'use client';

import { useState, useEffect } from 'react';
import { X, Sparkles, ChevronRight } from 'lucide-react';
import { recommendBag, type RecommendationResult, type BagDisc, type ThrowRecord } from '@/lib/engines/recommendation';
import { fetchWeather, type CurrentWeather } from '@/lib/services/weather';
import { dbQuery } from '@/lib/db';

interface RecommendationCardProps {
  lat: number | null;
  lon: number | null;
  onDiscPress?: (disc: BagDisc) => void;
}

export default function RecommendationCard({ lat, lon, onDiscPress }: RecommendationCardProps) {
  const [result, setResult] = useState<RecommendationResult | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        // Load all bags with discs
        const bags = await dbQuery<{ id: string; name: string }>('SELECT id, name FROM Bags ORDER BY created_at DESC');
        const bagsWithDiscs = await Promise.all(
          bags.slice(0, 3).map(async bag => {
            const discs = await dbQuery<BagDisc>(
              `SELECT dc.*, bd.id as bag_disc_id, bd.bag_id, bd.plastic, bd.weight, bd.notes
               FROM BagDiscs bd
               JOIN DiscCatalog dc ON dc.id = bd.disc_id
               WHERE bd.bag_id = ?`,
              [bag.id]
            );
            return { id: bag.id, name: bag.name, discs };
          })
        );

        // Load throw history
        const throws = await dbQuery<ThrowRecord>(
          'SELECT disc_id, distance, shape FROM Shots WHERE disc_id IS NOT NULL AND distance > 0 ORDER BY created_at DESC LIMIT 200'
        );

        // Get weather if we have location
        let weather: CurrentWeather | null = null;
        if (lat != null && lon != null) {
          const wr = await fetchWeather(lat, lon);
          if (wr.ok) weather = wr.data.current;
        }

        if (!mounted) return;
        const rec = recommendBag(bagsWithDiscs, weather, throws);
        setResult(rec);
      } catch (e) {
        console.warn('[RecommendationCard] load error', e);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, [lat, lon]);

  if (dismissed || loading || !result || result.picks.length === 0) return null;

  return (
    <div className="card !p-4 flex flex-col gap-3 bg-gradient-to-br from-[var(--surface-1)] to-[var(--surface-2)] border border-[var(--primary)]/20">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-[var(--primary-tonal)] flex items-center justify-center">
          <Sparkles size={14} className="text-[var(--primary)]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-black text-[var(--text-primary)] truncate">Today's Picks</p>
          <p className="text-[10px] text-[var(--text-muted)] truncate">{result.context}</p>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-[var(--surface-3)] active:scale-90 transition-all"
          aria-label="Dismiss"
        >
          <X size={12} className="text-[var(--text-muted)]" />
        </button>
      </div>

      {/* Picks list */}
      <div className="flex flex-col gap-1.5">
        {result.picks.slice(0, 4).map(({ disc, reasons }) => (
          <div
            key={disc.bag_disc_id}
            role={onDiscPress ? 'button' : 'listitem'}
            tabIndex={onDiscPress ? 0 : undefined}
            onClick={() => onDiscPress?.(disc)}
            onKeyDown={e => { if (e.key === 'Enter') onDiscPress?.(disc); }}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--surface-0)] ${onDiscPress ? 'cursor-pointer active:scale-[0.98] hover:bg-[var(--surface-2)]' : ''} transition-all`}
          >
            {/* Disc color swatch */}
            <div
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{
                backgroundColor: (disc as unknown as { color?: string }).color ?? 'var(--primary)',
                opacity: 0.8,
              }}
            />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-[var(--text-primary)] truncate">
                {disc.brand} {disc.name}
              </p>
              {reasons[0] && (
                <p className="text-[10px] text-[var(--text-muted)] truncate">{reasons[0]}</p>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-tight">
                {disc.category?.replace(' Driver', '').replace('Distance', 'Dist')}
              </span>
              {onDiscPress && <ChevronRight size={10} className="text-[var(--text-muted)]" />}
            </div>
          </div>
        ))}
      </div>

      <p className="text-[10px] text-[var(--text-muted)] opacity-60 text-center">
        Based on {lat != null ? 'weather + ' : ''}throw history · From: {result.bag_name}
      </p>
    </div>
  );
}
