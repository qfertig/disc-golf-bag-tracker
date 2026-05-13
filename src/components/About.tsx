'use client';

import { History } from 'lucide-react';
import { useState, useRef } from 'react';
import { seedCatalog } from '@/lib/db';

const VERSION_HISTORY = [
  {
    version: '1.2.0',
    date: 'May 2026',
    changes: [
      'GPS Rangefinder with Shot Tracking added',
      'Multiplayer Scorecard support (up to 4 players)',
      'Disc Wanted (Wishlist) system implemented',
      'Dynamic Island headers for Search and Bags',
      'Native back-button and swipe-to-close support',
      'Edge-to-edge display mode for foldables'
    ]
  },
  {
    version: '1.1.0',
    date: 'April 2026',
    changes: [
      'Overlaid Bag Flight Charts (Gap Finder)',
      'Custom Disc Entry with manual flight numbers',
      'Material 3 design overhaul with Floating Island nav',
      'Physics-based flight path refinements'
    ]
  },
  {
    version: '1.0.0',
    date: 'March 2026',
    changes: [
      'Initial release',
      'Offline SQLite database support',
      'Disc catalog search',
      'Bag management and QR sharing'
    ]
  }
];

export default function About({ onDevUnlock }: { onDevUnlock?: () => void }) {
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState('');
  const tapCount = useRef(0);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleVersionTap = () => {
    tapCount.current += 1;
    if (tapTimer.current) clearTimeout(tapTimer.current);
    if (tapCount.current >= 5) {
      tapCount.current = 0;
      onDevUnlock?.();
      return;
    }
    // Reset if no new tap within 1.5s
    tapTimer.current = setTimeout(() => { tapCount.current = 0; }, 1500);
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncStatus('Connecting...');
    try {
      await seedCatalog((step) => setSyncStatus(step), true);
    } catch (e) {
      setSyncStatus('Sync failed. Check connection.');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 fade-up pb-32">
      <div className="flex flex-col mb-2">
        <h1 className="text-4xl font-black tracking-tighter text-[var(--text-primary)]">About</h1>
        <p className="text-[var(--text-muted)] text-sm font-medium">App info and version history</p>
      </div>

      <div className="card bg-[var(--surface-1)] !p-6 flex flex-col gap-4">
        <div className="flex flex-col">
          <span className="text-xl font-black text-[var(--text-primary)]">Bag<span style={{color:'var(--primary)'}}>Tracker</span></span>
          <button
            onClick={handleVersionTap}
            className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest text-left select-none"
            aria-label="App version"
          >
            v1.3.0 · Disc Golf
          </button>
        </div>
        <p className="text-sm text-[var(--text-muted)] leading-relaxed">
          Your offline disc golf companion. Track bags, visualize flight paths, keep score — no account needed.
        </p>
        
        <div className="mt-2 pt-4 border-t border-[var(--border)] flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest">Disc Catalog</span>
              <span className="text-xs font-bold">{syncStatus || 'Offline-ready database'}</span>
            </div>
            <button 
              onClick={handleSync} 
              disabled={syncing}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${syncing ? 'bg-[var(--surface-3)] text-[var(--text-muted)]' : 'bg-[var(--primary)] text-white shadow-lg active:scale-95'}`}
            >
              {syncing ? 'Syncing...' : 'Refresh Catalog'}
            </button>
          </div>
          <p className="text-[10px] text-[var(--text-muted)] opacity-60">
            Disc data sourced from the community-maintained disc database. Last synced: Once per launch or manual refresh.
          </p>
        </div>

        {/* Version History separator + version note */}
        <div className="mt-2 pt-4 border-t border-[var(--border)]/50">
          <p className="text-[10px] text-[var(--text-muted)] opacity-50">
            Offline-first · SQLite · No account required · Free forever
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <History size={16} className="text-[var(--text-muted)]" />
          <h2 className="text-[11px] font-black tracking-[0.15em] text-[var(--text-muted)] uppercase">Version History</h2>
          <div className="flex-1 h-px bg-[var(--border)]" />
        </div>

        <div className="flex flex-col gap-4">
          {VERSION_HISTORY.map((v, i) => (
            <div key={v.version} className="relative pl-6 pb-2">
              {/* Timeline Connector */}
              {i !== VERSION_HISTORY.length - 1 && (
                <div className="absolute left-[7px] top-4 bottom-0 w-0.5 bg-[var(--border)]" />
              )}
              <div className="absolute left-0 top-1.5 w-4 h-4 rounded-full border-2 border-[var(--primary)] bg-[var(--surface-0)]" />

              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="font-black text-sm text-[var(--text-primary)]">v{v.version}</span>
                  <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">{v.date}</span>
                </div>
                <ul className="flex flex-col gap-1.5 mt-1">
                  {v.changes.map((change, idx) => (
                    <li key={idx} className="text-xs text-[var(--text-muted)] flex gap-2">
                      <span className="text-[var(--primary)]">•</span>
                      {change}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
