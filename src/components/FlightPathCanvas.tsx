'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import type { ThrowPathData } from '@/lib/engines/throwpath';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FlightPathCanvasProps {
  distance: number;
  /** Called when the user finishes drawing a path */
  onPathDrawn: (data: ThrowPathData) => void;
  /** Called when canvas is cleared */
  onCleared?: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Thin the point array to at most maxPts evenly spaced points */
function thinPoints(pts: [number, number][], maxPts = 12): [number, number][] {
  if (pts.length <= maxPts) return pts;
  const result: [number, number][] = [pts[0]];
  const step = (pts.length - 1) / (maxPts - 1);
  for (let i = 1; i < maxPts - 1; i++) {
    result.push(pts[Math.round(i * step)]);
  }
  result.push(pts[pts.length - 1]);
  return result;
}

/** Convert raw canvas pixel coords → disc-flight coordinate space
 *  x = lateral feet (left negative, right positive)
 *  y = forward feet (0 = tee, distance = landing)
 */
function pixelToFlight(
  px: number, py: number,
  canvasW: number, canvasH: number,
  distance: number
): [number, number] {
  // Canvas: origin = BOTTOM CENTER (tee pad)
  // px=0..canvasW, py=0..canvasH (top=far, bottom=close)
  const xFraction = (px - canvasW / 2) / (canvasW / 2); // -1..1
  const yFraction = 1 - py / canvasH;                    // 0 (bottom) .. 1 (top)
  return [
    xFraction * 40,          // ±40 ft lateral
    yFraction * distance,    // 0..distance ft forward
  ];
}

/** Catmull-Rom SVG path for a point array in pixel space */
function catmullRomSvg(pts: [number, number][]): string {
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

// ─── Component ────────────────────────────────────────────────────────────────

export default function FlightPathCanvas({ distance, onPathDrawn, onCleared }: FlightPathCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [rawPts, setRawPts] = useState<[number, number][]>([]);
  const [drawing, setDrawing] = useState(false);
  const [hasPath, setHasPath] = useState(false);

  // ── pointer helpers ────────────────────────────────────────────────────────

  const getSvgXY = useCallback((e: React.PointerEvent<SVGSVGElement>): [number, number] => {
    const rect = svgRef.current!.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const [x, y] = getSvgXY(e);
    setRawPts([[x, y]]);
    setDrawing(true);
    setHasPath(false);
  }, [getSvgXY]);

  const onPointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (!drawing) return;
    const [x, y] = getSvgXY(e);
    setRawPts(prev => [...prev, [x, y]]);
  }, [drawing, getSvgXY]);

  const onPointerUp = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (!drawing) return;
    setDrawing(false);
    setHasPath(rawPts.length > 3);

    if (rawPts.length > 3 && svgRef.current) {
      const rect = svgRef.current.getBoundingClientRect();
      const w = rect.width, h = rect.height;
      const thinned = thinPoints(rawPts);
      const flightPts = thinned.map(([px, py]) => pixelToFlight(px, py, w, h, distance));
      onPathDrawn({
        preset: 'custom',
        points: flightPts,
        mirror: false,
      });
    }
    // suppress unused
    void e;
  }, [drawing, rawPts, distance, onPathDrawn]);

  const clear = useCallback(() => {
    setRawPts([]);
    setHasPath(false);
    setDrawing(false);
    onCleared?.();
  }, [onCleared]);

  // ── re-normalize stored points when distance changes ───────────────────────
  // (nothing needed — path is rebuilt on each draw)

  // ── SVG dimensions ─────────────────────────────────────────────────────────
  const W = 220, H = 300;

  // labels for distance grid
  const gridFt = [0, 100, 200, 300, 400, 500, 600].filter(v => v <= distance + 50);

  const pathD = catmullRomSvg(rawPts);

  // tee point = bottom centre
  const teeX = W / 2, teeY = H - 16;

  return (
    <div className="flex flex-col items-center gap-3 w-full select-none">
      {/* Instruction */}
      <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">
        {hasPath ? 'Path drawn — or draw again to redo' : 'Drag to trace your throw path'}
      </p>

      {/* Canvas */}
      <div className="rounded-3xl bg-[var(--surface-1)] border border-[var(--border)] overflow-hidden w-full max-w-[260px]">
        <svg
          ref={svgRef}
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          className="w-full touch-none cursor-crosshair"
          style={{ maxHeight: 320 }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {/* Center line */}
          <line x1={W / 2} y1={8} x2={W / 2} y2={H - 16}
            stroke="var(--border)" strokeWidth={1} strokeDasharray="4,4" />

          {/* Distance grid */}
          {gridFt.map(ft => {
            const yPct = 1 - ft / distance;
            const y = 8 + yPct * (H - 24);
            return (
              <g key={ft}>
                <line x1={28} y1={y} x2={W - 8} y2={y}
                  stroke="var(--border)" strokeWidth={0.5} />
                <text x={22} y={y + 3.5} textAnchor="end"
                  fill="var(--text-muted)" fontSize={7} fontWeight="700" fontFamily="inherit">
                  {ft}
                </text>
              </g>
            );
          })}

          {/* Drawn path */}
          {pathD && (
            <>
              <path d={pathD} fill="none" stroke="#22c55e" strokeWidth={8} strokeOpacity={0.12} strokeLinecap="round" strokeLinejoin="round" />
              <path d={pathD} fill="none" stroke="#22c55e" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
            </>
          )}

          {/* Tee pad marker */}
          <circle cx={teeX} cy={teeY} r={5} fill="var(--text-primary)" />
          <text x={teeX + 7} y={teeY + 4} fill="var(--text-muted)" fontSize={8} fontWeight="700" fontFamily="inherit">tee</text>

          {/* Landing dot */}
          {hasPath && rawPts.length > 0 && (() => {
            const last = rawPts[rawPts.length - 1];
            return <circle cx={last[0]} cy={last[1]} r={5} fill="#22c55e" />;
          })()}

          {/* Empty state overlay */}
          {!hasPath && !drawing && (
            <text x={W / 2} y={H / 2} textAnchor="middle"
              fill="var(--text-muted)" fontSize={11} fontWeight="700" fontFamily="inherit" opacity={0.35}>
              draw here
            </text>
          )}
        </svg>
      </div>

      {/* Clear button */}
      {hasPath && (
        <button
          onClick={clear}
          className="text-[11px] font-bold text-[var(--text-muted)] underline underline-offset-2 active:scale-95 transition-transform"
        >
          Clear & Redraw
        </button>
      )}
    </div>
  );
}
