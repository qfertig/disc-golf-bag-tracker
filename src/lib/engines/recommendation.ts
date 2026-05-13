/**
 * Bag Recommendation Engine
 *
 * Pure functions — no UI dependencies, no side effects.
 * Prioritizes real throw history over manufacturer flight numbers.
 */

import type { CurrentWeather } from '@/lib/services/weather';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CatalogDisc {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  speed: number | null;
  glide: number | null;
  turn: number | null;
  fade: number | null;
  stability: string | null;
}

export interface BagDisc extends CatalogDisc {
  bag_disc_id: string;
  bag_id: string;
  plastic?: string | null;
  weight?: string | null;
  notes?: string | null;
}

export interface ThrowRecord {
  disc_id: string;
  distance: number;
  shape?: string | null;
}

export interface RecommendedDisc {
  disc: BagDisc;
  score: number;
  reasons: string[];
}

export interface RecommendationResult {
  picks: RecommendedDisc[];
  bag_id: string;
  bag_name: string;
  context: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const WIND_HIGH_THRESHOLD = 25;   // km/h — favor overstable above this
const WIND_LOW_THRESHOLD = 10;    // km/h — favor understable below this
const MIN_THROWS_FOR_HISTORY = 5; // Need at least 5 throws to use personal data
const MAX_PICKS = 6;

// Stability order (lowest = most understable)
const STABILITY_SCORE: Record<string, number> = {
  'Very Understable': 1,
  'Understable': 2,
  'Stable': 3,
  'Neutral': 3,
  'Overstable': 4,
  'Very Overstable': 5,
};

// Category priority for a balanced bag
const CATEGORY_PRIORITY: Record<string, number> = {
  'Distance Driver': 5,
  'Hybrid Driver': 4,
  'Control Driver': 4,
  'Fairway Driver': 4,
  'Midrange': 3,
  'Approach Discs': 2,
  'Putter': 2,
};

// ─── Core scoring ─────────────────────────────────────────────────────────────

export function scoreDisc(
  disc: BagDisc,
  weather: CurrentWeather | null,
  throwHistory: ThrowRecord[]
): { score: number; reasons: string[] } {
  let score = 50; // baseline
  const reasons: string[] = [];

  const throws = throwHistory.filter(t => t.disc_id === disc.id);
  const hasHistory = throws.length >= MIN_THROWS_FOR_HISTORY;

  // ── Wind adjustments ──────────────────────────────────────────────────────
  if (weather) {
    const wind = weather.wind_speed_kmh;
    const stabilityVal = STABILITY_SCORE[disc.stability ?? 'Stable'] ?? 3;

    if (wind > WIND_HIGH_THRESHOLD) {
      // High wind — overstable is more reliable
      if (stabilityVal >= 4) {
        score += 20;
        reasons.push(`Overstable — handles ${Math.round(wind)} km/h wind well`);
      } else if (stabilityVal <= 2) {
        score -= 15;
        reasons.push('Understable discs turn more in high wind');
      }
    } else if (wind < WIND_LOW_THRESHOLD) {
      // Calm — understable/neutral gives more distance and fun
      if (stabilityVal <= 2) {
        score += 10;
        reasons.push('Great in calm conditions');
      }
    }
  }

  // ── Personal throw history ────────────────────────────────────────────────
  if (hasHistory) {
    const avgDistance = throws.reduce((sum, t) => sum + t.distance, 0) / throws.length;
    if (avgDistance > 250) {
      score += 15;
      reasons.push(`You average ${Math.round(avgDistance)}ft with this disc`);
    } else if (avgDistance > 150) {
      score += 8;
      reasons.push(`Consistent ${Math.round(avgDistance)}ft average`);
    }
    // Throw count bonus — well-tested discs get preference
    score += Math.min(throws.length, 15);
    if (throws.length >= 10) {
      reasons.push('One of your most-used discs');
    }
  }

  // ── Category balance boost ────────────────────────────────────────────────
  const catPriority = CATEGORY_PRIORITY[disc.category ?? ''] ?? 1;
  score += catPriority * 2;

  // ── Flight number health check ────────────────────────────────────────────
  const speed = disc.speed ?? 5;
  const fade = disc.fade ?? 2;

  // Penalize very overstable approach discs unless wind is high
  if (fade >= 4 && speed <= 5 && !(weather && weather.wind_speed_kmh > WIND_HIGH_THRESHOLD)) {
    score -= 8;
  }

  return { score, reasons };
}

// ─── Main recommendation function ────────────────────────────────────────────

export function recommendBag(
  bags: { id: string; name: string; discs: BagDisc[] }[],
  weather: CurrentWeather | null,
  throwHistory: ThrowRecord[]
): RecommendationResult | null {
  if (!bags.length) return null;

  // Use the first bag (user's primary bag) or the one with the most discs
  const bag = bags.reduce((best, b) => b.discs.length > best.discs.length ? b : best, bags[0]);
  if (!bag.discs.length) return null;

  // Score all discs in the bag
  const scored = bag.discs.map(disc => {
    const { score, reasons } = scoreDisc(disc, weather, throwHistory);
    return { disc, score, reasons } as RecommendedDisc;
  });

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // Ensure category diversity in top picks
  const picks: RecommendedDisc[] = [];
  const usedCategories = new Set<string>();

  for (const item of scored) {
    if (picks.length >= MAX_PICKS) break;
    const cat = item.disc.category ?? 'Other';

    // Allow max 2 of same category to keep bag balanced
    const catCount = picks.filter(p => p.disc.category === cat).length;
    if (catCount < 2) {
      picks.push(item);
      usedCategories.add(cat);
    }
  }

  // Build context string
  let context = 'Based on your bag';
  if (weather) {
    const windDesc = weather.wind_speed_kmh > WIND_HIGH_THRESHOLD ? 'high wind' :
                     weather.wind_speed_kmh < WIND_LOW_THRESHOLD ? 'calm conditions' : 'moderate wind';
    context = `Today's picks for ${Math.round(weather.temperature_c)}°C, ${windDesc}`;
  }

  return { picks, bag_id: bag.id, bag_name: bag.name, context };
}
