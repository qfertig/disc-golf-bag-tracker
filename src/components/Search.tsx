'use client';
import { useState, useEffect, useMemo, useRef } from 'react';
import { dbQuery, dbRun } from '@/lib/db';
import { TDisc } from 'discit-types';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Preferences } from '@capacitor/preferences';
import DiscDetail from './DiscDetail';
import FlightNumbers from './FlightNumbers';
import FlightPath from './FlightPath';
import { buildFlightModel, FlightChart } from './FlightPath';
import { Plus, Search as SearchIcon, Disc3, Check, ChevronDown, ChevronUp, LineChart, Filter, PlusCircle, Heart, Scale, X } from 'lucide-react';

const STABILITY_ORDER = ['Very Overstable','Overstable','Somewhat Overstable','Neutral','Somewhat Understable','Understable','Very Understable'];
const CATEGORY_CHIPS = ['All', 'Putter', 'Midrange', 'Fairway', 'Distance', 'Approach'];

function stabilityClass(stability: string) {
  if (stability === 'Very Overstable') return 'very-overstable';
  if (stability.includes('Overstable')) return 'overstable';
  if (stability === 'Very Understable') return 'very-understable';
  if (stability.includes('Understable')) return 'understable';
  return 'neutral';
}

function tokenize(query: string): string[] {
  return query.toLowerCase().trim().split(/\s+/).filter(Boolean);
}

function matchDisc(disc: TDisc, tokens: string[]): boolean {
  const haystack = `${disc.name} ${disc.brand} ${disc.category} ${disc.stability || ''}`.toLowerCase();
  
  // Pre-process tokens to handle cases like ["speed", "4-6"]
  const processedTokens: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === 'speed' && i + 1 < tokens.length && /^\d+/.test(tokens[i+1])) {
      processedTokens.push(`speed${tokens[i+1]}`);
      i++; // skip next token
    } else {
      processedTokens.push(tokens[i]);
    }
  }

  return processedTokens.every(token => {
    if (token.startsWith('speed')) {
      const rangeMatch = token.match(/(\d+)-(\d+)/);
      const singleMatch = token.match(/(\d+)/);
      if (rangeMatch) {
        const [_, min, max] = rangeMatch;
        return Number(disc.speed) >= parseInt(min) && Number(disc.speed) <= parseInt(max);
      }
      if (singleMatch) {
        return Math.round(Number(disc.speed)) === parseInt(singleMatch[0]);
      }
    }
    
    return haystack.includes(token);
  });
}

function displayCategory(category?: string): string {
  const value = (category || '').toLowerCase();
  if (value.includes('approach')) return 'Approach';
  if (value.includes('control') || value.includes('fairway') || value.includes('hybrid')) return 'Fairway';
  if (value.includes('distance')) return 'Distance';
  if (value.includes('midrange') || value.includes('mid-range')) return 'Midrange';
  if (value.includes('putter')) return 'Putter';
  return category || 'Other';
}

