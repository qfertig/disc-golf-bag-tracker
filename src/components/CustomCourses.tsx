'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Plus, ChevronRight, ArrowLeft, Camera, Trash2,
  Flag, Pencil, Check, X, History, Trophy
} from 'lucide-react';
import { dbQuery, dbRun } from '@/lib/db';
import { Capacitor } from '@capacitor/core';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CustomCourse {
  id: string;
  name: string;
  hole_count: number;
  city: string | null;
  notes: string | null;
  photo_uri: string | null;
  created_at: number;
}

interface CustomCourseHole {
  id: string;
  course_id: string;
  hole_number: number;
  par: number;
  distance_ft: number | null;
  notes: string | null;
}

type View = 'list' | 'detail' | 'create';

// ─── Photo helpers ─────────────────────────────────────────────────────────────

async function pickAndSaveCoverPhoto(courseId: string): Promise<string | null> {
  try {
    if (Capacitor.getPlatform() === 'web') {
      // web: file input → data URL stored in localStorage
      return new Promise(resolve => {
        const input = document.createElement('input');
        input.type = 'file'; input.accept = 'image/*';
        input.onchange = async () => {
          const file = input.files?.[0];
          if (!file) { resolve(null); return; }
          const reader = new FileReader();
          reader.onload = () => {
            const key = `course_photo_${courseId}`;
            localStorage.setItem(key, reader.result as string);
            resolve(key);
          };
          reader.readAsDataURL(file);
        };
        document.body.appendChild(input);
        input.click();
        document.body.removeChild(input);
      });
    }

    const { Camera, CameraSource, CameraResultType } = await import('@capacitor/camera');
    const img = await Camera.getPhoto({
      source: CameraSource.Photos,
      resultType: CameraResultType.Base64,
      quality: 72, width: 600,
    });
    if (!img.base64String) return null;
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const fileName = `course_${courseId}_${Date.now()}.jpg`;
    const result = await Filesystem.writeFile({
      path: `course_photos/${fileName}`,
      data: img.base64String,
      directory: Directory.Data,
      recursive: true,
    });
    return result.uri;
  } catch {
    return null;
  }
}

async function resolvePhotoSrc(uri: string | null): Promise<string | null> {
  if (!uri) return null;
  if (uri.startsWith('course_photo_')) {
    return localStorage.getItem(uri) ?? null;
  }
  if (uri.startsWith('data:') || uri.startsWith('http')) return uri;
  // Native file:// URI → read as base64
  try {
    const { Filesystem } = await import('@capacitor/filesystem');
    const res = await Filesystem.readFile({ path: uri });
    const b64 = typeof res.data === 'string' ? res.data : '';
    return `data:image/jpeg;base64,${b64}`;
  } catch { return null; }
}

// ─── CoursePhoto ───────────────────────────────────────────────────────────────

function CourseAvatar({ uri, size = 56 }: { uri: string | null; size?: number }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    resolvePhotoSrc(uri).then(setSrc);
  }, [uri]);

  const style = { width: size, height: size, borderRadius: size * 0.28 };
  if (src) {
    return <img src={src} alt="course" style={style} className="object-cover shrink-0" />;
  }
  return (
    <div style={style} className="bg-[var(--surface-3)] flex items-center justify-center shrink-0">
      <Flag size={size * 0.4} className="text-[var(--text-muted)] opacity-40" />
    </div>
  );
}

// ─── HoleRow ──────────────────────────────────────────────────────────────────

