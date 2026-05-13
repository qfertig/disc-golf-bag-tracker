'use client';

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
} from 'react';
import Search from '@/components/Search';
import BagManager from '../components/BagManager';
import Terminology from '@/components/Terminology';
import Scorekeeper from '@/components/Scorekeeper';
import Wishlist from '@/components/Wishlist';
import Rangefinder from '@/components/Rangefinder';
import About from '@/components/About';
import DataManager from '@/components/DataManager';
import CourseCache from '@/components/CourseCache';
import DevEvalScreen from '@/components/DevEvalScreen';
import ThrowLoggerScreen from '@/components/ThrowLoggerScreen';
import CustomCourses from '@/components/CustomCourses';
import Stats from '@/components/Stats';
import {
  Search as SearchIcon,
  Backpack,
  BookOpen,
  Trophy,
  Heart,
  MapPin,
  Info,
  Menu,
  X,
  Database,
  Flag,
  FlaskConical,
  Crosshair,
  MoreHorizontal,
  BarChart3,
} from 'lucide-react';
import { DatabaseProvider } from '@/context/DatabaseContext';

// ─── Types ─────────────────────────────────────────────────────────────────

type Tab = 'search' | 'bags' | 'score' | 'distance' | 'wishlist' | 'terms' | 'about' | 'data' | 'courses' | 'throws' | 'mycourses' | 'deveval' | 'stats';

interface NavItem {
  id: Tab;
  label: string;
  icon: ReactNode;
  description?: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

/** Minimum drag distance (px) to trigger close */
const SWIPE_CLOSE_THRESHOLD = 100;
/** Minimum swipe velocity (px/ms) to trigger close regardless of distance */
const SWIPE_CLOSE_VELOCITY = 0.4;

/** Tab order for swipe-to-navigate */
const TAB_ORDER: Tab[] = ['search', 'bags', 'score', 'throws', 'distance', 'wishlist', 'mycourses', 'courses', 'data', 'stats', 'terms', 'about'];

const PRIMARY_NAV: NavItem[] = [
  { id: 'search',   label: 'Catalog',     icon: <SearchIcon size={20} />,  description: 'Search 1000+ discs'     },
  { id: 'bags',     label: 'Bags',        icon: <Backpack size={20} />,    description: 'Manage your disc bags'  },
  { id: 'score',    label: 'Score',       icon: <Trophy size={20} />,      description: 'Keep scorecard'         },
  { id: 'distance', label: 'Range',       icon: <MapPin size={20} />,      description: 'GPS rangefinder'        },
];

const DRAWER_NAV_TOOLS: NavItem[] = [
  { id: 'throws',   label: 'Throw Logger',    icon: <Crosshair size={20} />,  description: 'Log throws with path & distance' },
  { id: 'distance', label: 'Distance Tracker', icon: <MapPin size={20} />,     description: 'GPS rangefinder & measurements' },
];

const DRAWER_NAV: NavItem[] = [
  { id: 'wishlist',  label: 'Wishlist',       icon: <Heart size={20} />,    description: 'Discs you want'          },
  { id: 'mycourses', label: 'My Courses',     icon: <Flag size={20} />,     description: 'Custom course layouts'   },
  { id: 'courses',   label: 'Location Pins',  icon: <MapPin size={20} />,   description: 'Saved tee & basket pins' },
  { id: 'data',      label: 'Data & Backup',  icon: <Database size={20} />, description: 'Import, export & backup' },
  { id: 'stats',     label: 'Stats',          icon: <BarChart3 size={20} />, description: 'Rounds, throws & records' },
  { id: 'terms',     label: 'Dictionary',     icon: <BookOpen size={20} />, description: 'Disc golf terms'          },
  { id: 'about',     label: 'About',          icon: <Info size={20} />,     description: 'App info & changelog'    },
];

const ALL_NAV: NavItem[] = [
  { id: 'search',    label: 'Catalog',       icon: <SearchIcon size={20} /> },
  { id: 'bags',      label: 'My Bags',       icon: <Backpack size={20} />   },
  { id: 'throws',    label: 'Throw Log',     icon: <Crosshair size={20} />  },
  { id: 'score',     label: 'Scorecard',     icon: <Trophy size={20} />     },
  { id: 'distance',  label: 'Rangefinder',   icon: <MapPin size={20} />     },
  { id: 'wishlist',  label: 'Wishlist',      icon: <Heart size={20} />      },
  { id: 'mycourses', label: 'My Courses',    icon: <Flag size={20} />       },
  { id: 'courses',   label: 'Location Pins', icon: <MapPin size={20} />     },
  { id: 'data',      label: 'Data',          icon: <Database size={20} />   },
  { id: 'stats',     label: 'Stats',         icon: <BarChart3 size={20} /> },
  { id: 'terms',     label: 'Dictionary',    icon: <BookOpen size={20} />   },
  { id: 'about',     label: 'About',         icon: <Info size={20} />       },
];

const DRAWER_TABS = new Set<Tab>(['wishlist', 'courses', 'mycourses', 'data', 'terms', 'about', 'throws', 'deveval', 'stats']);

// ─── Root ───────────────────────────────────────────────────────────────────

export default function Home() {
  return (
    <DatabaseProvider>
      <HomeContent />
    </DatabaseProvider>
  );
}

// ─── HomeContent ────────────────────────────────────────────────────────────

function HomeContent() {
  const [tab, setTab] = useState<Tab>('search');
  const [mounted, setMounted] = useState(false);
  const [requestedBagId, setRequestedBagId] = useState<string | null>(null);
  const [forceShowSearch, setForceShowSearch] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  // Lifted GPS state — shared by Rangefinder, Weather widget, Recommendations
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  // Backup reminder — subtle, dismissible
  const [backupReminder, setBackupReminder] = useState<string | null>(null);
  const [reminderDismissed, setReminderDismissed] = useState(false);

  // Tab swipe gesture state
  const swipeStartX = useRef(0);
  const swipeStartY = useRef(0);
  // Pull-to-refresh state
  const mainRef = useRef<HTMLElement>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const pullStartY = useRef(0);
  const isPulling = useRef(false);

  const handleTabClick = useCallback((next: Tab) => {
    setTab(prev => {
      if (prev === next) setForceShowSearch(c => c + 1);
      return next;
    });
    setIsDrawerOpen(false);
  }, []);

  const navigateTabSwipe = useCallback((direction: -1 | 1) => {
    setTab(prev => {
      const idx = TAB_ORDER.indexOf(prev);
      const next = TAB_ORDER[Math.max(0, Math.min(TAB_ORDER.length - 1, idx + direction))];
      if (next === prev) setForceShowSearch(c => c + 1);
      return next;
    });
  }, []);

  const handleSwipeStart = useCallback((e: React.TouchEvent) => {
    swipeStartX.current = e.touches[0].clientX;
    swipeStartY.current = e.touches[0].clientY;
  }, []);

  const handleSwipeEnd = useCallback((e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - swipeStartX.current;
    const dy = e.changedTouches[0].clientY - swipeStartY.current;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
      navigateTabSwipe(dx < 0 ? 1 : -1);
    }
  }, [navigateTabSwipe]);

