'use client';

import { TDisc } from 'discit-types';
import { X, Plus, Check, Target, TrendingUp, Award, ChevronDown, Heart, LineChart, Camera, ImagePlus, ArrowLeft } from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { dbRun, dbQuery } from '@/lib/db';
import { Preferences } from '@capacitor/preferences';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import FlightPath from './FlightPath';
import FlightNumbers from './FlightNumbers';
import { captureOrPickPhoto, saveDiscPhoto } from '@/lib/services/photos';

interface DiscDetailProps {
  disc: TDisc;
  onClose: () => void;
  onViewSimilar?: (disc: TDisc) => void;
  isNestedSidePanel?: boolean;
}

function stabilityClass(stability: string) {
  if (stability === 'Very Overstable') return 'very-overstable';
  if (stability.includes('Overstable')) return 'overstable';
  if (stability === 'Very Understable') return 'very-understable';
  if (stability.includes('Understable')) return 'understable';
  return 'neutral';
}

const getCategoryInfo = (category: string) => {
  if (category.includes('Putter')) return { icon: Target, label: 'Putt & Approach' };
  if (category.includes('Midrange')) return { icon: TrendingUp, label: 'Approach & Control' };
  if (category.includes('Fairway')) return { icon: Award, label: 'Controlled Distance' };
  return { icon: Award, label: 'Maximum Distance' };
};

const getSkillLevel = (speed: number): string => {
  if (speed <= 4) return 'Beginner';
  if (speed <= 8) return 'Intermediate';
  if (speed <= 11) return 'Advanced';
  return 'Expert';
};

type SpeedMode = 'slow' | 'normal' | 'fast';
type ThrowStyle = 'left' | 'right' | 'forehand';

// ─── Inner panel content (single disc) ──────────────────────────────────────

