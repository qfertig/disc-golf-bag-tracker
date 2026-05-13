'use client';
import { useMemo, memo } from 'react';

export type Release = 'slow' | 'normal' | 'fast';
export type ThrowStyle = 'left' | 'right' | 'forehand';

export interface FlightPoint {
  x: number;
  y: number;
}

export interface FlightModel {
  totalDistance: number;
  chartDistance: number;
  points: FlightPoint[];
  name?: string;
  color?: string;
}

export function buildFlightModel(
  speed: number,
  glide: number,
  turn: number,
  fade: number,
  release: Release = 'normal',
  throwStyle: ThrowStyle = 'right'
): FlightModel {
  const powerMap = { slow: 0.78, normal: 1.0, fast: 1.18 };
  const power = powerMap[release];

  const isForehand = throwStyle === 'forehand';
  // Forehand flips turn/fade (hyzer-flip becomes more OS)
  const effectiveTurn = isForehand ? -turn : turn;
  const forehandDistPenalty = isForehand ? 0.93 : 1.0;

  // Distance model: calibrated so:
  //   Speed 2 putter  ~190ft normal, Speed 7 fairway ~330ft, Speed 13 distance ~480ft
  //   Glide adds meaningful yardage (each +1 glide ≈ 15ft)
  const baseDist = 140 + speed * 23 + glide * 14;
  // Diminishing returns at high speed (real-world ceiling ~450-500ft casual)
  const distCurve = baseDist * (1 - Math.max(0, speed - 9) * 0.015);
  const distance = Math.round(distCurve * power * forehandDistPenalty);

  const chartDistance = distance > 420 ? 600 : 400;
  const mirror = throwStyle === 'left' ? -1 : 1;

  const points: FlightPoint[] = [];
  const steps = 80; // more points = smoother spline

  // --- Lateral motion model ---
  // Turn: negative = understable = goes right (RHBH). Peaks at ~28% of flight.
  // Fade: positive = overstable = goes left (RHBH). Kicks in after ~72%.

  // How far the disc can swing laterally (high speed = tighter arc)
  const lateralScale = Math.max(0.55, 1.0 - speed * 0.028);

  // Turn magnitude: more negative turn = bigger early right hook
  // at "normal" power, full turn kicks in. At slow power, disc won't turn as much.
  const turnMag = Math.max(0, -effectiveTurn) * power * 5.5 * lateralScale;

  // Fade magnitude: fade always happens regardless of power (physics)
  const fadeMag = fade * 4.8 * lateralScale;

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;

    // Launch dead zone: disc flies straight out of the hand for the first ~10%.
    // Real discs have maximum gyroscopic stability at release; turn doesn't
    // engage until the disc slows and precession takes over.
    const launchZone = 0.10;
    const tActive = t < launchZone ? 0 : (t - launchZone) / (1 - launchZone);

    // Turn shape: 0 during launch, then sin(t*π) × (1-t)^1.4
    // Peaks around t≈0.35 (of active zone), decays by t≈0.75.
    const turnShape = tActive <= 0
      ? 0
      : Math.sin(tActive * Math.PI) * Math.pow(1 - tActive, 1.4);

    // Fade shape: exactly 0 until fadeStart (relative to full flight),
    // then smooth power curve. Represents gyroscopic precession overcoming
    // lift as the disc slows.
    const fadeStart = 0.65;
    const fadeShape = t < fadeStart
      ? 0
      : Math.pow((t - fadeStart) / (1 - fadeStart), 2.5);

    const x = (turnMag * turnShape - fadeMag * fadeShape) * mirror;
    points.push({ x, y: distance * t });
  }

  return { totalDistance: distance, chartDistance, points };
}