function DiscCard({ disc, onAdd, onWishlist, isWishlisted, onViewDetails, justAdded, inCompare, onCompare }: { disc: TDisc; onAdd: () => void; onWishlist: () => void; isWishlisted: boolean; onViewDetails: () => void; justAdded: boolean; inCompare?: boolean; onCompare?: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchStartY, setTouchStartY] = useState<number | null>(null);
  const [touchOffset, setTouchOffset] = useState(0);
  const [showActions, setShowActions] = useState(false);
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
    if (diffX > 0 && !showActions) {
      setTouchOffset(Math.min(diffX, 100)); // swipe left to reveal
    } else if (diffX < 0 && showActions) {
      setTouchOffset(Math.min(-diffX, 100)); // swipe right to hide
    }
  };

  const handleTouchEnd = () => {
    if (!showActions && touchOffset > 50) setShowActions(true);
    if (showActions && touchOffset > 50) setShowActions(false);
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
      <div 
        className="card !py-2.5 !px-3 cursor-pointer hover:bg-[var(--surface-2)] transition-colors group relative z-10"
        style={{
          transform: `translateX(${showActions ? -80 : 0}px)`,
          transition: touchStartX === null ? 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)' : 'none'
        }}
      >
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0" onClick={onViewDetails}>
            <div className="flex items-center gap-2 mb-0.5">
              <p className="disc-name !text-[15px] truncate leading-tight">{disc.name}</p>
              <span className={`stability-chip !text-[8px] !px-1.5 !min-h-[14px] !font-black ${stabilityClass(stability)}`}>
                {stability.replace('Overstable', 'OS').replace('Understable', 'US')}
              </span>
            </div>
            <p className="text-[11px] text-[var(--text-muted)] font-medium truncate leading-tight">
              {disc.brand} • <span className="text-[var(--primary)] uppercase tracking-wider font-bold">{displayCategory(disc.category)}</span>
            </p>
          </div>

          <div className="hidden sm:block" onClick={onViewDetails}>
            <FlightNumbers speed={Number(disc.speed) || 0} glide={Number(disc.glide) || 0} turn={Number(disc.turn) || 0} fade={Number(disc.fade) || 0} compact />
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={(e) => { e.stopPropagation(); onWishlist(); }}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-all border ${
                isWishlisted 
                  ? 'bg-amber-500/10 text-amber-500 border-amber-500/30' 
                  : 'bg-[var(--surface-3)] text-[var(--text-muted)] border-transparent hover:bg-[var(--surface-2)] hover:border-[var(--border)]'
              }`}
            >
              <Heart size={18} className={isWishlisted ? 'fill-amber-500' : ''} />
            </button>

            <button
              onClick={(e) => { e.stopPropagation(); onAdd(); }}
              className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center transition-all border ${
                justAdded 
                  ? 'bg-[var(--primary)] text-white border-[var(--primary)] shadow-lg scale-105' 
                  : 'bg-[var(--surface-3)] text-[var(--text-muted)] border-transparent hover:bg-[var(--primary-tonal)] hover:text-[var(--primary)] hover:border-[var(--primary)]/30'
              }`}
            >
              {justAdded ? <Check size={20} /> : <Plus size={22} />}
            </button>
          </div>
        </div>

        {expanded && (
          <div className="mt-2 pt-2 border-t border-[var(--border)] animate-in fade-in slide-in-from-top-1 duration-200" onClick={e => e.stopPropagation()}>
            <FlightPath speed={Number(disc.speed)} glide={Number(disc.glide)} turn={Number(disc.turn)} fade={Number(disc.fade)} />
          </div>
        )}

        <div className="sm:hidden mt-2 pt-2 border-t border-[var(--border)]" onClick={onViewDetails}>
          <FlightNumbers speed={Number(disc.speed) || 0} glide={Number(disc.glide) || 0} turn={Number(disc.turn) || 0} fade={Number(disc.fade) || 0} compact />
        </div>
      </div>
      
      {/* Revealed Actions Background */}
      <div className="absolute inset-y-0 right-0 w-24 flex items-center justify-end px-3">
        <div className="flex items-center gap-1.5">
          <button
            onClick={(e) => { e.stopPropagation(); onCompare?.(); }}
            title="Add to compare"
            className={`w-8 h-8 rounded-[9999px] flex items-center justify-center transition-colors ${inCompare ? 'bg-[var(--primary-tonal)] text-[var(--primary)]' : 'text-[var(--text-muted)] hover:bg-[var(--surface-3)]'}`}
          >
            <Scale size={15} />
          </button>

          <button
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
            className={`w-8 h-8 rounded-[9999px] flex items-center justify-center transition-colors ${expanded ? 'bg-[var(--primary-tonal)] text-[var(--primary)]' : 'text-[var(--text-muted)] hover:bg-[var(--surface-3)]'}`}
          >
            {expanded ? <ChevronUp size={16} /> : <LineChart size={16} />}
          </button>
        </div>
      </div>
    </div>
  );
}

