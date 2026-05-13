'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { Download, Upload, Package, RotateCcw, FileText, CheckCircle2, AlertTriangle, X, Clock, Shield, Send, Wifi, Smartphone, ArrowRight } from 'lucide-react';
import {
  downloadBackup, readBackupFile, readImportFile, validateBackupPayload, restoreFromBackup,
  ALL_CATEGORIES, type ExportCategory, type RestoreResult,
} from '@/lib/export/backupExporter';
import { parseCSV, validateImportBatch, autoDetectFieldMap, type ImportPreview, type FieldMap } from '@/lib/import/csvParser';
import { dbQuery, dbRun } from '@/lib/db';

type Section = 'overview' | 'backup' | 'restore' | 'import' | 'transfer';

// ─── Confirmation Dialog ───────────────────────────────────────────────────────
function ConfirmDialog({ message, onConfirm, onCancel }: { message: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-[var(--surface-2)] rounded-3xl border border-[var(--border)] p-6 flex flex-col gap-4 shadow-2xl">
        <div className="flex items-start gap-3">
          <AlertTriangle size={20} className="text-amber-400 shrink-0 mt-0.5" />
          <p className="text-sm text-[var(--text-primary)]">{message}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl bg-[var(--surface-3)] text-sm font-bold text-[var(--text-muted)] active:scale-95 transition-all">Cancel</button>
          <button onClick={onConfirm} className="flex-1 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-bold active:scale-95 transition-all">Confirm</button>
        </div>
      </div>
    </div>
  );
}

// ─── Backup section ───────────────────────────────────────────────────────────

const REMINDER_OPTIONS = [
  { value: 0,  label: 'Off' },
  { value: 7,  label: 'Weekly' },
  { value: 14, label: 'Biweekly' },
  { value: 30, label: 'Monthly' },
];

function formatBackupAge(ts: number): { text: string; color: string; stale: boolean } {
  const diff = Date.now() - ts;
  const days = Math.floor(diff / 86400000);
  const d = new Date(ts);
  const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const full = `${dateStr} at ${timeStr}`;
  if (days === 0) return { text: `Today — ${timeStr}`, color: '#22c55e', stale: false };
  if (days === 1) return { text: `Yesterday — ${timeStr}`, color: '#22c55e', stale: false };
  if (days < 7) return { text: `${days} days ago · ${dateStr}`, color: '#22c55e', stale: false };
  if (days < 30) return { text: `${days} days ago · ${dateStr}`, color: '#eab308', stale: true };
  return { text: `${days} days ago · ${full}`, color: '#ef4444', stale: true };
}

