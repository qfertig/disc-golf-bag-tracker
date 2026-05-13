'use client';

import { useState, useEffect } from 'react';
import { AlertTriangle, CircleDashed, Plus, ChevronDown, ChevronUp, Search } from 'lucide-react';
import {
  analyzeBagPower,
  SPEED_BANDS,
  STABILITY_COLUMNS,
  type BagPowerReport,
  type StabilitySlot,
  type SpeedBand,
} from '@/lib/engines/bagpower';
import type { BagDisc } from '@/lib/engines/recommendation';
import { dbQuery } from '@/lib/db';

// ─── Props ────────────────────────────────────────────────────────────────────

interface BagPowerMapProps {
  bagId: string;
  bagName: string;
  onFillGap?: (speedRange: [number, number], stabilityLabel: string) => void;
}

// ─── Score Ring ────────────────────────────────────────────────────────────────

function ScoreRing({ score }: { score: number }) {
  const radius = 36;
  const stroke = 5;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  const color =
    score >= 75 ? '#22c55e' :
    score >= 50 ? '#eab308' :
    '#ef4444';

  return (
    <div className="relative flex items-center justify-center" style={{ width: 88, height: 88 }}>
      <svg width={88} height={88} className="-rotate-90">
        {/* Background track */}
        <circle
          cx={44} cy={44} r={radius}
          fill="none"
          stroke="var(--border)"
          strokeWidth={stroke}
        />
        {/* Progress arc */}
        <circle
          cx={44} cy={44} r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1s cubic-bezier(0.4, 0, 0.2, 1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-black" style={{ color }}>{score}</span>
        <span className="text-[8px] font-bold text-[var(--text-muted)] uppercase tracking-widest">Power</span>
      </div>
    </div>
  );
}

// ─── Grid Cell ────────────────────────────────────────────────────────────────

function GridCell({ slot, bandColor }: { slot: StabilitySlot; bandColor: string }) {
  const [expanded, setExpanded] = useState(false);
  const count = slot.discs.length;

  if (count === 0) {
    return (
      <div
        className="rounded-xl border border-dashed border-[var(--border)] flex items-center justify-center min-h-[48px] opacity-30 hover:opacity-50 transition-opacity"
      >
        <Plus size={12} className="text-[var(--text-muted)]" />
      </div>
    );
  }

  const isStacked = count >= 3;

  return (
    <div
      onClick={() => count > 1 && setExpanded(v => !v)}
      className={`
        rounded-xl border p-1.5 min-h-[48px] flex flex-col gap-0.5 transition-all cursor-default
        ${isStacked
          ? 'border-amber-400/40 bg-amber-400/5'
          : 'border-[var(--border)] bg-[var(--surface-2)]'
        }
        ${count > 1 ? 'cursor-pointer active:scale-[0.97]' : ''}
      `}
    >
      {/* Show first disc always */}
      <div className="flex items-center gap-1">
        <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: bandColor }} />
        <span className="text-[9px] font-bold text-[var(--text-primary)] truncate leading-tight">
          {slot.discs[0].name}
        </span>
      </div>

      {/* Stack indicator */}
      {count > 1 && !expanded && (
        <div className="flex items-center gap-0.5">
          <span className={`text-[8px] font-black uppercase tracking-wider ${isStacked ? 'text-amber-400' : 'text-[var(--text-muted)]'}`}>
            +{count - 1} more
          </span>
          <ChevronDown size={8} className="text-[var(--text-muted)]" />
        </div>
      )}

      {/* Expanded list */}
      {expanded && slot.discs.slice(1).map(d => (
        <div key={d.id} className="flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: bandColor, opacity: 0.5 }} />
          <span className="text-[9px] font-medium text-[var(--text-muted)] truncate leading-tight">
            {d.name}
          </span>
        </div>
      ))}
      {expanded && (
        <div className="flex items-center gap-0.5">
          <ChevronUp size={8} className="text-[var(--text-muted)]" />
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function BagPowerMap({ bagId, bagName, onFillGap }: BagPowerMapProps) {
  const [report, setReport] = useState<BagPowerReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const discs = await dbQuery<BagDisc>(
          `SELECT dc.*, bd.id as bag_disc_id, bd.bag_id, bd.plastic, bd.weight, bd.notes
           FROM BagDiscs bd
           JOIN DiscCatalog dc ON dc.id = bd.disc_id
           WHERE bd.bag_id = ?`,
          [bagId]
        );
        if (!mounted) return;
        const r = analyzeBagPower(discs);
        setReport(r);
      } catch (e) {
        console.warn('[BagPowerMap] load error', e);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, [bagId]);

  if (loading) {
    return (
      <div className="flex flex-col gap-3 fade-up">
        <div className="flex flex-col mb-1">
          <h2 className="text-2xl font-black tracking-tighter text-[var(--text-primary)]">Power Map</h2>
          <p className="text-[var(--text-muted)] text-sm">{bagName}</p>
        </div>
        <div className="flex items-center gap-2 text-[var(--text-muted)] text-sm">
          <div className="w-4 h-4 rounded-full border-2 border-[var(--primary)] border-t-transparent animate-spin" />
          Mapping bag coverage...
        </div>
      </div>
    );
  }

  if (!report) return null;

  return (
    <div className="flex flex-col gap-5 fade-up pb-4">
      {/* Header */}
      <div className="flex flex-col mb-1">
        <h2 className="text-2xl font-black tracking-tighter text-[var(--text-primary)]">Power Map</h2>
        <p className="text-[var(--text-muted)] text-sm">{bagName} · {report.totalDiscs} discs</p>
      </div>

      {/* Score + Summary */}
      <div className="card !p-4 bg-[var(--surface-1)] flex items-center gap-4">
        <ScoreRing score={report.strengthScore} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[var(--text-primary)] leading-snug mb-2">
            {report.summary}
          </p>
          {/* Band breakdown */}
          <div className="flex gap-2 flex-wrap">
            {SPEED_BANDS.map(band => (
              <div key={band.id} className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: band.color }} />
                <span className="text-[10px] font-bold text-[var(--text-muted)]">
                  {report.bandCounts[band.id]} {band.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Stability Grid */}
      <div className="card !p-3 bg-[var(--surface-1)]">
        <p className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-3 px-1">
          Stability Coverage
        </p>

        {/* Column headers */}
        <div className="grid gap-1 mb-1.5" style={{ gridTemplateColumns: '64px repeat(5, 1fr)' }}>
          <div /> {/* empty corner */}
          {STABILITY_COLUMNS.map(col => (
            <div key={col.id} className="text-center">
              <span className="text-[8px] font-black text-[var(--text-muted)] uppercase tracking-wider">
                {col.short}
              </span>
            </div>
          ))}
        </div>

        {/* Grid rows */}
        {SPEED_BANDS.map((band, bandIdx) => (
          <div
            key={band.id}
            className="grid gap-1 mb-1"
            style={{ gridTemplateColumns: '64px repeat(5, 1fr)' }}
          >
            {/* Row label */}
            <div className="flex items-center gap-1.5 pr-1">
              <div className="w-2 h-full rounded-full shrink-0" style={{ backgroundColor: band.color, minHeight: 32 }} />
              <div className="flex flex-col min-w-0">
                <span className="text-[10px] font-black text-[var(--text-primary)] truncate leading-tight">
                  {band.label}
                </span>
                <span className="text-[8px] text-[var(--text-muted)] font-medium">
                  S{band.range[0]}–{band.range[1]}
                </span>
              </div>
            </div>

            {/* Cells */}
            {report.grid[bandIdx].map((slot, stabIdx) => (
              <GridCell
                key={`${band.id}-${stabIdx}`}
                slot={slot}
                bandColor={band.color}
              />
            ))}
          </div>
        ))}
      </div>

      {/* Gaps */}
      {report.gaps.length > 0 && (
        <div className="card !p-4 bg-[var(--surface-1)]">
          <p className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-3">
            <CircleDashed size={10} className="inline mr-1 text-amber-400" />
            Top Gaps to Fill
          </p>
          <div className="flex flex-col gap-1.5">
            {report.gaps.slice(0, 5).map((gap, i) => {
              const bandInfo = SPEED_BANDS.find(b => b.id === gap.band);
              const stabInfo = STABILITY_COLUMNS.find(c => c.id === gap.stability);
              return (
                <button
                  key={i}
                  onClick={() => onFillGap?.(bandInfo?.range ?? [1, 14], stabInfo?.label ?? '')}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-[var(--surface-0)] border border-dashed border-[var(--border)] hover:border-[var(--primary)]/40 hover:bg-[var(--surface-2)] transition-all active:scale-[0.98] text-left"
                >
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: bandInfo?.color }} />
                  <span className="text-xs font-bold text-[var(--text-primary)] flex-1">
                    {stabInfo?.label} {bandInfo?.label?.replace(/s$/, '')}
                  </span>
                  <Search size={13} className="text-[var(--primary)] shrink-0" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Stacks warning */}
      {report.stacks.length > 0 && (
        <div className="card !p-4 bg-amber-400/5 border-amber-400/20">
          <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest mb-2">
            <AlertTriangle size={10} className="inline mr-1" />
            Stacked Slots ({report.stacks.length})
          </p>
          <p className="text-xs text-[var(--text-muted)] leading-relaxed">
            {report.stacks.map(s => {
              const bandInfo = SPEED_BANDS.find(b => b.id === s.band);
              const stabInfo = STABILITY_COLUMNS.find(c => c.id === s.stability);
              return `${s.discs.length}× ${stabInfo?.label} ${bandInfo?.label}`;
            }).join(', ')}
            . These slots have 3+ discs filling the same role — consider if each brings something unique.
          </p>
        </div>
      )}

      {/* Footer */}
      <p className="text-[11px] text-[var(--text-muted)] opacity-50 text-center px-2">
        Coverage is estimated from flight numbers and stability ratings. Plastic, wear, and throw style always matter.
      </p>
    </div>
  );
}
