/**
 * Bag Power / Stability Coverage Engine
 *
 * Pure functions — no UI dependencies, no side effects.
 * Maps a bag's discs into a speed-band × stability grid
 * to surface coverage, gaps, and stacks.
 */

import type { BagDisc } from '@/lib/engines/recommendation';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SpeedBand = 'putter' | 'mid' | 'fairway' | 'control' | 'distance';
export type StabilityColumn = 'very-us' | 'understable' | 'stable' | 'overstable' | 'very-os';
export type CoverageLevel = 'empty' | 'single' | 'covered' | 'stacked';

export interface StabilitySlot {
  band: SpeedBand;
  stability: StabilityColumn;
  discs: BagDisc[];
  coverage: CoverageLevel;
}

export interface BagPowerReport {
  grid: StabilitySlot[][];        // [bandIndex][stabilityIndex]
  slots: StabilitySlot[];         // Flat list of all slots
  gaps: StabilitySlot[];          // Empty slots worth filling
  stacks: StabilitySlot[];        // Over-represented slots (3+)
  bandCounts: Record<SpeedBand, number>;
  strengthScore: number;          // 0–100
  totalDiscs: number;
  summary: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const SPEED_BANDS: { id: SpeedBand; label: string; range: [number, number]; color: string }[] = [
  { id: 'putter',   label: 'Putters',    range: [1, 3],   color: '#3b82f6' },
  { id: 'mid',      label: 'Mids',       range: [4, 6],   color: '#22c55e' },
  { id: 'fairway',  label: 'Fairways',   range: [7, 9],   color: '#eab308' },
  { id: 'control',  label: 'Control',    range: [10, 11], color: '#f97316' },
  { id: 'distance', label: 'Distance',   range: [12, 14], color: '#ef4444' },
];

export const STABILITY_COLUMNS: { id: StabilityColumn; label: string; short: string }[] = [
  { id: 'very-us',      label: 'Very Understable', short: 'V.US' },
  { id: 'understable',  label: 'Understable',      short: 'US' },
  { id: 'stable',       label: 'Stable',           short: 'S' },
  { id: 'overstable',   label: 'Overstable',       short: 'OS' },
  { id: 'very-os',      label: 'Very Overstable',  short: 'V.OS' },
];

// ─── Classification helpers ───────────────────────────────────────────────────

export function classifySpeedBand(speed: number | null): SpeedBand {
  const s = Number(speed) || 5;
  if (s <= 3) return 'putter';
  if (s <= 6) return 'mid';
  if (s <= 9) return 'fairway';
  if (s <= 11) return 'control';
  return 'distance';
}

export function classifyStability(disc: BagDisc): StabilityColumn {
  const stability = (disc.stability ?? '').toLowerCase();
  const turn = Number(disc.turn) || 0;
  const fade = Number(disc.fade) || 0;

  // Explicit stability label takes priority
  if (stability.includes('very understable') || turn <= -3) return 'very-us';
  if (stability.includes('very overstable') || fade >= 4) return 'very-os';
  if (stability.includes('understable') || turn <= -2) return 'understable';
  if (stability.includes('overstable') || (fade >= 3 && turn >= 0)) return 'overstable';

  // Default: stable/neutral
  return 'stable';
}

function coverageLevel(count: number): CoverageLevel {
  if (count === 0) return 'empty';
  if (count === 1) return 'single';
  if (count === 2) return 'covered';
  return 'stacked';
}

// Gaps that are more "important" to fill — distance drivers being very understable
// is less critical than having no stable mid, for example.
const GAP_PRIORITY: Record<SpeedBand, number> = {
  putter: 3,    // Putters are essential
  mid: 4,       // Mids are the backbone
  fairway: 3,   // Fairways are versatile
  control: 2,   // Niche
  distance: 1,  // Most players only need 1–2
};

// Some stability columns matter more per band
const STABILITY_IMPORTANCE: Record<StabilityColumn, number> = {
  'stable': 5,        // Everyone needs stable discs
  'overstable': 4,    // Wind/utility
  'understable': 3,   // Turnovers/distance
  'very-os': 2,       // Specialty
  'very-us': 1,       // Specialty
};

// ─── Main analysis ────────────────────────────────────────────────────────────

export function analyzeBagPower(discs: BagDisc[]): BagPowerReport {
  // Build the grid
  const grid: StabilitySlot[][] = SPEED_BANDS.map(band =>
    STABILITY_COLUMNS.map(col => ({
      band: band.id,
      stability: col.id,
      discs: [],
      coverage: 'empty' as CoverageLevel,
    }))
  );

  // Place each disc
  const bandCounts: Record<SpeedBand, number> = {
    putter: 0, mid: 0, fairway: 0, control: 0, distance: 0,
  };

  for (const disc of discs) {
    const band = classifySpeedBand(disc.speed);
    const stab = classifyStability(disc);

    const bandIdx = SPEED_BANDS.findIndex(b => b.id === band);
    const stabIdx = STABILITY_COLUMNS.findIndex(c => c.id === stab);

    if (bandIdx >= 0 && stabIdx >= 0) {
      grid[bandIdx][stabIdx].discs.push(disc);
      bandCounts[band]++;
    }
  }

  // Update coverage levels
  const allSlots: StabilitySlot[] = [];
  for (const row of grid) {
    for (const slot of row) {
      slot.coverage = coverageLevel(slot.discs.length);
      allSlots.push(slot);
    }
  }

  // Find gaps (empty slots that are worth filling)
  const gaps = allSlots
    .filter(s => s.coverage === 'empty')
    .sort((a, b) => {
      const priorityA = GAP_PRIORITY[a.band] * STABILITY_IMPORTANCE[a.stability];
      const priorityB = GAP_PRIORITY[b.band] * STABILITY_IMPORTANCE[b.stability];
      return priorityB - priorityA;
    });

  // Find stacks (3+ discs in one slot)
  const stacks = allSlots.filter(s => s.coverage === 'stacked');

  // Strength score: percentage of "important" slots filled
  // Weight each slot by its priority
  let totalWeight = 0;
  let filledWeight = 0;
  for (const slot of allSlots) {
    const w = GAP_PRIORITY[slot.band] * STABILITY_IMPORTANCE[slot.stability];
    totalWeight += w;
    if (slot.discs.length > 0) filledWeight += w;
  }
  const strengthScore = totalWeight > 0 ? Math.round((filledWeight / totalWeight) * 100) : 0;

  // Build summary
  const filledCount = allSlots.filter(s => s.discs.length > 0).length;
  const totalSlots = allSlots.length;
  let summary: string;

  if (gaps.length === 0) {
    summary = `Full coverage! Every speed and stability slot is filled.`;
  } else if (strengthScore >= 75) {
    summary = `Strong bag — ${filledCount}/${totalSlots} slots covered. A few specialty gaps remain.`;
  } else if (strengthScore >= 50) {
    summary = `Good foundation — ${filledCount}/${totalSlots} slots filled. Key gaps in ${describeTopGaps(gaps)}.`;
  } else {
    summary = `Building your bag — ${filledCount}/${totalSlots} slots filled. Focus on adding ${describeTopGaps(gaps)}.`;
  }

  return {
    grid,
    slots: allSlots,
    gaps,
    stacks,
    bandCounts,
    strengthScore,
    totalDiscs: discs.length,
    summary,
  };
}

function describeTopGaps(gaps: StabilitySlot[]): string {
  const bandLabel: Record<SpeedBand, string> = {
    putter: 'putters', mid: 'mids', fairway: 'fairways', control: 'control drivers', distance: 'distance drivers',
  };
  const stabLabel: Record<StabilityColumn, string> = {
    'very-us': 'very understable', 'understable': 'understable', 'stable': 'stable',
    'overstable': 'overstable', 'very-os': 'very overstable',
  };

  return gaps
    .slice(0, 2)
    .map(g => `${stabLabel[g.stability]} ${bandLabel[g.band]}`)
    .join(' and ');
}
