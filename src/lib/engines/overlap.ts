/**
 * Disc Overlap Analyzer
 *
 * Pure functions — no UI dependencies, no side effects.
 * Never recommends deletion. Surfaces information only.
 * Prioritizes real throw history over manufacturer flight numbers when available.
 */

import type { BagDisc, ThrowRecord } from '@/lib/engines/recommendation';

// ─── Types ────────────────────────────────────────────────────────────────────

export type OverlapClass =
  | 'High Overlap'
  | 'Situational Overlap'
  | 'Complementary';

export interface OverlapPair {
  discA: BagDisc;
  discB: BagDisc;
  classification: OverlapClass;
  overlap_score: number;   // 0–100
  reasons: string[];
  differentiators: string[];
}

export interface OverlapReport {
  pairs: OverlapPair[];
  total_discs: number;
  high_overlap_count: number;
  summary: string;
}

// ─── Tolerance bands ──────────────────────────────────────────────────────────

const SPEED_TOLERANCE = 1.5;
const GLIDE_TOLERANCE = 1.5;
const TURN_TOLERANCE = 1.0;
const FADE_TOLERANCE = 1.0;
const DISTANCE_TOLERANCE_PCT = 0.12; // 12% distance difference = similar

// ─── Similarity scoring ───────────────────────────────────────────────────────

function numDiff(a: number | null, b: number | null): number | null {
  if (a == null || b == null) return null;
  return Math.abs(a - b);
}

function flightSimilarity(a: BagDisc, b: BagDisc): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  let fields = 0;

  // Speed
  const speedDiff = numDiff(a.speed, b.speed);
  if (speedDiff !== null) {
    fields++;
    if (speedDiff <= SPEED_TOLERANCE) {
      score += 25;
      if (speedDiff < 0.5) reasons.push(`Same speed (${a.speed})`);
      else reasons.push(`Similar speed (${a.speed} vs ${b.speed})`);
    }
  }

  // Turn
  const turnDiff = numDiff(a.turn, b.turn);
  if (turnDiff !== null) {
    fields++;
    if (turnDiff <= TURN_TOLERANCE) {
      score += 25;
      if (turnDiff < 0.5) reasons.push(`Same turn (${a.turn})`);
      else reasons.push(`Similar turn (${a.turn} vs ${b.turn})`);
    }
  }

  // Fade
  const fadeDiff = numDiff(a.fade, b.fade);
  if (fadeDiff !== null) {
    fields++;
    if (fadeDiff <= FADE_TOLERANCE) {
      score += 25;
      if (fadeDiff < 0.5) reasons.push(`Same fade (${a.fade})`);
    }
  }

  // Stability band
  if (a.stability === b.stability) {
    score += 25;
    reasons.push(`Both ${a.stability ?? 'similar stability'}`);
    fields++;
  } else if (fields > 0) {
    fields++;
  }

  return { score: fields > 0 ? Math.round(score) : 0, reasons };
}

function historySimilarity(a: BagDisc, b: BagDisc, throws: ThrowRecord[]): { bonus: number; reasons: string[] } {
  const aThrows = throws.filter(t => t.disc_id === a.id);
  const bThrows = throws.filter(t => t.disc_id === b.id);
  if (aThrows.length < 3 || bThrows.length < 3) return { bonus: 0, reasons: [] };

  const aAvg = aThrows.reduce((s, t) => s + t.distance, 0) / aThrows.length;
  const bAvg = bThrows.reduce((s, t) => s + t.distance, 0) / bThrows.length;
  const larger = Math.max(aAvg, bAvg);
  const diff = Math.abs(aAvg - bAvg);

  if (diff / larger <= DISTANCE_TOLERANCE_PCT) {
    return {
      bonus: 20,
      reasons: [`You throw both ~${Math.round((aAvg + bAvg) / 2)}ft on average`],
    };
  }
  return { bonus: 0, reasons: [] };
}

function findDifferentiators(a: BagDisc, b: BagDisc): string[] {
  const diffs: string[] = [];

  // Category difference is a key differentiator
  if (a.category !== b.category) {
    diffs.push(`${a.name} is a ${a.category}, ${b.name} is a ${b.category}`);
  }

  // Speed gap
  const speedDiff = numDiff(a.speed, b.speed);
  if (speedDiff !== null && speedDiff > SPEED_TOLERANCE) {
    diffs.push(`${Math.round(speedDiff)}-point speed difference`);
  }

  // Turn gap
  const turnDiff = numDiff(a.turn, b.turn);
  if (turnDiff !== null && turnDiff > TURN_TOLERANCE + 0.5) {
    diffs.push(`Different turn (${a.turn} vs ${b.turn}) — different shot shapes`);
  }

  // Plastic / wear note
  if (a.plastic || b.plastic) {
    diffs.push('Plastic type may change flight in real use');
  }

  // Notes hint
  if (a.notes || b.notes) {
    diffs.push('You have personal notes on these discs');
  }

  return diffs;
}

// ─── Classification ───────────────────────────────────────────────────────────

function classifyOverlap(flightScore: number, historyBonus: number): OverlapClass {
  const total = flightScore + historyBonus;
  if (total >= 75) return 'High Overlap';
  if (total >= 45) return 'Situational Overlap';
  return 'Complementary';
}

// ─── Main function ────────────────────────────────────────────────────────────

export function detectOverlaps(
  discs: BagDisc[],
  throwHistory: ThrowRecord[] = []
): OverlapReport {
  const pairs: OverlapPair[] = [];

  // Compare every pair (O(n²) — fine for bag sizes of 5–25 discs)
  for (let i = 0; i < discs.length; i++) {
    for (let j = i + 1; j < discs.length; j++) {
      const a = discs[i];
      const b = discs[j];

      const { score: flightScore, reasons: flightReasons } = flightSimilarity(a, b);
      const { bonus: historyBonus, reasons: historyReasons } = historySimilarity(a, b, throwHistory);
      const differentiators = findDifferentiators(a, b);

      // Only report if there's some overlap
      if (flightScore < 20 && historyBonus === 0) continue;

      const classification = classifyOverlap(flightScore, historyBonus);
      const overlapScore = Math.min(100, flightScore + historyBonus);

      pairs.push({
        discA: a,
        discB: b,
        classification,
        overlap_score: overlapScore,
        reasons: [...flightReasons, ...historyReasons],
        differentiators,
      });
    }
  }

  // Sort by overlap score descending
  pairs.sort((a, b) => b.overlap_score - a.overlap_score);

  const highCount = pairs.filter(p => p.classification === 'High Overlap').length;

  let summary = '';
  if (pairs.length === 0) {
    summary = 'Great bag diversity! No significant overlaps detected.';
  } else if (highCount === 0) {
    summary = `${pairs.length} situational overlaps — your bag has good variety.`;
  } else {
    summary = `${highCount} high-overlap pair${highCount > 1 ? 's' : ''} detected. Consider which feels better in hand.`;
  }

  return {
    pairs,
    total_discs: discs.length,
    high_overlap_count: highCount,
    summary,
  };
}
