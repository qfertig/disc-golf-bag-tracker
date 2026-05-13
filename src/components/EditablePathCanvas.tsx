'use client';

/**
 * EditablePathCanvas
 *
 * An interactive SVG where:
 *  - Preset control points are shown as draggable anchor dots
 *  - Dragging a dot reshapes the Catmull-Rom curve live
 *  - A "Draw" toggle lets users sketch freehand instead
 *  - Reset restores the current preset's original points
 *
 * Coordinate space (flight coords):
 *   x = lateral feet  (left = negative, right = positive)
 *   y = forward feet  (0 = tee pad, distance = landing zone)
 *
 * SVG space:
 *   origin = bottom-center (tee pad)
 *   up = increasing distance
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { RotateCcw, PenLine, Move } from 'lucide-react';
import type { ThrowPathData, ThrowPreset } from '@/lib/engines/throwpath';

// ─── Catmull-Rom SVG path ─────────────────────────────────────────────────────

function catmullRom(pts: [number, number][]): string {
  if (pts.length < 2) return '';
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2[0]} ${p2[1]}`;
  }
  return d;
}

// ─── Coordinate transforms ────────────────────────────────────────────────────

const W = 240, H = 200;
const PAD = { l: 32, r: 12, t: 10, b: 24 };
const GW = W - PAD.l - PAD.r;
const GH = H - PAD.t - PAD.b;
const X_RANGE = 35; // ±35 ft lateral shown

function toSvg(fx: number, fy: number, dist: number): [number, number] {
  const chartDist = Math.max(dist, 600);
  const sx = PAD.l + GW / 2 + (fx / X_RANGE) * (GW / 2);
  const sy = H - PAD.b - (fy / chartDist) * GH;
  return [sx, sy];
}

function toFlight(sx: number, sy: number, dist: number): [number, number] {
  const chartDist = Math.max(dist, 600);
  const fx = ((sx - PAD.l - GW / 2) / (GW / 2)) * X_RANGE;
  const fy = ((H - PAD.b - sy) / GH) * chartDist;
  return [
    Math.max(-X_RANGE, Math.min(X_RANGE, fx)),
    Math.max(0, Math.min(chartDist, fy)),
  ];
}

// ─── Thin freehand points ─────────────────────────────────────────────────────

function thin(pts: [number, number][], max = 10): [number, number][] {
  if (pts.length <= max) return pts;
  const out: [number, number][] = [pts[0]];
  const step = (pts.length - 1) / (max - 1);
  for (let i = 1; i < max - 1; i++) out.push(pts[Math.round(i * step)]);
  out.push(pts[pts.length - 1]);
  return out;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface EditablePathCanvasProps {
  /** Initial control points in flight coords — updated externally when preset changes */
  initialPoints: [number, number][];
  distance: number;
  preset: ThrowPreset;
  /** Increment to force-reset the canvas (e.g. when preset/slider changes externally) */
  resetVersion?: number;
  onChange: (data: ThrowPathData) => void;
  onDistanceChange?: (distance: number) => void;
  onReset: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function EditablePathCanvas({
  initialPoints,
  distance,
  preset,
  resetVersion,
  onChange,
  onDistanceChange,
  onReset,
}: EditablePathCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  // Control points in SVG pixel coords
  const [pts, setPts] = useState<[number, number][]>(() =>
    initialPoints.map(([fx, fy]) => toSvg(fx, fy, distance))
  );
  // Mirror pts in a ref so event handlers always read the latest value
  // without needing to be re-created on every pts change
  const ptsRef = useRef(pts);
  const updatePts = useCallback((next: [number, number][]) => {
    ptsRef.current = next;
    setPts(next);
  }, []);

  // Track whether user has manually edited — prevent useEffect from overwriting
  const isEditedRef = useRef(false);
  const prevVersionRef = useRef(resetVersion);

  // Sync when external reset is requested (version changes) or initial data changes
  useEffect(() => {
    if (prevVersionRef.current !== resetVersion) {
      prevVersionRef.current = resetVersion;
      isEditedRef.current = false;
    }
    if (isEditedRef.current) return;
    const next = initialPoints.map(([fx, fy]) => toSvg(fx, fy, distance));
    ptsRef.current = next;
    setPts(next);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPoints, distance, resetVersion]);

  // Which point is being dragged (-1 = none)
  const dragging = useRef(-1);

  // Freehand mode
  const [freehand, setFreehand] = useState(false);
  const [rawPts, setRawPts] = useState<[number, number][]>([]);
  const drawingFree = useRef(false);

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const getSvgXY = useCallback((e: React.PointerEvent): [number, number] => {
    const rect = svgRef.current!.getBoundingClientRect();
    const scaleX = W / rect.width;
    const scaleY = H / rect.height;
    return [(e.clientX - rect.left) * scaleX, (e.clientY - rect.top) * scaleY];
  }, []);

  const emit = useCallback((svgPts: [number, number][]) => {
    const flightPts = svgPts.map(([sx, sy]) => toFlight(sx, sy, distance));
    onChange({
      preset,
      points: flightPts,
      mirror: false,
    });
    if (onDistanceChange && flightPts.length > 0) {
      const lastY = Math.round(flightPts[flightPts.length - 1][1]);
      if (lastY !== distance) {
        onDistanceChange(lastY);
      }
    }
  }, [distance, onChange, onDistanceChange, preset]);

  // ── Anchor drag handlers ──────────────────────────────────────────────────────

  const onAnchorDown = useCallback((e: React.PointerEvent, idx: number) => {
    if (freehand) return;
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    dragging.current = idx;
  }, [freehand]);

  const onSvgMove = useCallback((e: React.PointerEvent) => {
    if (freehand) {
      if (!drawingFree.current) return;
      const xy = getSvgXY(e);
      setRawPts(prev => [...prev, xy]);
      return;
    }
    if (dragging.current < 0) return;
    isEditedRef.current = true;
    const [sx, sy] = getSvgXY(e);
    const idx = dragging.current;
    // Compute next OUTSIDE the setState updater to avoid calling emit() during render
    const next = ptsRef.current.map((p, i) =>
      i === idx ? [sx, sy] as [number, number] : p
    );
    updatePts(next);
    emit(next);
  }, [freehand, getSvgXY, emit, updatePts]);

  const onSvgUp = useCallback(() => {
    if (freehand) {
      drawingFree.current = false;
      if (rawPts.length > 3) {
        isEditedRef.current = true;
        const thinned = thin(rawPts);
        updatePts(thinned);
        emit(thinned);
      }
      setRawPts([]);
      return;
    }
    dragging.current = -1;
  }, [freehand, rawPts, emit, updatePts]);

  const onSvgDown = useCallback((e: React.PointerEvent) => {
    if (!freehand) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const xy = getSvgXY(e);
    setRawPts([xy]);
    drawingFree.current = true;
  }, [freehand, getSvgXY]);

  // ── Render ────────────────────────────────────────────────────────────────────

  const chartDist = Math.max(distance, 600);
  const gridFt = [0, 100, 200, 300, 400, 500, 600].filter(v => v <= chartDist + 30);

  // Tee pad position
  const [teeX, teeY] = toSvg(0, 0, distance);

  // Path D string
  const activePts = freehand && rawPts.length > 1 ? rawPts : pts;
  const pathD = catmullRom(activePts);

  // Landing point
  const lastPt = pts[pts.length - 1];

  return (
    <div className="flex flex-col gap-1 w-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-0.5">
        <div className="flex gap-1 p-0.5 rounded-xl bg-[var(--surface-1)] border border-[var(--border)]">
          <button
            onClick={() => setFreehand(false)}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${
              !freehand ? 'bg-[var(--primary)] text-white' : 'text-[var(--text-muted)]'
            }`}
          >
            <Move size={9} /> Edit Points
          </button>
          <button
            onClick={() => setFreehand(true)}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${
              freehand ? 'bg-[var(--primary)] text-white' : 'text-[var(--text-muted)]'
            }`}
          >
            <PenLine size={9} /> Draw Free
          </button>
        </div>
        <button
          onClick={onReset}
          className="flex items-center gap-1 px-2 py-1 rounded-xl bg-[var(--surface-1)] border border-[var(--border)] text-[9px] font-black uppercase tracking-wider text-[var(--text-muted)] active:scale-95 transition-all"
        >
          <RotateCcw size={9} /> Reset
        </button>
      </div>

      {/* Mode hint */}
      <p className="text-[8px] text-[var(--text-muted)] opacity-50 text-center -mt-1">
        {freehand ? 'Drag to sketch your throw' : 'Drag the dots to reshape the path'}
      </p>

      {/* SVG canvas — fixed height, full width, coordinates calculated via getBoundingClientRect */}
      <div className="rounded-2xl bg-[var(--surface-1)] border border-[var(--border)] overflow-hidden w-full">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="xMidYMid meet"
          className="touch-none"
          style={{ cursor: freehand ? 'crosshair' : 'default', width: '100%', height: 220, display: 'block' }}
          onPointerDown={onSvgDown}
          onPointerMove={onSvgMove}
          onPointerUp={onSvgUp}
          onPointerCancel={onSvgUp}
        >
          {/* Distance grid lines */}
          {gridFt.map(ft => {
            const [, gy] = toSvg(0, ft, distance);
            return (
              <g key={ft}>
                <line x1={PAD.l} y1={gy} x2={W - PAD.r} y2={gy}
                  stroke="var(--border)" strokeWidth={0.5} />
                <text x={PAD.l - 4} y={gy + 3.5} textAnchor="end"
                  fill="var(--text-muted)" fontSize={7} fontWeight="700" fontFamily="inherit">
                  {ft}
                </text>
              </g>
            );
          })}

          {/* Center line */}
          <line
            x1={PAD.l + GW / 2} y1={PAD.t}
            x2={PAD.l + GW / 2} y2={H - PAD.b}
            stroke="var(--border)" strokeWidth={1} strokeDasharray="4,3"
          />

          {/* Path glow */}
          {pathD && (
            <>
              <path d={pathD} fill="none" stroke="#22c55e" strokeWidth={10} strokeOpacity={0.08} strokeLinecap="round" strokeLinejoin="round" />
              <path d={pathD} fill="none" stroke="#22c55e" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
            </>
          )}

          {/* Connector lines between anchor points (ghost) — only in edit mode */}
          {!freehand && pts.map((p, i) => {
            if (i === 0) return null;
            const prev = pts[i - 1];
            return (
              <line key={i}
                x1={prev[0]} y1={prev[1]} x2={p[0]} y2={p[1]}
                stroke="var(--border)" strokeWidth={0.5} strokeDasharray="3,3"
              />
            );
          })}

          {/* Landing zone label */}
          {lastPt && (
            <>
              <circle cx={lastPt[0]} cy={lastPt[1]} r={freehand ? 4 : 0} fill="#22c55e" opacity={freehand ? 1 : 0} />
              <text
                x={lastPt[0] + 12}
                y={Math.max(12, lastPt[1] - 8)}
                textAnchor="start"
                fill="#22c55e" fontSize={9} fontWeight="800" fontFamily="inherit"
              >
                {Math.round(distance)}ft
              </text>
            </>
          )}

          {/* Tee pad marker */}
          <circle cx={teeX} cy={teeY} r={5} fill="var(--text-primary)" />
          <text x={teeX + 12} y={teeY + 3} fill="var(--text-muted)" fontSize={9} fontWeight="700" fontFamily="inherit">tee</text>

          {/* Draggable anchor dots — only in edit mode */}
          {!freehand && pts.map(([sx, sy], i) => {
            const isFirst = i === 0;
            const isLast = i === pts.length - 1;
            const r = isFirst || isLast ? 8 : 7;
            const fill = isFirst ? 'var(--text-primary)' : isLast ? '#22c55e' : 'var(--primary)';
            return (
              <g key={i}>
                {/* Hit target (larger invisible circle) */}
                <circle
                  cx={sx} cy={sy} r={16}
                  fill="transparent"
                  style={{ cursor: 'grab', touchAction: 'none' }}
                  onPointerDown={e => onAnchorDown(e, i)}
                />
                {/* Visible dot */}
                <circle cx={sx} cy={sy} r={r}
                  fill="var(--surface-1)" stroke={fill} strokeWidth={2.5}
                  style={{ pointerEvents: 'none' }}
                />
                {/* Inner fill */}
                <circle cx={sx} cy={sy} r={r - 3.5}
                  fill={fill} opacity={0.8}
                  style={{ pointerEvents: 'none' }}
                />
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