// True Catmull-Rom spline — smooth through all points
export function catmullRomPath(
  points: FlightPoint[],
  tx: (x: number) => number,
  ty: (y: number) => number
): string {
  if (points.length < 2) return '';
  if (points.length === 2) {
    return `M ${tx(points[0].x)} ${ty(points[0].y)} L ${tx(points[1].x)} ${ty(points[1].y)}`;
  }

  // Add phantom points at start and end for the spline
  const pts = [points[0], ...points, points[points.length - 1]];
  let d = `M ${tx(pts[1].x)} ${ty(pts[1].y)}`;
  const alpha = 0.5; // centripetal Catmull-Rom

  for (let i = 1; i < pts.length - 2; i++) {
    const p0 = pts[i - 1], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2];

    // Convert to screen coords
    const x0 = tx(p0.x), y0 = ty(p0.y);
    const x1 = tx(p1.x), y1 = ty(p1.y);
    const x2 = tx(p2.x), y2 = ty(p2.y);
    const x3 = tx(p3.x), y3 = ty(p3.y);

    // Catmull-Rom tangents
    const cp1x = x1 + (x2 - x0) / 6;
    const cp1y = y1 + (y2 - y0) / 6;
    const cp2x = x2 - (x3 - x1) / 6;
    const cp2y = y2 - (y3 - y1) / 6;

    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x2} ${y2}`;
  }

  return d;
}

const FlightPath = memo(function FlightPath({ speed, glide, turn, fade, release = 'normal', throwStyle = 'right', height, showComparison = false }: {
  speed: number; glide: number; turn: number; fade: number; release?: Release; throwStyle?: ThrowStyle; height?: number; showComparison?: boolean;
}) {
  const pathData = useMemo(
    () => buildFlightModel(speed, glide, turn, fade, release, throwStyle),
    [speed, glide, turn, fade, release, throwStyle]
  );

  const comparisonPaths = useMemo(() => {
    if (!showComparison) return [];
    return (['slow', 'normal', 'fast'] as Release[]).map(r => ({
      ...buildFlightModel(speed, glide, turn, fade, r, throwStyle),
      color: r === 'slow' ? '#6b7280' : r === 'normal' ? 'var(--primary)' : '#f97316',
      name: r.toUpperCase()
    }));
  }, [showComparison, speed, glide, turn, fade, throwStyle]);

  return (
    <FlightChart pathData={showComparison ? undefined : pathData} multiplePaths={comparisonPaths} height={height} />
  );
});

export default FlightPath;

export const FlightChart = memo(function FlightChart({ pathData, multiplePaths = [], height }: { pathData?: FlightModel, multiplePaths?: FlightModel[], height?: number }) {
  const paths = pathData ? [pathData, ...multiplePaths] : multiplePaths;
  if (paths.length === 0) return null;

  const maxChartDist = Math.max(...paths.map(p => p.chartDistance));
  const isMulti = paths.length > 1;

  const w = 200;
  const h = height || (isMulti ? 420 : 300);
  const pad = { left: 34, right: 14, top: 14, bottom: 28 };
  const gw = w - pad.left - pad.right;
  const gh = h - pad.top - pad.bottom;

  // X range: ±35ft lateral (wider to show extreme flights)
  const xRange = 35;
  const tx = (x: number) => pad.left + gw / 2 + (x / xRange) * (gw / 2);
  const ty = (y: number) => h - pad.bottom - (y / maxChartDist) * gh;

  const gridLines = Array.from({ length: Math.floor(maxChartDist / 100) + 1 }, (_, i) => i * 100);

  return (
    <div className="flex justify-center w-full">
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
        {/* Vertical grid lines */}
        {[-20, 0, 20].map(x => (
          <line
            key={x}
            x1={tx(x)} y1={pad.top} x2={tx(x)} y2={h - pad.bottom}
            stroke="var(--border)" strokeWidth={x === 0 ? 1.5 : 1} strokeDasharray={x === 0 ? '' : '4,4'}
          />
        ))}
        {/* Horizontal distance lines */}
        {gridLines.map(yPos => (
          <g key={yPos}>
            <line x1={pad.left} y1={ty(yPos)} x2={w - pad.right} y2={ty(yPos)} stroke="var(--border)" strokeWidth={1} />
            <text x={pad.left - 6} y={ty(yPos) + 3.5} textAnchor="end" fill="var(--text-muted)" fontSize={8} fontWeight="700" fontFamily="inherit">
              {yPos}
            </text>
          </g>
        ))}

        {/* Flight paths */}
        {paths.map((p, i) => {
          const d = catmullRomPath(p.points, tx, ty);
          const color = p.color || 'var(--primary)';
          const endPt = p.points[p.points.length - 1];
          const strokeW = isMulti ? 2.5 : 4;

          return (
            <g key={i}>
              {/* Glow under path */}
              <path d={d} fill="none" stroke={color} strokeWidth={strokeW + 4} strokeOpacity={0.1} strokeLinecap="round" />
              <path d={d} fill="none" stroke={color} strokeWidth={strokeW} strokeOpacity={isMulti ? 0.8 : 1} strokeLinecap="round" className="transition-all duration-500" />
              {/* End dot */}
              <circle cx={tx(endPt.x)} cy={ty(endPt.y)} r={isMulti ? 3 : 4.5} fill={color} />
              {/* Distance label */}
              {!isMulti && (
                <text
                  x={tx(endPt.x) + (endPt.x >= 0 ? 6 : -6)}
                  y={ty(endPt.y) + 4}
                  textAnchor={endPt.x >= 0 ? 'start' : 'end'}
                  fill={color}
                  fontSize={8}
                  fontWeight="800"
                  fontFamily="inherit"
                >
                  {Math.round(p.totalDistance)}ft
                </text>
              )}
            </g>
          );
        })}

        {/* Throw origin dot */}
        <circle cx={tx(0)} cy={ty(0)} r={3.5} fill="var(--text-primary)" />
        <text x={tx(0) + 5} y={ty(0) - 5} fill="var(--text-muted)" fontSize={8} fontWeight="700" fontFamily="inherit">release</text>
      </svg>
    </div>
  );
});