function CustomDiscModal({ onClose, onSave }: { onClose: () => void; onSave: (disc: any) => void }) {
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [speed, setSpeed] = useState('7');
  const [glide, setGlide] = useState('5');
  const [turn, setTurn] = useState('-1');
  const [fade, setFade] = useState('2');

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-[var(--surface-2)] rounded-[32px] p-6 shadow-2xl border border-[var(--border)]">
        <h2 className="text-xl font-bold mb-6">Add Custom Disc</h2>
        <div className="space-y-4">
          <input type="text" placeholder="Disc Name" value={name} onChange={e => setName(e.target.value)} className="w-full bg-[var(--surface-3)] p-4 rounded-2xl outline-none border border-[var(--border)] text-sm" />
          <input type="text" placeholder="Brand" value={brand} onChange={e => setBrand(e.target.value)} className="w-full bg-[var(--surface-3)] p-4 rounded-2xl outline-none border border-[var(--border)] text-sm" />
          <div className="grid grid-cols-4 gap-2">
            {[['Spd', speed, setSpeed], ['Gld', glide, setGlide], ['Trn', turn, setTurn], ['Fde', fade, setFade]].map(([l, v, s]: any) => (
              <div key={l}><label className="text-[10px] font-black text-[var(--text-muted)] ml-2">{l}</label><input type="number" value={v} onChange={e => s(e.target.value)} className="w-full bg-[var(--surface-3)] p-3 rounded-xl text-center text-sm font-bold" /></div>
            ))}
          </div>
        </div>
        <div className="flex gap-3 mt-8">
          <button onClick={onClose} className="flex-1 py-4 font-bold text-sm text-[var(--text-muted)]">Cancel</button>
          <button onClick={() => onSave({ name, brand, speed, glide, turn, fade })} className="flex-1 py-4 bg-[var(--primary)] text-[var(--on-primary)] rounded-2xl font-bold shadow-lg text-sm">Save Disc</button>
        </div>
      </div>
    </div>
  );
}