function BackupSection() {
  const [selected, setSelected] = useState<Set<ExportCategory>>(new Set(ALL_CATEGORIES));
  const [exporting, setExporting] = useState(false);
  const [done, setDone] = useState(false);
  const [lastBackupTs, setLastBackupTs] = useState<number | null>(null);
  const [reminderDays, setReminderDays] = useState(0);

  useEffect(() => {
    const load = async () => {
      try {
        const { Preferences } = await import('@capacitor/preferences');
        const { value: ts } = await Preferences.get({ key: 'lastBackupAt' });
        if (ts) setLastBackupTs(Number(ts));
        const { value: rd } = await Preferences.get({ key: 'backupReminderDays' });
        if (rd) setReminderDays(Number(rd));
      } catch { /* Preferences not available */ }
    };
    load();
  }, [done]); // re-load after export completes

  const toggle = (cat: ExportCategory) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  };

  const doExport = async () => {
    setExporting(true);
    setDone(false);
    const ok = await downloadBackup([...selected] as ExportCategory[]);
    setExporting(false);
    if (ok) { setDone(true); setTimeout(() => setDone(false), 3000); }
  };

  const updateReminder = async (days: number) => {
    setReminderDays(days);
    try {
      const { Preferences } = await import('@capacitor/preferences');
      await Preferences.set({ key: 'backupReminderDays', value: String(days) });
    } catch { /* ignore */ }
  };

  const backupAge = lastBackupTs ? formatBackupAge(lastBackupTs) : null;

  return (
    <div className="flex flex-col gap-4">
      {/* Last backup status */}
      <div className="rounded-2xl bg-[var(--surface-2)] p-4 border border-[var(--border)]">
        <div className="flex items-center gap-3 mb-1">
          <Shield size={16} style={{ color: backupAge?.color ?? 'var(--text-muted)' }} />
          <p className="text-xs font-black uppercase tracking-widest text-[var(--text-muted)]">Last Backup</p>
        </div>
        {backupAge ? (
          <p className="text-sm font-bold" style={{ color: backupAge.color }}>{backupAge.text}</p>
        ) : (
          <p className="text-sm font-bold text-[var(--text-muted)] opacity-50">Never backed up</p>
        )}
      </div>

      <div>
        <p className="text-xs font-black text-[var(--text-muted)] uppercase tracking-widest mb-2">Select Categories</p>
        <div className="flex flex-col gap-1.5">
          {ALL_CATEGORIES.map(cat => (
            <label key={cat} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-[var(--surface-2)] cursor-pointer">
              <input
                type="checkbox"
                checked={selected.has(cat)}
                onChange={() => toggle(cat)}
                className="w-4 h-4 accent-[var(--primary)]"
              />
              <span className="text-sm font-semibold capitalize text-[var(--text-primary)]">{cat.replace('_', ' ')}</span>
            </label>
          ))}
        </div>
      </div>
      <button
        onClick={doExport}
        disabled={exporting || selected.size === 0}
        className={`flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold transition-all active:scale-[0.98] ${done ? 'bg-green-500 text-white' : 'bg-[var(--primary)] text-white shadow-lg disabled:opacity-40'}`}
      >
        {done ? <><CheckCircle2 size={16} /> Backup Saved!</> : exporting ? 'Preparing...' : <><Download size={16} /> Export Backup</>}
      </button>

      {/* Reminder setting */}
      <div className="rounded-2xl bg-[var(--surface-2)] p-4 border border-[var(--border)]">
        <div className="flex items-center gap-3 mb-2">
          <Clock size={14} className="text-[var(--text-muted)]" />
          <p className="text-xs font-black uppercase tracking-widest text-[var(--text-muted)]">Backup Reminder</p>
        </div>
        <div className="flex gap-1.5">
          {REMINDER_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => updateReminder(opt.value)}
              className={`flex-1 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all ${
                reminderDays === opt.value
                  ? 'bg-[var(--primary)] text-white'
                  : 'bg-[var(--surface-3)] text-[var(--text-muted)]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-[var(--text-muted)] opacity-60 mt-2">
          {reminderDays > 0 ? `A subtle reminder will appear if no backup in ${reminderDays} days.` : 'Reminders are off.'}
        </p>
      </div>

      <p className="text-[10px] text-[var(--text-muted)] opacity-60 text-center">
        File-based backup — use this to migrate to a new device or restore after reinstall.
        <br/>This is different from QR bag sharing (which is lightweight &amp; social).
      </p>
    </div>
  );
}

// ─── Restore section ──────────────────────────────────────────────────────────
function RestoreSection() {
  const [mode, setMode] = useState<'merge' | 'restore'>('merge');
  const [confirm, setConfirm] = useState(false);
  const [result, setResult] = useState<RestoreResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [payload, setPayload] = useState<unknown>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const pickFile = async () => {
    const file = await readBackupFile();
    if (!file) return;
    try {
      const raw = JSON.parse(file.json);
      const validation = validateBackupPayload(raw);
      if (!validation.valid) {
        setValidationErrors(validation.errors);
        setPayload(null);
        setFileName(null);
      } else {
        setPayload(raw);
        setFileName(file.fileName);
        setValidationErrors([]);
      }
    } catch {
      setValidationErrors(['File could not be parsed as JSON']);
    }
  };

  const doRestore = async () => {
    if (!payload) return;
    setLoading(true);
    setConfirm(false);
    const res = await restoreFromBackup(payload as Parameters<typeof restoreFromBackup>[0], mode);
    setResult(res);
    setLoading(false);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        {(['merge', 'restore'] as const).map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex-1 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${mode === m ? 'bg-[var(--primary)] text-white' : 'bg-[var(--surface-2)] text-[var(--text-muted)]'}`}
          >
            {m === 'merge' ? '+ Merge' : '↩ Full Restore'}
          </button>
        ))}
      </div>
      <p className="text-[10px] text-[var(--text-muted)] opacity-70">
        {mode === 'merge' ? 'Adds backup data alongside your existing data. Existing records are kept.' : 'Replaces matching data with backup. Recommended after reinstall.'}
      </p>

      <button
        onClick={pickFile}
        className="flex items-center justify-center gap-2 py-3 rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] border-dashed text-sm font-bold text-[var(--text-muted)] active:scale-[0.98] transition-all"
      >
        <FileText size={16} />
        {fileName ?? 'Choose Backup File (.json)'}
      </button>

      {validationErrors.map((e, i) => (
        <p key={i} className="text-xs text-red-400 flex gap-1.5"><X size={12} />{e}</p>
      ))}

      {payload != null && (
        <button
          onClick={() => setConfirm(true)}
          className="flex items-center justify-center gap-2 py-3 rounded-2xl bg-amber-500 text-white text-sm font-bold shadow-lg active:scale-[0.98] transition-all"
        >
          <RotateCcw size={16} />
          Restore from {fileName}
        </button>
      )}

      {loading && <p className="text-xs text-[var(--text-muted)] text-center animate-pulse">Restoring data...</p>}

      {result && (
        <div className={`rounded-xl p-3 text-xs ${result.success ? 'bg-green-500/10 border border-green-500/20' : 'bg-red-500/10 border border-red-500/20'}`}>
          <p className={`font-bold mb-1 ${result.success ? 'text-green-400' : 'text-red-400'}`}>
            {result.success ? '✓ Restore complete' : '✗ Restore failed'}
          </p>
          {Object.entries(result.imported_counts).map(([k, v]) => (
            <p key={k} className="text-[var(--text-muted)]">{k}: {String(v)} imported</p>
          ))}
          {result.errors.map((e, i) => <p key={i} className="text-red-400">{String(e)}</p>)}
        </div>
      )}

      {confirm && (
        <ConfirmDialog
          message={`This will ${mode === 'restore' ? 'overwrite matching' : 'add'} data from the backup. Continue?`}
          onConfirm={doRestore}
          onCancel={() => setConfirm(false)}
        />
      )}
    </div>
  );
}

