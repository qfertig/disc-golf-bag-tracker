'use client';

import { BookOpen, Disc3, Gauge, MoveUpRight, Zap, ArrowRightCircle } from 'lucide-react';

const sections = [
  {
    title: 'Flight Numbers',
    icon: Gauge,
    terms: [
      ['Speed', 'How much power a disc wants before it flies like the numbers say. Higher speed requires more arm speed.'],
      ['Glide', 'The ability of the disc to maintain loft during flight. High glide is great for distance.'],
      ['Turn', 'The tendency of a disc to curve to the right (for RHBH) during the fast part of the flight.'],
      ['Fade', 'The tendency of a disc to hook left (for RHBH) at the end of its flight as it slows down.'],
    ],
  },
  {
    title: 'Stability',
    icon: Disc3,
    terms: [
      ['Understable', 'A disc that turns significantly to the right. Ideal for tailwinds and roller shots.'],
      ['Overstable', 'A disc that fights to the left even in headwinds. Predictable and reliable.'],
      ['Stable / Neutral', 'A disc that resists both turn and fade, flying relatively straight.'],
      ['OAT', 'Off-Axis Torque. Wobbly flight caused by poor release, making discs fly more understable than intended.'],
    ],
  },
  {
    title: 'Release Angles',
    icon: MoveUpRight,
    terms: [
      ['Hyzer', 'Releasing the disc with the outer edge tilted down.'],
      ['Anhyzer', 'Releasing the disc with the outer edge tilted up.'],
      ['Hyzer Flip', 'Throwing an understable disc on hyzer so it "flips" to flat for maximum straight distance.'],
      ['Spike Hyzer', 'A very steep hyzer shot designed to go high and stick where it lands.'],
    ],
  },
  {
    title: 'Advanced Concepts',
    icon: Zap,
    terms: [
      ['Ground Game', 'How a disc behaves after it hits the ground (skips, rolls, or sticks).'],
      ['Spit-out', 'When a disc hits the chains but falls out of the basket.'],
      ['Worm Burner', 'A shot released too low that hits the ground immediately.'],
      ['Tree-nied', 'When a perfect line is ruined by a tree kick.'],
    ],
  },
];

export default function Terminology() {
  return (
    <div className="flex flex-col gap-6 fade-up">
      <div className="flex flex-col mb-2">
        <h1 className="text-3xl font-black tracking-tighter text-[var(--text-primary)]">Dictionary</h1>
        <p className="text-[var(--text-muted)] font-medium">Master the language of the fairways</p>
      </div>

      <div className="flex flex-col gap-4">
        {sections.map(section => {
          const Icon = section.icon;
          return (
            <section className="card" key={section.title}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-full bg-[var(--surface-3)] text-[var(--primary)] flex items-center justify-center">
                  <Icon size={18} />
                </div>
                <h3 className="section-heading">{section.title}</h3>
              </div>
              <div className="divide-y divide-[var(--border)]">
                {section.terms.map(([term, definition]) => (
                  <div className="py-3" key={term}>
                    <div className="text-md font-medium text-[var(--text-primary)]">{term}</div>
                    <p className="mt-1 text-base text-[var(--text-muted)] leading-relaxed">{definition}</p>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
