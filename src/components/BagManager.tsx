'use client';

import { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import { dbQuery, dbRun } from '@/lib/db';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Preferences } from '@capacitor/preferences';
import { Plus, Trash2, Download, Upload, Backpack, Disc3, LineChart, ChevronDown, ChevronUp, Copy, Move, Scale, Check, Crosshair } from 'lucide-react';
import { ConfirmDialog, Toast } from './Dialogs';
import BagQrCode from './BagQrCode';
import DiscPhotoButton from './DiscPhotoButton';
import FlightNumbers from './FlightNumbers';
import FlightPath from './FlightPath';
import BagPowerMap from './BagPowerMap';
import OverlapAnalyzer from './OverlapAnalyzer';
import ThrowLogger from './ThrowLogger';
import { buildFlightModel, FlightChart } from './FlightPath';

interface Bag {
  id: string;
  name: string;
  created_at: number;
}

interface BagDisc {
  bd_id: string;
  id: string;
  disc_id: string;
  name: string;
  brand?: string;
  category?: string;
  speed?: number | string;
  glide?: number | string;
  turn?: number | string;
  fade?: number | string;
  stability?: string;
  plastic?: string;
  weight?: string;
  notes?: string;
}

function stabilityClass(stability: string) {
  if (stability === 'Very Overstable') return 'very-overstable';
  if (stability.includes('Overstable')) return 'overstable';
  if (stability === 'Very Understable') return 'very-understable';
  if (stability.includes('Understable')) return 'understable';
  return 'neutral';
}

function getDiscColor(disc: BagDisc) {
  const speed = Number(disc.speed);
  if (speed >= 12) return '#ef4444'; // Distance
  if (speed >= 9) return '#f97316';  // Control
  if (speed >= 6) return '#eab308';  // Fairway
  if (speed >= 4) return '#22c55e';  // Mid
  return '#3b82f6';                 // Putter
}