export default function Search({ forceShowTrigger = 0, onModalStateChange, initialQuery = '' }: { forceShowTrigger?: number, onModalStateChange?: (open: boolean) => void, initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [allDiscs, setAllDiscs] = useState<TDisc[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [groupBy, setGroupBy] = useState<'category' | 'stability'>('category');
  const [filterCategory, setFilterCategory] = useState('All');
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [selectedDisc, setSelectedDisc] = useState<TDisc | null>(null);
  const [showCustom, setShowCustom] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [wishlistIds, setWishlistIds] = useState<Set<string>>(new Set());
  // Compare mode — max 2 discs, reuses existing FlightChart
  const [compareQueue, setCompareQueue] = useState<TDisc[]>([]);
  const [showCompare, setShowCompare] = useState(false);
  // Search focus — keeps island visible while keyboard is open
  const [searchFocused, setSearchFocused] = useState(false);
  // Hide-on-scroll state
  const [islandVisible, setIslandVisible] = useState(true);
  const lastScrollY = useRef(0);
  const scrollDelta = useRef(0);

  const [bags, setBags] = useState<any[]>([]);
  const [addingToDisc, setAddingToDisc] = useState<TDisc | null>(null);
  const [showCreateBag, setShowCreateBag] = useState(false);
  const [newBagName, setNewBagName] = useState('');

  useEffect(() => {
    onModalStateChange?.(!!selectedDisc || !!showCustom || !!addingToDisc || showCompare);
  }, [selectedDisc, showCustom, addingToDisc, showCompare, onModalStateChange]);

  useEffect(() => {
    const HIDE_THRESHOLD = 40;   // px scrolled down before hiding
    const SHOW_THRESHOLD = 10;   // px scrolled up before showing

    const onScroll = () => {
      const y = window.scrollY;
      const delta = y - lastScrollY.current;
      lastScrollY.current = y;

      // Always show near top
      if (y < 80) { setIslandVisible(true); scrollDelta.current = 0; return; }
      
      // If focused or comparing, don't update visibility state (should stay visible via effect)
      if (searchFocused || compareQueue.length > 0) {
        if (!islandVisible) setIslandVisible(true);
        return;
      }

      scrollDelta.current += delta;
      if (scrollDelta.current > HIDE_THRESHOLD) {
        setIslandVisible(false);
        scrollDelta.current = 0;
      } else if (scrollDelta.current < -SHOW_THRESHOLD) {
        setIslandVisible(true);
        scrollDelta.current = 0;
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [searchFocused, compareQueue.length, islandVisible]);

  // Force island visibility when active
  useEffect(() => {
    if (searchFocused || compareQueue.length > 0) {
      setIslandVisible(true);
    }
  }, [searchFocused, compareQueue.length]);
  
  // Watch initialQuery for tab switches
  useEffect(() => {
    if (initialQuery) {
      setQuery(initialQuery);
      setFilterCategory('All');
    }
  }, [initialQuery]);

  const loadAll = async () => {
    try {
      // Local-first: always read from SQLite first
      const rows = await dbQuery('SELECT * FROM DiscCatalog ORDER BY name ASC');
      setAllDiscs(rows as TDisc[]);
      setTotalCount(rows.length);

      const bagRows = await dbQuery('SELECT * FROM Bags ORDER BY created_at DESC');
      setBags(bagRows);

      const wishRows = await dbQuery<{ disc_id: string }>('SELECT disc_id FROM Wishlist');
      setWishlistIds(new Set(wishRows.map(r => r.disc_id)));
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  // Network-on-miss: if local search returns nothing, try the API
  const fetchFromApi = async (q: string) => {
    try {
      const res = await fetch(`https://discit-api.fly.dev/disc?name=${encodeURIComponent(q)}`);
      if (!res.ok) return;
      const discs: any[] = await res.json();
      for (const d of discs) {
        await dbRun(
          `INSERT OR IGNORE INTO DiscCatalog (id,name,brand,category,speed,glide,turn,fade,stability,pic,color,background_color,link,name_slug,brand_slug,source_provenance)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [d.id,d.name,d.brand??null,d.category??null,d.speed??null,d.glide??null,d.turn??null,d.fade??null,
           d.stability??null,d.pic??null,d.color??null,d.background_color??null,d.link??null,
           d.name_slug??null,d.brand_slug??null,'discit']
        );
      }
      if (discs.length > 0) loadAll();
    } catch { /* offline — silent */ }
  };

  const toggleWishlist = async (id: string) => {
    try {
      await Haptics.impact({ style: ImpactStyle.Light });
      if (wishlistIds.has(id)) {
        await dbRun('DELETE FROM Wishlist WHERE disc_id = ?', [id]);
      } else {
        await dbRun('INSERT INTO Wishlist (id, disc_id, created_at) VALUES (?, ?, ?)', [crypto.randomUUID(), id, Date.now()]);
      }
      loadAll();
    } catch (err) { console.error(err); }
  };

  useEffect(() => { loadAll(); }, []);

  const handleSaveCustom = async (data: any) => {
    const id = `custom-${crypto.randomUUID()}`;
    await dbRun(`INSERT INTO DiscCatalog (id, name, brand, speed, glide, turn, fade, category) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [id, data.name, data.brand, data.speed, data.glide, data.turn, data.fade, 'Custom']);
    setShowCustom(false); loadAll();
  };

  const filteredDiscs = useMemo(() => {
    let list = allDiscs;
    if (filterCategory !== 'All') {
      list = list.filter(d => displayCategory(d.category).includes(filterCategory));
    }
    if (!query.trim()) return list.slice(0, 100);
    const tokens = tokenize(query);
    return list.filter(disc => matchDisc(disc, tokens));
  }, [query, allDiscs, filterCategory]);

  // Network-on-miss: debounced side effect
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2 || filteredDiscs.length >= 3) return;

    const timer = setTimeout(() => {
      fetchFromApi(q);
    }, 800); // Wait for pause in typing

    return () => clearTimeout(timer);
  }, [query, filteredDiscs.length]);

  const { grouped, sortedGroups } = useMemo(() => {
    const g: Record<string, TDisc[]> = {};
    for (const disc of filteredDiscs) {
      const key = groupBy === 'category' ? displayCategory(disc.category) : (disc.stability || 'Other');
      if (!g[key]) g[key] = [];
      g[key].push(disc);
    }
    const s = groupBy === 'stability'
      ? STABILITY_ORDER.filter(k => g[k])
      : (filterCategory !== 'All' ? [filterCategory] : ['Putter', 'Midrange', 'Fairway', 'Distance', 'Approach', 'Other'].filter(k => g[k]));
    
    return { grouped: g, sortedGroups: s };
  }, [filteredDiscs, groupBy, filterCategory]);

  const handleAddAction = async (bagId: string) => {
    if (!addingToDisc) return;
    try {
      await Haptics.impact({ style: ImpactStyle.Light });
      await dbRun('INSERT OR IGNORE INTO BagDiscs (id, bag_id, disc_id) VALUES (?, ?, ?)', [crypto.randomUUID(), bagId, addingToDisc.id]);
      setAddedIds(prev => new Set(prev).add(addingToDisc.id));
      setAddingToDisc(null);
      setTimeout(() => setAddedIds(prev => { const s = new Set(prev); s.delete(addingToDisc.id); return s; }), 1500);
    } catch (err) { console.error(err); }
  };

  const createBagAndAdd = async () => {
    if (!newBagName.trim()) return;
    const bagId = crypto.randomUUID();
    await dbRun('INSERT INTO Bags (id, name, created_at) VALUES (?, ?, ?)', [bagId, newBagName.trim(), Date.now()]);
    if (addingToDisc) {
      await dbRun('INSERT OR IGNORE INTO BagDiscs (id, bag_id, disc_id) VALUES (?, ?, ?)', [crypto.randomUUID(), bagId, addingToDisc.id]);
      setAddedIds(prev => new Set(prev).add(addingToDisc.id));
      setTimeout(() => setAddedIds(prev => { const s = new Set(prev); s.delete(addingToDisc.id); return s; }), 1500);
    }
    setNewBagName('');
    setShowCreateBag(false);
    setAddingToDisc(null);
    loadAll();
  };

  const handlePlusClick = (disc: TDisc) => {
    if (bags.length === 0) {
      setShowCreateBag(true);
      setAddingToDisc(disc);
      return;
    }
    setAddingToDisc(disc);
  };

  const toggleCompare = (disc: TDisc) => {
    setCompareQueue(prev => {
      if (prev.find(d => d.id === disc.id)) return prev.filter(d => d.id !== disc.id);
      if (prev.length >= 2) return prev;
      return [...prev, disc];
    });
  };

  // Memoized comparison content to prevent re-renders during state transitions
  // Moved to top-level to follow Rules of Hooks
  const compareContent = useMemo(() => {
    if (compareQueue.length !== 2) return null;
    return (
      <>
        <div className="grid grid-cols-2 gap-3 mb-4">
          {compareQueue.map((d, i) => (
            <div key={d.id} className="rounded-2xl p-3 bg-[var(--surface-1)] border border-[var(--border)]">
              <p className="font-black text-sm truncate" style={{ color: i === 0 ? 'var(--primary)' : '#f97316' }}>{d.name}</p>
              <p className="text-[11px] text-[var(--text-muted)] truncate">{d.brand}</p>
              <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] mt-1">{displayCategory(d.category)}</p>
              <FlightNumbers speed={Number(d.speed)||0} glide={Number(d.glide)||0} turn={Number(d.turn)||0} fade={Number(d.fade)||0} compact />
              <p className="text-[10px] mt-1 text-[var(--text-muted)]">{d.stability}</p>
            </div>
          ))}
        </div>
        <FlightChart
          multiplePaths={compareQueue.map((d, i) => ({
            ...buildFlightModel(Number(d.speed)||0, Number(d.glide)||0, Number(d.turn)||0, Number(d.fade)||0),
            color: i === 0 ? 'var(--primary)' : '#f97316',
            name: d.name,
          }))}
          height={320}
        />
        <div className="mt-4 rounded-2xl bg-[var(--surface-1)] border border-[var(--border)] p-3 flex flex-col gap-1.5">
          <p className="text-[10px] font-black tracking-widest text-[var(--text-muted)] mb-1">Key Differences</p>
          {(['speed','glide','turn','fade'] as const).map(k => {
            const a = Number((compareQueue[0] as any)[k])||0;
            const b = Number((compareQueue[1] as any)[k])||0;
            const diff = Math.abs(a - b);
            if (diff === 0) return null;
            return (
              <div key={k} className="flex items-center gap-2 text-xs">
                <span className="w-8 font-black text-[var(--text-muted)] capitalize">{k}</span>
                <span style={{color:'var(--primary)'}} className="font-bold w-6 text-center">{a}</span>
                <span className="text-[var(--text-muted)]">/</span>
                <span style={{color:'#f97316'}} className="font-bold w-6 text-center">{b}</span>
                <span className="text-[var(--text-muted)] text-[10px]">Δ{diff}</span>
              </div>
            );
          })}
        </div>
      </>
    );
  }, [compareQueue]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col mb-1 pt-2">
        <h1 className="text-3xl font-black tracking-tight text-[var(--text-primary)]">Catalog</h1>
        <p className="text-[var(--text-muted)] text-sm font-medium">Find your next favorite disc</p>
      </div>

      {/* Floating Island Search Bar — hides on scroll-down, shows on scroll-up */}
      <div
        className="sticky z-30 -mx-4 md:-mx-8 px-4 md:px-8 transition-all duration-300"
        style={{
          top: 'calc(env(safe-area-inset-top) + 12px)',
          transform: islandVisible ? 'translateY(0)' : 'translateY(-110%)',
          opacity: islandVisible ? 1 : 0,
          pointerEvents: islandVisible ? 'auto' : 'none',
        }}
      >
        <div className="w-full max-w-2xl mx-auto bg-[var(--surface-2)]/90 backdrop-blur-2xl rounded-[28px] p-3 shadow-[0_8px_32px_rgba(0,0,0,0.45)] border border-[var(--border)]">
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center bg-[var(--surface-3)] rounded-2xl h-11 px-4 border border-transparent transition-all focus-within:border-[var(--primary)]/60 focus-within:bg-[var(--surface-2)]">
              <SearchIcon className="w-4 h-4 text-[var(--text-muted)] mr-3 flex-shrink-0" />
              <input
                type="text"
                placeholder={`Search ${totalCount} discs...`}
                value={query}
                onChange={e => setQuery(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none"
              />
              {query && <button onClick={() => setQuery('')} className="p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"><Plus size={16} className="rotate-45" /></button>}
            </div>

            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`w-11 h-11 flex items-center justify-center rounded-2xl transition-all ${
                showFilters || filterCategory !== 'All' || groupBy !== 'category'
                  ? 'bg-[var(--primary)] text-[var(--on-primary)] shadow-md'
                  : 'bg-[var(--surface-3)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Filter size={18} />
            {filterCategory !== 'All' && <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[var(--primary)]" />}
            </button>
          </div>

          {/* Collapsible Filter/Custom Island Content */}
          {showFilters && (
            <div className="mt-2 p-3 flex flex-col gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="w-full h-px bg-[var(--border)]" />

              <div>
                <label className="text-[10px] font-black text-[var(--text-muted)] ml-1 mb-2 block">Category</label>
                <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                  {CATEGORY_CHIPS.map(cat => (
                    <button
                      key={cat}
                      onClick={() => setFilterCategory(cat)}
                      className={`px-4 py-2 rounded-xl text-[11px] font-bold whitespace-nowrap border transition-all ${
                        filterCategory === cat
                          ? 'bg-[var(--primary-tonal)] text-[var(--primary)] border-[var(--primary)]'
                          : 'bg-[var(--surface-3)] text-[var(--text-muted)] border-transparent hover:text-[var(--text-primary)]'
                      }`}
                    >
                      {cat.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between gap-4">
                <div className="flex-1">
                  <label className="text-[10px] font-black text-[var(--text-muted)] ml-1 mb-2 block">Group Results</label>
                  <div className="segmented-control !bg-[var(--surface-3)]">
                    <button onClick={() => setGroupBy('category')} className={groupBy === 'category' ? 'active' : ''}>By Type</button>
                    <button onClick={() => setGroupBy('stability')} className={groupBy === 'stability' ? 'active' : ''}>By Stability</button>
                  </div>
                </div>
                <div className="shrink-0 pt-6">
                  <button
                    onClick={() => { setShowCustom(true); setShowFilters(false); }}
                    className="flex items-center gap-2 px-4 py-2.5 bg-[var(--primary-tonal)] text-[var(--primary)] rounded-xl font-bold text-xs hover:bg-[var(--primary)] hover:text-[var(--on-primary)] transition-all"
                  >
                    <PlusCircle size={16} />
                    CUSTOM
                  </button>
                </div>
              </div>
            </div>
          )}
          {/* Compare state indicator — now integrated into the island */}
          {compareQueue.length > 0 && (
            <div className="mt-3 pt-3 border-t border-[var(--border)] flex items-center gap-2 px-1 animate-in fade-in slide-in-from-top-1 duration-200">
              <Scale size={13} className="text-[var(--primary)] shrink-0" />
              <p className="text-[11px] font-bold text-[var(--primary)] flex-1 truncate">
                {compareQueue.length === 1 ? `${compareQueue[0].name} selected...` : `${compareQueue[0].name} vs ${compareQueue[1].name}`}
              </p>
              {compareQueue.length === 2 && (
                <button
                  onClick={() => setShowCompare(true)}
                  className="px-3 py-1.5 rounded-xl bg-[var(--primary)] text-white text-[9px] font-black uppercase tracking-[0.15em] shadow-lg active:scale-95 transition-transform"
                >
                  Compare
                </button>
              )}
              <button onClick={() => setCompareQueue([])} className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
                <X size={14} />
              </button>
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="text-center text-[var(--text-muted)] py-20 text-sm font-bold animate-pulse">Loading catalog...</div>
      ) : sortedGroups.length === 0 ? (
        <div className="text-center py-20 opacity-50"><Disc3 size={32} className="mx-auto mb-4" /><p className="text-sm font-bold">No discs found.</p></div>
      ) : (
        <div className="flex flex-col gap-5 pb-20">
          {sortedGroups.map(group => {
            const discs = grouped[group] || [];
            return (
              <div key={group} className="flex flex-col gap-2.5">
                <div className="flex items-center gap-3">
                  <h2 className="text-[11px] font-black tracking-[0.15em] text-[var(--text-muted)] capitalize">{group}</h2>
                  <div className="flex-1 h-px bg-[var(--border)]" />
                  <span className="text-[10px] font-black text-[var(--text-muted)] opacity-50">{discs.length}</span>
                </div>
                <div className="grid grid-cols-1 gap-2.5">
                  {discs.map(disc => (
                    <DiscCard
                      key={disc.id}
                      disc={disc}
                      onAdd={() => handlePlusClick(disc)}
                      onWishlist={() => toggleWishlist(disc.id)}
                      isWishlisted={wishlistIds.has(disc.id)}
                      onViewDetails={() => setSelectedDisc(disc)}
                      justAdded={addedIds.has(disc.id)}
                      inCompare={!!compareQueue.find(d => d.id === disc.id)}
                      onCompare={() => toggleCompare(disc)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Bag Selection Modal for Adding */}
      {addingToDisc && !showCreateBag && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setAddingToDisc(null)} />
          <div className="relative w-full max-w-xs bg-[var(--surface-2)] rounded-[32px] p-6 shadow-2xl border border-[var(--border)]">
            <h3 className="text-lg font-bold mb-1">Add {addingToDisc.name}</h3>
            <p className="text-xs text-[var(--text-muted)] mb-6">Select a bag to add this disc to.</p>
            <div className="flex flex-col gap-2 mb-6 max-h-48 overflow-y-auto">
              {bags.map(bag => (
                <button
                  key={bag.id}
                  onClick={() => handleAddAction(bag.id)}
                  className="group flex items-center justify-between p-3.5 rounded-full border border-transparent bg-[var(--surface-3)] hover:bg-[var(--primary-tonal)] hover:border-[var(--primary)]/30 hover:shadow-sm transition-all text-left"
                >
                  <span className="text-sm font-bold truncate ml-2 group-hover:text-[var(--primary)] transition-colors">{bag.name}</span>
                  <div className="w-8 h-8 rounded-full bg-[var(--surface-2)] flex items-center justify-center text-[var(--text-muted)] group-hover:bg-[var(--primary)] group-hover:text-white transition-all shadow-sm">
                    <Plus size={16} />
                  </div>
                </button>
              ))}
              {bags.length === 0 && (
                <div className="text-center py-6">
                  <p className="text-xs font-bold text-[var(--text-muted)] mb-2">No bags yet!</p>
                  <button onClick={() => setShowCreateBag(true)} className="px-5 py-2.5 bg-[var(--primary)] text-white rounded-xl text-[11px] font-black uppercase tracking-widest shadow-lg">
                    Create a Bag
                  </button>
                </div>
              )}
            </div>
            <button onClick={() => { setAddingToDisc(null); setShowCreateBag(false); }} className="w-full py-3 font-bold text-sm text-[var(--text-muted)]">Cancel</button>
          </div>
        </div>
      )}

      {/* Create Bag Modal */}
      {showCreateBag && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => { setShowCreateBag(false); setAddingToDisc(null); }} />
          <div className="relative w-full max-w-sm bg-[var(--surface-2)] rounded-[32px] p-6 shadow-2xl border border-[var(--border)]">
            <h3 className="text-lg font-bold mb-1">Create a Bag</h3>
            <p className="text-xs text-[var(--text-muted)] mb-6">Name your new bag to add {addingToDisc?.name}.</p>
            <input
              type="text"
              value={newBagName}
              onChange={e => setNewBagName(e.target.value)}
              placeholder="e.g. Main Bag"
              className="w-full bg-[var(--surface-3)] border border-[var(--border)] rounded-2xl p-4 text-sm focus:border-[var(--primary)] outline-none mb-6"
              autoFocus
            />
            <div className="flex gap-3">
              <button onClick={() => { setShowCreateBag(false); setAddingToDisc(null); }} className="flex-1 py-4 font-bold text-sm text-[var(--text-muted)]">Cancel</button>
              <button onClick={createBagAndAdd} disabled={!newBagName.trim()} className="flex-1 py-4 bg-[var(--primary)] text-white rounded-2xl font-black text-sm shadow-lg disabled:opacity-50">Create & Add</button>
            </div>
          </div>
        </div>
      )}

      {/* Compare modal — reuses existing FlightChart directly */}
      {showCompare && compareQueue.length === 2 && (
        <div className="fixed inset-0 z-[100] flex items-stretch justify-end" onClick={() => setShowCompare(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div 
            className="relative w-full max-w-sm bg-[var(--surface-2)] border-l border-[var(--border)] p-5 pb-10 shadow-2xl h-full overflow-y-auto animate-in slide-in-from-right-full duration-300" 
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4 mt-2">
              <h3 className="text-xl font-black tracking-tight">Comparison</h3>
              <button onClick={() => setShowCompare(false)} className="w-10 h-10 rounded-full bg-[var(--surface-3)] flex items-center justify-center text-[var(--text-muted)]"><X size={20} /></button>
            </div>
            {/* Comparison Content — Memoized to prevent re-renders during state transitions */}
            {compareContent}
            <button onClick={() => { setShowCompare(false); setCompareQueue([]); }} className="mt-8 w-full py-5 rounded-2xl bg-[var(--surface-3)] text-sm font-black uppercase tracking-widest text-[var(--text-muted)]">Clear Comparison</button>
          </div>
        </div>
      )}
      {showCustom && <CustomDiscModal onClose={() => setShowCustom(false)} onSave={handleSaveCustom} />}
      {selectedDisc && (
        <DiscDetail
          disc={selectedDisc}
          onClose={() => { setSelectedDisc(null); loadAll(); }}
          onViewSimilar={(s) => setSelectedDisc(s)}
        />
      )}
    </div>
  );
}