function DiscDetailInner({ disc, onNavigate, onBack, canGoBack }: {
  disc: TDisc;
  onNavigate: (disc: TDisc) => void;
  onBack: () => void;
  canGoBack: boolean;
}) {
  const [justAdded, setJustAdded] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [speedMode, setSpeedMode] = useState<SpeedMode>('normal');
  const [throwStyle, setThrowStyle] = useState<ThrowStyle>('right');
  const [showPowerComparison, setShowPowerComparison] = useState(false);
  const [bags, setBags] = useState<any[]>([]);
  const [selectedBagIds, setSelectedBagIds] = useState<Set<string>>(new Set());
  const [showAddSection, setShowAddSection] = useState(false);

  const [plastic, setPlastic] = useState('');
  const [weight, setWeight] = useState('');
  const [isInWishlist, setIsInWishlist] = useState(false);
  const [similarDiscs, setSimilarDiscs] = useState<TDisc[]>([]);
  const [pendingPhotoB64, setPendingPhotoB64] = useState<string | null>(null);
  const [photoLoading, setPhotoLoading] = useState(false);

  const stability = disc.stability || 'Neutral';
  const speed = Number(disc.speed);
  const glide = Number(disc.glide);
  const turn = Number(disc.turn);
  const fade = Number(disc.fade);
  const skillLevel = getSkillLevel(speed);
  const categoryInfo = getCategoryInfo(disc.category);

  useEffect(() => {
    const loadData = async () => {
      const bagRows = await dbQuery<{ id: string }>('SELECT * FROM Bags ORDER BY created_at DESC');
      setBags(bagRows);
      const { value: activeId } = await Preferences.get({ key: 'activeBagId' });
      if (activeId) setSelectedBagIds(new Set([activeId]));
      else if (bagRows.length > 0) setSelectedBagIds(new Set([bagRows[0].id]));

      const wishRows = await dbQuery<{ count: number }>('SELECT COUNT(*) as count FROM Wishlist WHERE disc_id = ?', [disc.id]);
      setIsInWishlist(Number(wishRows[0]?.count ?? 0) > 0);

      const similarRows = await dbQuery<TDisc>(`
        SELECT * FROM DiscCatalog
        WHERE speed BETWEEN ? AND ?
        AND glide BETWEEN ? AND ?
        AND turn BETWEEN ? AND ?
        AND fade BETWEEN ? AND ?
        AND id != ?
        LIMIT 5
      `, [speed - 1, speed + 1, glide - 1, glide + 1, turn - 1, turn + 1, fade - 1, fade + 1, disc.id]);
      setSimilarDiscs(similarRows);
    };
    loadData();
    // Reset UI state on disc change
    setShowAddSection(false);
    setShowPowerComparison(false);
    setJustAdded(false);
    setIsAdding(false);
    setPlastic('');
    setWeight('');
    setPendingPhotoB64(null);
  }, [disc.id, speed, glide, turn, fade]);

  const toggleWishlist = async () => {
    try {
      await Haptics.impact({ style: ImpactStyle.Light });
      if (isInWishlist) {
        await dbRun('DELETE FROM Wishlist WHERE disc_id = ?', [disc.id]);
      } else {
        await dbRun('INSERT INTO Wishlist (id, disc_id, created_at) VALUES (?, ?, ?)', [crypto.randomUUID(), disc.id, Date.now()]);
      }
      setIsInWishlist(!isInWishlist);
    } catch (err) { console.error(err); }
  };

  const toggleBag = (id: string) => {
    setSelectedBagIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAddToBag = async () => {
    if (isAdding || selectedBagIds.size === 0) return;
    setIsAdding(true);
    try {
      await Haptics.impact({ style: ImpactStyle.Light });
      for (const bagId of Array.from(selectedBagIds)) {
        const bdId = crypto.randomUUID();
        await dbRun('INSERT OR IGNORE INTO BagDiscs (id, bag_id, disc_id, plastic, weight) VALUES (?, ?, ?, ?, ?)', [
          bdId, bagId, disc.id, plastic || null, weight || null
        ]);
        if (pendingPhotoB64) {
          await saveDiscPhoto(bdId, pendingPhotoB64);
        }
      }
      setJustAdded(true);
      setTimeout(() => { setJustAdded(false); setIsAdding(false); }, 1500);
    } catch (err) {
      console.error('Error adding disc:', err);
      setIsAdding(false);
    }
  };

  return (
    <>
      {/* Header */}
      <div className="px-6 pb-2 pt-2">
        {canGoBack && (
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 mb-2 px-3 py-1.5 rounded-full bg-[var(--surface-3)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-all active:scale-95 text-[10px] font-black uppercase tracking-widest"
          >
            <ArrowLeft size={12} />
            Back
          </button>
        )}
        {canGoBack && (
          <p className="text-[10px] font-black uppercase text-[var(--primary)] tracking-widest mb-1 flex items-center gap-1"><Target size={10} /> Similar Disc</p>
        )}
        <h1 className="text-3xl font-black leading-tight text-[var(--text-primary)] break-words tracking-tight">
          {disc.name}
        </h1>
        <p className="text-base text-[var(--text-muted)] font-bold uppercase tracking-wider">
          {disc.brand}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-6 pt-0 pb-32 no-scrollbar">
        <div className="flex items-center justify-between mb-6">
          <div className="flex gap-2 flex-wrap">
            <span className={`stability-chip ${stabilityClass(stability)}`}>
              {stability}
            </span>
            <span className="tonal-chip font-black text-[10px] uppercase">
              {skillLevel}
            </span>
          </div>
          <button
            onClick={toggleWishlist}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${isInWishlist ? 'bg-amber-500 text-white' : 'bg-[var(--surface-3)] text-[var(--text-muted)]'}`}
          >
            <Heart size={14} className={isInWishlist ? 'fill-white' : ''} />
            {isInWishlist ? 'Wanted' : 'Add Wanted'}
          </button>
        </div>

        <div className="mb-4 flex justify-center">
          <FlightNumbers speed={speed} glide={glide} turn={turn} fade={fade} />
        </div>

        <div className="mb-4">
          <FlightPath speed={speed} glide={glide} turn={turn} fade={fade} release={speedMode} throwStyle={throwStyle} height={240} showComparison={showPowerComparison} />
        </div>

        <div className="flex items-center justify-center mb-6">
          <button
            onClick={() => setShowPowerComparison(!showPowerComparison)}
            className={`flex items-center gap-2 px-6 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${showPowerComparison ? 'bg-[var(--primary)] text-white shadow-lg' : 'bg-[var(--surface-3)] text-[var(--text-muted)]'}`}
          >
            <LineChart size={14} />
            {showPowerComparison ? 'Hide Power Levels' : 'Show Power Levels'}
          </button>
        </div>

        <div className="flex items-center justify-between gap-3 mb-8 flex-wrap">
          <div className="segmented-control compact">
            {['left', 'right', 'forehand'].map((s: any) => (
              <button key={s} onClick={() => setThrowStyle(s)} className={throwStyle === s ? 'active' : ''}>{s.charAt(0).toUpperCase() + s.slice(1)}</button>
            ))}
          </div>
          <div className="segmented-control compact">
            {['slow', 'normal', 'fast'].map((m: any) => (
              <button key={m} onClick={() => setSpeedMode(m)} className={speedMode === m ? 'active' : ''}>{m.charAt(0).toUpperCase() + m.slice(1)}</button>
            ))}
          </div>
        </div>

        <div className="rounded-3xl bg-[var(--surface-3)] p-5 mb-8 border border-[var(--border)]">
          <h3 className="section-heading mb-4 !text-[10px]">Disc Information</h3>
          <div className="flex flex-col gap-4">
            {[
              { icon: categoryInfo.icon, label: 'Category', value: disc.category },
              { icon: Target, label: 'Primary Use', value: categoryInfo.label },
              { icon: TrendingUp, label: 'Stability', value: stability },
              { icon: Award, label: 'Skill Level', value: skillLevel }
            ].map((item, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-3 text-[var(--text-muted)]">
                  <item.icon size={16} />
                  <span className="text-sm font-medium">{item.label}</span>
                </div>
                <span className="text-sm font-bold text-[var(--text-primary)]">{item.value}</span>
              </div>
            ))}
          </div>
          <div className="mt-6 pt-4 border-t border-[var(--border)]">
            <button
              onClick={async () => {
                const url = `https://infinitediscs.com/search-results?search_text=${encodeURIComponent(disc.name)}`;
                window.open(url, '_blank');
              }}
              className="flex items-center justify-center gap-2 w-full py-4 rounded-2xl bg-[var(--primary)] text-white font-black text-xs uppercase tracking-widest shadow-lg cursor-pointer"
            >
              Buy on Infinite Discs
            </button>
          </div>
        </div>

        {similarDiscs.length > 0 && (
          <div className="rounded-3xl bg-[var(--surface-3)] p-5 mb-8 border border-[var(--border)]">
            <h3 className="section-heading mb-4 !text-[10px]">Similar Discs</h3>
            <div className="flex flex-col gap-2">
              {similarDiscs.map(s => (
                <button key={s.id} onClick={() => onNavigate(s)} className="flex items-center justify-between p-3 rounded-2xl bg-[var(--surface-2)] hover:bg-[var(--surface-1)] transition-all text-left active:scale-[0.98]">
                  <div className="flex flex-col">
                    <span className="text-sm font-bold">{s.name}</span>
                    <span className="text-[10px] text-[var(--text-muted)] uppercase font-black">{s.brand} • {s.speed}/{s.glide}/{s.turn}/{s.fade}</span>
                  </div>
                  <ChevronDown size={16} className="-rotate-90 text-[var(--primary)]" />
                </button>
              ))}
            </div>
          </div>
        )}

        {!showAddSection ? (
          <button onClick={() => setShowAddSection(true)} className="w-full py-5 bg-[var(--surface-1)] border border-[var(--primary)] text-[var(--primary)] rounded-[24px] font-black text-sm shadow-xl flex items-center justify-center gap-2">
            <Plus size={20} /> ADD TO BAG
          </button>
        ) : (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="rounded-3xl bg-[var(--surface-1)] p-5 border border-[var(--primary-tonal)] shadow-inner flex flex-col gap-6">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black uppercase text-[var(--primary)] tracking-widest">Configuration</h3>
                <button onClick={() => setShowAddSection(false)} className="text-[var(--text-muted)]"><X size={16} /></button>
              </div>

              {/* Photo capture */}
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black uppercase text-[var(--text-muted)] ml-1 tracking-widest">Disc Photo</label>
                {pendingPhotoB64 ? (
                  <div className="flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`data:image/jpeg;base64,${pendingPhotoB64}`} alt="Disc" className="w-16 h-16 rounded-2xl object-cover border-2 border-[var(--primary)]/40" />
                    <button onClick={() => setPendingPhotoB64(null)} className="text-xs font-bold text-red-400 hover:underline">
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={async () => { setPhotoLoading(true); const b64 = await captureOrPickPhoto('camera'); if (b64) setPendingPhotoB64(b64); setPhotoLoading(false); }}
                      disabled={photoLoading}
                      className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-[var(--surface-3)] border border-[var(--border)] text-xs font-bold text-[var(--text-primary)] hover:border-[var(--primary)]/40 transition-all"
                    >
                      <Camera size={14} className="text-[var(--primary)]" />
                      Take Photo
                    </button>
                    <button
                      onClick={async () => { setPhotoLoading(true); const b64 = await captureOrPickPhoto('library'); if (b64) setPendingPhotoB64(b64); setPhotoLoading(false); }}
                      disabled={photoLoading}
                      className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-[var(--surface-3)] border border-[var(--border)] text-xs font-bold text-[var(--text-primary)] hover:border-[var(--primary)]/40 transition-all"
                    >
                      <ImagePlus size={14} className="text-[var(--primary)]" />
                      Library
                    </button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black uppercase text-[var(--text-muted)] ml-1">Plastic</label>
                  <input type="text" placeholder="e.g. Star" value={plastic} onChange={e => setPlastic(e.target.value)} className="bg-[var(--surface-3)] border border-[var(--border)] rounded-2xl p-4 text-sm focus:border-[var(--primary)] outline-none" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black uppercase text-[var(--text-muted)] ml-1">Weight (g)</label>
                  <input type="text" placeholder="175" value={weight} onChange={e => setWeight(e.target.value)} className="bg-[var(--surface-3)] border border-[var(--border)] rounded-2xl p-4 text-sm focus:border-[var(--primary)] outline-none" />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                {bags.map(bag => (
                  <button
                    key={bag.id}
                    onClick={() => toggleBag(bag.id)}
                    className={`group flex items-center justify-between p-3.5 rounded-full transition-all border ${
                      selectedBagIds.has(bag.id)
                        ? 'bg-[var(--primary-tonal)] text-[var(--primary)] border-[var(--primary)]/30 shadow-sm'
                        : 'bg-[var(--surface-3)] text-[var(--text-muted)] border-transparent hover:bg-[var(--surface-2)] hover:border-[var(--primary)]/20'
                    }`}
                  >
                    <span className="font-bold text-sm ml-2 transition-colors">{bag.name}</span>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all shadow-sm ${
                      selectedBagIds.has(bag.id) 
                        ? 'bg-[var(--primary)] text-white scale-100' 
                        : 'bg-[var(--surface-2)] text-[var(--primary)] scale-95 border border-[var(--border)] group-hover:scale-100'
                    }`}>
                      <Check size={16} className={`transition-all duration-300 ${selectedBagIds.has(bag.id) ? 'opacity-100 scale-100' : 'opacity-0 scale-50'}`} />
                    </div>
                  </button>
                ))}
              </div>
              <button onClick={handleAddToBag} disabled={isAdding || selectedBagIds.size === 0} className={`w-full py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 primary-action ${justAdded ? 'success' : ''} disabled:opacity-50`}>
                {justAdded ? <Check size={20} /> : <Plus size={20} />}
                {justAdded ? 'SAVED!' : `CONFIRM ADD`}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ─── Main DiscDetail (shell with stack navigation) ───────────────────────────

export default function DiscDetail({ disc, onClose }: DiscDetailProps) {
  // Stack-based similar-disc navigation: current disc + history
  const [discStack, setDiscStack] = useState<TDisc[]>([]);
  const [currentDisc, setCurrentDisc] = useState<TDisc>(disc);
  const [touchOffset, setTouchOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef({ startPos: 0, offset: 0 });
  const rafId = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Navigate to a similar disc: push current onto stack
  const handleNavigate = useCallback((next: TDisc) => {
    setDiscStack(prev => [...prev, currentDisc]);
    setCurrentDisc(next);
    // Scroll to top on navigation
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentDisc]);

  // Go back: pop from stack
  const handleBack = useCallback(() => {
    setDiscStack(prev => {
      const next = [...prev];
      const popped = next.pop();
      if (popped) setCurrentDisc(popped);
      return next;
    });
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // Close: if stack has items, pop back; otherwise close the whole panel
  const handleClose = useCallback(() => {
    if (discStack.length > 0) {
      handleBack();
    } else {
      onClose();
    }
  }, [discStack.length, handleBack, onClose]);

  useEffect(() => {
    const initBackListener = async () => {
      try {
        const { App } = await import('@capacitor/app');
        const listener = await App.addListener('backButton', () => {
          handleClose();
        });
        return listener;
      } catch (e) { return null; }
    };
    const listenerPromise = initBackListener();
    return () => {
      listenerPromise.then(l => l?.remove());
    };
  }, [handleClose]);

  // Swipe-to-close
  const onTouchStart = (e: React.TouchEvent) => {
    cancelAnimationFrame(rafId.current);
    dragRef.current = { startPos: e.touches[0].clientY, offset: 0 };
    setIsDragging(true);
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    const diff = e.touches[0].clientY - dragRef.current.startPos;
    if (diff > 0) {
      dragRef.current.offset = diff;
      cancelAnimationFrame(rafId.current);
      rafId.current = requestAnimationFrame(() => setTouchOffset(diff));
    }
  };
  const onTouchEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);
    cancelAnimationFrame(rafId.current);
    if (dragRef.current.offset > 200) onClose();
    else setTouchOffset(0);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 modal-scrim backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full max-w-xl max-h-[92vh] overflow-hidden bg-[var(--surface-2)] rounded-t-[32px] flex flex-col shadow-2xl animate-in slide-in-from-bottom-full duration-300"
        style={{
          transform: isDragging ? `translateY(${touchOffset}px)` : 'none',
          willChange: 'transform',
          transition: isDragging ? 'none' : 'transform 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
        }}
      >
        {/* Drag handle + close */}
        <div
          className="flex flex-col items-center pt-3 pb-1 cursor-grab active:cursor-grabbing bg-[var(--surface-2)]/90 backdrop-blur-md sticky top-0 z-20"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <div className="w-12 h-1.5 bg-[var(--border)] rounded-full mb-1 shrink-0" />
          <div className="w-full flex items-center justify-end px-6">
            <button onClick={onClose} className="w-10 h-10 shrink-0 rounded-full flex items-center justify-center bg-[var(--surface-3)] text-[var(--text-muted)] hover:bg-[var(--surface-1)] transition-all active:scale-90">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Content — re-renders in place when navigating similar discs */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto flex flex-col no-scrollbar">
          <DiscDetailInner
            key={currentDisc.id}
            disc={currentDisc}
            onNavigate={handleNavigate}
            onBack={handleBack}
            canGoBack={discStack.length > 0}
          />
        </div>
      </div>
    </div>
  );
}