function BagDiscCard({ disc, onMove, onRemove, onCompare, onLogThrow, onEditDetails, isComparing, discColor }: { disc: BagDisc, onMove: () => void, onRemove: () => void, onCompare: () => void, onLogThrow: () => void, onEditDetails: () => void, isComparing: boolean, discColor: string }) {
  const [expanded, setExpanded] = useState(false);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchStartY, setTouchStartY] = useState<number | null>(null);
  const [touchOffset, setTouchOffset] = useState(0);
  const stability = disc.stability || 'Neutral';

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.targetTouches[0].clientX);
    setTouchStartY(e.targetTouches[0].clientY);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartX === null || touchStartY === null) return;
    const diffX = touchStartX - e.targetTouches[0].clientX;
    const diffY = touchStartY - e.targetTouches[0].clientY;
    // Only handle horizontal swipes; let vertical scrolling pass through
    if (Math.abs(diffY) > Math.abs(diffX)) return;
    // Only allow left swipe and limit distance
    if (diffX > 0) {
      setTouchOffset(Math.min(diffX, 120));
    } else {
      setTouchOffset(0);
    }
  };

  const handleTouchEnd = () => {
    if (touchOffset > 80) {
      onRemove();
    }
    setTouchOffset(0);
    setTouchStartX(null);
    setTouchStartY(null);
  };

  return (
    <div
      className="relative overflow-hidden rounded-[var(--radius-card)] touch-pan-y"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Swipe Action Background - Revealed under the card */}
      <div
        className="absolute inset-0 bg-red-500 flex items-center justify-end px-8 transition-opacity"
        style={{ opacity: touchOffset > 10 ? 1 : 0 }}
      >
        <div className={`flex flex-col items-center gap-1 transition-transform ${touchOffset > 80 ? 'scale-125' : 'scale-100'}`}>
          <Trash2 className="text-white" size={24} />
          <span className="text-[10px] text-white font-bold uppercase">Remove</span>
        </div>
      </div>

      <div
        className={`card !py-2 !px-3 transition-all group relative z-10 select-none border-2 ${isComparing ? 'border-[var(--primary)] bg-[var(--primary-tonal)]' : 'border-transparent hover:bg-[var(--surface-2)]'}`}
        style={{
          transform: `translateX(${-touchOffset}px)`,
          transition: touchStartX === null ? 'transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)' : 'none'
        }}
      >
        <div className="flex items-center gap-2">
          {/* Custom photo thumbnail / add button */}
          <DiscPhotoButton bagDiscId={disc.bd_id} discName={disc.name} />
          <div className="flex-1 min-w-0" onClick={() => setExpanded(!expanded)}>
            <div className="flex items-center gap-2 mb-0.5">
              <p className="disc-name !text-[15px] truncate leading-tight">{disc.name}</p>
              <span className={`stability-chip !text-[8px] !px-1.5 !min-h-[14px] !font-black ${stabilityClass(stability)}`}>
                {stability.replace('Overstable', 'OS').replace('Understable', 'US')}
              </span>
            </div>
            <p className="text-[11px] text-[var(--text-muted)] font-medium truncate leading-tight">
              {disc.brand} • <span className="uppercase tracking-wider font-extrabold" style={{ color: discColor }}>{disc.category || 'Unknown'}</span>
              {(disc.plastic || disc.weight) && (
                <span className="ml-2 text-[var(--text-primary)] opacity-80 italic">
                  {disc.plastic && <span>{disc.plastic}</span>}
                  {disc.plastic && disc.weight && <span> • </span>}
                  {disc.weight && <span>{disc.weight}g</span>}
                </span>
              )}
            </p>
          </div>

          <div className="hidden sm:block" onClick={() => setExpanded(!expanded)}>
            <FlightNumbers
              speed={Number(disc.speed ?? 0)}
              glide={Number(disc.glide ?? 0)}
              turn={Number(disc.turn ?? 0)}
              fade={Number(disc.fade ?? 0)}
              compact
            />
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); onLogThrow(); }}
              className="w-8 h-8 rounded-full flex items-center justify-center transition-colors text-[var(--text-muted)] hover:bg-green-500/10 hover:text-green-400"
              title="Log Throw"
            >
              <Crosshair size={16} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onCompare(); }}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${isComparing ? 'bg-amber-500 text-white shadow-md scale-110' : 'text-[var(--text-muted)] hover:bg-[var(--surface-3)]'}`}
              title="Compare Disc"
            >
              <Scale size={16} />
            </button>
            <button
              onClick={() => setExpanded(!expanded)}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${expanded ? 'bg-[var(--primary-tonal)] text-[var(--primary)]' : 'text-[var(--text-muted)] hover:bg-[var(--surface-3)]'}`}
            >
              {expanded ? <ChevronUp size={16} /> : <LineChart size={16} />}
            </button>
            <button
              onClick={onMove}
              className="w-8 h-8 flex items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--surface-3)] hover:text-[var(--primary)] transition-all"
            >
              <Move size={16} />
            </button>
            <button
              onClick={onRemove}
              className="w-8 h-8 flex items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-red-500/10 hover:text-red-400 transition-all"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>

        {expanded && (
          <div className="mt-2 pt-2 border-t border-[var(--border)] animate-in fade-in slide-in-from-top-1 duration-200">
            {disc.notes && <p className="text-sm text-[var(--text-primary)] mb-3 leading-relaxed opacity-90">{disc.notes}</p>}
            <FlightPath
              speed={Number(disc.speed)}
              glide={Number(disc.glide)}
              turn={Number(disc.turn)}
              fade={Number(disc.fade)}
            />
            <button onClick={(e) => { e.stopPropagation(); onEditDetails(); }} className="w-full mt-4 py-2.5 bg-[var(--surface-3)] text-sm font-bold rounded-2xl text-[var(--text-primary)] hover:bg-[var(--primary-tonal)] hover:text-[var(--primary)] transition-colors border border-[var(--border)]">
              Edit details
            </button>
          </div>
        )}

        <div className="sm:hidden mt-2 pt-2 border-t border-[var(--border)] flex items-center justify-between" onClick={() => setExpanded(!expanded)}>
          <FlightNumbers
            speed={Number(disc.speed ?? 0)}
            glide={Number(disc.glide ?? 0)}
            turn={Number(disc.turn ?? 0)}
            fade={Number(disc.fade ?? 0)}
            compact
          />
        </div>
      </div>
    </div>
  );
}