function HoleRow({ hole, onUpdate }: {
  hole: CustomCourseHole;
  onUpdate: (h: CustomCourseHole) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [par, setPar] = useState(hole.par);
  const [dist, setDist] = useState(hole.distance_ft ?? 0);
  const [notes, setNotes] = useState(hole.notes ?? '');

  const save = async () => {
    await dbRun(
      'UPDATE CustomCourseHoles SET par=?, distance_ft=?, notes=? WHERE id=?',
      [par, dist || null, notes.trim() || null, hole.id]
    );
    onUpdate({ ...hole, par, distance_ft: dist || null, notes: notes.trim() || null });
    setEditing(false);
  };

  return (
    <div className="card !p-3 bg-[var(--surface-1)] flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-[var(--primary-tonal)] flex items-center justify-center shrink-0">
          <span className="text-xs font-black text-[var(--primary)]">{hole.hole_number}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-[var(--text-primary)]">Hole {hole.hole_number}</p>
          <p className="text-[11px] text-[var(--text-muted)]">
            Par {hole.par}{hole.distance_ft ? ` · ${hole.distance_ft} ft` : ''}
            {hole.notes ? ` · ${hole.notes}` : ''}
          </p>
        </div>
        <button onClick={() => setEditing(v => !v)} className="p-2 rounded-xl text-[var(--text-muted)] hover:text-[var(--primary)] active:scale-90 transition-all">
          <Pencil size={14} />
        </button>
      </div>

      {editing && (
        <div className="flex flex-col gap-2 pt-2 border-t border-[var(--border)]">
          <div className="flex gap-2">
            <div className="flex-1">
              <p className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-1">Par</p>
              <div className="flex gap-1">
                {[3, 4, 5].map(p => (
                  <button key={p} onClick={() => setPar(p)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-black transition-all ${par === p ? 'bg-[var(--primary)] text-white' : 'bg-[var(--surface-3)] text-[var(--text-muted)]'}`}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1">
              <p className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-1">Dist (ft)</p>
              <input type="number" value={dist || ''} onChange={e => setDist(Number(e.target.value))}
                placeholder="e.g. 280"
                className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--primary)]" />
            </div>
          </div>
          <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes (optional)"
            className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-xl px-3 py-2 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--primary)]" />
          <div className="flex gap-2">
            <button onClick={() => setEditing(false)} className="flex-1 py-1.5 rounded-xl bg-[var(--surface-3)] text-xs font-bold text-[var(--text-muted)] active:scale-95">Cancel</button>
            <button onClick={save} className="flex-1 py-1.5 rounded-xl bg-[var(--primary)] text-white text-xs font-bold shadow active:scale-95 flex items-center justify-center gap-1">
              <Check size={12} /> Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── CourseDetail ─────────────────────────────────────────────────────────────

function CourseDetail({ course, onBack, onDeleted }: {
  course: CustomCourse;
  onBack: () => void;
  onDeleted: () => void;
}) {
  const [holes, setHoles] = useState<CustomCourseHole[]>([]);
  const [photoSrc, setPhotoSrc] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [recentRounds, setRecentRounds] = useState<{ id: string; name: string; date: number; score: number, par: number }[]>([]);

  useEffect(() => {
    dbQuery<CustomCourseHole>(
      'SELECT * FROM CustomCourseHoles WHERE course_id=? ORDER BY hole_number',
      [course.id]
    ).then(setHoles);
    resolvePhotoSrc(course.photo_uri).then(setPhotoSrc);

    dbQuery<any>(`
      SELECT r.id, r.name, r.created_at as date, 
             (SELECT SUM(score) FROM Scores WHERE round_id = r.id) as score,
             (SELECT SUM(par) FROM Scores WHERE round_id = r.id) as par
      FROM Rounds r
      WHERE r.course_id = ?
      ORDER BY r.created_at DESC
      LIMIT 10
    `, [course.id]).then(setRecentRounds);
  }, [course.id, course.photo_uri]);

  const handlePhotoTap = async () => {
    setUploadingPhoto(true);
    const uri = await pickAndSaveCoverPhoto(course.id);
    if (uri) {
      await dbRun('UPDATE CustomCourses SET photo_uri=? WHERE id=?', [uri, course.id]);
      const src = await resolvePhotoSrc(uri);
      setPhotoSrc(src);
    }
    setUploadingPhoto(false);
  };

  const updateHole = (updated: CustomCourseHole) => {
    setHoles(prev => prev.map(h => h.id === updated.id ? updated : h));
  };

  const deleteCourse = async () => {
    await dbRun('DELETE FROM CustomCourseHoles WHERE course_id=?', [course.id]);
    await dbRun('DELETE FROM CustomCourses WHERE id=?', [course.id]);
    onDeleted();
  };

  return (
    <div className="flex flex-col gap-4 fade-up pb-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="w-8 h-8 rounded-xl bg-[var(--surface-2)] flex items-center justify-center active:scale-90 transition-all text-[var(--text-muted)]">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl font-black tracking-tighter text-[var(--text-primary)] truncate">{course.name}</h2>
          {course.city && <p className="text-xs text-[var(--text-muted)]">{course.city}</p>}
        </div>
        <button onClick={() => setConfirmDelete(v => !v)} className="p-2 rounded-xl text-[var(--text-muted)] hover:text-red-400 hover:bg-red-400/10 active:scale-90 transition-all">
          <Trash2 size={16} />
        </button>
      </div>

      {/* Confirm delete */}
      {confirmDelete && (
        <div className="card !p-4 bg-red-500/5 border-red-500/20 flex flex-col gap-3">
          <p className="text-sm font-bold text-red-400">Delete this course and all holes?</p>
          <div className="flex gap-2">
            <button onClick={() => setConfirmDelete(false)} className="flex-1 py-2 rounded-xl bg-[var(--surface-3)] text-sm font-bold text-[var(--text-muted)] active:scale-95">Cancel</button>
            <button onClick={deleteCourse} className="flex-1 py-2 rounded-xl bg-red-500 text-white text-sm font-bold active:scale-95">Delete</button>
          </div>
        </div>
      )}

      {/* Cover photo */}
      <div className="relative rounded-3xl overflow-hidden bg-[var(--surface-2)] aspect-video">
        {photoSrc ? (
          <img src={photoSrc} alt={course.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-[var(--text-muted)]">
            <Flag size={32} className="opacity-20" />
            <p className="text-xs opacity-50">No course photo yet</p>
          </div>
        )}
        <button
          onClick={handlePhotoTap}
          disabled={uploadingPhoto}
          className="absolute bottom-3 right-3 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-black/50 backdrop-blur-sm text-white text-xs font-bold active:scale-95 transition-all"
        >
          <Camera size={13} />
          {uploadingPhoto ? 'Saving...' : photoSrc ? 'Change Photo' : 'Add Photo'}
        </button>
      </div>

      {/* Info */}
      <div className="flex gap-3">
        <div className="card !p-3 flex-1 text-center bg-[var(--surface-1)]">
          <p className="text-2xl font-black text-[var(--primary)]">{course.hole_count}</p>
          <p className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest">Holes</p>
        </div>
        <div className="card !p-3 flex-1 text-center bg-[var(--surface-1)]">
          <p className="text-2xl font-black text-[var(--text-primary)]">
            {holes.reduce((s, h) => s + h.par, 0) || '—'}
          </p>
          <p className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest">Total Par</p>
        </div>
        {holes.some(h => h.distance_ft) && (
          <div className="card !p-3 flex-1 text-center bg-[var(--surface-1)]">
            <p className="text-2xl font-black text-[var(--text-primary)]">
              {holes.reduce((s, h) => s + (h.distance_ft ?? 0), 0)}
            </p>
            <p className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest">Total ft</p>
          </div>
        )}
      </div>

      {/* Holes */}
      <div>
        <p className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-2">Holes</p>
        <div className="flex flex-col gap-2">
          {holes.map(h => (
            <HoleRow key={h.id} hole={h} onUpdate={updateHole} />
          ))}
        </div>
      </div>

      {recentRounds.length > 0 && (
        <div className="mt-2">
          <div className="flex items-center gap-3 mb-2">
            <History size={16} className="text-[var(--text-muted)]" />
            <h2 className="text-[11px] font-black tracking-[0.15em] text-[var(--text-muted)]">Recent Rounds</h2>
            <div className="flex-1 h-px bg-[var(--border)]" />
          </div>
          <div className="flex flex-col gap-2">
            {recentRounds.map(r => {
              const rel = r.score - r.par;
              return (
                <div key={r.id} className="card !p-3 flex items-center justify-between bg-[var(--surface-1)]">
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-[var(--text-primary)] truncate max-w-[200px]">{r.name}</span>
                    <span className="text-[10px] text-[var(--text-muted)]">{new Date(r.date).toLocaleDateString()}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col items-end">
                      <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">Score</span>
                      <span className="text-lg font-black text-[var(--text-primary)]">{r.score || '—'}</span>
                    </div>
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm shadow-sm ${
                      rel > 0 ? 'bg-red-500/10 text-red-400' : rel < 0 ? 'bg-green-500/10 text-green-400' : 'bg-[var(--surface-3)] text-[var(--text-muted)]'
                    }`}>
                      {rel > 0 ? `+${rel}` : rel === 0 ? 'E' : rel}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {course.notes && (
        <p className="text-xs text-[var(--text-muted)] italic px-1">{course.notes}</p>
      )}
    </div>
  );
}

// ─── CreateCourse ─────────────────────────────────────────────────────────────

function CreateCourse({ onCreated, onCancel }: {
  onCreated: (c: CustomCourse) => void;
  onCancel: () => void;
}) {
  const [courseId] = useState(() => crypto.randomUUID());
  const [name, setName] = useState('');
  const [holeCount, setHoleCount] = useState(18);
  const [isCustomHoles, setIsCustomHoles] = useState(false);
  const [city, setCity] = useState('');
  const [notes, setNotes] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoSrc, setPhotoSrc] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [saving, setSaving] = useState(false);

  const handlePhotoTap = async () => {
    setUploadingPhoto(true);
    const uri = await pickAndSaveCoverPhoto(courseId);
    if (uri) {
      setPhotoUri(uri);
      const src = await resolvePhotoSrc(uri);
      setPhotoSrc(src);
    }
    setUploadingPhoto(false);
  };

  const create = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const now = Date.now();
    await dbRun(
      'INSERT INTO CustomCourses (id, name, hole_count, city, notes, photo_uri, created_at) VALUES (?,?,?,?,?,?,?)',
      [courseId, name.trim(), holeCount, city.trim() || null, notes.trim() || null, photoUri, now]
    );
    // Create default holes
    for (let i = 1; i <= holeCount; i++) {
      await dbRun(
        'INSERT INTO CustomCourseHoles (id, course_id, hole_number, par) VALUES (?,?,?,?)',
        [crypto.randomUUID(), courseId, i, 3]
      );
    }
    onCreated({ id: courseId, name: name.trim(), hole_count: holeCount, city: city.trim() || null, notes: notes.trim() || null, photo_uri: photoUri, created_at: now });
    setSaving(false);
  };

  return (
    <div className="flex flex-col gap-4 fade-up pb-4">
      <div className="flex items-center gap-3 mb-1">
        <button onClick={onCancel} className="w-8 h-8 rounded-xl bg-[var(--surface-2)] flex items-center justify-center active:scale-90 text-[var(--text-muted)]">
          <X size={18} />
        </button>
        <h2 className="text-xl font-black tracking-tighter text-[var(--text-primary)]">New Course</h2>
      </div>

      <div 
        onClick={handlePhotoTap}
        className="relative rounded-2xl overflow-hidden bg-[var(--surface-2)] border border-[var(--border)] aspect-[21/9] flex flex-col items-center justify-center text-[var(--text-muted)] hover:bg-[var(--surface-3)] transition-colors cursor-pointer group"
      >
        {photoSrc ? (
          <>
            <img src={photoSrc} alt="Cover Preview" className="w-full h-full object-cover group-hover:opacity-75 transition-opacity" />
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="px-3 py-1.5 rounded-lg bg-black/60 text-white text-[10px] font-bold backdrop-blur-sm">
                Change Photo
              </div>
            </div>
          </>
        ) : (
          <>
            <Camera size={24} className="mb-2 opacity-50" />
            <p className="text-xs font-bold">{uploadingPhoto ? 'Loading...' : 'Add Cover Photo'}</p>
          </>
        )}
      </div>

      <input value={name} onChange={e => setName(e.target.value)} placeholder="Course name *"
        className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-2xl px-4 py-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--primary)] transition-colors" />

      <input value={city} onChange={e => setCity(e.target.value)} placeholder="City (optional)"
        className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-2xl px-4 py-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--primary)] transition-colors" />

      <div>
        <p className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-2">Number of Holes</p>
        <div className="flex gap-2">
          {[9, 18, 27].map(n => (
            <button key={n} onClick={() => { setHoleCount(n); setIsCustomHoles(false); }}
              className={`flex-1 py-2.5 rounded-xl text-sm font-black transition-all ${holeCount === n && !isCustomHoles ? 'bg-[var(--primary)] text-white' : 'bg-[var(--surface-2)] text-[var(--text-muted)]'}`}>
              {n}
            </button>
          ))}
          <button onClick={() => setIsCustomHoles(true)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-black transition-all ${isCustomHoles ? 'bg-[var(--primary)] text-white' : 'bg-[var(--surface-2)] text-[var(--text-muted)]'}`}>
            Custom
          </button>
        </div>
        {isCustomHoles && (
          <div className="mt-2 flex items-center justify-between px-4 py-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)]">
            <span className="text-xs font-bold text-[var(--text-muted)]">Custom Hole Count:</span>
            <input type="number" value={holeCount} onChange={e => setHoleCount(Math.max(1, Math.min(99, Number(e.target.value) || 18)))}
              className="w-16 bg-transparent text-right text-base font-black text-[var(--text-primary)] outline-none" autoFocus />
          </div>
        )}
      </div>

      <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes (optional)"
        rows={2}
        className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-2xl px-4 py-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--primary)] resize-none transition-colors" />

      <button 
        onClick={create} 
        disabled={!name.trim() || saving}
        className="w-full mt-2 py-5 rounded-3xl font-black text-sm shadow-xl flex items-center justify-center gap-2 bg-[var(--primary)] text-white active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {saving ? (
          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        ) : (
          `CREATE ${holeCount}-HOLE COURSE`
        )}
      </button>
    </div>
  );
}

// ─── CourseList ────────────────────────────────────────────────────────────────

function CourseCard({ course, onClick, recentRound, bestScore }: { course: CustomCourse; onClick: () => void; recentRound?: { date: number; score: number } | null; bestScore?: number }) {
  return (
    <button onClick={onClick}
      className="card !p-3 flex items-center gap-3 bg-[var(--surface-1)] active:scale-[0.98] hover:bg-[var(--surface-2)] transition-all text-left w-full">
      <CourseAvatar uri={course.photo_uri} size={52} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-black text-[var(--text-primary)] truncate">{course.name}</p>
        <p className="text-[11px] text-[var(--text-muted)]">
          {course.hole_count} holes{course.city ? ` · ${course.city}` : ''}
        </p>
        {recentRound ? (
          <p className="text-[10px] text-[var(--primary)] font-bold">
            Last: {new Date(recentRound.date).toLocaleDateString()} · {recentRound.score > 0 ? `+${recentRound.score}` : recentRound.score === 0 ? 'E' : recentRound.score}
          </p>
        ) : course.notes ? (
          <p className="text-[10px] text-[var(--text-muted)] opacity-60 truncate">{course.notes}</p>
        ) : null}
        {bestScore !== undefined && (
          <p className="text-[10px] text-yellow-400 font-bold">
            Best: {bestScore > 0 ? `+${bestScore}` : bestScore === 0 ? 'E' : bestScore}
          </p>
        )}
      </div>
      <ChevronRight size={16} className="text-[var(--text-muted)] shrink-0" />
    </button>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────────

export default function CustomCourses() {
  const [courses, setCourses] = useState<CustomCourse[]>([]);
  const [view, setView] = useState<View>('list');
  const [selected, setSelected] = useState<CustomCourse | null>(null);
  const [recentRoundMap, setRecentRoundMap] = useState<Map<string, { date: number; score: number }>>(new Map());
  const [bestScoreMap, setBestScoreMap] = useState<Map<string, number>>(new Map());

  const load = useCallback(async () => {
    const rows = await dbQuery<CustomCourse>('SELECT * FROM CustomCourses ORDER BY created_at DESC');
    setCourses(rows);

    // Load most recent round per course
    try {
      const allRounds = await dbQuery<{ course_id: string; created_at: number; total_score: number }>(
        `SELECT r.course_id, r.created_at, s.total_score
         FROM Rounds r
         JOIN (SELECT round_id, SUM(score) as total_score FROM Scores GROUP BY round_id) s ON s.round_id = r.id
         WHERE r.course_id IS NOT NULL
         ORDER BY r.created_at DESC`
      );
      const map = new Map<string, { date: number; score: number }>();
      for (const rr of allRounds) {
        if (!map.has(rr.course_id)) {
          map.set(rr.course_id, { date: rr.created_at, score: rr.total_score });
        }
      }
      setRecentRoundMap(map);

      // Best relative score per course
      const allWithPar = await dbQuery<{ course_id: string; round_id: string; total_score: number; total_par: number }>(
        `SELECT r.course_id, s.total_score, s.total_par, r.id as round_id
         FROM Rounds r
         JOIN (SELECT round_id, SUM(score) as total_score, SUM(par) as total_par FROM Scores GROUP BY round_id) s ON s.round_id = r.id
         WHERE r.course_id IS NOT NULL`
      );
      const bestMap = new Map<string, number>();
      for (const rw of allWithPar) {
        const rel = rw.total_score - rw.total_par;
        const prev = bestMap.get(rw.course_id);
        if (prev === undefined || rel < prev) bestMap.set(rw.course_id, rel);
      }
      setBestScoreMap(bestMap);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (view === 'create') {
    return (
      <CreateCourse
        onCreated={course => { setCourses(prev => [course, ...prev]); setSelected(course); setView('detail'); }}
        onCancel={() => setView('list')}
      />
    );
  }

  if (view === 'detail' && selected) {
    return (
      <CourseDetail
        course={selected}
        onBack={() => { setView('list'); load(); }}
        onDeleted={() => { setView('list'); load(); }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4 fade-up pb-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <div>
          <h1 className="text-4xl font-black tracking-tighter text-[var(--text-primary)]">My Courses</h1>
          <p className="text-[var(--text-muted)] text-sm font-medium">Custom course layouts</p>
        </div>
        {courses.length > 0 && (
          <button
            onClick={() => setView('create')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--primary)] text-white text-xs font-bold shadow-lg active:scale-95 transition-all"
          >
            <Plus size={14} /> New Course
          </button>
        )}
      </div>

      {courses.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-[var(--text-muted)]">
          <Flag size={40} className="opacity-20" />
          <p className="text-sm font-bold">No custom courses yet</p>
          <p className="text-xs opacity-60 text-center max-w-[240px]">
            Create a course to track hole pars, distances, and add a cover photo.
          </p>
          <button
            onClick={() => setView('create')}
            className="mt-2 px-5 py-2.5 rounded-2xl bg-[var(--primary)] text-white text-sm font-black shadow active:scale-95"
          >
            Create First Course
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {courses.map(c => (
            <CourseCard key={c.id} course={c} recentRound={recentRoundMap.get(c.id) ?? null} bestScore={bestScoreMap.get(c.id)} onClick={() => { setSelected(c); setView('detail'); }} />
          ))}
        </div>
      )}

      <p className="text-[11px] text-[var(--text-muted)] opacity-50 text-center">
        Courses are stored locally and work fully offline.
      </p>
    </div>
  );
}
