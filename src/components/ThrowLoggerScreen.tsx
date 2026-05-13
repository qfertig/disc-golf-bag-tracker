'use client';

import { useState, useEffect, useMemo } from 'react';
import { Crosshair, Plus, ChevronDown, Disc3, Trash2, Calendar } from 'lucide-react';
import { dbQuery, dbRun } from '@/lib/db';
import ThrowLogger from './ThrowLogger';
import {
  deserializePath,
  toFlightPoints,
  THROW_PRESETS,
  type ThrowPathData,
} from '@/lib/engines/throwpath';
import { catmullRomPath } from '@/components/FlightPath';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BagDisc {
  id: string;
  name: string;
  brand: string;
  speed: number;
  bd_id: string;
  bag_id: string;
}

interface ThrowRecord {
  id: string;
  disc_name: string;
  disc_id: string;
  distance: number;
  shape: string;
  path_json: string | null;
  throw_style: string | null;
  notes: string | null;
  created_at: number;
}

// ─── Tiny path thumbnail for history ──────────────────────────────────────────

function parseConditions(notes: string | null): { tags: string[]; cleanNotes: string } {
  if (!notes) return { tags: [], cleanNotes: '' };
  const m = notes.match(/^\[(.+?)\]\s/);
  if (!m) return { tags: [], cleanNotes: notes };
  return { tags: m[1].split(', '), cleanNotes: notes.replace(/^\[.+?\]\s/, '') };
}

const CONDITION_COLORS: Record<string, string> = {
  headwind: '#3b82f6', tailwind: '#22c55e', crosswind: '#a855f7',
  uphill: '#f59e0b', downhill: '#06b6d4', ob: '#ef4444', ace: '#f97316', skip: '#84cc16',
};

