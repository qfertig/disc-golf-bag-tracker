'use client';

import { useState, useEffect, useCallback } from 'react';
import { Camera, ImagePlus, Trash2, RotateCcw } from 'lucide-react';
import { captureOrPickPhoto, saveDiscPhoto, loadDiscPhoto, deleteDiscPhoto, type PhotoSource } from '@/lib/services/photos';

interface DiscPhotoButtonProps {
  bagDiscId: string;
  discName: string;
}

export default function DiscPhotoButton({ bagDiscId, discName }: DiscPhotoButtonProps) {
  const [photoSrc, setPhotoSrc] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const loadPhoto = useCallback(async () => {
    const src = await loadDiscPhoto(bagDiscId);
    setPhotoSrc(src);
  }, [bagDiscId]);

  useEffect(() => { loadPhoto(); }, [loadPhoto]);

  const handleCapture = async (source: PhotoSource) => {
    setMenuOpen(false);
    setLoading(true);
    try {
      const b64 = await captureOrPickPhoto(source);
      if (!b64) return;
      await saveDiscPhoto(bagDiscId, b64);
      await loadPhoto();
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    setMenuOpen(false);
    setLoading(true);
    try {
      await deleteDiscPhoto(bagDiscId);
      setPhotoSrc(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative">
      {/* Photo thumbnail or add button */}
      <button
        onClick={() => setMenuOpen(v => !v)}
        className={`relative overflow-hidden rounded-full transition-all active:scale-90 ${
          photoSrc
            ? 'w-12 h-12 border-2 border-[var(--primary)]/40 shadow-sm'
            : 'w-10 h-10 bg-[var(--surface-3)] border border-[var(--border)] flex items-center justify-center text-[var(--text-muted)] hover:border-[var(--primary)]/40 hover:text-[var(--primary)] shadow-sm'
        }`}
        aria-label={photoSrc ? `Photo for ${discName}` : `Add photo for ${discName}`}
        title={photoSrc ? 'Manage photo' : 'Add disc photo'}
      >
        {loading ? (
          <div className="w-4 h-4 rounded-full border-2 border-[var(--primary)] border-t-transparent animate-spin" />
        ) : photoSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoSrc} alt={discName} className="w-full h-full object-cover" />
        ) : (
          <ImagePlus size={16} />
        )}
      </button>

      {/* Action menu */}
      {menuOpen && (
        <>
          <div className="fixed inset-0 z-[90]" onClick={() => setMenuOpen(false)} />
          <div className="absolute left-0 top-full mt-2 z-[100] w-48 bg-[var(--surface-2)] border border-[var(--border)] rounded-2xl shadow-2xl overflow-hidden py-1">
            {!photoSrc && (
              <>
                <button
                  onClick={() => handleCapture('camera')}
                  className="w-full flex items-center gap-3 px-4 py-3 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--surface-3)] transition-colors"
                >
                  <Camera size={14} className="text-[var(--primary)]" />
                  Take Photo
                </button>
                <button
                  onClick={() => handleCapture('library')}
                  className="w-full flex items-center gap-3 px-4 py-3 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--surface-3)] transition-colors"
                >
                  <ImagePlus size={14} className="text-[var(--primary)]" />
                  Choose from Library
                </button>
              </>
            )}
            {photoSrc && (
              <>
                <button
                  onClick={() => handleCapture('camera')}
                  className="w-full flex items-center gap-3 px-4 py-3 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--surface-3)] transition-colors"
                >
                  <RotateCcw size={14} className="text-amber-400" />
                  Replace Photo
                </button>
                <button
                  onClick={() => handleCapture('library')}
                  className="w-full flex items-center gap-3 px-4 py-3 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--surface-3)] transition-colors"
                >
                  <ImagePlus size={14} className="text-amber-400" />
                  Replace from Library
                </button>
                <div className="mx-3 my-1 h-px bg-[var(--border)]" />
                <button
                  onClick={handleDelete}
                  className="w-full flex items-center gap-3 px-4 py-3 text-xs font-bold text-red-400 hover:bg-red-400/10 transition-colors"
                >
                  <Trash2 size={14} />
                  Remove Photo
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
