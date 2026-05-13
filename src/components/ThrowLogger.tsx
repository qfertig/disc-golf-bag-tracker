'use client';

import { useState, useMemo, useCallback } from 'react';
import { X, Check, ChevronDown } from 'lucide-react';
import { dbRun } from '@/lib/db';
import {
  THROW_PRESETS,
  THROW_HANDS,
  generatePath,
  serializePath,
  deserializePath,
  type ThrowPreset,
  type ThrowHand,
  type ThrowPathData,
} from '@/lib/engines/throwpath';
import { catmullRomPath } from '@/components/FlightPath';
import EditablePathCanvas from '@/components/EditablePathCanvas';

// ─── Types ────────────────────────────────────────────────────────────────────

const CONDITION_TAGS = [
  { id: 'headwind', label: 'Headwind', color: '#3b82f6' },
  { id: 'tailwind', label: 'Tailwind', color: '#22c55e' },
  { id: 'crosswind', label: 'Crosswind', color: '#a855f7' },
  { id: 'uphill', label: 'Uphill', color: '#f59e0b' },
  { id: 'downhill', label: 'Downhill', color: '#06b6d4' },
  { id: 'ob', label: 'OB', color: '#ef4444' },
  { id: 'ace', label: 'Ace', color: '#f97316' },
  { id: 'skip', label: 'Skip', color: '#84cc16' },
];

const PARSE_CONDITIONS_RE = /^\[(.+?)\]\s/;

interface ThrowLoggerProps {
  discId: string;
  discName: string;
  discBrand?: string;
  roundId?: string;
  holeNumber?: number;
  shotId?: string;
  editInitial?: {
    distance: number;
    preset: ThrowPreset;
    hand: ThrowHand;
    notes: string;
    pathJson: string | null;
  };
  onClose: () => void;
  onSaved?: () => void;
}

// ─── Mini Preset Card Preview ─────────────────────────────────────────────────

