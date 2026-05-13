'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, Info, X } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'info';
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Native-feeling inline confirmation dialog.
 * Replaces window.confirm() which is blocked in Capacitor WebViews.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Auto-focus cancel on open (safer default)
  useEffect(() => {
    if (open) cancelRef.current?.focus();
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      aria-describedby="confirm-msg"
      className="fixed inset-0 z-[200] flex items-center justify-center p-6"
    >
      {/* Scrim */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="relative w-full max-w-sm bg-[var(--surface-2)] rounded-3xl border border-[var(--border)] shadow-2xl p-6 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex flex-col items-center text-center gap-4">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
            variant === 'danger'
              ? 'bg-red-500/15 text-red-400'
              : 'bg-[var(--primary-tonal)] text-[var(--primary)]'
          }`}>
            {variant === 'danger' ? <AlertTriangle size={24} /> : <Info size={24} />}
          </div>

          <div>
            <h2 id="confirm-title" className="text-base font-black text-[var(--text-primary)] mb-1">
              {title}
            </h2>
            <p id="confirm-msg" className="text-sm text-[var(--text-muted)] leading-relaxed">
              {message}
            </p>
          </div>

          <div className="flex gap-3 w-full pt-1">
            <button
              ref={cancelRef}
              onClick={onCancel}
              className="flex-1 py-3 rounded-2xl text-sm font-bold text-[var(--text-muted)] bg-[var(--surface-3)] hover:bg-[var(--surface-1)] transition-colors"
            >
              {cancelLabel}
            </button>
            <button
              onClick={onConfirm}
              className={`flex-1 py-3 rounded-2xl text-sm font-bold transition-colors ${
                variant === 'danger'
                  ? 'bg-red-500 hover:bg-red-600 text-white'
                  : 'bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[var(--on-primary)]'
              }`}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ToastProps {
  message: string;
  open: boolean;
  icon?: ReactNode;
}

/**
 * Non-blocking transient toast notification.
 * Replaces window.alert() for success/info messages.
 */
export function Toast({ message, open, icon }: ToastProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`
        fixed inset-x-4 z-[200] flex justify-center pointer-events-none
        transition-all duration-300
        ${open ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}
      `}
      style={{ bottom: 'var(--bottom-safe-padding)' }}
    >
      <div className="flex items-center gap-2.5 px-5 py-3 bg-[var(--surface-3)] border border-[var(--border)] rounded-2xl shadow-2xl text-sm font-semibold text-[var(--text-primary)]">
        {icon}
        {message}
      </div>
    </div>
  );
}

// ─── BottomSheet ────────────────────────────────────────────────────────────────

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  maxHeight?: string;
}

export function BottomSheet({ open, onClose, title, children, maxHeight = '94vh' }: BottomSheetProps) {
  const [visible, setVisible] = useState(false);
  const [animateIn, setAnimateIn] = useState(false);
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const touchStartY = useRef(0);

  useEffect(() => {
    if (open) {
      setVisible(true);
      const raf = requestAnimationFrame(() => requestAnimationFrame(() => setAnimateIn(true)));
      return () => cancelAnimationFrame(raf);
    } else {
      setAnimateIn(false);
      setDragY(0);
      const timer = setTimeout(() => setVisible(false), 320);
      return () => clearTimeout(timer);
    }
  }, [open]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    setIsDragging(true);
    setDragY(0);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    const delta = e.touches[0].clientY - touchStartY.current;
    if (delta > 0) setDragY(delta);
  };

  const handleTouchEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);
    if (dragY > 120) onClose();
    setDragY(0);
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center" style={{ pointerEvents: animateIn ? 'auto' : 'none' }}>
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        style={{ opacity: animateIn ? 1 : 0, transition: 'opacity 0.25s ease' }}
      />
      <div
        className="relative w-full max-w-lg bg-[var(--surface-2)] rounded-t-[28px] shadow-2xl flex flex-col overflow-hidden"
        style={{
          maxHeight,
          transform: animateIn ? `translateY(${dragY}px)` : 'translateY(100%)',
          transition: isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
        }}
      >
        {/* Drag handle + header */}
        <div
          className="flex flex-col items-center pt-2.5 pb-1 shrink-0 cursor-grab active:cursor-grabbing"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className="w-10 h-1 bg-[var(--border)] rounded-full mb-2 shrink-0" />
          {title && (
            <div className="w-full flex items-center justify-between px-5 pb-1 border-b border-[var(--border)]">
              <h2 className="text-base font-black tracking-tight text-[var(--text-primary)]">{title}</h2>
              <button onClick={onClose} className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center bg-[var(--surface-3)] text-[var(--text-muted)] active:scale-90 transition-transform">
                <X size={18} />
              </button>
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-6">
          {children}
        </div>
      </div>
    </div>
  );
}
