/**
 * DiscGolfAPI Evaluation Adapter
 *
 * This adapter is for EVALUATION ONLY and is NOT wired into any production
 * app flow. It is accessible only via the hidden developer screen (5-tap
 * Easter egg on the About page version number).
 *
 * Purpose: Test whether DiscGolfAPI provides sufficient data coverage for:
 *   - Course selection
 *   - Round association
 *   - Offline caching
 *   - Local course detail views
 *
 * Do NOT hardwire this into production flows until the evaluation passes.
 *
 * Docs: https://discgolfapi.com/docs
 */

import { dbRun } from '@/lib/db';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DGACountry {
  id: number;
  name: string;
  code: string;
}

export interface DGARegion {
  id: number;
  name: string;
  country_id: number;
}

export interface DGACourse {
  id: number;
  name: string;
  city?: string;
  state?: string;
  country?: string;
  zip?: string;
  latitude?: number;
  longitude?: number;
  hole_count?: number;
  rating?: number;
}

export type FieldUsability = 'usable' | 'partial' | 'insufficient' | 'missing';

export interface EvalField {
  field: string;
  value: unknown;
  usability: FieldUsability;
}

export interface EvalResult {
  endpoint: string;
  status: 'success' | 'error' | 'timeout';
  raw: unknown;
  fields: EvalField[];
  saved_to_db: boolean;
  error?: string;
  fetched_at: number;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const BASE_URL = 'https://api.discgolfapi.com/api/v1';
const TIMEOUT_MS = 10_000;
const RETRY_DELAY_MS = 2_000;

// ─── HTTP helper with retry ───────────────────────────────────────────────────

async function fetchWithRetry(url: string, retries = 1): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' },
    });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    if (retries > 0) {
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
      return fetchWithRetry(url, retries - 1);
    }
    throw err;
  }
}

// ─── Field evaluation ─────────────────────────────────────────────────────────

function evaluateCourseFields(course: DGACourse): EvalField[] {
  return [
    { field: 'id', value: course.id, usability: course.id ? 'usable' : 'missing' },
    { field: 'name', value: course.name, usability: course.name ? 'usable' : 'missing' },
    { field: 'latitude', value: course.latitude, usability: course.latitude != null ? 'usable' : 'insufficient' },
    { field: 'longitude', value: course.longitude, usability: course.longitude != null ? 'usable' : 'insufficient' },
    { field: 'hole_count', value: course.hole_count, usability: course.hole_count ? 'usable' : 'partial' },
    { field: 'city', value: course.city, usability: course.city ? 'usable' : 'partial' },
    { field: 'state', value: course.state, usability: course.state ? 'usable' : 'partial' },
    { field: 'country', value: course.country, usability: course.country ? 'usable' : 'partial' },
    { field: 'rating', value: course.rating, usability: course.rating != null ? 'usable' : 'partial' },
  ];
}

// ─── Evaluation methods ───────────────────────────────────────────────────────

