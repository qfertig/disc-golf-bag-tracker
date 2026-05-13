'use client';

import { useState, useEffect, useCallback } from 'react';
import { dbQuery, dbRun } from '@/lib/db';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Plus, Trash2, ChevronLeft, ChevronRight, Trophy, History, Play, X, User, Crosshair, Disc3, Flag, Check, Share2 } from 'lucide-react';
import { ConfirmDialog } from './Dialogs';
import ThrowLogger from './ThrowLogger';

interface Player {
  id: string;
  name: string;
}

interface Round {
  id: string;
  name: string;
  hole_count: number;
  created_at: number;
  course_id: string | null;
  players?: Player[];
}

interface Score {
  player_id: string;
  hole_number: number;
  par: number;
  score: number;
}

interface CustomCourse {
  id: string;
  name: string;
  hole_count: number;
}

interface HoleThrow {
  id: string;
  disc_name: string;
  distance: number;
  hole_number: number;
}

interface BagDisc {
  id: string;
  name: string;
  brand: string;
  bd_id: string;
}

export default function Scorekeeper({ onModalStateChange }: { onModalStateChange?: (open: boolean) => void }) {
  const [rounds, setRounds] = useState<Round[]>([]);
  const [activeRoundId, setActiveRoundId] = useState<string | null>(null);
  const [scores, setScores] = useState<Score[]>([]);
  const [showNewRound, setShowNewRound] = useState(false);
  const [newName, setNewName] = useState('');
  const [newHoles, setNewHoles] = useState(18);
  const [players, setPlayers] = useState<Player[]>([{ id: 'p1', name: 'Me' }]);
  const [currentPlayerIdx, setCurrentPlayerIdx] = useState(0);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Course selection state
  const [courseSource, setCourseSource] = useState<'custom' | 'saved'>('custom');
  const [savedCourses, setSavedCourses] = useState<CustomCourse[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);

  // Throw tracking state
  const [bagDiscs, setBagDiscs] = useState<BagDisc[]>([]);
  const [holeThrows, setHoleThrows] = useState<HoleThrow[]>([]);
  const [trackingHole, setTrackingHole] = useState<number | null>(null);
  const [selectedThrowDisc, setSelectedThrowDisc] = useState<BagDisc | null>(null);
  const [editThrow, setEditThrow] = useState<{
    shotId: string; discId: string; discName: string; discBrand: string;
    distance: number; preset: string; hand: string; notes: string; pathJson: string | null;
  } | null>(null);
  const [quickDiscsExpanded, setQuickDiscsExpanded] = useState<Set<number>>(new Set());
  const [showSummary, setShowSummary] = useState(false);
  const [holeDistances, setHoleDistances] = useState<Map<number, number>>(new Map());
  const [isNewPB, setIsNewPB] = useState(false);

  useEffect(() => {
    onModalStateChange?.(!!activeRoundId || showNewRound || trackingHole !== null || editThrow !== null);
  }, [activeRoundId, showNewRound, trackingHole, editThrow, onModalStateChange]);

  const loadRounds = useCallback(async () => {
    try {
      const rows = await dbQuery<Round>('SELECT * FROM Rounds ORDER BY created_at DESC');
      const roundsWithPlayers = rows.map(r => ({
        ...r,
        players: JSON.parse((r as any).players_json || '[{"id":"p1","name":"Player 1"}]')
      }));
      setRounds(roundsWithPlayers);
    } catch (e) { console.error(e); }
  }, []);

  const loadScores = useCallback(async (id: string) => {
    try {
      const rows = await dbQuery<Score>('SELECT player_id, hole_number, par, score FROM Scores WHERE round_id = ? ORDER BY hole_number ASC', [id]);
      setScores(rows);
    } catch (e) { console.error(e); }
  }, []);

  const loadHoleThrows = useCallback(async (roundId: string) => {
    try {
      const rows = await dbQuery<HoleThrow>(
        `SELECT id, disc_name, distance, hole_number FROM Shots WHERE round_id = ? ORDER BY hole_number ASC`,
        [roundId]
      );
      setHoleThrows(rows);
    } catch (e) { console.error(e); }
  }, []);

  const loadBagDiscs = useCallback(async () => {
    try {
      const discs = await dbQuery<BagDisc>(
        `SELECT dc.id, dc.name, dc.brand, bd.id as bd_id
         FROM BagDiscs bd
         JOIN DiscCatalog dc ON dc.id = bd.disc_id
         ORDER BY dc.name ASC`
      );
      const seen = new Set<string>();
      setBagDiscs(discs.filter(d => {
        if (seen.has(d.id)) return false;
        seen.add(d.id);
        return true;
      }));
    } catch (e) { console.error(e); }
  }, []);

  const loadSavedCourses = useCallback(async () => {
    try {
      const rows = await dbQuery<CustomCourse>('SELECT id, name, hole_count FROM CustomCourses ORDER BY name ASC');
      setSavedCourses(rows);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => {
    if (!activeRoundId) return;
    const initBackListener = async () => {
      try {
        const { App } = await import('@capacitor/app');
        const listener = await App.addListener('backButton', () => {
          setActiveRoundId(null);
        });
        return listener;
      } catch (e) { return null; }
    };
    const listenerPromise = initBackListener();
    return () => {
      listenerPromise.then(l => l?.remove());
    };
  }, [activeRoundId]);

  useEffect(() => {
    loadRounds();
    loadSavedCourses();
    const onRefresh = () => { loadRounds(); loadSavedCourses(); };
    window.addEventListener('app:refresh', onRefresh);
    return () => window.removeEventListener('app:refresh', onRefresh);
  }, [loadRounds, loadSavedCourses]);

  const handleCourseSelect = (courseId: string) => {
    setSelectedCourseId(courseId);
    const course = savedCourses.find(c => c.id === courseId);
    if (course) {
      setNewName(course.name);
      setNewHoles(course.hole_count);
    }
  };

  const startRound = async () => {
    const id = crypto.randomUUID();
    const playersJson = JSON.stringify(players);
    const courseId = courseSource === 'saved' ? selectedCourseId : null;
    await dbRun(
      'INSERT INTO Rounds (id, name, hole_count, created_at, players_json, course_id) VALUES (?, ?, ?, ?, ?, ?)',
      [id, newName || 'New Round', newHoles, Date.now(), playersJson, courseId]);

    for (const p of players) {
      for (let i = 1; i <= newHoles; i++) {
        await dbRun('INSERT INTO Scores (id, round_id, player_id, hole_number, par, score) VALUES (?, ?, ?, ?, ?, ?)',
          [crypto.randomUUID(), id, p.id, i, 3, 3]);
      }
    }

    // Load holes from saved course if available
    if (courseId) {
      try {
        const holes = await dbQuery<{ par: number; distance_ft: number | null }>(
          'SELECT par, distance_ft FROM CustomCourseHoles WHERE course_id = ? ORDER BY hole_number', [courseId]);
        if (holes.length > 0) {
          const distMap = new Map<number, number>();
          for (let i = 0; i < holes.length; i++) {
            await dbRun('UPDATE Scores SET par = ? WHERE round_id = ? AND hole_number = ?',
              [holes[i].par, id, i + 1]);
            const d = holes[i].distance_ft;
            if (d != null) distMap.set(i + 1, d);
          }
          setHoleDistances(distMap);
        }
      } catch { /* ignore par fallback */ }
    }

    setNewName('');
    setShowNewRound(false);
    setActiveRoundId(id);
    loadScores(id);
    loadRounds();
    loadBagDiscs();
    loadHoleThrows(id);
  };

  const deleteRound = (id: string) => {
    setConfirmDeleteId(id);
  };

  const confirmDeleteRound = async (id: string) => {
    try {
      await Haptics.impact({ style: ImpactStyle.Medium });
      await dbRun('DELETE FROM Shots WHERE round_id = ?', [id]);
      await dbRun('DELETE FROM Scores WHERE round_id = ?', [id]);
      await dbRun('DELETE FROM Rounds WHERE id = ?', [id]);
      if (activeRoundId === id) setActiveRoundId(null);
      loadRounds();
    } catch (err) { console.error('Delete round error:', err); }
  };

  const updateScore = async (holeNum: number, playerId: string, field: 'par' | 'score', val: number) => {
    try { await Haptics.impact({ style: ImpactStyle.Light }); } catch {}
    const newScores = [...scores];
    const idx = newScores.findIndex(s => s.hole_number === holeNum && s.player_id === playerId);
    if (idx === -1) return;

    const current = newScores[idx];
    const updated = { ...current, [field]: Math.max(1, current[field] + val) };

    if (field === 'par') {
      newScores.forEach((s, i) => {
        if (s.hole_number === holeNum) newScores[i].par = updated.par;
      });
      await dbRun('UPDATE Scores SET par = ? WHERE round_id = ? AND hole_number = ?',
        [updated.par, activeRoundId, holeNum]);
    } else {
      newScores[idx] = updated;
      await dbRun('UPDATE Scores SET score = ? WHERE round_id = ? AND hole_number = ? AND player_id = ?',
        [updated.score, activeRoundId, holeNum, playerId]);
    }

    setScores(newScores);
  };

  const handleTrackThrow = (holeNum: number) => {
    setTrackingHole(holeNum);
    setSelectedThrowDisc(null);
  };

  const handleThrowDiscSelected = (disc: BagDisc) => {
    setSelectedThrowDisc(disc);
  };

  const handleThrowSaved = () => {
    setTrackingHole(null);
    setSelectedThrowDisc(null);
    setEditThrow(null);
    if (activeRoundId) loadHoleThrows(activeRoundId);
  };

  const handleEditThrow = async (shotId: string) => {
    try {
      const rows = await dbQuery<any>('SELECT * FROM Shots WHERE id = ?', [shotId]);
      if (rows.length === 0) return;
      const s = rows[0];
      setEditThrow({
        shotId: s.id,
        discId: s.disc_id,
        discName: s.disc_name,
        discBrand: '',
        distance: s.distance,
        preset: s.shape || 'straight',
        hand: s.throw_style || 'rhbh',
        notes: s.notes || '',
        pathJson: s.path_json,
      });
    } catch (e) { console.error(e); }
  };

  const roundHoleThrows = (holeNum: number) => holeThrows.filter(t => t.hole_number === holeNum);

  const handleQuickLogThrow = (holeNum: number, disc: BagDisc) => {
    setSelectedThrowDisc(disc);
    setTrackingHole(holeNum);
  };

  const toggleQuickDiscs = (holeNum: number) => {
    setQuickDiscsExpanded(prev => {
      const next = new Set(prev);
      if (next.has(holeNum)) next.delete(holeNum);
      else next.add(holeNum);
      return next;
    });
  };

  if (activeRoundId) {
    const round = rounds.find(r => r.id === activeRoundId);
    const currentPlayer = round?.players?.[currentPlayerIdx];
    const playerScores = scores.filter(s => s.player_id === currentPlayer?.id);

    const totalScore = playerScores.reduce((acc, s) => acc + s.score, 0);
    const totalPar = playerScores.reduce((acc, s) => acc + s.par, 0);
    const relativeScore = totalScore - totalPar;

    return (
      <div className="flex flex-col gap-6 fade-up pt-4 pb-32">
        <div className="flex items-center justify-between">
          <button onClick={() => setActiveRoundId(null)} className="flex items-center gap-2 text-[var(--primary)] font-black text-xs tracking-widest uppercase">
            <ChevronLeft size={16} /> Back
          </button>
          <div className="flex flex-col items-end">
            <h2 className="text-xl font-black text-[var(--text-primary)]">{round?.name}</h2>
            <p className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest">{round?.hole_count} Holes</p>
          </div>
        </div>

        {/* Player Selector */}
        {(round?.players?.length ?? 0) > 1 && (
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            {round?.players?.map((p, i) => (
              <button
                key={p.id}
                onClick={() => setCurrentPlayerIdx(i)}
                className={`px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${
                  currentPlayerIdx === i ? 'bg-[var(--primary)] text-white' : 'bg-[var(--surface-3)] text-[var(--text-muted)]'
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>
        )}

        <div className="card bg-[var(--primary)] text-[var(--on-primary)] !p-6 shadow-2xl flex flex-col gap-4 rounded-[32px]">
          <div className="flex items-center justify-center gap-2 opacity-80">
            <User size={14} />
            <span className="text-[10px] font-black uppercase tracking-[0.2em]">{currentPlayer?.name}'s Score</span>
          </div>
          <div className="flex items-center justify-around">
            <div className="flex flex-col items-center">
              <span className="text-[10px] font-black uppercase tracking-widest opacity-80">Total</span>
              <span className="text-4xl font-black">{totalScore}</span>
            </div>
            <div className="w-px h-12 bg-white/20" />
            <div className="flex flex-col items-center">
              <span className="text-[10px] font-black uppercase tracking-widest opacity-80">To Par</span>
              <span className="text-4xl font-black">{relativeScore > 0 ? `+${relativeScore}` : relativeScore === 0 ? 'E' : relativeScore}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {playerScores.map(s => {
            const holeThrows = roundHoleThrows(s.hole_number);
            return (
              <div key={s.hole_number} className="card !p-4 flex flex-col bg-[var(--surface-1)]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-[var(--surface-3)] flex items-center justify-center font-black text-sm text-[var(--primary)] border border-[var(--border)]">
                      {s.hole_number}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest">Hole</span>
                      <span className="text-sm font-bold">Par {s.par}{holeDistances.has(s.hole_number) ? ` · ${holeDistances.get(s.hole_number)}ft` : ''}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    {/* Throw indicator */}
                    <button
                      onClick={() => handleTrackThrow(s.hole_number)}
                      className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all ${
                        holeThrows.length > 0
                          ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                          : 'bg-[var(--surface-3)] text-[var(--text-muted)] hover:bg-[var(--primary-tonal)] hover:text-[var(--primary)]'
                      }`}
                    >
                      <Crosshair size={10} />
                      {holeThrows.length > 0 ? `${holeThrows.length}` : 'Track'}
                    </button>

                    <div className="flex flex-col items-center gap-1">
                      <span className="text-[9px] font-black text-[var(--text-muted)] uppercase tracking-tighter">Par</span>
                      <div className="flex items-center gap-2">
                        <button onClick={() => updateScore(s.hole_number, currentPlayer!.id, 'par', -1)} className="w-8 h-8 rounded-lg bg-[var(--surface-3)] flex items-center justify-center text-xs">-</button>
                        <span className="w-4 text-center font-black text-sm">{s.par}</span>
                        <button onClick={() => updateScore(s.hole_number, currentPlayer!.id, 'par', 1)} className="w-8 h-8 rounded-lg bg-[var(--surface-3)] flex items-center justify-center text-xs">+</button>
                      </div>
                    </div>

                    <div className="flex flex-col items-center gap-1">
                      <span className="text-[9px] font-black text-[var(--text-muted)] uppercase tracking-tighter">Score</span>
                      <div className="flex items-center gap-2">
                        <button onClick={() => updateScore(s.hole_number, currentPlayer!.id, 'score', -1)} className="w-10 h-10 rounded-xl bg-[var(--surface-3)] border border-[var(--border)] flex items-center justify-center font-black text-lg">-</button>
                        <span className="w-6 text-center font-black text-xl">{s.score}</span>
                        <button onClick={() => updateScore(s.hole_number, currentPlayer!.id, 'score', 1)} className="w-10 h-10 rounded-xl bg-[var(--primary)] text-white flex items-center justify-center font-black text-lg shadow-md">+</button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Logged throws for this hole — tappable to edit */}
                {holeThrows.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-[var(--border)]">
                    {holeThrows.map(t => (
                      <button key={t.id} onClick={() => handleEditThrow(t.id)}
                        className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[var(--surface-3)] text-[9px] font-bold text-[var(--text-muted)] hover:bg-[var(--primary-tonal)] hover:text-[var(--primary)] transition-all active:scale-95"
                      >
                        <Disc3 size={8} className="text-[var(--primary)]" />
                        {t.disc_name} · {t.distance}ft
                      </button>
                    ))}
                  </div>
                )}

                {/* Quick-disc chips - inline bag discs for quick logging */}
                {bagDiscs.length > 0 && (
                  <>
                    {quickDiscsExpanded.has(s.hole_number) ? (
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {bagDiscs.slice(0, 8).map(d => (
                          <button key={d.bd_id} onClick={() => handleQuickLogThrow(s.hole_number, d)}
                            className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[var(--surface-3)] text-[9px] font-bold text-[var(--text-muted)] hover:bg-[var(--primary-tonal)] hover:text-[var(--primary)] active:scale-95 transition-all"
                          >
                            <Disc3 size={8} />
                            {d.name}
                          </button>
                        ))}
                        <button onClick={() => toggleQuickDiscs(s.hole_number)}
                          className="px-2 py-0.5 rounded-lg text-[9px] font-bold text-[var(--text-muted)]/50 hover:text-[var(--text-muted)] transition-all"
                        >
                          Hide
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => toggleQuickDiscs(s.hole_number)}
                        className="flex items-center gap-1 mt-1 text-[8px] font-bold text-[var(--text-muted)]/40 hover:text-[var(--text-muted)] transition-all"
                      >
                        <Plus size={8} />
                        Quick Disc
                      </button>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* Finish Round button */}
        {!showSummary && (
          <button onClick={async () => {
            setShowSummary(true);
            const round = rounds.find(r => r.id === activeRoundId);
            if (round?.course_id) {
              try {
                const allRounds = await dbQuery<{ id: string }>('SELECT id FROM Rounds WHERE course_id = ? AND id != ?', [round.course_id, activeRoundId]);
                let bestRel = Infinity;
                for (const rRow of allRounds) {
                  const sRows = await dbQuery<{ score: number; par: number }>(
                    'SELECT score, par FROM Scores WHERE round_id = ?', [rRow.id]);
                  if (sRows.length === 0) continue;
                  const rel = sRows.reduce((a, s) => a + s.score - s.par, 0);
                  if (rel < bestRel) bestRel = rel;
                }
                if (relativeScore < bestRel || bestRel === Infinity) setIsNewPB(true);
              } catch { /* ignore */ }
            }
          }}
            className="w-full py-4 rounded-2xl bg-green-600 text-white font-black text-sm shadow-lg active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            <Check size={18} /> Finish Round
          </button>
        )}

        {/* Round Summary */}
        {showSummary && (
          <div className="flex flex-col gap-4 fade-up">
            {isNewPB && (
              <div className="w-full py-3 rounded-2xl bg-yellow-500/15 border border-yellow-500/30 text-center">
                <span className="text-xs font-black text-yellow-400 tracking-widest uppercase">New Personal Best!</span>
              </div>
            )}
            <div className="card !p-6 bg-[var(--surface-1)] flex flex-col gap-4">
              <div className="flex items-center justify-center gap-2 opacity-80">
                <Trophy size={18} className="text-[var(--primary)]" />
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">Round Complete</span>
              </div>
              <div className="flex items-center justify-around">
                <div className="flex flex-col items-center">
                  <span className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">Total</span>
                  <span className="text-4xl font-black text-[var(--text-primary)]">{totalScore}</span>
                </div>
                <div className="w-px h-12 bg-[var(--border)]" />
                <div className="flex flex-col items-center">
                  <span className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">To Par</span>
                  <span className={`text-4xl font-black ${relativeScore > 0 ? 'text-red-400' : relativeScore < 0 ? 'text-green-400' : 'text-[var(--text-primary)]'}`}>
                    {relativeScore > 0 ? `+${relativeScore}` : relativeScore === 0 ? 'E' : relativeScore}
                  </span>
                </div>
              </div>
            </div>

            {/* Per-player summary */}
            {round && round.players && round.players.length > 1 && (
              <div className="flex flex-col gap-2">
                <p className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest">Players</p>
                {round.players.map(p => {
                  const pScores = scores.filter(s => s.player_id === p.id);
                  const pTotal = pScores.reduce((a, s) => a + s.score, 0);
                  const pPar = pScores.reduce((a, s) => a + s.par, 0);
                  const pRel = pTotal - pPar;
                  return (
                    <div key={p.id} className="card !p-3 bg-[var(--surface-1)] flex items-center justify-between">
                      <span className="text-sm font-bold text-[var(--text-primary)]">{p.name}</span>
                      <span className={`text-sm font-black ${pRel > 0 ? 'text-red-400' : pRel < 0 ? 'text-green-400' : 'text-[var(--text-muted)]'}`}>
                        {pRel > 0 ? `+${pRel}` : pRel === 0 ? 'E' : pRel}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Throws per disc */}
            {holeThrows.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest">Discs Used</p>
                <div className="flex flex-wrap gap-1.5">
                  {Array.from(new Map(holeThrows.map(t => [t.disc_name, (holeThrows.filter(x => x.disc_name === t.disc_name).length)])).entries()).map(([name, count]) => (
                    <div key={name} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--surface-3)] text-xs font-bold text-[var(--text-primary)]">
                      <Disc3 size={10} className="text-[var(--primary)]" />
                      {name}
                      <span className="text-[var(--text-muted)]">×{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Best/Worst holes */}
            <div className="flex gap-3">
              <div className="card !p-3 flex-1 bg-green-500/5 border-green-500/20">
                <p className="text-[9px] font-black text-green-400 uppercase tracking-widest mb-1">Best</p>
                {(() => {
                  const best = [...playerScores].sort((a, b) => (a.score - a.par) - (b.score - b.par))[0];
                  if (!best) return <span className="text-xs text-[var(--text-muted)]">—</span>;
                  const diff = best.score - best.par;
                  return <span className="text-sm font-black text-green-400">Hole {best.hole_number} {diff < 0 ? '-' : '+'}{Math.abs(diff)}</span>;
                })()}
              </div>
              <div className="card !p-3 flex-1 bg-red-500/5 border-red-500/20">
                <p className="text-[9px] font-black text-red-400 uppercase tracking-widest mb-1">Worst</p>
                {(() => {
                  const worst = [...playerScores].sort((a, b) => (b.score - b.par) - (a.score - a.par))[0];
                  if (!worst) return <span className="text-xs text-[var(--text-muted)]">—</span>;
                  const diff = worst.score - worst.par;
                  return <span className="text-sm font-black text-red-400">Hole {worst.hole_number} {diff < 0 ? '-' : '+'}{Math.abs(diff)}</span>;
                })()}
              </div>
            </div>

            <button onClick={() => setShowSummary(false)}
              className="w-full py-3 rounded-2xl bg-[var(--surface-3)] text-sm font-bold text-[var(--text-muted)] active:scale-95 transition-all"
            >
              Back to Holes
            </button>
          </div>
        )}

        {/* Throw tracking — disc picker modal */}
        {trackingHole !== null && !selectedThrowDisc && (
          <div className="fixed inset-0 z-[100] flex items-end justify-center font-sans overflow-hidden">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setTrackingHole(null)} />
            <div className="relative w-full max-w-lg bg-[var(--surface-2)] rounded-t-[28px] shadow-2xl flex flex-col max-h-[70vh] animate-in slide-in-from-bottom-4 duration-300 pointer-events-auto overflow-hidden"
              onClick={e => e.stopPropagation()}>
              <div className="w-10 h-1 bg-[var(--border)] rounded-full mx-auto mt-2.5 mb-1 shrink-0" />
              <div className="flex items-center justify-between px-5 pt-1.5 pb-1 shrink-0 border-b border-[var(--border)]">
                <h2 className="text-base font-black tracking-tight text-[var(--text-primary)]">
                  Hole {trackingHole} — Pick a Disc
                </h2>
                <button onClick={() => setTrackingHole(null)}
                  className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center bg-[var(--surface-3)] text-[var(--text-muted)] active:scale-90 transition-transform">
                  <X size={18} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-2">
                {bagDiscs.length === 0 ? (
                  <p className="text-sm text-[var(--text-muted)] text-center py-8">Add discs to a bag first</p>
                ) : (
                  bagDiscs.map(d => (
                    <button
                      key={d.bd_id}
                      onClick={() => handleThrowDiscSelected(d)}
                      className="flex items-center gap-3 p-4 rounded-2xl bg-[var(--surface-3)] border border-[var(--border)] hover:border-[var(--primary)]/40 active:scale-[0.98] transition-all text-left"
                    >
                      <div className="w-10 h-10 rounded-xl bg-[var(--primary-tonal)] flex items-center justify-center shrink-0">
                        <Disc3 size={18} className="text-[var(--primary)]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-[var(--text-primary)] truncate">{d.name}</p>
                        <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase truncate">{d.brand}</p>
                      </div>
                      <Crosshair size={16} className="text-[var(--text-muted)] shrink-0" />
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* ThrowLogger modal — with selected disc */}
        {trackingHole !== null && selectedThrowDisc && activeRoundId && (
          <ThrowLogger
            discId={selectedThrowDisc.id}
            discName={selectedThrowDisc.name}
            discBrand={selectedThrowDisc.brand}
            roundId={activeRoundId}
            holeNumber={trackingHole}
            onClose={() => { setTrackingHole(null); setSelectedThrowDisc(null); }}
            onSaved={handleThrowSaved}
          />
        )}

        {/* Edit throw modal */}
        {editThrow && (
          <ThrowLogger
            discId={editThrow.discId}
            discName={editThrow.discName}
            discBrand={editThrow.discBrand}
            roundId={activeRoundId}
            holeNumber={editThrow.shotId ? undefined : undefined}
            shotId={editThrow.shotId}
            editInitial={{
              distance: editThrow.distance,
              preset: editThrow.preset as any,
              hand: editThrow.hand as any,
              notes: editThrow.notes,
              pathJson: editThrow.pathJson,
            }}
            onClose={() => setEditThrow(null)}
            onSaved={handleThrowSaved}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col mb-2">
        <h1 className="text-3xl font-black tracking-tight text-[var(--text-primary)]">Scorecard</h1>
        <p className="text-[var(--text-muted)] text-sm font-medium">Keep track of your best rounds</p>
      </div>

      {!showNewRound ? (
        <button
          onClick={() => setShowNewRound(true)}
          className="card !p-8 bg-[var(--primary-tonal)] border-[var(--primary)] border-dashed border-2 flex flex-col items-center justify-center gap-3 text-[var(--primary)] hover:scale-[1.02] transition-all"
        >
          <div className="w-16 h-16 rounded-full bg-[var(--primary)] text-white flex items-center justify-center shadow-xl">
            <Play size={32} className="ml-1" />
          </div>
          <span className="font-black tracking-widest text-sm uppercase">Start New Round</span>
        </button>
      ) : (
        <div className="card !p-6 flex flex-col gap-6 animate-in slide-in-from-top-4 duration-300">
          <div className="flex items-center justify-between">
            <h3 className="font-black text-xs tracking-widest">Setup Round</h3>
            <button onClick={() => setShowNewRound(false)} className="text-[var(--text-muted)]"><Trash2 size={16} /></button>
          </div>

          <div className="flex flex-col gap-4">
            {/* Course source toggle */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-black text-[var(--text-muted)] ml-1">Course</label>
              <div className="flex gap-2 mb-2">
                <button
                  onClick={() => setCourseSource('custom')}
                  className={`flex-1 py-2.5 rounded-xl text-xs font-black tracking-wider transition-all ${
                    courseSource === 'custom' ? 'bg-[var(--primary)] text-white' : 'bg-[var(--surface-3)] text-[var(--text-muted)]'
                  }`}
                >
                  Custom
                </button>
                <button
                  onClick={() => setCourseSource('saved')}
                  className={`flex-1 py-2.5 rounded-xl text-xs font-black tracking-wider transition-all ${
                    courseSource === 'saved' ? 'bg-[var(--primary)] text-white' : 'bg-[var(--surface-3)] text-[var(--text-muted)]'
                  }`}
                >
                  My Courses
                </button>
              </div>

              {courseSource === 'saved' ? (
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap gap-1.5 max-h-[200px] overflow-y-auto">
                    {savedCourses.length === 0 ? (
                      <p className="text-xs text-[var(--text-muted)] italic px-2 py-2">No saved courses yet. Add one in My Courses.</p>
                    ) : (
                      savedCourses.map(c => (
                        <button
                          key={c.id}
                          onClick={() => handleCourseSelect(c.id)}
                          className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all w-full text-left ${
                            selectedCourseId === c.id
                              ? 'bg-[var(--primary-tonal)] text-[var(--primary)] border border-[var(--primary)]'
                              : 'bg-[var(--surface-3)] text-[var(--text-primary)] border border-[var(--border)] hover:border-[var(--primary)]/40'
                          }`}
                        >
                          <Flag size={12} className="shrink-0" />
                          <span className="truncate">{c.name}</span>
                          <span className="ml-auto text-[10px] text-[var(--text-muted)]">{c.hole_count}h</span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              ) : (
                <input
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="e.g. Maple Hill"
                  className="bg-[var(--surface-3)] border border-[var(--border)] rounded-2xl p-4 text-sm focus:border-[var(--primary)] outline-none"
                />
              )}
            </div>

            {/* Hole count (only for custom courses) */}
            {courseSource === 'custom' && (
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-[var(--text-muted)] ml-1">Number of Holes</label>
                <div className="flex gap-2">
                  {[9, 18, 27].map(h => (
                    <button key={h} onClick={() => setNewHoles(h)} className={`flex-1 py-3 rounded-xl font-bold border transition-all ${newHoles === h ? 'bg-[var(--primary)] text-white border-[var(--primary)]' : 'bg-[var(--surface-3)] border-[var(--border)] text-[var(--text-muted)]'}`}>{h}</button>
                  ))}
                  <input
                    type="number" value={newHoles}
                    onChange={e => setNewHoles(Math.max(1, Math.min(99, Number(e.target.value) || 18)))}
                    className="w-16 bg-[var(--surface-3)] border border-[var(--border)] rounded-xl text-sm text-center text-[var(--text-primary)] outline-none focus:border-[var(--primary)]"
                  />
                </div>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-black text-[var(--text-muted)] ml-1">Players</label>
              <div className="flex flex-col gap-2">
                {players.map((p, i) => (
                  <div key={p.id} className="flex gap-2">
                    <input
                      type="text"
                      value={p.name}
                      onChange={(e) => {
                        const next = [...players];
                        next[i].name = e.target.value;
                        setPlayers(next);
                      }}
                      className="flex-1 bg-[var(--surface-3)] border border-[var(--border)] rounded-xl p-3 text-sm"
                    />
                    {players.length > 1 && (
                      <button onClick={() => setPlayers(players.filter((_, idx) => idx !== i))} className="p-3 text-red-500"><X size={16} /></button>
                    )}
                  </div>
                ))}
                {players.length < 4 && (
                  <button onClick={() => setPlayers([...players, { id: `p${players.length + 1}`, name: `Player ${players.length + 1}` }])} className="text-[10px] font-black text-[var(--primary)] uppercase">+ Add Player</button>
                )}
              </div>
            </div>
          </div>

          <button
            onClick={startRound}
            disabled={courseSource === 'saved' && !selectedCourseId}
            className="w-full py-5 bg-[var(--primary)] text-[var(--on-primary)] rounded-[24px] font-black text-sm shadow-xl transition-all active:scale-95 disabled:opacity-40"
          >
            GO PLAY
          </button>
        </div>
      )}

      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <History size={16} className="text-[var(--text-muted)]" />
          <h2 className="text-[11px] font-black tracking-[0.15em] text-[var(--text-muted)]">Recent Rounds</h2>
          <div className="flex-1 h-px bg-[var(--border)]" />
        </div>

        {rounds.length > 0 ? (
          <div className="flex flex-col gap-2.5 pb-20">
            {rounds.map(r => (
              <div
                key={r.id}
                onClick={() => { setActiveRoundId(r.id); loadScores(r.id); loadBagDiscs(); loadHoleThrows(r.id); }}
                className="card !p-4 flex items-center justify-between hover:bg-[var(--surface-2)] transition-all group cursor-pointer"
                role="button"
                tabIndex={0}
              >
                <div className="flex flex-col items-start">
                  <span className="font-bold text-base">{r.name}</span>
                  <span className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest">
                    {new Date(r.created_at).toLocaleDateString()} • {r.hole_count} Holes • {r.players?.length} Player{r.players?.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                   <button
                    onClick={(e) => { e.stopPropagation(); deleteRound(r.id); }}
                    className="w-10 h-10 rounded-full bg-[var(--surface-3)] flex items-center justify-center text-red-500 hover:bg-red-500/10 transition-colors z-10"
                   >
                     <Trash2 size={18} />
                   </button>
                   <div className="w-10 h-10 rounded-full bg-[var(--surface-3)] flex items-center justify-center group-hover:bg-[var(--primary-tonal)] group-hover:text-[var(--primary)] transition-colors">
                     <ChevronRight size={20} />
                   </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="card !p-8 flex flex-col items-center justify-center text-center border-dashed border-[var(--border)] opacity-80 mt-2 mb-20">
            <Trophy size={32} className="text-[var(--text-muted)] opacity-50 mb-3" />
            <p className="text-sm font-bold text-[var(--text-primary)]">No rounds yet</p>
            <p className="text-xs font-medium text-[var(--text-muted)] mt-1">Start your first round above.</p>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Delete Round"
        message="This round, all scores, and all tracked throws will be permanently deleted."
        confirmLabel="Delete"
        onCancel={() => setConfirmDeleteId(null)}
        onConfirm={() => {
          if (confirmDeleteId) confirmDeleteRound(confirmDeleteId);
          setConfirmDeleteId(null);
        }}
      />
    </div>
  );
}