  // Pull-to-refresh
  const handlePullStart = useCallback((e: React.TouchEvent) => {
    const main = mainRef.current;
    if (!main || main.scrollTop > 0) return;
    pullStartY.current = e.touches[0].clientY;
    isPulling.current = true;
  }, []);

  const handlePullMove = useCallback((e: React.TouchEvent) => {
    if (!isPulling.current) return;
    const delta = e.touches[0].clientY - pullStartY.current;
    if (delta > 0) setPullDistance(Math.min(delta * 0.4, 80));
    else { setPullDistance(0); isPulling.current = false; }
  }, []);

  const handlePullEnd = useCallback(() => {
    if (!isPulling.current) return;
    isPulling.current = false;
    if (pullDistance > 50) {
      setIsRefreshing(true);
      setPullDistance(0);
      window.dispatchEvent(new CustomEvent('app:refresh'));
      setTimeout(() => setIsRefreshing(false), 1200);
    } else {
      setPullDistance(0);
    }
  }, [pullDistance]);

  // Check backup reminder on mount
  useEffect(() => {
    const check = async () => {
      try {
        const { Preferences } = await import('@capacitor/preferences');
        const { value: rd } = await Preferences.get({ key: 'backupReminderDays' });
        const days = Number(rd || 0);
        if (days <= 0) return;
        const { value: ts } = await Preferences.get({ key: 'lastBackupAt' });
        const lastTs = Number(ts || 0);
        const elapsed = Date.now() - lastTs;
        const dueMs = days * 86400000;
        if (elapsed > dueMs) {
          const ageDays = Math.floor(elapsed / 86400000);
          setBackupReminder(lastTs > 0 ? `Last backup was ${ageDays} days ago` : 'You haven\'t backed up yet');
        }
      } catch { /* ignore */ }
    };
    check();
  }, []);

