/**
 * Daylight Service Adapter — SunriseSunset.io
 *
 * Free API, no key required.
 * Docs: https://sunrisesunset.io/api/
 *
 * Cache strategy: cached by date + rounded coordinates (24h TTL per day).
 * If the API fails, the rest of the round flow continues normally — daylight
 * data is an optional enrichment, not a required dependency.
 */

import { dbQuery, dbRun } from '@/lib/db';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DaylightData {
  sunrise: string;          // ISO 8601 datetime
  sunset: string;           // ISO 8601 datetime
  first_light: string | null;
  last_light: string | null;
  solar_noon: string | null;
  day_length_seconds: number;
  date: string;             // YYYY-MM-DD
  timezone: string;
  fetched_at: number;
}

export type DaylightResult =
  | { ok: true; data: DaylightData }
  | { ok: false; reason: string };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function roundCoord(v: number): number {
  return Math.round(v * 10) / 10; // 0.1-degree precision (~11km) is fine for sunrise
}

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─── Cache ────────────────────────────────────────────────────────────────────

async function getFromCache(lat: number, lon: number, date: string): Promise<DaylightData | null> {
  const rows = await dbQuery<{ data_json: string }>(
    `SELECT data_json FROM DaylightSnapshots
     WHERE date = ? AND lat = ? AND lon = ?
     LIMIT 1`,
    [date, roundCoord(lat), roundCoord(lon)]
  );
  if (!rows.length) return null;
  try {
    return JSON.parse(rows[0].data_json) as DaylightData;
  } catch {
    return null;
  }
}

async function saveToCache(lat: number, lon: number, data: DaylightData): Promise<void> {
  const id = crypto.randomUUID();
  try {
    await dbRun(
      `INSERT OR REPLACE INTO DaylightSnapshots (id, lat, lon, date, data_json, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, roundCoord(lat), roundCoord(lon), data.date, JSON.stringify(data), data.fetched_at]
    );
  } catch (e) {
    console.warn('[daylight] Failed to cache daylight snapshot', e);
  }
}

// ─── Main fetch ───────────────────────────────────────────────────────────────

export async function fetchDaylight(
  lat: number,
  lon: number,
  date?: string,
  timezone?: string
): Promise<DaylightResult> {
  const targetDate = date ?? todayDateString();

  // 1. Check cache
  const cached = await getFromCache(lat, lon, targetDate);
  if (cached) return { ok: true, data: cached };

  // 2. Fetch from API
  const params = new URLSearchParams({
    lat: String(lat),
    lng: String(lon),
    date: targetDate,
    formatted: '0',
    ...(timezone ? { tzid: timezone } : {}),
  });

  const url = `https://api.sunrisesunset.io/json?${params.toString()}`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = await res.json();

    if (raw.status !== 'OK' || !raw.results) {
      throw new Error(`API status: ${raw.status}`);
    }

    const r = raw.results;

    // day_length comes as "HH:MM:SS" — convert to seconds
    let dayLengthSeconds = 0;
    if (typeof r.day_length === 'string') {
      const parts = r.day_length.split(':').map(Number);
      dayLengthSeconds = (parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0);
    } else if (typeof r.day_length === 'number') {
      dayLengthSeconds = r.day_length;
    }

    const data: DaylightData = {
      sunrise: r.sunrise ?? '',
      sunset: r.sunset ?? '',
      first_light: r.first_light ?? null,
      last_light: r.last_light ?? null,
      solar_noon: r.solar_noon ?? null,
      day_length_seconds: dayLengthSeconds,
      date: targetDate,
      timezone: r.timezone ?? timezone ?? 'UTC',
      fetched_at: Date.now(),
    };

    await saveToCache(lat, lon, data);
    return { ok: true, data };
  } catch (err) {
    console.warn('[daylight] Failed to fetch daylight data', err);
    return { ok: false, reason: 'Sunset estimate unavailable' };
  }
}

// ─── Utility functions ────────────────────────────────────────────────────────

/** Format a daylight ISO datetime for display, e.g. "7:42 AM" */
export function formatDaylightTime(isoStr: string | null): string {
  if (!isoStr) return '—';
  try {
    const d = new Date(isoStr);
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch {
    return isoStr;
  }
}

/** Returns minutes until sunset from now. Negative if already past sunset. */
export function minutesUntilSunset(sunset: string): number {
  const sunsetMs = new Date(sunset).getTime();
  return Math.floor((sunsetMs - Date.now()) / 60_000);
}

/** Returns a human-readable finish-before-dark estimate given holes remaining */
export function finishBeforeDarkEstimate(sunset: string, holesRemaining: number, minsPerHole = 12): string | null {
  const minsLeft = minutesUntilSunset(sunset);
  if (minsLeft <= 0) return 'After dark';
  const estimatedMins = holesRemaining * minsPerHole;
  const safetyBuffer = 20; // 20 min buffer before dark
  if (estimatedMins + safetyBuffer > minsLeft) {
    return `May finish after dark (${minsLeft}m until sunset)`;
  }
  return null; // Plenty of light — no warning needed
}