function MiniPreview({ preset, mirror }: { preset: ThrowPreset; mirror: boolean }) {
  const path = useMemo(() => generatePath(preset, 300, mirror), [preset, mirror]);
  const pts = path.points.map(([x, y]) => ({ x, y }));

  const w = 42, h = 42, pad = 4, xRange = 26;
  const tx = (x: number) => pad + (w - pad * 2) / 2 + (x / xRange) * ((w - pad * 2) / 2);
  const ty = (y: number) => h - pad - (y / 300) * (h - pad * 2);
  const d = catmullRomPath(pts, tx, ty);

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0">
      <line x1={tx(0)} y1={pad} x2={tx(0)} y2={h - pad}
        stroke="var(--border)" strokeWidth={0.5} strokeDasharray="2,2" />
      <path d={d} fill="none" stroke="var(--primary)" strokeWidth={2.5} strokeLinecap="round" />
      <circle cx={tx(pts[0].x)} cy={ty(pts[0].y)} r={2} fill="var(--text-primary)" />
      <circle cx={tx(pts[pts.length - 1].x)} cy={ty(pts[pts.length - 1].y)} r={2.5} fill="var(--primary)" />
    </svg>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

const VISIBLE_PRESETS = THROW_PRESETS.filter(p => p.id !== 'custom');

export default function ThrowLogger({ discId, discName, discBrand, roundId, holeNumber, shotId, editInitial, onClose, onSaved }: ThrowLoggerProps) {
  const [distance, setDistance] = useState(editInitial?.distance ?? 250);
  const [preset, setPreset] = useState<ThrowPreset>(editInitial?.preset ?? 'straight');
  const [hand, setHand] = useState<ThrowHand>(editInitial?.hand ?? 'rhbh');
  const [notes, setNotes] = useState(editInitial?.notes?.replace(PARSE_CONDITIONS_RE, '') ?? '');
  const [conditions, setConditions] = useState<Set<string>>(() => {
    if (editInitial?.notes) {
      const m = editInitial.notes.match(PARSE_CONDITIONS_RE);
      if (m) return new Set(m[1].split(', '));
    }
    return new Set();
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showHand, setShowHand] = useState(false);
  const [canvasVersion, setCanvasVersion] = useState(0);

  // Current editable path — starts as preset, user can reshape
  const mirror = hand === 'lhbh' || hand === 'lhfh';
  const defaultPath = useMemo(() => generatePath(preset, distance, mirror), [preset, distance, mirror]);
  const [editedPath, setEditedPath] = useState<ThrowPathData | null>(() => {
    if (editInitial?.pathJson) {
      const parsed = deserializePath(editInitial.pathJson);
      return parsed && parsed.preset === 'custom' ? parsed : null;
    }
    return null;
  });

  const activePath = editedPath ?? defaultPath;

  // When preset chip is tapped → clear edits, load new preset
  const handlePresetSelect = useCallback((p: ThrowPreset) => {
    setPreset(p);
    setEditedPath(null);
    setCanvasVersion(v => v + 1);
  }, []);

  // Canvas emits updated path when user drags a point
  const handlePathChange = useCallback((data: ThrowPathData) => {
    setEditedPath(data);
  }, []);

  // Canvas emits new distance when last anchor point is dragged
  const handleDistanceChange = useCallback((newDist: number) => {
    setDistance(newDist);
  }, []);

  // Reset button inside canvas → restore preset defaults
  const handleReset = useCallback(() => {
    setEditedPath(null);
    setCanvasVersion(v => v + 1);
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const id = shotId || crypto.randomUUID();
      const shape = editedPath ? 'custom' : preset;
      const pathJson = serializePath({ ...activePath, preset: shape });
      const conditionStr = conditions.size > 0 ? `[${[...conditions].join(', ')}] ` : '';
      const fullNotes = conditionStr + notes || null;
      if (shotId) {
        await dbRun(
          `UPDATE Shots SET distance=?, shape=?, path_json=?, throw_style=?, notes=? WHERE id=?`,
          [distance, shape, pathJson, hand, fullNotes, shotId]
        );
      } else {
        await dbRun(
          `INSERT INTO Shots (id, disc_name, disc_id, distance, shape, path_json, throw_style, notes, round_id, hole_number, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, discName, discId, distance, shape, pathJson, hand, fullNotes, roundId || null, holeNumber ?? null, Date.now()]
        );
      }
      setSaved(true);
      onSaved?.();
      setTimeout(() => onClose(), 700);
    } catch (e) {
      console.error('[ThrowLogger] save error', e);
      setSaving(false);
    }
  };

  const handInfo = THROW_HANDS.find(h => h.id === hand)!;
  const isModified = editedPath !== null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center font-sans overflow-hidden">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />
      <div
        className="relative w-full max-w-lg bg-[var(--surface-2)] rounded-t-[28px] shadow-2xl flex flex-col max-h-[94vh] animate-in slide-in-from-bottom-4 duration-300 pointer-events-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="w-10 h-1 bg-[var(--border)] rounded-full mx-auto mt-2.5 mb-1 shrink-0" />

        {/* Header — clean hierarchy */}
        <div className="flex items-center justify-between px-5 pt-1.5 pb-1 shrink-0 border-b border-[var(--border)] mb-1">
          <div className="min-w-0">
            <h2 className="text-base font-black tracking-tight text-[var(--text-primary)] leading-tight truncate">
              {discName}
              {discBrand && <span className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider opacity-60">{discBrand}</span>}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center bg-[var(--surface-3)] text-[var(--text-muted)] active:scale-90 transition-transform"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable body */}
        <div 
          className="flex-1 overflow-y-auto px-5 pb-16 flex flex-col gap-3 scroll-smooth"
          style={{ overscrollBehavior: 'contain' }}
        >

          {/* Distance + Hand — single row */}
          <div className="flex items-center gap-3">
            <input
              type="range" min={50} max={600} step={5} value={distance}
              onChange={e => { setDistance(Number(e.target.value)); setEditedPath(null); setCanvasVersion(v => v + 1); }}
              className="flex-1 accent-[var(--primary)]"
            />
            <div className="flex items-baseline gap-0.5 shrink-0">
              <input
                type="number" value={distance}
                onChange={e => { setDistance(Math.min(600, Math.max(50, Number(e.target.value) || 50))); setEditedPath(null); setCanvasVersion(v => v + 1); }}
                className="w-12 bg-transparent text-right text-base font-black text-[var(--text-primary)] outline-none"
              />
              <span className="text-[11px] font-black text-[var(--text-muted)] opacity-70">ft</span>
            </div>
            {/* Throw hand inline */}
            <div className="relative shrink-0">
              <button
                onClick={() => setShowHand(v => !v)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--surface-3)] text-[11px] font-black uppercase tracking-wider text-[var(--text-primary)] border border-[var(--border)] active:scale-95 transition-all"
              >
                {handInfo.short}
                <ChevronDown size={10} className={`transition-transform duration-200 ${showHand ? 'rotate-180' : ''}`} />
              </button>
              {showHand && (
                <div className="absolute right-0 top-full mt-1 z-10 flex flex-col gap-1 bg-[var(--surface-3)] rounded-xl p-1.5 shadow-xl border border-[var(--border)] min-w-[120px]">
                  {THROW_HANDS.map(h => (
                    <button key={h.id} onClick={() => { setHand(h.id); setShowHand(false); }}
                      className={`px-2.5 py-1.5 rounded-lg text-[10px] font-black text-left transition-all ${
                        hand === h.id ? 'bg-[var(--primary)] text-white' : 'text-[var(--text-muted)] hover:bg-[var(--surface-2)]'
                      }`}>
                      {h.short}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Preset chips — clean & compact */}
          <div>
            <div className="flex items-center justify-between mb-1.5 px-0.5">
              <p className="text-[9px] font-black uppercase text-[var(--text-muted)] tracking-[0.05em] opacity-80">Shot Shape</p>
              {isModified && (
                <span className="text-[8px] font-bold text-[var(--primary)] uppercase tracking-wider">
                  Custom
                </span>
              )}
            </div>
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
              {VISIBLE_PRESETS.map(p => (
                <button
                  key={p.id}
                  onClick={() => handlePresetSelect(p.id)}
                  className={`flex flex-col items-center gap-1.5 px-2.5 pt-2.5 pb-2 rounded-2xl border transition-all shrink-0 min-w-[64px] ${
                    preset === p.id && !isModified
                      ? 'bg-[var(--primary-tonal)] border-[var(--primary)] scale-[1.02]'
                      : 'bg-[var(--surface-3)] border-transparent'
                  }`}
                >
                  <MiniPreview preset={p.id} mirror={mirror} />
                  <span className={`text-[8px] font-bold uppercase tracking-tight ${
                    preset === p.id && !isModified ? 'text-[var(--primary)]' : 'text-[var(--text-muted)]/60'
                  }`}>
                    {p.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Condition tags — optional chips */}
          <div>
            <p className="text-[9px] font-black uppercase text-[var(--text-muted)] tracking-[0.05em] opacity-60 mb-1 px-0.5">Conditions</p>
            <div className="flex gap-1 flex-wrap">
              {CONDITION_TAGS.map(ct => {
                const active = conditions.has(ct.id);
                return (
                  <button
                    key={ct.id}
                    onClick={() => setConditions(prev => {
                      const next = new Set(prev);
                      next.has(ct.id) ? next.delete(ct.id) : next.add(ct.id);
                      return next;
                    })}
                    className={`px-2.5 py-1 rounded-lg text-[9px] font-bold transition-all active:scale-95 ${
                      active ? 'text-white' : 'text-[var(--text-muted)] bg-[var(--surface-3)]'
                    }`}
                    style={active ? { backgroundColor: ct.color } : undefined}
                  >
                    {ct.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Editable path canvas — the centrepiece */}
          <EditablePathCanvas
            initialPoints={defaultPath.points}
            distance={distance}
            preset={preset}
            resetVersion={canvasVersion}
            onChange={handlePathChange}
            onDistanceChange={handleDistanceChange}
            onReset={handleReset}
          />

          {/* Notes */}
          <input
            type="text"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Add notes..."
            className="w-full bg-[var(--surface-3)] border border-[var(--border)] rounded-xl px-4 py-2.5 text-[13px] focus:border-[var(--primary)] outline-none placeholder:text-[var(--text-muted)]/40"
          />

          {/* Save */}
          <button
            onClick={handleSave}
            disabled={saving || saved}
            className={`w-full py-3 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition-all ${
              saved ? 'bg-green-500 text-white' : 'bg-[var(--primary)] text-white shadow-lg active:scale-[0.98]'
            } disabled:opacity-70`}
          >
            {saved ? <><Check size={18} /> Saved!</> : isModified ? 'Save Custom Path' : 'Save Throw'}
          </button>
        </div>
      </div>
    </div>
  );
}