  // Deep-link handling
  useEffect(() => {
    const init = async () => {
      setMounted(true);
      const params = new URLSearchParams(window.location.search);

      const bagId = params.get('bag');
      if (bagId) {
        setRequestedBagId(bagId);
        setTab('bags');
      }

      const shareData = params.get('share');
      if (shareData) {
        const { unpackSharedBag } = await import('@/lib/sync');
        const newBagId = await unpackSharedBag(shareData);
        if (newBagId) {
          setRequestedBagId(newBagId);
          setTab('bags');
          window.history.replaceState({}, '', window.location.pathname);
        }
      }
    };
    queueMicrotask(init);
  }, []);

  // Hardware back button — close drawer first, then go to default tab
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    const init = async () => {
      try {
        const { App } = await import('@capacitor/app');
        const listener = await App.addListener('backButton', () => {
          if (isDrawerOpen) {
            setIsDrawerOpen(false);
          } else if (tab !== 'search') {
            setTab('search');
          }
        });
        cleanup = () => listener.remove();
      } catch { /* not in Capacitor */ }
    };
    init();
    return () => cleanup?.();
  }, [isDrawerOpen, tab]);

  // Prevent body scroll while drawer is open
  useEffect(() => {
    document.body.style.overflow = isDrawerOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isDrawerOpen]);

  if (!mounted) return null;

  return (
    <div className="flex flex-col md:flex-row h-dvh overflow-clip bg-[var(--surface-0)]">

      {/* ── Desktop sidebar ── */}
      <nav
        className="hidden md:flex flex-col w-20 lg:w-60 border-r border-[var(--border)] bg-[var(--surface-1)] sticky top-0 h-screen p-3"
        aria-label="Main navigation"
      >
        <div className="flex flex-col gap-0.5 mt-4">
          {ALL_NAV.map(item => (
            <SideNavBtn
              key={item.id}
              active={tab === item.id}
              onClick={() => handleTabClick(item.id)}
              icon={item.icon}
              label={item.label}
            />
          ))}
        </div>
      </nav>

      {/* ── Page content ── */}
      <div className="flex-1 flex flex-col min-w-0 h-full w-full bg-[var(--surface-0)]">
        <main
          ref={mainRef}
          className="flex-1 w-full h-full overflow-y-auto overscroll-y-contain"
          style={{ WebkitOverflowScrolling: 'touch' }}
          onTouchStart={handleSwipeStart}
          onTouchEnd={(e) => { handleSwipeEnd(e); handlePullEnd(); }}
          onTouchMove={handlePullMove}
          onTouchCancel={handlePullEnd}
        >
          {/* Pull-to-refresh indicator */}
          {(pullDistance > 0 || isRefreshing) && (
            <div className="flex justify-center items-center h-0 overflow-visible z-50" style={{ transform: `translateY(${pullDistance - 30}px)`, opacity: Math.min(1, pullDistance / 50), transition: isPulling.current ? 'none' : 'all 0.3s ease' }}>
              <div className={`w-8 h-8 rounded-full bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center shadow-lg ${isRefreshing ? 'animate-spin' : ''}`}>
                {isRefreshing ? (
                  <div className="w-4 h-4 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
                ) : (
                  <div className="w-4 h-4 text-[var(--text-muted)]" style={{ transform: `rotate(${pullDistance * 3}deg)` }}>↓</div>
                )}
              </div>
            </div>
          )}
          <div className="min-h-full max-w-4xl w-full mx-auto px-4 md:px-8 pt-[calc(env(safe-area-inset-top,0px)+24px)] md:py-8 flex flex-col">
            {/* Backup reminder banner — subtle, dismissible */}
            {backupReminder && !reminderDismissed && tab !== 'data' && (
              <div className="w-full mb-4">
                <div className="flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs">
                  <span className="text-amber-400 font-bold flex-1">{backupReminder}</span>
                  <button
                    onClick={() => { setTab('data' as Tab); setReminderDismissed(true); }}
                    className="text-amber-400 font-black uppercase tracking-wider text-[10px] hover:underline shrink-0"
                  >
                    Backup Now
                  </button>
                  <button
                    onClick={() => setReminderDismissed(true)}
                    className="text-amber-400/60 hover:text-amber-400 transition-colors shrink-0"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            )}

            {tab === 'search'   && <Search forceShowTrigger={forceShowSearch} onModalStateChange={setIsModalOpen} initialQuery={searchQuery} />}
            {tab === 'bags'     && <BagManager requestedBagId={requestedBagId} onModalStateChange={setIsModalOpen} gpsLat={gpsCoords?.lat ?? null} gpsLon={gpsCoords?.lon ?? null} onSwitchToSearch={(q) => { setSearchQuery(q); setTab('search'); }} />}
            {tab === 'score'    && <Scorekeeper onModalStateChange={setIsModalOpen} />}
            {tab === 'distance' && <Rangefinder onLocationUpdate={setGpsCoords} />}
            {tab === 'throws'   && <ThrowLoggerScreen />}
            {tab === 'wishlist' && <Wishlist onModalStateChange={setIsModalOpen} />}
            {tab === 'courses'   && <CourseCache />}
            {tab === 'mycourses' && <CustomCourses />}
            {tab === 'data'     && <DataManager />}
            {tab === 'terms'    && <Terminology />}
            {tab === 'about'    && <About onDevUnlock={() => { setTab('deveval'); setIsDrawerOpen(false); }} />}
            {tab === 'deveval'  && <DevEvalScreen />}
            {tab === 'stats'    && <Stats />}
            
            {/* Centralized Spacer for Floating Island */}
            <div 
              className="w-full pointer-events-none shrink-0 mt-auto" 
              style={{ height: '160px' }} 
              aria-hidden="true" 
            />
          </div>
        </main>

        {/* ── Mobile Floating Island Navigation ── */}
        {!isModalOpen && !isDrawerOpen && (
          <div 
            className="md:hidden fixed inset-x-4 z-50 flex justify-center"
            style={{ bottom: '24px', marginBottom: 'env(safe-area-inset-bottom, 0px)' }}
          >
            <div className="h-16 w-full max-w-md bg-[var(--surface-1)]/80 backdrop-blur-2xl border border-[var(--border)] shadow-[0_12px_40px_rgba(0,0,0,0.5)] rounded-[32px] px-2">
              <div className="flex h-full items-center justify-around">
                {PRIMARY_NAV.map(item => (
                  <BottomBtn
                    key={item.id}
                    active={tab === item.id}
                    onClick={() => handleTabClick(item.id)}
                    icon={item.icon}
                    label={item.label}
                  />
                ))}
                <BottomBtn
                  active={isDrawerOpen || DRAWER_TABS.has(tab)}
                  onClick={() => setIsDrawerOpen(v => !v)}
                  icon={isDrawerOpen ? <X size={20} /> : <MoreHorizontal size={20} />}
                  label="More"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Slide-in side drawer (mobile) ── */}
      <SideDrawer
        open={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
      >
        {/* App identity header */}
        <div className="px-5 pb-4 pt-6">
          <p className="text-2xl font-black tracking-tighter leading-none text-[var(--text-primary)]">
            Bag<span className="text-[var(--primary)]">Tracker</span>
          </p>
        </div>

        {/* Drawer nav items */}
        <div className="flex flex-col gap-0.5 px-3 pb-2">
          {/* Tools section */}
          <p className="text-[9px] font-black uppercase text-[var(--text-muted)] tracking-[0.15em] px-3 pt-3 pb-1 opacity-60">Tools</p>
          {DRAWER_NAV_TOOLS.map(item => (
            <DrawerItem
              key={`tool-${item.id}`}
              active={tab === item.id}
              onClick={() => handleTabClick(item.id)}
              icon={item.icon}
              label={item.label}
              description={item.description!}
            />
          ))}
          
          <div className="w-full h-px bg-[var(--border)] my-2 ml-3 max-w-[calc(100%-24px)]" />

          {/* Top Group */}
          {DRAWER_NAV.slice(0, 2).map(item => (
            <DrawerItem
              key={item.id}
              active={tab === item.id}
              onClick={() => handleTabClick(item.id)}
              icon={item.icon}
              label={item.label}
              description={item.description!}
            />
          ))}
          
          <div className="w-full h-px bg-[var(--border)] my-2 ml-3 max-w-[calc(100%-24px)]" />

          {/* Bottom Group */}
          {DRAWER_NAV.slice(2).map(item => (
            <DrawerItem
              key={item.id}
              active={tab === item.id}
              onClick={() => handleTabClick(item.id)}
              icon={item.icon}
              label={item.label}
              description={item.description!}
            />
          ))}
        </div>
      </SideDrawer>
    </div>
  );
}

// ─── SideDrawer ──────────────────────────────────────────────────────────────
// Slide-in drawer from the right side

interface SideDrawerProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

function SideDrawer({ open, onClose, children }: SideDrawerProps) {
  // Mount/animate state machine: render nothing when fully closed
  const [visible, setVisible] = useState(false);
  const [animateIn, setAnimateIn] = useState(false);

  // Swipe-to-close state
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const touchStartX = useRef(0);
  const touchStartTime = useRef(0);

  useEffect(() => {
    if (open) {
      // Mount first, then animate on next frame
      setVisible(true);
      const raf = requestAnimationFrame(() => {
        requestAnimationFrame(() => setAnimateIn(true));
      });
      return () => cancelAnimationFrame(raf);
    } else {
      // Animate out, then unmount after transition
      setAnimateIn(false);
      setDragX(0);
      const timer = setTimeout(() => setVisible(false), 320);
      return () => clearTimeout(timer);
    }
  }, [open]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartTime.current = Date.now();
    setIsDragging(true);
    setDragX(0);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    const delta = e.touches[0].clientX - touchStartX.current;
    if (delta > 0) setDragX(delta);
  };

  const handleTouchEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);
    const elapsed = Date.now() - touchStartTime.current;
    const velocity = dragX / (elapsed || 1);
    if (dragX > 100 || velocity > 0.5) {
      onClose();
    }
    setDragX(0);
  };

  // Don't render anything when fully closed — zero chance of stuck state
  if (!visible) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        pointerEvents: animateIn ? 'auto' : 'none',
      }}
    >
      {/* Scrim */}
      <div
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          opacity: animateIn ? 1 : 0,
          transition: 'opacity 0.3s ease',
        }}
      />

      {/* Drawer panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          width: '80%',
          maxWidth: '384px',
          backgroundColor: 'var(--surface-1)',
          borderLeft: '1px solid var(--border)',
          boxShadow: '-8px 0 40px rgba(0, 0, 0, 0.5)',
          transform: animateIn ? `translateX(${dragX}px)` : 'translateX(100%)',
          transition: isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
          display: 'flex',
          flexDirection: 'column' as const,
          overflow: 'hidden',
        }}
      >
        {/* Close button at top-right */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '16px 16px 0' }}>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-[var(--surface-3)] flex items-center justify-center text-[var(--text-muted)] hover:bg-[var(--surface-2)] transition-colors active:scale-90"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto no-scrollbar">
          {children}
        </div>
      </div>
    </div>
  );
}

