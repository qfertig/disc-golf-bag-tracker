'use client';

type FlightNumbersProps = {
  speed: number;
  glide: number;
  turn: number;
  fade: number;
  compact?: boolean;
};

const VALUES = [
  ['S', 'Speed', 'speed'],
  ['G', 'Glide', 'glide'],
  ['T', 'Turn', 'turn'],
  ['F', 'Fade', 'fade'],
] as const;

export default function FlightNumbers({ speed, glide, turn, fade, compact = false }: FlightNumbersProps) {
  const numbers = { speed, glide, turn, fade };

  return (
    <div className={`flight-number-strip ${compact ? 'compact' : ''}`}>
      {VALUES.map(([shortLabel, label, key]) => (
        <div className="flight-number-item" key={key} title={`${label} ${numbers[key]}`}>
          <span className="flight-number-label">{shortLabel}</span>
          <span className="flight-number-value">{numbers[key]}</span>
        </div>
      ))}
    </div>
  );
}
