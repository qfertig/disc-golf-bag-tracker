'use client';

import { useState, useEffect } from 'react';
import { AlertTriangle, CheckCircle2, Info, ChevronDown, ChevronUp } from 'lucide-react';
import { detectOverlaps, type OverlapReport, type OverlapPair, type OverlapClass } from '@/lib/engines/overlap';
import type { BagDisc, ThrowRecord } from '@/lib/engines/recommendation';
import { dbQuery } from '@/lib/db';

interface OverlapAnalyzerProps {
  bagId: string;
  bagName: string;
}

const classConfig: Record<OverlapClass, { icon: typeof AlertTriangle; color: string; bg: string; label: string }> = {
  'High Overlap': {
    icon: AlertTriangle,
    color: 'text-amber-400',
    bg: 'bg-amber-400/10 border-amber-400/20',
    label: 'High Overlap',
  },
  'Situational Overlap': {
    icon: Info,
    color: 'text-blue-400',
    bg: 'bg-blue-400/10 border-blue-400/20',
    label: 'Situational',
  },
  'Complementary': {
    icon: CheckCircle2,
    color: 'text-green-400',
    bg: 'bg-green-400/10 border-green-400/20',
    label: 'Complementary',
  },
};

function PairCard({ pair }: { pair: OverlapPair }) {
  const [expanded, setExpanded] = useState(false);
  const config = classConfig[pair.classification];
  const Icon = config.icon;

  return (
    <div className={`rounded-2xl border p-3 flex flex-col gap-2 ${config.bg}`}>
      <div
        className="flex items-center gap-2 cursor-pointer"
        onClick={() => setExpanded(v => !v)}
      >
        <Icon size={15} className={config.color} />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-[var(--text-primary)]">
            {pair.discA.brand} {pair.discA.name} &amp; {pair.discB.brand} {pair.discB.name}
          </p>
          <p className={`text-[10px] font-semibold uppercase tracking-wider ${config.color}`}>
            {config.label} · {pair.overlap_score}% similar
          </p>
        </div>
        {expanded ? <ChevronUp size={14} className="text-[var(--text-muted)] shrink-0" /> 
                  : <ChevronDown size={14} className="text-[var(--text-muted)] shrink-0" />}
      </div>

      {expanded && (
        <div className="flex flex-col gap-2 pt-1 border-t border-[var(--border)]/50">
          {pair.reasons.length > 0 && (
            <div>
              <p className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-1">Similar because:</p>
              <ul className="flex flex-col gap-0.5">
                {pair.reasons.map((r, i) => (
                  <li key={i} className="text-xs text-[var(--text-muted)] flex gap-1.5">
                    <span className={config.color}>•</span>{r}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {pair.differentiators.length > 0 && (
            <div>
              <p className="text-[10px] font-black text-green-400/80 uppercase tracking-widest mb-1">What makes them different:</p>
              <ul className="flex flex-col gap-0.5">
                {pair.differentiators.map((d, i) => (
                  <li key={i} className="text-xs text-[var(--text-muted)] flex gap-1.5">
                    <span className="text-green-400">✓</span>{d}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-[10px] text-[var(--text-muted)] opacity-50 italic">
            Both discs are in your bag. This is just info — no disc is being suggested for removal.
          </p>
        </div>
      )}
    </div>
  );
}

export default function OverlapAnalyzer({ bagId, bagName }: OverlapAnalyzerProps) {
  const [report, setReport] = useState<OverlapReport | null>(null);
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

        const throws = await dbQuery<ThrowRecord>(
          'SELECT disc_id, distance, shape FROM Shots WHERE disc_id IS NOT NULL AND distance > 0 ORDER BY created_at DESC LIMIT 500'
        );

        if (!mounted) return;
        const r = detectOverlaps(discs, throws);
        setReport(r);
      } catch (e) {
        console.warn('[OverlapAnalyzer] load error', e);
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
          <h2 className="text-2xl font-black tracking-tighter text-[var(--text-primary)]">Bag Analysis</h2>
          <p className="text-[var(--text-muted)] text-sm">{bagName}</p>
        </div>
        <div className="flex items-center gap-2 text-[var(--text-muted)] text-sm">
          <div className="w-4 h-4 rounded-full border-2 border-[var(--primary)] border-t-transparent animate-spin" />
          Analyzing disc overlap...
        </div>
      </div>
    );
  }

  if (!report) return null;

  const byClass = {
    'High Overlap': report.pairs.filter(p => p.classification === 'High Overlap'),
    'Situational Overlap': report.pairs.filter(p => p.classification === 'Situational Overlap'),
    'Complementary': report.pairs.filter(p => p.classification === 'Complementary'),
  };

  return (
    <div className="flex flex-col gap-4 fade-up pb-4">
      <div className="flex flex-col mb-1">
        <h2 className="text-2xl font-black tracking-tighter text-[var(--text-primary)]">Bag Analysis</h2>
        <p className="text-[var(--text-muted)] text-sm">{bagName} · {report.total_discs} discs</p>
      </div>

      {/* Insight Card */}
      <div className="p-4 rounded-[24px] bg-[var(--surface-1)] border border-[var(--border)] shadow-sm">
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 shrink-0 ${report.pairs.length === 0 ? 'text-[var(--text-muted)]' : byClass['High Overlap'].length > 0 ? 'text-amber-400' : 'text-blue-400'}`}>
            {report.pairs.length === 0 ? <Info size={18} /> : byClass['High Overlap'].length > 0 ? <AlertTriangle size={18} /> : <Info size={18} />}
          </div>
          <div className="flex flex-col gap-3">
            <p className="text-[13px] font-medium text-[var(--text-primary)] leading-relaxed">
              {report.summary}
            </p>
            {report.pairs.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {byClass['High Overlap'].length > 0 && (
                  <span className="text-[10px] font-black uppercase tracking-wider text-amber-400 bg-amber-400/10 px-2 py-1 rounded-md">
                    {byClass['High Overlap'].length} High Overlap
                  </span>
                )}
                {byClass['Situational Overlap'].length > 0 && (
                  <span className="text-[10px] font-black uppercase tracking-wider text-blue-400 bg-blue-400/10 px-2 py-1 rounded-md">
                    {byClass['Situational Overlap'].length} Situational
                  </span>
                )}
                {byClass['Complementary'].length > 0 && (
                  <span className="text-[10px] font-black uppercase tracking-wider text-green-400 bg-green-400/10 px-2 py-1 rounded-md">
                    {byClass['Complementary'].length} Complementary
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {report.pairs.length > 0 && (
        <div className="flex flex-col gap-2">
          {(['High Overlap', 'Situational Overlap', 'Complementary'] as OverlapClass[]).map(cls => (
            byClass[cls].length > 0 && (
              <div key={cls} className="flex flex-col gap-2">
                <p className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest px-1">
                  {cls} ({byClass[cls].length})
                </p>
                {byClass[cls].map((pair, i) => (
                  <PairCard key={i} pair={pair} />
                ))}
              </div>
            )
          ))}
        </div>
      )}

      <p className="text-[11px] text-[var(--text-muted)] opacity-50 text-center px-2">
        Overlap analysis uses flight numbers and your throw history. Plastic, wear, and personal feel always matter.
      </p>
    </div>
  );
}
