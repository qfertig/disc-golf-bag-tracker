'use client';

import { useState, useCallback } from 'react';
import { Globe, Layers, Flag, Map, ChevronRight, CheckCircle2, AlertTriangle, Clock, RefreshCw } from 'lucide-react';
import {
  evalFetchCountries, evalFetchRegions, evalFetchCourses, evalFetchCourse,
  type EvalResult, type FieldUsability,
} from '@/lib/services/discgolfapi';

const usabilityConfig: Record<FieldUsability, { icon: string; color: string }> = {
  usable: { icon: '✅', color: 'text-green-400' },
  partial: { icon: '⚠️', color: 'text-amber-400' },
  insufficient: { icon: '❌', color: 'text-red-400' },
  missing: { icon: '⊘', color: 'text-[var(--text-muted)]' },
};

function StatusBadge({ status }: { status: EvalResult['status'] }) {
  const map = {
    success: { label: 'Success', color: 'bg-green-500/20 text-green-400' },
    error: { label: 'Error', color: 'bg-red-500/20 text-red-400' },
    timeout: { label: 'Timeout', color: 'bg-amber-500/20 text-amber-400' },
  };
  const c = map[status];
  return <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest ${c.color}`}>{c.label}</span>;
}

function ResultCard({ result }: { result: EvalResult }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] overflow-hidden">
      <div
        className="flex items-center gap-3 p-3 cursor-pointer"
        onClick={() => setExpanded(v => !v)}
      >
        <StatusBadge status={result.status} />
        <p className="flex-1 text-xs font-bold text-[var(--text-primary)] font-mono">{result.endpoint}</p>
        <span className="text-[10px] text-[var(--text-muted)]">
          {new Date(result.fetched_at).toLocaleTimeString()}
        </span>
        {expanded ? <ChevronRight size={14} className="text-[var(--text-muted)] rotate-90 transition-transform" />
                  : <ChevronRight size={14} className="text-[var(--text-muted)] transition-transform" />}
      </div>

      {expanded && (
        <div className="border-t border-[var(--border)] p-3 flex flex-col gap-3">
          {result.error && (
            <div className="flex items-center gap-2 text-red-400 text-xs">
              <AlertTriangle size={12} />
              {result.error}
            </div>
          )}

          {result.fields.length > 0 && (
            <div>
              <p className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-2">Field Usability</p>
              <div className="flex flex-col gap-1">
                {result.fields.map(field => {
                  const cfg = usabilityConfig[field.usability];
                  return (
                    <div key={field.field} className="flex items-center gap-2">
                      <span className="w-4">{cfg.icon}</span>
                      <span className={`text-xs font-mono font-bold w-24 ${cfg.color}`}>{field.field}</span>
                      <span className="text-[11px] text-[var(--text-muted)] flex-1 truncate font-mono">
                        {field.value == null ? 'null' : String(field.value)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {result.saved_to_db && (
            <div className="flex items-center gap-1.5 text-[10px] text-green-400">
              <CheckCircle2 size={11} />
              Sample saved to local SQLite
            </div>
          )}

          {result.raw != null && (
            <details className="text-[10px]">
              <summary className="text-[var(--text-muted)] cursor-pointer font-bold uppercase tracking-wider">Raw JSON</summary>
              <pre className="mt-2 p-2 rounded-xl bg-[var(--surface-0)] text-[var(--text-muted)] overflow-x-auto text-[9px] leading-relaxed whitespace-pre-wrap break-all">
                {JSON.stringify(result.raw as object, null, 2).slice(0, 2000)}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

interface EvalButtonProps {
  label: string;
  icon: typeof Globe;
  onRun: () => Promise<void>;
  loading: boolean;
}

function EvalButton({ label, icon: Icon, onRun, loading }: EvalButtonProps) {
  return (
    <button
      onClick={onRun}
      disabled={loading}
      className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-xs font-bold text-[var(--text-muted)] active:scale-95 transition-all disabled:opacity-50"
    >
      {loading ? <RefreshCw size={13} className="animate-spin" /> : <Icon size={13} />}
      {label}
    </button>
  );
}

export default function DevEvalScreen() {
  const [results, setResults] = useState<EvalResult[]>([]);
  const [loading, setLoading] = useState<string | null>(null);
  const [countryId, setCountryId] = useState('1');
  const [regionId, setRegionId] = useState('1');
  const [courseId, setCourseId] = useState('1');

  const run = useCallback(async (key: string, fn: () => Promise<EvalResult>) => {
    setLoading(key);
    try {
      const result = await fn();
      setResults(prev => [result, ...prev]);
    } catch (e) {
      console.error('[DevEval]', e);
    } finally {
      setLoading(null);
    }
  }, []);

  return (
    <div className="flex flex-col gap-4 fade-up pb-4">
      <div className="flex flex-col mb-1">
        <div className="flex items-center gap-2">
          <div className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-400 text-[10px] font-black uppercase tracking-widest">Dev Only</div>
          <h2 className="text-xl font-black tracking-tighter text-[var(--text-primary)]">API Evaluation</h2>
        </div>
        <p className="text-xs text-[var(--text-muted)] mt-0.5">DiscGolfAPI — field usability evaluation. Not wired into production.</p>
      </div>

      {/* Parameter inputs */}
      <div className="card !p-3 bg-[var(--surface-1)] flex flex-col gap-2">
        <p className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest">Test Parameters</p>
        <div className="flex gap-2">
          {[
            { label: 'Country ID', value: countryId, set: setCountryId },
            { label: 'Region ID', value: regionId, set: setRegionId },
            { label: 'Course ID', value: courseId, set: setCourseId },
          ].map(({ label, value, set }) => (
            <div key={label} className="flex flex-col gap-0.5 flex-1">
              <span className="text-[10px] text-[var(--text-muted)]">{label}</span>
              <input
                value={value}
                onChange={e => set(e.target.value)}
                className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none w-full"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Eval buttons */}
      <div className="flex flex-wrap gap-2">
        <EvalButton
          label="Fetch Countries"
          icon={Globe}
          loading={loading === 'countries'}
          onRun={() => run('countries', () => evalFetchCountries())}
        />
        <EvalButton
          label={`Regions (${countryId})`}
          icon={Map}
          loading={loading === 'regions'}
          onRun={() => run('regions', () => evalFetchRegions(Number(countryId)))}
        />
        <EvalButton
          label={`Courses (${regionId})`}
          icon={Layers}
          loading={loading === 'courses'}
          onRun={() => run('courses', () => evalFetchCourses(Number(regionId)))}
        />
        <EvalButton
          label={`Course #${courseId}`}
          icon={Flag}
          loading={loading === 'course'}
          onRun={() => run('course', () => evalFetchCourse(Number(courseId)))}
        />
      </div>

      {/* Results */}
      {results.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-[var(--text-muted)]">
          <Clock size={32} className="opacity-20" />
          <p className="text-xs">Run an evaluation above to see results</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest">{results.length} result{results.length > 1 ? 's' : ''}</p>
            <button onClick={() => setResults([])} className="text-[10px] text-red-400 font-bold">Clear</button>
          </div>
          {results.map((r, i) => <ResultCard key={i} result={r} />)}
        </div>
      )}

      <div className="card !p-3 bg-amber-500/5 border-amber-500/20">
        <p className="text-[10px] text-amber-400 font-black uppercase tracking-widest mb-1">Evaluation Notes</p>
        <ul className="text-[10px] text-[var(--text-muted)] space-y-0.5 list-disc list-inside">
          <li>✅ Usable — field has consistent data, ready for production</li>
          <li>⚠️ Partial — sometimes present, needs fallback handling</li>
          <li>❌ Insufficient — data quality too low for the feature</li>
          <li>⊘ Missing — field not returned by this API</li>
        </ul>
        <p className="text-[10px] text-[var(--text-muted)] mt-2 opacity-70">
          All evaluation results that pass ✅ should be reviewed before wiring into any production flow.
        </p>
      </div>
    </div>
  );
}
