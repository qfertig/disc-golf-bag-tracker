/**
 * Throw Path Sketcher Engine
 *
 * Pure functions for generating and managing user-recorded throw paths.
 * This is SEPARATE from FlightPath.tsx — it represents observed throw behavior,
 * not simulated disc physics.
 *
 * Path data is stored as compact JSON: { preset, points, mirror }
 * Points are [x, y] where x = lateral feet, y = distance feet.
 * These can be rendered with the existing catmullRomPath() SVG utility.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type ThrowPreset = 'straight' | 'hyzer' | 'anhyzer' | 'flex' | 's-curve' | 'turnover' | 'custom';
export type ThrowHand = 'rhbh' | 'rhfh' | 'lhbh' | 'lhfh';

export interface ThrowPathData {
  preset: ThrowPreset;
  points: [number, number][];  // [x, y] normalized control points
  mirror: boolean;             // true = flip laterally (lefty)
}

export interface ThrowPresetDef {
  id: ThrowPreset;
  label: string;
  description: string;
  /** Generate control points scaled to the given distance */
  generate: (dist: number) => [number, number][];
}

// ─── Preset Definitions ───────────────────────────────────────────────────────

export const THROW_PRESETS: ThrowPresetDef[] = [
  {
    id: 'straight',
    label: 'Straight',
    description: 'Dead straight to target',
    generate: (d) => [[0, 0], [0, d * 0.33], [0, d * 0.66], [0, d]],
  },
  {
    id: 'hyzer',
    label: 'Hyzer',
    description: 'Curves left (RHBH)',
    generate: (d) => [[0, 0], [-3, d * 0.25], [-10, d * 0.55], [-18, d * 0.8], [-22, d]],
  },
  {
    id: 'anhyzer',
    label: 'Anhyzer',
    description: 'Turns right, fades back',
    generate: (d) => [[0, 0], [6, d * 0.25], [10, d * 0.5], [4, d * 0.75], [-4, d]],
  },
  {
    id: 'flex',
    label: 'Flex',
    description: 'S-shape: right then left',
    generate: (d) => [[0, 0], [8, d * 0.2], [12, d * 0.4], [4, d * 0.65], [-6, d * 0.85], [-10, d]],
  },
  {
    id: 's-curve',
    label: 'S-Curve',
    description: 'Wide S: hard right then hard left',
    generate: (d) => [[0, 0], [12, d * 0.18], [18, d * 0.35], [8, d * 0.55], [-8, d * 0.75], [-16, d]],
  },
  {
    id: 'turnover',
    label: 'Turnover',
    description: 'Flips right and holds',
    generate: (d) => [[0, 0], [4, d * 0.2], [12, d * 0.45], [18, d * 0.7], [20, d]],
  },
  {
    id: 'custom',
    label: 'Custom',
    description: 'Place your own points',
    generate: (d) => [[0, 0], [0, d * 0.33], [0, d * 0.66], [0, d]],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getPreset(id: ThrowPreset): ThrowPresetDef {
  return THROW_PRESETS.find(p => p.id === id) ?? THROW_PRESETS[0];
}

export function generatePath(preset: ThrowPreset, distance: number, mirror: boolean): ThrowPathData {
  const def = getPreset(preset);
  let points = def.generate(distance);
  if (mirror) {
    points = points.map(([x, y]) => [-x, y]);
  }
  return { preset, points, mirror };
}

/** Convert ThrowPathData points to FlightPoint[] format for catmullRomPath */
export function toFlightPoints(data: ThrowPathData): { x: number; y: number }[] {
  return data.points.map(([x, y]) => ({ x, y }));
}

/** Serialize for storage in path_json column */
export function serializePath(data: ThrowPathData): string {
  return JSON.stringify(data);
}

/** Deserialize from path_json column */
export function deserializePath(json: string | null): ThrowPathData | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as ThrowPathData;
  } catch {
    return null;
  }
}

/** Hand labels for UI */
export const THROW_HANDS: { id: ThrowHand; label: string; short: string }[] = [
  { id: 'rhbh', label: 'Right-Hand Backhand', short: 'RHBH' },
  { id: 'rhfh', label: 'Right-Hand Forehand', short: 'RHFH' },
  { id: 'lhbh', label: 'Left-Hand Backhand',  short: 'LHBH' },
  { id: 'lhfh', label: 'Left-Hand Forehand',  short: 'LHFH' },
];
