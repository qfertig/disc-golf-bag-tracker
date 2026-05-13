'use client';

import { useState, useEffect } from 'react';
import { dbQuery } from '@/lib/db';
import { BarChart3, Trophy, Crosshair, Target, TrendingUp, Disc3, Calendar } from 'lucide-react';

interface StatData {
  totalRounds: number;
  totalThrows: number;
  longestThrow: number;
  longestDisc: string;
  bestScore: string;
  bestCourse: string;
  mostUsedDisc: string;
  mostUsedCount: number;
  roundsThisMonth: number;
  throwsThisMonth: number;
}

export default function Stats() {
  const [stats, setStats] = useState<StatData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        // Total rounds
        const rounds = await dbQuery<{ count: number }>('SELECT COUNT(*) as count FROM Rounds');
        const totalThrows = await dbQuery<{ count: number }>('SELECT COUNT(*) as count FROM Shots WHERE path_json IS NOT NULL');
        const longest = await dbQuery<{ max_dist: number; disc_name: string }>(
          'SELECT distance as max_dist, disc_name FROM Shots WHERE path_json IS NOT NULL ORDER BY distance DESC LIMIT 1'
        );
        const discUsage = await dbQuery<{ disc_name: string; cnt: number }>(
          'SELECT disc_name, COUNT(*) as cnt FROM Shots WHERE path_json IS NOT NULL GROUP BY disc_name ORDER BY cnt DESC LIMIT 1'
        );

        // Best round: lowest relative to par for any player
        const roundsData = await dbQuery<{ id: string }>('SELECT id FROM Rounds');
        let bestScoreStr = '—';
        let bestCourse = '';
        let bestRel = Infinity;
        for (const r of roundsData) {
          try {
            const scores = await dbQuery<{ score: number; par: number }>(
              'SELECT score, par FROM Scores WHERE round_id = ?', [r.id]
            );
            if (scores.length === 0) continue;
            const totalScore = scores.reduce((a, s) => a + s.score, 0);
            const totalPar = scores.reduce((a, s) => a + s.par, 0);
            const rel = totalScore - totalPar;
            if (rel < bestRel) {
              bestRel = rel;
              bestScoreStr = rel > 0 ? `+${rel}` : rel === 0 ? 'E' : String(rel);
              const rInfo = await dbQuery<{ name: string; course_id: string }>('SELECT name, course_id FROM Rounds WHERE id=?', [r.id]);
              if (rInfo.length > 0) {
                bestCourse = rInfo[0].name;
              }
            }
          } catch { /* skip broken rounds */ }
        }
        if (bestRel === Infinity) bestScoreStr = '—';

        // Month stats
        const monthStart = Date.now() - 30 * 86400000;
        const monthRounds = await dbQuery<{ count: number }>(
          'SELECT COUNT(*) as count FROM Rounds WHERE created_at > ?', [monthStart]
        );
        const monthThrows = await dbQuery<{ count: number }>(
          'SELECT COUNT(*) as count FROM Shots WHERE path_json IS NOT NULL AND created_at > ?', [monthStart]
        );

        setStats({
          totalRounds: rounds[0]?.count ?? 0,
          totalThrows: totalThrows[0]?.count ?? 0,
          longestThrow: longest[0]?.max_dist ?? 0,
          longestDisc: longest[0]?.disc_name ?? '—',
          bestScore: bestScoreStr,
          bestCourse,
          mostUsedDisc: discUsage[0]?.disc_name ?? '—',
          mostUsedCount: discUsage[0]?.cnt ?? 0,
          roundsThisMonth: monthRounds[0]?.count ?? 0,
          throwsThisMonth: monthThrows[0]?.count ?? 0,
        });
      } catch (e) { console.error(e); }
      setLoading(false);
    };
    load();
    const onRefresh = () => { setLoading(true); load(); };
    window.addEventListener('app:refresh', onRefresh);
    return () => window.removeEventListener('app:refresh', onRefresh);
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col gap-4 fade-up">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-2xl bg-[var(--primary-tonal)]">
            <BarChart3 size={22} className="text-[var(--primary)]" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tighter text-[var(--text-primary)]">Stats</h1>
            <p className="text-xs text-[var(--text-muted)] font-medium">Your disc golf data</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[var(--text-muted)] text-sm">
          <div className="w-4 h-4 rounded-full border-2 border-[var(--primary)] border-t-transparent animate-spin" />
          Loading...
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex flex-col gap-4 fade-up">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-2xl bg-[var(--primary-tonal)]">
            <BarChart3 size={22} className="text-[var(--primary)]" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tighter text-[var(--text-primary)]">Stats</h1>
            <p className="text-xs text-[var(--text-muted)] font-medium">Your disc golf data</p>
          </div>
        </div>
        <div className="card border-dashed !border-[var(--border)] text-center py-10 opacity-70">
          <p className="text-sm font-bold text-[var(--text-muted)]">Play a round to see your stats</p>
        </div>
      </div>
    );
  }

  const statCards = [
    { label: 'Rounds Played', value: String(stats.totalRounds), sub: `${stats.roundsThisMonth} this month`, icon: Trophy },
    { label: 'Throws Logged', value: String(stats.totalThrows), sub: `${stats.throwsThisMonth} this month`, icon: Crosshair },
    { label: 'Longest Throw', value: stats.longestThrow > 0 ? `${stats.longestThrow}ft` : '—', sub: stats.longestDisc !== '—' ? stats.longestDisc : '', icon: Target },
    { label: 'Best Round', value: stats.bestScore, sub: stats.bestCourse || '', icon: TrendingUp },
    { label: 'Most Used Disc', value: stats.mostUsedDisc !== '—' ? stats.mostUsedDisc : '—', sub: stats.mostUsedCount > 0 ? `${stats.mostUsedCount} throws` : '', icon: Disc3 },
  ];

  return (
    <div className="flex flex-col gap-4 fade-up pb-4">
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 rounded-2xl bg-[var(--primary-tonal)]">
          <BarChart3 size={22} className="text-[var(--primary)]" />
        </div>
        <div>
          <h1 className="text-2xl font-black tracking-tighter text-[var(--text-primary)]">Stats</h1>
          <p className="text-xs text-[var(--text-muted)] font-medium">{stats.totalRounds} rounds · {stats.totalThrows} throws</p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {statCards.map(({ label, value, sub, icon: Icon }) => (
          <div key={label} className="card !p-4 bg-[var(--surface-1)] flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-[var(--primary-tonal)] flex items-center justify-center shrink-0">
              <Icon size={18} className="text-[var(--primary)]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest">{label}</p>
              <p className="text-xl font-black text-[var(--text-primary)]">{value}</p>
            </div>
            {sub && (
              <span className="text-[10px] font-bold text-[var(--text-muted)] text-right shrink-0">{sub}</span>
            )}
          </div>
        ))}
      </div>

      {stats.totalThrows === 0 && (
        <div className="card border-dashed !border-[var(--border)] text-center py-8 mt-2 opacity-60">
          <Crosshair size={24} className="mx-auto mb-2 text-[var(--text-muted)]" />
          <p className="text-xs font-bold text-[var(--text-muted)]">Log some throws to see more detailed stats</p>
        </div>
      )}

      <p className="text-[11px] text-[var(--text-muted)] opacity-50 text-center mt-2">
        <Calendar size={10} className="inline mr-1" />
        Stats include all rounds and throws across players
      </p>
    </div>
  );
}