// Removed DiscSVG component

// ─── Nav components ──────────────────────────────────────────────────────────

interface NavBtnProps {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}

function SideNavBtn({ active, onClick, icon, label }: NavBtnProps) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`
        flex items-center gap-3 p-2.5 lg:px-3.5 rounded-xl w-full
        transition-all duration-150
        ${active
          ? 'bg-[var(--primary-tonal)] text-[var(--primary)]'
          : 'text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]'
        }
      `}
    >
      <span className={`shrink-0 transition-transform duration-150 ${active ? 'scale-110' : ''}`}>
        {icon}
      </span>
      <span className="hidden lg:block text-sm font-semibold truncate">{label}</span>
    </button>
  );
}

function BottomBtn({ active, onClick, icon, label }: NavBtnProps) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`
        flex flex-col items-center justify-center gap-0.5 h-full w-full
        transition-all duration-150 active:scale-90
        ${active ? 'text-[var(--primary)]' : 'text-[var(--text-muted)]'}
      `}
    >
      <span className={`px-4 py-1.5 rounded-full transition-colors duration-150 ${active ? 'bg-[var(--primary-tonal)]' : ''}`}>
        {icon}
      </span>
      <span className="text-[9px] font-bold uppercase tracking-tight leading-none">{label}</span>
    </button>
  );
}

interface DrawerItemProps extends NavBtnProps {
  description: string;
}

function DrawerItem({ active, onClick, icon, label, description }: DrawerItemProps) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`
        w-full flex items-center gap-3.5 px-3.5 py-3 rounded-2xl
        transition-all duration-150 active:scale-[0.97]
        ${active ? 'text-[var(--primary)]' : 'hover:bg-white/[0.03]'}
      `}
    >
      {/* Bare icon — no box, no tile, just the icon itself */}
      <span className={`shrink-0 transition-colors duration-150 ${
        active ? 'text-[var(--primary)]' : 'text-[var(--text-muted)]'
      }`}>
        {icon}
      </span>

      {/* Label + description */}
      <span className="text-left flex-1 min-w-0">
        <span className={`block text-sm font-semibold leading-snug ${
          active ? 'text-[var(--primary)]' : 'text-[var(--text-primary)]'
        }`}>
          {label}
        </span>
        <span className="block text-[11px] text-[var(--text-muted)] font-medium leading-snug mt-0.5">
          {description}
        </span>
      </span>

      {/* Soft active dot — only when active */}
      {active && (
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--primary)] shrink-0 opacity-80" aria-hidden="true" />
      )}
    </button>
  );
}