export async function evalFetchCountries(): Promise<EvalResult> {
  const now = Date.now();
  try {
    const res = await fetchWithRetry(`${BASE_URL}/countries`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = await res.json();
    const countries: DGACountry[] = Array.isArray(raw) ? raw : (raw.data ?? raw.countries ?? []);

    // Save sample to SQLite
    let saved = false;
    try {
      for (const c of countries.slice(0, 5)) {
        await dbRun(
          `INSERT OR IGNORE INTO AppSettings (key, value, updated_at) VALUES (?, ?, ?)`,
          [`eval_country_${c.id}`, JSON.stringify(c), now]
        );
      }
      saved = true;
    } catch (_) {}

    return {
      endpoint: 'countries',
      status: 'success',
      raw,
      fields: [
        { field: 'total_count', value: countries.length, usability: countries.length > 0 ? 'usable' : 'insufficient' },
        { field: 'has_id', value: countries[0]?.id, usability: countries[0]?.id ? 'usable' : 'missing' },
        { field: 'has_name', value: countries[0]?.name, usability: countries[0]?.name ? 'usable' : 'missing' },
      ],
      saved_to_db: saved,
      fetched_at: now,
    };
  } catch (err) {
    const isTimeout = (err as Error).name === 'AbortError';
    return {
      endpoint: 'countries',
      status: isTimeout ? 'timeout' : 'error',
      raw: null,
      fields: [],
      saved_to_db: false,
      error: (err as Error).message,
      fetched_at: now,
    };
  }
}

export async function evalFetchRegions(countryId: number): Promise<EvalResult> {
  const now = Date.now();
  try {
    const res = await fetchWithRetry(`${BASE_URL}/countries/${countryId}/regions`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = await res.json();
    const regions: DGARegion[] = Array.isArray(raw) ? raw : (raw.data ?? raw.regions ?? []);

    return {
      endpoint: `regions(country=${countryId})`,
      status: 'success',
      raw,
      fields: [
        { field: 'total_count', value: regions.length, usability: regions.length > 0 ? 'usable' : 'partial' },
        { field: 'has_id', value: regions[0]?.id, usability: regions[0]?.id ? 'usable' : 'missing' },
        { field: 'has_name', value: regions[0]?.name, usability: regions[0]?.name ? 'usable' : 'missing' },
      ],
      saved_to_db: false,
      fetched_at: now,
    };
  } catch (err) {
    const isTimeout = (err as Error).name === 'AbortError';
    return {
      endpoint: `regions(country=${countryId})`,
      status: isTimeout ? 'timeout' : 'error',
      raw: null,
      fields: [],
      saved_to_db: false,
      error: (err as Error).message,
      fetched_at: now,
    };
  }
}

export async function evalFetchCourses(regionId: number): Promise<EvalResult> {
  const now = Date.now();
  try {
    const res = await fetchWithRetry(`${BASE_URL}/courses?region=${regionId}&limit=10`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = await res.json();
    const courses: DGACourse[] = Array.isArray(raw) ? raw : (raw.data ?? raw.courses ?? []);
    const sample = courses[0];

    let saved = false;
    try {
      for (const c of courses.slice(0, 3)) {
        await dbRun(
          `INSERT OR IGNORE INTO Courses (id, name, lat, lon, hole_count, city, state, country, source, source_id, raw_json, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            crypto.randomUUID(),
            c.name ?? 'Unknown',
            c.latitude ?? null, c.longitude ?? null,
            c.hole_count ?? null,
            c.city ?? null, c.state ?? null, c.country ?? null,
            'discgolfapi_sample',
            String(c.id),
            JSON.stringify(c),
            now,
          ]
        );
      }
      saved = true;
    } catch (_) {}

    return {
      endpoint: `courses(region=${regionId})`,
      status: 'success',
      raw,
      fields: sample ? evaluateCourseFields(sample) : [],
      saved_to_db: saved,
      fetched_at: now,
    };
  } catch (err) {
    const isTimeout = (err as Error).name === 'AbortError';
    return {
      endpoint: `courses(region=${regionId})`,
      status: isTimeout ? 'timeout' : 'error',
      raw: null,
      fields: [],
      saved_to_db: false,
      error: (err as Error).message,
      fetched_at: now,
    };
  }
}

export async function evalFetchCourse(courseId: number): Promise<EvalResult> {
  const now = Date.now();
  try {
    const res = await fetchWithRetry(`${BASE_URL}/courses/${courseId}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = await res.json();
    const course: DGACourse = raw.data ?? raw;

    let saved = false;
    try {
      await dbRun(
        `INSERT OR IGNORE INTO Courses (id, name, lat, lon, hole_count, city, state, country, source, source_id, raw_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          crypto.randomUUID(),
          course.name ?? 'Unknown',
          course.latitude ?? null, course.longitude ?? null,
          course.hole_count ?? null,
          course.city ?? null, course.state ?? null, course.country ?? null,
          'discgolfapi_eval',
          String(course.id),
          JSON.stringify(course),
          now,
        ]
      );
      saved = true;
    } catch (_) {}

    return {
      endpoint: `course(id=${courseId})`,
      status: 'success',
      raw,
      fields: evaluateCourseFields(course),
      saved_to_db: saved,
      fetched_at: now,
    };
  } catch (err) {
    const isTimeout = (err as Error).name === 'AbortError';
    return {
      endpoint: `course(id=${courseId})`,
      status: isTimeout ? 'timeout' : 'error',
      raw: null,
      fields: [],
      saved_to_db: false,
      error: (err as Error).message,
      fetched_at: now,
    };
  }
}