// ─── Import section ───────────────────────────────────────────────────────────
function ImportSection() {
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [fieldMap, setFieldMap] = useState<Partial<FieldMap>>({});
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);

  const pickFile = async () => {
    const file = await readImportFile();
    if (!file) return;
    setFileName(file.fileName);
    setDone(false);

    let rows: Record<string, string>[] = [];
    if (file.format === 'csv') {
      rows = parseCSV(file.content);
    } else {
      try {
        const parsed = JSON.parse(file.content);
        rows = Array.isArray(parsed) ? parsed : (parsed.discs ?? parsed.bag_discs ?? []);
      } catch {
        rows = [];
      }
    }
    setRawRows(rows);

    const existingDiscs = await dbQuery<{ name: string; brand: string | null }>(
      'SELECT name, brand FROM DiscCatalog LIMIT 2000'
    );

    if (rows.length > 0) {
      const detected = autoDetectFieldMap(Object.keys(rows[0]));
      setFieldMap(detected);
      const p = validateImportBatch(rows, detected as FieldMap, existingDiscs);
      setPreview(p);
    }
  };

  const updateFieldMap = (field: keyof FieldMap, value: string) => {
    const next = { ...fieldMap, [field]: value || undefined };
    setFieldMap(next);
    if (rawRows.length > 0 && next.name) {
      dbQuery<{ name: string; brand: string | null }>('SELECT name, brand FROM DiscCatalog LIMIT 2000').then(existing => {
        setPreview(validateImportBatch(rawRows, next as FieldMap, existing));
      });
    }
  };

  const doImport = async () => {
    if (!preview) return;
    setImporting(true);

    let count = 0;
    for (const row of preview.rows) {
      if (!row.mapped || row.duplicate === 'exact') continue;
      // Create a catalog entry for custom/imported discs
      const id = crypto.randomUUID();
      try {
        await dbRun(
          `INSERT OR IGNORE INTO DiscCatalog (id, name, brand, category, speed, glide, turn, fade, source_provenance)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, row.mapped.name, row.mapped.brand, null, row.mapped.speed, row.mapped.glide, row.mapped.turn, row.mapped.fade, 'import']
        );
        count++;
      } catch { /* skip */ }
    }

    await dbRun(
      `INSERT INTO Imports (id, import_type, source_format, total_records, imported_records, skipped_records, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [crypto.randomUUID(), 'disc_import', fileName?.endsWith('.csv') ? 'csv' : 'json',
       preview.total, count, preview.total - count, 'success', Date.now()]
    );

    setImporting(false);
    setDone(true);
    setPreview(null);
    setRawRows([]);
    setFileName(null);
  };

  const headers = rawRows.length > 0 ? Object.keys(rawRows[0]) : [];
  const MAPPABLE_FIELDS: (keyof FieldMap)[] = ['name', 'brand', 'plastic', 'weight', 'speed', 'glide', 'turn', 'fade', 'notes', 'status'];

  return (
    <div className="flex flex-col gap-4">
      <button
        onClick={pickFile}
        className="flex items-center justify-center gap-2 py-3 rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] border-dashed text-sm font-bold text-[var(--text-muted)] active:scale-[0.98] transition-all"
      >
        <FileText size={16} />
        {fileName ?? 'Choose CSV or JSON File'}
      </button>

      {done && (
        <div className="flex items-center gap-2 text-green-400 text-sm font-bold p-3 rounded-xl bg-green-400/10">
          <CheckCircle2 size={16} /> Import complete!
        </div>
      )}

      {preview && (
        <>
          <div className="rounded-xl bg-[var(--surface-2)] p-3 flex flex-col gap-1 text-xs">
            <p className="font-bold text-[var(--text-primary)] mb-1">Preview: {preview.total} rows detected</p>
            <p className="text-green-400">✓ {preview.new_count} new discs to import</p>
            {preview.probable_duplicate_count > 0 && <p className="text-amber-400">⚠ {preview.probable_duplicate_count} probable duplicates (will import)</p>}
            {preview.exact_duplicate_count > 0 && <p className="text-[var(--text-muted)]">⊘ {preview.exact_duplicate_count} exact duplicates (will skip)</p>}
            {preview.parse_errors > 0 && <p className="text-red-400">✗ {preview.parse_errors} rows with errors</p>}
          </div>

          <div>
            <p className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-2">Field Mapping</p>
            <div className="flex flex-col gap-1.5">
              {MAPPABLE_FIELDS.map(field => (
                <div key={field} className="flex items-center gap-2">
                  <span className="text-xs text-[var(--text-muted)] w-14 capitalize shrink-0">{field}</span>
                  <select
                    value={fieldMap[field] ?? ''}
                    onChange={e => updateFieldMap(field, e.target.value)}
                    className="flex-1 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none"
                  >
                    <option value="">(not mapped)</option>
                    {headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={doImport}
            disabled={importing || !fieldMap.name}
            className="flex items-center justify-center gap-2 py-3 rounded-2xl bg-[var(--primary)] text-white text-sm font-bold shadow-lg active:scale-[0.98] transition-all disabled:opacity-40"
          >
            <Upload size={16} />
            {importing ? 'Importing...' : `Import ${preview.new_count + preview.probable_duplicate_count} Discs`}
          </button>
        </>
      )}
    </div>
  );
}

// ─── Nearby Transfer section ──────────────────────────────────────────────────
function NearbyTransferSection() {
  const [step, setStep] = useState<'preflight' | 'preparing' | 'sharing' | 'done' | 'error'>('preflight');
  const [errorMsg, setErrorMsg] = useState('');

  const startTransfer = async () => {
    setStep('preparing');
    try {
      const { buildBackupPayload, ALL_CATEGORIES: cats } = await import('@/lib/export/backupExporter');
      const { Capacitor } = await import('@capacitor/core');

      const payload = await buildBackupPayload(cats);
      const json = JSON.stringify(payload);
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const fileName = `bagtracker-transfer-${ts}.json`;

      if (Capacitor.getPlatform() === 'web') {
        // Web fallback: just download
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = fileName;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a); URL.revokeObjectURL(url);
        setStep('done');
        return;
      }

      const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
      const { Share } = await import('@capacitor/share');

      const result = await Filesystem.writeFile({
        path: fileName, data: json, directory: Directory.Cache, encoding: Encoding.UTF8,
      });

      setStep('sharing');
      await Share.share({
        title: 'BagTracker Data Transfer',
        text: 'Tap to receive this bag data on your other device',
        url: result.uri,
        dialogTitle: 'Send to Nearby Device',
      });

      // Also update lastBackupAt since we generated a full backup
      try {
        const { Preferences } = await import('@capacitor/preferences');
        await Preferences.set({ key: 'lastBackupAt', value: String(Date.now()) });
      } catch { /* ignore */ }

      setStep('done');
    } catch (err) {
      console.error('[transfer] error', err);
      setErrorMsg(err instanceof Error ? err.message : 'Transfer failed');
      setStep('error');
    }
  };

  if (step === 'done') {
    return (
      <div className="flex flex-col items-center gap-4 py-8">
        <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
          <CheckCircle2 size={32} className="text-green-400" />
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-[var(--text-primary)]">Transfer Ready</p>
          <p className="text-xs text-[var(--text-muted)] mt-1 leading-relaxed max-w-[280px]">
            Your data has been shared. On the receiving device, open BagTracker → Data → Restore and select the received file.
          </p>
        </div>
      </div>
    );
  }

  if (step === 'error') {
    return (
      <div className="flex flex-col items-center gap-4 py-8">
        <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
          <AlertTriangle size={32} className="text-red-400" />
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-red-400">Transfer Failed</p>
          <p className="text-xs text-[var(--text-muted)] mt-1">{errorMsg}</p>
          <p className="text-xs text-[var(--text-muted)] mt-2">Use Data → Backup Data → Export as a fallback.</p>
        </div>
        <button onClick={() => setStep('preflight')} className="px-6 py-2 rounded-xl bg-[var(--surface-3)] text-sm font-bold text-[var(--text-muted)] active:scale-95 transition-all">
          Try Again
        </button>
      </div>
    );
  }

  if (step === 'preparing' || step === 'sharing') {
    return (
      <div className="flex flex-col items-center gap-4 py-12">
        <div className="w-8 h-8 rounded-full border-2 border-[var(--primary)] border-t-transparent animate-spin" />
        <p className="text-sm font-bold text-[var(--text-muted)]">
          {step === 'preparing' ? 'Preparing your data...' : 'Opening share sheet...'}
        </p>
      </div>
    );
  }

  // Preflight screen
  return (
    <div className="flex flex-col gap-4">
      {/* How it works */}
      <div className="rounded-2xl bg-[var(--surface-2)] p-4 border border-[var(--border)]">
        <p className="text-xs font-black uppercase tracking-widest text-[var(--text-muted)] mb-3">How It Works</p>
        <div className="flex flex-col gap-3">
          {[
            { icon: Smartphone, text: 'Your data is bundled into a transfer file' },
            { icon: Send, text: 'Your device\'s share sheet opens (AirDrop, Nearby Share, etc.)' },
            { icon: ArrowRight, text: 'The other device receives the file and restores it' },
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[var(--primary-tonal)] flex items-center justify-center shrink-0">
                <item.icon size={14} className="text-[var(--primary)]" />
              </div>
              <p className="text-xs font-medium text-[var(--text-primary)] leading-snug">{item.text}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Network warning */}
      <div className="rounded-2xl bg-amber-500/5 border border-amber-500/15 p-4">
        <div className="flex items-start gap-3">
          <Wifi size={16} className="text-amber-400 shrink-0 mt-0.5" />
          <div className="flex flex-col gap-1">
            <p className="text-xs font-bold text-amber-400">Same Network Recommended</p>
            <p className="text-[10px] text-[var(--text-muted)] leading-relaxed">
              For best results, both devices should be on the same Wi‑Fi or local network.
              Nearby transfer may not work on public, guest, or isolated networks.
            </p>
          </div>
        </div>
      </div>

      {/* Fallback note */}
      <div className="rounded-2xl bg-[var(--surface-2)] p-3 border border-[var(--border)]">
        <p className="text-[10px] text-[var(--text-muted)] leading-relaxed">
          <strong className="text-[var(--text-primary)]">Not working?</strong> You can always use Backup Data → Export to save a file, then Restore on the other device. That method works without any network.
        </p>
      </div>

      {/* Start button */}
      <button
        onClick={startTransfer}
        className="flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-[var(--primary)] text-white text-sm font-bold shadow-lg active:scale-[0.98] transition-all"
      >
        <Send size={16} />
        Send My Data
      </button>
    </div>
  );
}

// ─── Main DataManager ─────────────────────────────────────────────────────────
export default function DataManager() {
  const [section, setSection] = useState<Section>('overview');
  const [lastBackupTs, setLastBackupTs] = useState<number | null>(null);

  // Swipe-right gesture to go back to overview
  const touchStartX = useRef(0);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    setIsSwiping(true);
    setSwipeOffset(0);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isSwiping) return;
    const delta = e.touches[0].clientX - touchStartX.current;
    if (delta > 0) setSwipeOffset(Math.min(delta, 120));
  };

  const handleTouchEnd = () => {
    if (swipeOffset > 60) setSection('overview');
    setSwipeOffset(0);
    setIsSwiping(false);
  };

  useEffect(() => {
    const load = async () => {
      try {
        const { Preferences } = await import('@capacitor/preferences');
        const { value: ts } = await Preferences.get({ key: 'lastBackupAt' });
        if (ts) setLastBackupTs(Number(ts));
      } catch { /* ignore */ }
    };
    load();
  }, [section]); // refresh when returning to overview

  const SECTIONS = [
    { id: 'backup' as Section, label: 'Backup Data', icon: Download, desc: 'Export your data to a file' },
    { id: 'transfer' as Section, label: 'Send to Nearby Device', icon: Send, desc: 'Transfer data to another device' },
    { id: 'restore' as Section, label: 'Restore', icon: RotateCcw, desc: 'Restore from a backup file' },
    { id: 'import' as Section, label: 'Import Discs', icon: Upload, desc: 'Import from CSV or JSON' },
  ];

  if (section !== 'overview') {
    const found = SECTIONS.find(s => s.id === section)!;
    return (
      <div
        className="flex flex-col gap-4 fade-up pb-4"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          transform: swipeOffset > 0 ? `translateX(${swipeOffset * 0.3}px)` : undefined,
          transition: isSwiping ? 'none' : 'transform 0.2s ease',
          opacity: swipeOffset > 0 ? 1 - (swipeOffset * 0.003) : 1,
        }}
      >
        <div className="flex items-center gap-3 mb-2">
          <button
            onClick={() => setSection('overview')}
            className="w-8 h-8 rounded-xl bg-[var(--surface-2)] flex items-center justify-center active:scale-90 transition-all text-[var(--text-muted)]"
          >
            ←
          </button>
          <div>
            <h2 className="text-xl font-black tracking-tighter text-[var(--text-primary)]">{found.label}</h2>
            <p className="text-xs text-[var(--text-muted)]">{found.desc}</p>
          </div>
        </div>
        {section === 'backup' && <BackupSection />}
        {section === 'transfer' && <NearbyTransferSection />}
        {section === 'restore' && <RestoreSection />}
        {section === 'import' && <ImportSection />}
      </div>
    );
  }

  const backupAge = lastBackupTs ? formatBackupAge(lastBackupTs) : null;

  return (
    <div className="flex flex-col gap-4 fade-up pb-4">
      <div className="flex flex-col mb-2">
        <h1 className="text-4xl font-black tracking-tighter text-[var(--text-primary)]">Data</h1>
        <p className="text-[var(--text-muted)] text-sm font-medium">Import, export &amp; backup</p>
      </div>

      {/* Last backup card */}
      <div className="card !p-4 bg-[var(--surface-1)] flex items-center gap-4">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${backupAge?.color ?? 'var(--text-muted)'}20` }}>
          <Shield size={18} style={{ color: backupAge?.color ?? 'var(--text-muted)' }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-0.5">Last Backup</p>
          {backupAge ? (
            <p className="text-sm font-bold" style={{ color: backupAge.color }}>{backupAge.text}</p>
          ) : (
            <p className="text-sm font-bold text-amber-400">Never — tap Backup Data to start</p>
          )}
        </div>
      </div>

      <div className="card !p-4 bg-[var(--surface-1)] flex flex-col gap-1.5">
        <p className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-1">Bag Share vs Backup</p>
        <p className="text-xs text-[var(--text-muted)] leading-relaxed">
          <strong className="text-[var(--primary)]">Bag Share</strong> — QR code for sharing one bag with another player. Lightweight &amp; social.
        </p>
        <p className="text-xs text-[var(--text-muted)] leading-relaxed">
          <strong className="text-[var(--primary)]">Backup</strong> — Full file export of your history. For migration, disaster recovery &amp; reinstall.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {SECTIONS.map(({ id, label, icon: Icon, desc }) => (
          <button
            key={id}
            onClick={() => setSection(id)}
            className="card !p-4 flex items-center gap-3 text-left bg-[var(--surface-1)] active:scale-[0.98] hover:bg-[var(--surface-2)] transition-all"
          >
            <div className="w-10 h-10 rounded-xl bg-[var(--primary-tonal)] flex items-center justify-center shrink-0">
              <Icon size={18} className="text-[var(--primary)]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-[var(--text-primary)]">{label}</p>
              <p className="text-xs text-[var(--text-muted)]">{desc}</p>
            </div>
            <Package size={14} className="text-[var(--text-muted)] shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
}