export default function BagManager({ requestedBagId, onModalStateChange, gpsLat, gpsLon, onSwitchToSearch }: { requestedBagId?: string | null, onModalStateChange?: (open: boolean) => void, gpsLat?: number | null, gpsLon?: number | null, onSwitchToSearch?: (query: string) => void }) {
  const [bags, setBags] = useState<Bag[]>([]);
  const [activeBagId, setActiveBagId] = useState<string | null>(null);
  const [selectedBag, setSelectedBag] = useState<Bag | null>(null);
  const [bagDiscs, setBagDiscs] = useState<BagDisc[]>([]);
  const [showAddBag, setShowAddBag] = useState(false);
  const [newBagName, setNewBagName] = useState('');
  const [isChartExpanded, setIsChartExpanded] = useState(false);
  const [isQrExpanded, setIsQrExpanded] = useState(false);
  const chartRef = useRef<HTMLDivElement>(null);
  const qrRef = useRef<HTMLDivElement>(null);
  const [movingDisc, setMovingDisc] = useState<{ bd_id: string, disc_id: string } | null>(null);
  const [moveCopyFeedback, setMoveCopyFeedback] = useState<string | null>(null);
  const [compareIds, setCompareIds] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState<{ type: 'bag' | 'disc'; id: string; label: string } | null>(null);
  const [importSuccess, setImportSuccess] = useState(false);
  const [bagView, setBagView] = useState<'discs' | 'power' | 'overlap'>('discs');
  const [loggingDisc, setLoggingDisc] = useState<BagDisc | null>(null);
  const [editingDisc, setEditingDisc] = useState<BagDisc | null>(null);

  useEffect(() => {
    onModalStateChange?.(!!movingDisc || !!editingDisc);
  }, [movingDisc, editingDisc, onModalStateChange]);

  const toggleCompare = (bdId: string) => {
    setCompareIds(prev => {
      const next = new Set(prev);
      if (next.has(bdId)) next.delete(bdId);
      else if (next.size < 2) next.add(bdId);
      else {
        // If already 2 selected, replace the oldest one
        const [first] = next;
        next.delete(first);
        next.add(bdId);
      }
      return next;
    });
    // Auto expand chart if we start comparing
    if (!isChartExpanded) {
      setIsChartExpanded(true);
    }
  };

  // Auto-scroll when chart expands (e.g. via disc click)
  useEffect(() => {
    if (isChartExpanded) {
      setTimeout(() => {
        chartRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 150);
    }
  }, [isChartExpanded]);

  const loadBags = useCallback(async () => {
    try {
      const rows = await dbQuery<Bag>('SELECT * FROM Bags ORDER BY created_at DESC');
      setBags(rows);
      if (rows.length > 0 && !activeBagId) {
        const { value } = await Preferences.get({ key: 'activeBagId' });
        const bagToSelect = rows.find(b => b.id === value) || rows[0];
        setActiveBagId(bagToSelect.id);
        setSelectedBag(bagToSelect);
      }
    } catch (err) { console.error('Error loading bags:', err); }
  }, [activeBagId]);

  const loadBagDiscs = useCallback(async (bagId: string) => {
    try {
      const rows = await dbQuery<BagDisc>(`
        SELECT bd.id as bd_id, bd.plastic, bd.weight, bd.notes, d.* FROM DiscCatalog d
        JOIN BagDiscs bd ON d.id = bd.disc_id
        WHERE bd.bag_id = ?
        ORDER BY d.speed DESC, d.name ASC
      `, [bagId]);
      setBagDiscs(rows);
      const bag = bags.find(b => b.id === bagId);
      setSelectedBag(bag || null);
    } catch (err) { console.error('Error loading bag discs:', err); }
  }, [bags]);

  const selectBag = useCallback(async (bagId: string) => {
    setActiveBagId(bagId);
    await Preferences.set({ key: 'activeBagId', value: bagId });
    loadBagDiscs(bagId);
  }, [loadBagDiscs]);

  useEffect(() => {
    queueMicrotask(() => { loadBags(); });
  }, [loadBags]);

  useEffect(() => {
    if (!requestedBagId || bags.length === 0) return;
    const requestedBag = bags.find(bag => bag.id === requestedBagId);
    if (requestedBag && requestedBag.id !== activeBagId) {
      queueMicrotask(() => { selectBag(requestedBag.id); });
    }
  }, [requestedBagId, bags, activeBagId, selectBag]);

  useEffect(() => {
    if (activeBagId) queueMicrotask(() => { loadBagDiscs(activeBagId); });
  }, [activeBagId, loadBagDiscs]);

  const createBag = async () => {
    if (!newBagName.trim()) return;
    try {
      await Haptics.impact({ style: ImpactStyle.Light });
      const newBag: Bag = { id: crypto.randomUUID(), name: newBagName.trim(), created_at: Date.now() };
      await dbRun('INSERT INTO Bags (id, name, created_at) VALUES (?, ?, ?)', [newBag.id, newBag.name, newBag.created_at]);
      setBags(prev => [newBag, ...prev]);
      await selectBag(newBag.id);
      setNewBagName('');
      setShowAddBag(false);
    } catch (err) { console.error('Error creating bag:', err); }
  };

  const deleteBag = async (bagId: string) => {
    const bag = bags.find(b => b.id === bagId);
    if (!bag) return;
    setConfirmDelete({ type: 'bag', id: bagId, label: bag.name });
  };

  const confirmDeleteBag = async (bagId: string) => {
    try {
      await Haptics.impact({ style: ImpactStyle.Medium });
      await dbRun('DELETE FROM Bags WHERE id = ?', [bagId]);
      await dbRun('DELETE FROM BagDiscs WHERE bag_id = ?', [bagId]);
      setBags(prev => prev.filter(b => b.id !== bagId));
      if (activeBagId === bagId) {
        const remaining = bags.filter(b => b.id !== bagId);
        if (remaining.length > 0) await selectBag(remaining[0].id);
        else { setActiveBagId(null); setSelectedBag(null); setBagDiscs([]); await Preferences.remove({ key: 'activeBagId' }); }
      }
    } catch (err) { console.error('Error deleting bag:', err); }
  };

  const removeDisc = (bdId: string) => {
    const disc = bagDiscs.find(d => d.bd_id === bdId);
    if (!disc) return;
    setConfirmDelete({ type: 'disc', id: bdId, label: disc.name });
  };

  const confirmRemoveDisc = async (bdId: string) => {
    try {
      await Haptics.impact({ style: ImpactStyle.Light });
      await dbRun('DELETE FROM BagDiscs WHERE id = ?', [bdId]);
      setBagDiscs(prev => prev.filter(d => d.bd_id !== bdId));
    } catch (err) { console.error('Error removing disc:', err); }
  };

  const handleMoveCopy = async (targetBagId: string, isCopy: boolean) => {
    if (!movingDisc) return;
    try {
      await Haptics.impact({ style: ImpactStyle.Light });
      const newBdId = crypto.randomUUID();
      
      const rows = await dbQuery<any>('SELECT plastic, weight, notes FROM BagDiscs WHERE id = ?', [movingDisc.bd_id]);
      const original = rows[0] || { plastic: null, weight: null, notes: null };
      
      await dbRun('INSERT INTO BagDiscs (id, bag_id, disc_id, plastic, weight, notes) VALUES (?, ?, ?, ?, ?, ?)', 
        [newBdId, targetBagId, movingDisc.disc_id, original.plastic, original.weight, original.notes]);
        
      const photos = await dbQuery<any>('SELECT * FROM DiscPhotos WHERE bag_disc_id = ?', [movingDisc.bd_id]);
      if (photos.length > 0) {
        if (isCopy) {
          const p = photos[0];
          await dbRun('INSERT INTO DiscPhotos (id, bag_disc_id, file_name, file_uri, thumb_uri, created_at) VALUES (?, ?, ?, ?, ?, ?)',
            [crypto.randomUUID(), newBdId, p.file_name, p.file_uri, p.thumb_uri, Date.now()]);
        } else {
          await dbRun('UPDATE DiscPhotos SET bag_disc_id = ? WHERE bag_disc_id = ?', [newBdId, movingDisc.bd_id]);
        }
      }

      if (!isCopy) {
        await dbRun('DELETE FROM BagDiscs WHERE id = ?', [movingDisc.bd_id]);
        setBagDiscs(prev => prev.filter(d => d.bd_id !== movingDisc.bd_id));
      }
      const feedback = isCopy ? 'Copied!' : 'Moved!';
      setMoveCopyFeedback(feedback);
      setMovingDisc(null);
      setTimeout(() => setMoveCopyFeedback(null), 1800);
    } catch (err) { console.error('Move/Copy error:', err); }
  };

  const exportBags = async () => {
    const { exportBags } = await import('@/lib/sync');
    await exportBags();
  };

  const importBags = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await file.text();
      const { importBags } = await import('@/lib/sync');
      if (await importBags(text)) {
        await loadBags();
        setImportSuccess(true);
        setTimeout(() => setImportSuccess(false), 2500);
      }
    };
    input.click();
  };

  const bagPaths = useMemo(() => {
    // If comparing, only show selected discs
    const discsToShow = compareIds.size > 0
      ? bagDiscs.filter(d => compareIds.has(d.bd_id))
      : bagDiscs;

    return discsToShow.map(d => ({
      ...buildFlightModel(Number(d.speed), Number(d.glide), Number(d.turn), Number(d.fade)),
      color: getDiscColor(d),
      name: d.name
    }));
  }, [bagDiscs, compareIds]);

  return (
    <div className="flex flex-col gap-0">
      {/* Static Header */}
      <div className="-mx-4 px-4 md:-mx-8 md:px-8 pt-2 pb-6">
        <div className="w-full max-w-2xl mx-auto bg-[var(--surface-2)] rounded-[32px] p-5 shadow-xl border border-[var(--border)] mt-[env(safe-area-inset-top)]">
          {/* Title row */}
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="flex flex-col">
              <h1 className="text-3xl font-black tracking-tight text-[var(--text-primary)] leading-none">My Bags</h1>
              {selectedBag && bagDiscs.length > 0 && (
                <p className="text-[10px] font-bold uppercase text-[var(--text-muted)] tracking-widest mt-1.5">
                  {bagDiscs.length} discs
                  <span className="mx-2 opacity-30">|</span>
                  Avg {Math.round(bagDiscs.reduce((acc, d) => acc + Number(d.speed || 0), 0) / bagDiscs.length * 10) / 10} Spd
                </p>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <button onClick={importBags} className="w-10 h-10 rounded-2xl text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-3)] flex items-center justify-center transition-all" title="Import bags">
                <Upload size={16} />
              </button>
              <button onClick={exportBags} className="w-10 h-10 rounded-2xl text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-3)] flex items-center justify-center transition-all" title="Export bags">
                <Download size={16} />
              </button>
            </div>
          </div>

          {/* Bag tab selector */}
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1">
            {bags.map(bag => (
              <button
                key={bag.id}
                onClick={() => selectBag(bag.id)}
                className={`px-5 py-2.5 rounded-2xl text-xs font-bold transition-all whitespace-nowrap border ${
                  activeBagId === bag.id
                    ? 'bg-[var(--primary)] text-[var(--on-primary)] border-[var(--primary)] shadow-md scale-[1.02]'
                    : 'bg-transparent text-[var(--text-muted)] border-[var(--border)] hover:text-[var(--text-primary)] hover:border-[var(--primary)]/30'
                }`}
              >
                <Backpack size={12} className="inline mr-2 opacity-70" />{bag.name}
              </button>
            ))}
            {showAddBag ? (
              <div className="flex gap-1 items-center bg-[var(--surface-3)] rounded-2xl px-4 border border-[var(--primary)]/60">
                <input type="text" value={newBagName} onChange={e => setNewBagName(e.target.value)} onKeyDown={e => e.key === 'Enter' && createBag()} placeholder="Bag name" className="bg-transparent text-xs font-bold text-[var(--text-primary)] focus:outline-none w-24" autoFocus />
                <button onClick={createBag} className="p-2 text-[var(--primary)] hover:scale-110 transition-transform"><Plus size={16} /></button>
                <button onClick={() => { setShowAddBag(false); setNewBagName(''); }} className="p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors text-xs font-bold">✕</button>
              </div>
            ) : (
              <button onClick={() => setShowAddBag(true)} className="px-5 py-2.5 rounded-2xl text-xs font-bold border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--primary-tonal)] hover:text-[var(--primary)] hover:border-[var(--primary)]/50 transition-all whitespace-nowrap">
                <Plus size={13} className="inline mr-1.5" />New Bag
              </button>
            )}
          </div>
        </div>
      </div>
      <div className="h-5" />

      {selectedBag && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-black tracking-tight text-[var(--text-primary)]">{selectedBag.name}</h2>
            <button onClick={() => deleteBag(selectedBag.id)} className="w-8 h-8 flex items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-red-500/10 hover:text-red-400 transition-colors" title="Delete bag"><Trash2 size={15} /></button>
          </div>

          {/* View mode segmented control */}
          {bagDiscs.length > 0 && (
            <div className="flex bg-[var(--surface-3)] p-1 rounded-full border border-[var(--border)] gap-1">
              <button 
                className={`flex-1 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${bagView === 'discs' ? 'bg-[var(--primary-tonal)] text-[var(--primary)] shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
                onClick={() => setBagView('discs')}
              >
                Discs
              </button>
              <button 
                className={`flex-1 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${bagView === 'power' ? 'bg-[var(--primary-tonal)] text-[var(--primary)] shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
                onClick={() => setBagView('power')}
              >
                Power Map
              </button>
              <button 
                className={`flex-1 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${bagView === 'overlap' ? 'bg-[var(--primary-tonal)] text-[var(--primary)] shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
                onClick={() => setBagView('overlap')}
              >
                Overlap
              </button>
            </div>
          )}

          {/* Discs view */}
          {bagView === 'discs' && (
            <>
              {bagDiscs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 px-6 rounded-3xl bg-[var(--surface-2)] border border-[var(--border)] text-center mb-2 shadow-sm relative overflow-hidden">
                  <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-transparent via-[var(--primary)] to-transparent opacity-50" />
                  <div className="w-16 h-16 rounded-full bg-[var(--primary-tonal)] flex items-center justify-center mb-4 border border-[var(--primary)]/20 shadow-inner">
                    <Disc3 size={32} className="text-[var(--primary)]" />
                  </div>
                  <h3 className="text-xl font-black text-[var(--text-primary)] tracking-tight mb-2">This bag is empty</h3>
                  <p className="text-xs text-[var(--text-muted)] font-medium mb-6 max-w-[240px] leading-relaxed">
                    Build your perfect arsenal by adding discs from the catalog.
                  </p>
                  <button onClick={() => onSwitchToSearch?.('')} className="px-6 py-3.5 rounded-full bg-[var(--primary)] text-white font-black text-[11px] uppercase tracking-widest shadow-[0_4px_16px_rgba(124,111,247,0.3)] hover:scale-105 transition-all">
                    Add discs to this bag
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2.5">
                  {bagDiscs.map(disc => (
                    <BagDiscCard
                      key={disc.bd_id}
                      disc={disc}
                      onMove={() => setMovingDisc({ bd_id: disc.bd_id, disc_id: disc.disc_id })}
                      onRemove={() => removeDisc(disc.bd_id)}
                      onCompare={() => toggleCompare(disc.bd_id)}
                      onLogThrow={() => setLoggingDisc(disc)}
                      onEditDetails={() => setEditingDisc(disc)}
                      isComparing={compareIds.has(disc.bd_id)}
                      discColor={getDiscColor(disc)}
                    />
                  ))}
                </div>
              )}

              {bagDiscs.length > 0 && (
                <div className="flex flex-col gap-2">
                  <div 
                    onClick={() => {
                      const willExpand = !isChartExpanded;
                      setIsChartExpanded(willExpand);
                      if (willExpand) {
                        setCompareIds(new Set());
                        // Auto-scroll is handled by the useEffect watching isChartExpanded
                      }
                    }} 
                    className="flex items-center justify-between p-3.5 rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] hover:bg-[var(--surface-3)] transition-all cursor-pointer"
                    role="button"
                    tabIndex={0}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center bg-[var(--primary-tonal)] text-[var(--primary)] shrink-0">
                        <LineChart size={20} />
                      </div>
                      <div className="text-left">
                        <h4 className="text-sm font-bold">
                          {compareIds.size > 0 ? `Comparing ${compareIds.size} Disc${compareIds.size > 1 ? 's' : ''}` : 'Flight Overlay'}
                        </h4>
                        {!isChartExpanded && compareIds.size === 0 && (
                          <p className="text-[10px] text-[var(--text-muted)] font-bold mt-0.5">
                            {bagDiscs.filter(d => d.stability?.includes('Overstable')).length} OS · {bagDiscs.filter(d => !d.stability?.includes('Overstable') && !d.stability?.includes('Understable')).length} Neutral · {bagDiscs.filter(d => d.stability?.includes('Understable')).length} US
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {compareIds.size > 0 && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setCompareIds(new Set()); }}
                          className="text-[10px] font-bold text-[var(--primary)] hover:underline z-10"
                        >
                          CLEAR
                        </button>
                      )}
                      {isChartExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </div>
                  </div>
                  {isChartExpanded && (
                    <div className="card !p-0 overflow-hidden bg-[var(--surface-1)] animate-in fade-in slide-in-from-top-2 duration-300">
                      <div className="p-4 bg-[var(--surface-0)]"><FlightChart multiplePaths={bagPaths} /></div>
                      <div className="p-3 flex gap-4 bg-[var(--surface-2)] justify-center">
                        {['DISTANCE', 'MIDRANGE', 'PUTTER'].map(t => <div key={t} className="flex items-center gap-1.5 text-[9px] font-black text-[var(--text-muted)]"><div className={`w-2 h-2 rounded-full ${t === 'DISTANCE' ? 'bg-[#ef4444]' : t === 'MIDRANGE' ? 'bg-[#22c55e]' : 'bg-[#3b82f6]'}`} /> {t}</div>)}
                      </div>
                    </div>
                  )}
                  <div ref={chartRef} style={{ scrollMarginBottom: 'var(--bottom-safe-padding)' }} />
                </div>
              )}

              <div className="flex flex-col gap-2">
                <button 
                  onClick={() => {
                    const willExpand = !isQrExpanded;
                    setIsQrExpanded(willExpand);
                    if (willExpand) {
                      setTimeout(() => {
                        qrRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }, 150);
                    }
                  }} 
                  className="flex items-center justify-between p-3.5 rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] hover:bg-[var(--surface-3)] transition-all"
                >
                  <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-full flex items-center justify-center bg-[var(--primary-tonal)] text-[var(--primary)] shrink-0"><Plus size={20} /></div><div className="text-left"><h4 className="text-sm font-bold">Share this bag</h4></div></div>
                  {isQrExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>
                {isQrExpanded && <div className="animate-in fade-in slide-in-from-top-2 duration-300"><BagQrCode bagId={selectedBag.id} bagName={selectedBag.name} /></div>}
                <div ref={qrRef} style={{ scrollMarginBottom: 'var(--bottom-safe-padding)' }} />
              </div>
            </>
          )}

          {/* Power Map view */}
          {bagView === 'power' && (
            <BagPowerMap
              bagId={selectedBag.id}
              bagName={selectedBag.name}
              onFillGap={(speedRange, stabilityLabel) => {
                const q = `${stabilityLabel} speed ${speedRange[0]}-${speedRange[1]}`.trim();
                onSwitchToSearch?.(q);
              }}
            />
          )}

          {/* Overlap view */}
          {bagView === 'overlap' && (
            <OverlapAnalyzer bagId={selectedBag.id} bagName={selectedBag.name} />
          )}
        </div>
      )}

      {movingDisc && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center">
          <div className="absolute inset-0 modal-scrim backdrop-blur-sm" onClick={() => setMovingDisc(null)} />
          <div className="relative w-full max-w-lg max-h-[85vh] overflow-hidden bg-[var(--surface-2)] rounded-t-[32px] shadow-2xl flex flex-col animate-in slide-in-from-bottom-4 duration-300">
            <div className="w-12 h-1.5 bg-[var(--border)] rounded-full mx-auto mt-3 mb-2 shrink-0" />
            <div className="px-6 py-4">
              <h3 className="text-2xl font-black tracking-tight mb-1">Move or Copy</h3>
              <p className="text-xs text-[var(--text-muted)] font-bold uppercase tracking-widest">Select target bag</p>
            </div>

            <div className="flex-1 overflow-y-auto px-6 pb-6 no-scrollbar">
              <div className="flex flex-col gap-2">
                {bags.filter(b => b.id !== activeBagId).map(bag => (
                  <div key={bag.id} className="flex items-center justify-between p-4 rounded-2xl bg-[var(--surface-3)]">
                    <span className="text-sm font-bold truncate pr-2">{bag.name}</span>
                    <div className="flex gap-1.5">
                      <button onClick={() => handleMoveCopy(bag.id, false)} className="p-2.5 rounded-xl bg-[var(--surface-1)] hover:text-[var(--primary)] transition-colors" title="Move here"><Move size={16} /></button>
                      <button onClick={() => handleMoveCopy(bag.id, true)} className="p-2.5 rounded-xl bg-[var(--surface-1)] hover:text-[var(--primary)] transition-colors" title="Copy here"><Copy size={16} /></button>
                    </div>
                  </div>
                ))}
                {bags.length <= 1 && <p className="text-sm text-center py-8 text-[var(--text-muted)]">No other bags to move or copy to.</p>}
              </div>
            </div>

            <div className="px-6 pb-6 pt-2">
              <button onClick={() => setMovingDisc(null)} className="w-full py-4 font-bold text-sm text-[var(--text-muted)] bg-[var(--surface-3)] rounded-2xl">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm dialogs */}
      <ConfirmDialog
        open={!!confirmDelete}
        title={confirmDelete?.type === 'bag' ? 'Delete Bag' : 'Remove Disc'}
        message={
          confirmDelete?.type === 'bag'
            ? `"${confirmDelete.label}" and all its discs will be permanently deleted.`
            : `Remove "${confirmDelete?.label}" from this bag?`
        }
        confirmLabel={confirmDelete?.type === 'bag' ? 'Delete' : 'Remove'}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (!confirmDelete) return;
          if (confirmDelete.type === 'bag') confirmDeleteBag(confirmDelete.id);
          else confirmRemoveDisc(confirmDelete.id);
          setConfirmDelete(null);
        }}
      />

      <Toast
        open={importSuccess}
        message="Bags imported successfully"
        icon={<Check size={16} className="text-green-400" />}
      />

      {/* Copy/Move feedback */}
      <Toast
        message={moveCopyFeedback ?? ''}
        open={moveCopyFeedback !== null}
        icon={<Check size={16} className="text-green-400" />}
      />

      {/* Throw Logger modal */}
      {loggingDisc && (
        <ThrowLogger
          discId={loggingDisc.id}
          discName={loggingDisc.name}
          discBrand={loggingDisc.brand ?? undefined}
          onClose={() => setLoggingDisc(null)}
          onSaved={() => setLoggingDisc(null)}
        />
      )}

      {/* Edit Details modal */}
      {editingDisc && (
        <EditDiscModal 
          disc={editingDisc}
          onClose={() => setEditingDisc(null)}
          onSaved={() => {
            setEditingDisc(null);
            if (activeBagId) loadBagDiscs(activeBagId);
          }}
        />
      )}
    </div>
  );
}

function EditDiscModal({ disc, onClose, onSaved }: { disc: BagDisc, onClose: () => void, onSaved: () => void }) {
  const [plastic, setPlastic] = useState(disc.plastic || '');
  const [weight, setWeight] = useState(disc.weight || '');
  const [notes, setNotes] = useState(disc.notes || '');

  const save = async () => {
    try {
      await dbRun('UPDATE BagDiscs SET plastic = ?, weight = ?, notes = ? WHERE id = ?', 
        [plastic || null, weight || null, notes || null, disc.bd_id]);
      onSaved();
    } catch (e) { console.error(e); }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center">
      <div className="absolute inset-0 modal-scrim backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-[var(--surface-2)] rounded-t-[32px] shadow-2xl flex flex-col animate-in slide-in-from-bottom-4 duration-300">
        <div className="w-12 h-1.5 bg-[var(--border)] rounded-full mx-auto mt-3 mb-2 shrink-0" />
        <div className="px-6 py-4">
          <h3 className="text-xl font-black tracking-tight mb-1">Edit Details</h3>
          <p className="text-xs text-[var(--text-muted)] font-bold uppercase tracking-widest">{disc.name}</p>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-6 no-scrollbar flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-black uppercase text-[var(--text-muted)] ml-1">Plastic</label>
              <input type="text" value={plastic} onChange={e => setPlastic(e.target.value)} placeholder="e.g. Star" className="bg-[var(--surface-3)] border border-[var(--border)] rounded-2xl p-4 text-sm focus:border-[var(--primary)] outline-none" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-black uppercase text-[var(--text-muted)] ml-1">Weight (g)</label>
              <input type="text" value={weight} onChange={e => setWeight(e.target.value)} placeholder="175" className="bg-[var(--surface-3)] border border-[var(--border)] rounded-2xl p-4 text-sm focus:border-[var(--primary)] outline-none" />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-black uppercase text-[var(--text-muted)] ml-1">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="When I need a pushing hyzer..." rows={4} className="bg-[var(--surface-3)] border border-[var(--border)] rounded-2xl p-4 text-sm focus:border-[var(--primary)] outline-none resize-none" />
          </div>
        </div>

        <div className="px-6 pb-6 pt-2 flex gap-3">
          <button onClick={onClose} className="flex-1 py-4 font-bold text-sm text-[var(--text-muted)] bg-[var(--surface-3)] rounded-2xl">Cancel</button>
          <button onClick={save} className="flex-1 py-4 font-black text-sm text-[var(--on-primary)] bg-[var(--primary)] shadow-lg rounded-2xl">SAVE</button>
        </div>
      </div>
    </div>
  );
}