function ThrowPathThumb({ pathData, distance }: { pathData: ThrowPathData; distance: number }) {
  const points = toFlightPoints(pathData);
  const w = 32, h = 44;
  const pad = 3;
  const xRange = 25;
  const tx = (x: number) => pad + (w - pad * 2) / 2 + (x / xRange) * ((w - pad * 2) / 2);
  const ty = (y: number) => h - pad - (y / distance) * (h - pad * 2);
  const d = catmullRomPath(points, tx, ty);

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0 opacity-70">
      <path d={d} fill="none" stroke="#22c55e" strokeWidth={2} strokeLinecap="round" />
      <circle cx={tx(points[points.length - 1].x)} cy={ty(points[points.length - 1].y)} r={1.5} fill="#22c55e" />
    </svg>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ThrowLoggerScreen() {
  const [bagDiscs, setBagDiscs] = useState<BagDisc[]>([]);
  const [throws, setThrows] = useState<ThrowRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDisc, setSelectedDisc] = useState<BagDisc | null>(null);
  const [showLogger, setShowLogger] = useState(false);
  const [showDiscPicker, setShowDiscPicker] = useState(false);
  const [editThrowData, setEditThrowData] = useState<{
    shotId: string; discId: string; discName: string; discBrand: string;
    distance: number; shape: string; throwStyle: string; notes: string; pathJson: string | null;
  } | null>(null);

  const loadData = async () => {
    try {
      const discs = await dbQuery<BagDisc>(
        `SELECT dc.id, dc.name, dc.brand, dc.speed, bd.id as bd_id, bd.bag_id
         FROM BagDiscs bd
         JOIN DiscCatalog dc ON dc.id = bd.disc_id
         ORDER BY dc.name ASC`
      );
      setBagDiscs(discs);

      const throwRows = await dbQuery<ThrowRecord>(
        `SELECT * FROM Shots WHERE path_json IS NOT NULL ORDER BY created_at DESC LIMIT 50`
      );
      setThrows(throwRows);
    } catch (e) {
      console.warn('[ThrowLoggerScreen] load error', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const onFocus = () => loadData();
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('app:refresh', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('app:refresh', onFocus);
    };
  }, []);

  const handleEditThrow = async (id: string) => {
    try {
      const rows = await dbQuery<ThrowRecord>('SELECT * FROM Shots WHERE id = ?', [id]);
      if (rows.length === 0) return;
      const s = rows[0];
      setEditThrowData({
        shotId: s.id,
        discId: s.disc_id,
        discName: s.disc_name,
        discBrand: '',
        distance: s.distance,
        shape: s.shape || 'straight',
        throwStyle: s.throw_style || 'rhbh',
        notes: s.notes || '',
        pathJson: s.path_json,
      });
    } catch (e) { console.error(e); }
  };

  const deleteThrow = async (id: string) => {
    await dbRun('DELETE FROM Shots WHERE id = ?', [id]);
    setThrows(prev => prev.filter(t => t.id !== id));
  };

  const handleSaved = () => {
    setShowLogger(false);
    setSelectedDisc(null);
    loadData();
  };

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 604800000) return d.toLocaleDateString('en-US', { weekday: 'short' });
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const presetLabel = (shape: string) => {
    return THROW_PRESETS.find(p => p.id === shape)?.label ?? shape;
  };

  // Deduplicate discs by id (same disc in multiple bags)
  const uniqueDiscs = useMemo(() => {
    const seen = new Set<string>();
    return bagDiscs.filter(d => {
      if (seen.has(d.id)) return false;
      seen.add(d.id);
      return true;
    });
  }, [bagDiscs]);

  if (loading) {
    return (
      <div className="flex flex-col gap-4 fade-up">
        <h1 className="text-2xl font-black tracking-tighter text-[var(--text-primary)]">Throw Logger</h1>
        <div className="flex items-center gap-2 text-[var(--text-muted)] text-sm">
          <div className="w-4 h-4 rounded-full border-2 border-[var(--primary)] border-t-transparent animate-spin" />
          Loading...
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-5 fade-up">
        {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tighter text-[var(--text-primary)]">Throw Logger</h1>
          <p className="text-xs text-[var(--text-muted)] font-medium mt-0.5">{throws.length} throw{throws.length !== 1 ? 's' : ''} logged</p>
        </div>
      </div>

      {/* New throw CTA */}
      {uniqueDiscs.length === 0 ? (
        <div className="card border-dashed !border-[var(--border)] text-center py-10 opacity-70">
          <Disc3 size={32} className="mx-auto mb-3 text-[var(--text-muted)]" />
          <p className="text-sm font-bold text-[var(--text-muted)]">No discs in your bags yet</p>
          <p className="text-xs text-[var(--text-muted)] mt-1">Add discs to a bag first, then log throws here.</p>
        </div>
      ) : (
        <div className="card !p-4 bg-[var(--surface-1)]">
          <p className="text-[10px] font-black uppercase text-[var(--text-muted)] tracking-widest mb-3">Log a Throw</p>

          {/* Disc selector */}
          <button
            onClick={() => setShowDiscPicker(v => !v)}
            className="w-full flex items-center justify-between p-4 rounded-2xl bg-[var(--surface-3)] border border-[var(--border)] hover:border-[var(--primary)]/40 transition-all mb-3"
          >
            <div className="flex items-center gap-3">
              <Disc3 size={18} className="text-[var(--primary)]" />
              <div className="text-left">
                {selectedDisc ? (
                  <>
                    <p className="text-sm font-bold text-[var(--text-primary)]">{selectedDisc.name}</p>
                    <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase">{selectedDisc.brand}</p>
                  </>
                ) : (
                  <p className="text-sm font-medium text-[var(--text-muted)]">Select a disc...</p>
                )}
              </div>
            </div>
            <ChevronDown size={16} className={`text-[var(--text-muted)] transition-transform ${showDiscPicker ? 'rotate-180' : ''}`} />
          </button>

          {/* Disc picker dropdown */}
          {showDiscPicker && (
            <div className="max-h-[240px] overflow-y-auto rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] mb-3 no-scrollbar">
              {uniqueDiscs.map(d => (
                <button
                  key={d.id}
                  onClick={() => { setSelectedDisc(d); setShowDiscPicker(false); }}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--surface-3)] transition-colors ${
                    selectedDisc?.id === d.id ? 'bg-[var(--primary-tonal)]' : ''
                  }`}
                >
                  <Disc3 size={14} className={selectedDisc?.id === d.id ? 'text-[var(--primary)]' : 'text-[var(--text-muted)]'} />
                  <div className="min-w-0">
                    <p className={`text-sm font-bold truncate ${selectedDisc?.id === d.id ? 'text-[var(--primary)]' : 'text-[var(--text-primary)]'}`}>
                      {d.name}
                    </p>
                    <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase truncate">{d.brand}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Start logging button */}
          <button
            onClick={() => { if (selectedDisc) setShowLogger(true); }}
            disabled={!selectedDisc}
            className="w-full py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 bg-[var(--primary)] text-white shadow-lg active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus size={18} />
            {selectedDisc ? `Log Throw with ${selectedDisc.name}` : 'Select a disc first'}
          </button>
        </div>
      )}

      {/* Throw History */}
      {throws.length > 0 && (
        <div>
          <p className="text-[10px] font-black uppercase text-[var(--text-muted)] tracking-widest mb-3 px-1">
            <Calendar size={10} className="inline mr-1" />
            Recent Throws
          </p>
          <div className="flex flex-col gap-2">
            {throws.map(t => {
              const pathData = deserializePath(t.path_json);
              return (
                <div
                  key={t.id}
                  className="card !p-3 bg-[var(--surface-1)] flex items-center gap-3"
                >
                  {/* Path thumbnail */}
                  {pathData && t.distance > 0 && (
                    <ThrowPathThumb pathData={pathData} distance={t.distance} />
                  )}

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-bold text-[var(--text-primary)] truncate">{t.disc_name}</span>
                      <span className="text-[10px] font-black text-[var(--primary)] uppercase">{presetLabel(t.shape)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)] font-bold">
                      <span>{t.distance}ft</span>
                      {t.throw_style && <span className="uppercase">{t.throw_style}</span>}
                      {(() => {
                        const { tags, cleanNotes } = parseConditions(t.notes);
                        return (
                          <>
                            {tags.map(tag => (
                              <span key={tag} className="px-1 py-0.5 rounded text-[8px] font-bold text-white" style={{ backgroundColor: CONDITION_COLORS[tag] || '#888' }}>{tag}</span>
                            ))}
                            {cleanNotes && <span className="truncate opacity-60">· {cleanNotes}</span>}
                          </>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Time + actions */}
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="text-[9px] font-bold text-[var(--text-muted)]">{formatDate(t.created_at)}</span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleEditThrow(t.id)}
                        className="w-6 h-6 rounded-full flex items-center justify-center text-[var(--text-muted)] hover:bg-[var(--primary-tonal)] hover:text-[var(--primary)] transition-all"
                      >
                        ✎
                      </button>
                      <button
                        onClick={() => deleteThrow(t.id)}
                        className="w-6 h-6 rounded-full flex items-center justify-center text-[var(--text-muted)] hover:bg-red-500/10 hover:text-red-400 transition-all"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty state for history */}
      {throws.length === 0 && uniqueDiscs.length > 0 && (
        <div className="text-center py-6 opacity-50">
          <p className="text-xs font-bold text-[var(--text-muted)]">No throws logged yet. Pick a disc above and start tracking!</p>
        </div>
        )}
      </div>

      {/* ThrowLogger modal — new throw */}
      {showLogger && selectedDisc && (
        <ThrowLogger
          discId={selectedDisc.id}
          discName={selectedDisc.name}
          discBrand={selectedDisc.brand}
          onClose={() => setShowLogger(false)}
          onSaved={handleSaved}
        />
      )}

      {/* ThrowLogger modal — edit existing throw */}
      {editThrowData && (
        <ThrowLogger
          discId={editThrowData.discId}
          discName={editThrowData.discName}
          discBrand={editThrowData.discBrand}
          shotId={editThrowData.shotId}
          editInitial={{
            distance: editThrowData.distance,
            preset: editThrowData.shape as any,
            hand: editThrowData.throwStyle as any,
            notes: editThrowData.notes,
            pathJson: editThrowData.pathJson,
          }}
          onClose={() => setEditThrowData(null)}
          onSaved={() => { setEditThrowData(null); loadData(); }}
        />
      )}
    </>
  );
}
