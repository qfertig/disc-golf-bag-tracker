/**
 * Nominatim Reverse Geocoding Service Adapter
 *
 * Nominatim public API is free to use under these constraints:
 *   - Maximum 1 request per second (enforced here)
 *   - Must send a valid User-Agent identifying your application
 *   - Cache results aggressively to reduce repeated lookups
 *   - Do NOT bulk-geocode or use for commercial purposes
 *
 * Docs: https://nominatim.org/release-docs/latest/api/Reverse/
 */

import { dbQuery, dbRun } from '@/lib/db';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LocationLabel {
  display_name: string;
  city: string | null;
  state: string | null;
  country: string | null;
  lat: number;
  lon: number;
  source: 'cache' | 'api' | 'fallback';
}

interface NominatimResponse {
  display_name?: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    county?: string;
    state?: string;
    country?: string;
  };
}

// ─── Rate limiter ─────────────────────────────────────────────────────────────
// Nominatim requires at most 1 request per second globally across all users.
// We enforce a 1200ms minimum gap to stay safely under the limit.

let _lastRequestAt = 0;
const MIN_INTERVAL_MS = 1200;

async function enforceRateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - _lastRequestAt;
  if (elapsed < MIN_INTERVAL_MS) {
    await new Promise<void>(resolve => setTimeout(resolve, MIN_INTERVAL_MS - elapsed));
  }
  _lastRequestAt = Date.now();
}

// ─── Coordinate rounding ──────────────────────────────────────────────────────
// We cache by coordinates rounded to 3 decimal places (~100m precision)
// This avoids hammering the API for very nearby locations.

function roundForCache(v: number): string {
  return v.toFixed(3);
}

// ─── Cache helpers ────────────────────────────────────────────────────────────

async function getFromCache(lat: number, lon: number): Promise<LocationLabel | null> {
  const latKey = roundForCache(lat);
  const lonKey = roundForCache(lon);
  const rows = await dbQuery<{
    display_name: string | null;
    city: string | null;
    state: string | null;
    country: string | null;
  }>(
    'SELECT display_name, city, state, country FROM GeocodeCache WHERE lat_key = ? AND lon_key = ?',
    [latKey, lonKey]
  );
  if (!rows.length) return null;
  return {
    display_name: rows[0].display_name ?? 'Unknown location',
    city: rows[0].city,
    state: rows[0].state,
    country: rows[0].country,
    lat,
    lon,
    source: 'cache',
  };
}

async function saveToCache(lat: number, lon: number, result: LocationLabel, raw: NominatimResponse): Promise<void> {
  const latKey = roundForCache(lat);
  const lonKey = roundForCache(lon);
  const id = crypto.randomUUID();
  try {
    await dbRun(
      `INSERT OR REPLACE INTO GeocodeCache
         (id, lat_key, lon_key, display_name, city, state, country, raw_json, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, latKey, lonKey, result.display_name, result.city, result.state, result.country, JSON.stringify(raw), Date.now()]
    );
  } catch (e) {
    console.warn('[geocoding] Failed to cache geocode result', e);
  }
}

// ─── Fallback label ───────────────────────────────────────────────────────────

function fallbackLabel(lat: number, lon: number): LocationLabel {
  return {
    display_name: `${lat.toFixed(4)}, ${lon.toFixed(4)}`,
    city: null,
    state: null,
    country: null,
    lat,
    lon,
    source: 'fallback',
  };
}

// ─── Main function ────────────────────────────────────────────────────────────

export async function reverseGeocode(lat: number, lon: number): Promise<LocationLabel> {
  // 1. Check cache — no API call needed
  const cached = await getFromCache(lat, lon);
  if (cached) return cached;

  // 2. Enforce rate limit
  await enforceRateLimit();

  // 3. Fetch from Nominatim with timeout
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        // Required by Nominatim public API policy
        'User-Agent': 'BagTracker-DiscGolf/1.2 (disc-golf-companion-app)',
        'Accept': 'application/json',
      },
    });
    clearTimeout(timer);

    if (!res.ok) {
      console.warn(`[geocoding] Nominatim returned ${res.status}`);
      return fallbackLabel(lat, lon);
    }

    const data: NominatimResponse = await res.json();

    const city =
      data.address?.city ??
      data.address?.town ??
      data.address?.village ??
      data.address?.county ??
      null;

    const result: LocationLabel = {
      display_name: data.display_name ?? fallbackLabel(lat, lon).display_name,
      city,
      state: data.address?.state ?? null,
      country: data.address?.country ?? null,
      lat,
      lon,
      source: 'api',
    };

    await saveToCache(lat, lon, result, data);
    return result;
  } catch (err) {
    console.warn('[geocoding] Reverse geocode failed', err);
    return fallbackLabel(lat, lon);
  }
}

// ─── Utility: short location string ──────────────────────────────────────────

export function shortLocation(label: LocationLabel): string {
  const parts: string[] = [];
  if (label.city) parts.push(label.city);
  if (label.state) parts.push(label.state);
  if (!parts.length && label.country) parts.push(label.country);
  return parts.join(', ') || label.display_name;
}
