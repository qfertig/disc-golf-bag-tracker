/**
 * Open-Meteo Weather Service Adapter
 *
 * Open-Meteo is free for non-commercial use and requires no API key.
 * Treat as best-effort enrichment only — never block core app flows.
 * Docs: https://open-meteo.com/en/docs
 *
 * Cache strategy:
 *   - Current weather: 15 minute TTL
 *   - Forecast: 2 hour TTL
 */

import { dbQuery, dbRun } from '@/lib/db';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CurrentWeather {
  temperature_c: number;
  wind_speed_kmh: number;
  wind_direction_deg: number;
  precipitation_mm: number;
  fetched_at: number;
  is_stale: boolean;
  stale_label: string;
}

export interface HourlyForecast {
  time: string;
  precipitation_probability: number;
}

export interface WeatherData {
  current: CurrentWeather;
  hourly: HourlyForecast[];
  timezone: string;
}

export type WeatherResult =
  | { ok: true; data: WeatherData }
  | { ok: false; reason: string };

// ─── Constants ────────────────────────────────────────────────────────────────

const CURRENT_TTL_MS = 15 * 60 * 1000;   // 15 minutes
const FORECAST_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const TIMEOUT_MS = 8_000;
const API_BASE = 'https://api.open-meteo.com/v1/forecast';

function roundCoord(v: number): number {
  return Math.round(v * 100) / 100;
}

function formatStaleLabel(fetchedAt: number): string {
  const diffMs = Date.now() - fetchedAt;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

// ─── Cache helpers ────────────────────────────────────────────────────────────

async function getFromCache(lat: number, lon: number, type: string): Promise<WeatherData | null> {
  const rows = await dbQuery<{ data_json: string; fetched_at: number; expires_at: number }>(
    `SELECT data_json, fetched_at, expires_at
     FROM WeatherSnapshots
     WHERE lat = ? AND lon = ? AND snapshot_type = ?
     ORDER BY fetched_at DESC LIMIT 1`,
    [roundCoord(lat), roundCoord(lon), type]
  );
  if (!rows.length) return null;
  const row = rows[0];
  if (Date.now() > row.expires_at) return null; // expired
  try {
    return JSON.parse(row.data_json) as WeatherData;
  } catch {
    return null;
  }
}

async function saveToCache(lat: number, lon: number, type: string, data: WeatherData, ttlMs: number): Promise<void> {
  const now = Date.now();
  const id = crypto.randomUUID();
  try {
    await dbRun(
      `INSERT OR REPLACE INTO WeatherSnapshots (id, lat, lon, snapshot_type, data_json, fetched_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, roundCoord(lat), roundCoord(lon), type, JSON.stringify(data), now, now + ttlMs]
    );
  } catch (e) {
    console.warn('[weather] Failed to cache weather snapshot', e);
  }
}

// ─── Main fetch ───────────────────────────────────────────────────────────────

export async function fetchWeather(lat: number, lon: number): Promise<WeatherResult> {
  // 1. Try cache first
  const cached = await getFromCache(lat, lon, 'combined');
  if (cached) {
    const ageMs = Date.now() - cached.current.fetched_at;
    const is_stale = ageMs > CURRENT_TTL_MS;
    return {
      ok: true,
      data: {
        ...cached,
        current: {
          ...cached.current,
          is_stale,
          stale_label: `Weather updated ${formatStaleLabel(cached.current.fetched_at)}`,
        },
      },
    };
  }

  // 2. Fetch from API with timeout
  const url =
    `${API_BASE}?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,wind_speed_10m,wind_direction_10m,precipitation` +
    `&hourly=precipitation_probability` +
    `&timezone=auto&forecast_days=1`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = await res.json();

    const now = Date.now();
    const hourly: HourlyForecast[] = (raw.hourly?.time ?? []).map((t: string, i: number) => ({
      time: t,
      precipitation_probability: raw.hourly.precipitation_probability?.[i] ?? 0,
    }));

    const data: WeatherData = {
      current: {
        temperature_c: raw.current?.temperature_2m ?? 0,
        wind_speed_kmh: raw.current?.wind_speed_10m ?? 0,
        wind_direction_deg: raw.current?.wind_direction_10m ?? 0,
        precipitation_mm: raw.current?.precipitation ?? 0,
        fetched_at: now,
        is_stale: false,
        stale_label: 'Weather updated just now',
      },
      hourly,
      timezone: raw.timezone ?? 'UTC',
    };

    await saveToCache(lat, lon, 'combined', data, FORECAST_TTL_MS);
    return { ok: true, data };
  } catch (err) {
    console.warn('[weather] Fetch failed, returning unavailable', err);
    return { ok: false, reason: 'Weather unavailable' };
  }
}

// ─── Utility: wind description ───────────────────────────────────────────────

export function windDescription(kmh: number): string {
  if (kmh < 5) return 'Calm';
  if (kmh < 15) return 'Light';
  if (kmh < 25) return 'Moderate';
  if (kmh < 40) return 'Strong';
  return 'Very strong';
}

export function windDirectionLabel(deg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(deg / 45) % 8];
}

export function celsiusToFahrenheit(c: number): number {
  return Math.round(c * 9 / 5 + 32);
}
