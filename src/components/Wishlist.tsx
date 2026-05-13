'use client';

import { useState, useEffect, useCallback } from 'react';
import { dbQuery, dbRun } from '@/lib/db';
import { TDisc } from 'discit-types';
import { Heart, Trash2, ShoppingCart, Disc3 } from 'lucide-react';
import DiscDetail from './DiscDetail';

export default function Wishlist({ onModalStateChange }: { onModalStateChange?: (open: boolean) => void }) {
  const [discs, setDiscs] = useState<TDisc[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDisc, setSelectedDisc] = useState<TDisc | null>(null);

  const loadWishlist = useCallback(async () => {
    try {
      const rows = await dbQuery<TDisc>(`
        SELECT d.* FROM DiscCatalog d
        JOIN Wishlist w ON d.id = w.disc_id
        ORDER BY w.created_at DESC
      `);
      setDiscs(rows);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadWishlist(); }, [loadWishlist]);

  useEffect(() => {
    onModalStateChange?.(!!selectedDisc);
  }, [selectedDisc, onModalStateChange]);

  const removeFromWishlist = async (id: string) => {
    await dbRun('DELETE FROM Wishlist WHERE disc_id = ?', [id]);
    loadWishlist();
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col mb-2">
        <h1 className="text-4xl font-black tracking-tighter text-[var(--text-primary)]">Wishlist</h1>
        <p className="text-[var(--text-muted)] text-sm font-medium">Discs you've got your eye on</p>
      </div>

      {loading ? (
        <div className="text-center py-20 animate-pulse text-[var(--text-muted)] font-bold">Loading...</div>
      ) : discs.length === 0 ? (
        <div className="text-center py-20 opacity-50 flex flex-col items-center gap-4">
          <Heart size={48} className="text-[var(--text-muted)]" />
          <p className="text-sm font-bold">Your wishlist is empty.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3 pb-32">
          {discs.map(disc => (
            <div key={disc.id} className="card !p-4 flex items-center justify-between hover:bg-[var(--surface-2)] transition-all group" onClick={() => setSelectedDisc(disc)}>
              <div className="flex flex-col">
                <span className="font-bold text-base">{disc.name}</span>
                <span className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest">{disc.brand} • {disc.category}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    const url = `https://infinitediscs.com/search-results?search_text=${encodeURIComponent(disc.name)}`;
                    window.open(url, '_blank');
                  }}
                  className="w-10 h-10 rounded-full bg-[var(--surface-3)] flex items-center justify-center text-[var(--primary)] hover:bg-[var(--primary-tonal)] transition-colors"
                >
                  <ShoppingCart size={18} />
                </button>
                <button
                  onClick={e => { e.stopPropagation(); removeFromWishlist(disc.id); }}
                  className="w-10 h-10 rounded-full bg-[var(--surface-3)] flex items-center justify-center text-[var(--text-muted)] hover:bg-red-500/10 hover:text-red-400 transition-colors"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedDisc && <DiscDetail disc={selectedDisc} onClose={() => { setSelectedDisc(null); loadWishlist(); }} onViewSimilar={(s) => setSelectedDisc(s)} />}
    </div>
  );
}
