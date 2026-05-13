'use client';

import { useState, useEffect, useCallback } from 'react';
import { MapPin, Navigation, RotateCcw, Target, Save, History, ChevronRight, Disc3 } from 'lucide-react';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Geolocation } from '@capacitor/geolocation';
import { dbQuery, dbRun } from '@/lib/db';
import EditablePathCanvas from '@/components/EditablePathCanvas';
import { type ThrowPreset, type ThrowPathData, generatePath, serializePath } from '@/lib/engines/throwpath';

type ShotShape = 'straight' | 'hyzer' | 'anhyzer' | 'flex';

interface Shot {
  id: string;
  disc_name: string;
  distance: number;
  shape: string;
  created_at: number;
}

const METERS_TO_FEET = 3.28084;

function formatAccuracy(coords: any | null) {
  if (!coords) return null;
  return Math.max(1, Math.round(coords.accuracy * METERS_TO_FEET));
}

function getGpsGuidance(accuracyFeet: number | null) {
  if (accuracyFeet === null) {
    return {
      label: 'Finding GPS',
      message: 'Stand still with a clear view of the sky while your phone locks in.',
      ready: false,
      className: 'bg-amber-500/15 text-amber-300 border-amber-500/25'
    };
  }

  if (accuracyFeet <= 12) {
    return {
      label: `Ready within +/- ${accuracyFeet} ft`,
      message: 'Accuracy is tight enough for a clean throw measurement.',
      ready: true,
      className: 'bg-green-500/15 text-green-300 border-green-500/25'
    };
  }

  if (accuracyFeet <= 25) {
    return {
      label: `Usable within +/- ${accuracyFeet} ft`,
      message: 'This will work, but wait a moment if you want closer to +/- 10-12 ft.',
      ready: true,
      className: 'bg-sky-500/15 text-sky-300 border-sky-500/25'
    };
  }

  return {
    label: `Wait: +/- ${accuracyFeet} ft`,
    message: 'GPS is still loose. Hold position before setting your start point.',
    ready: false,
    className: 'bg-amber-500/15 text-amber-300 border-amber-500/25'
  };
}

export default function Rangefinder({ onLocationUpdate }: { onLocationUpdate?: (coords: { lat: number; lon: number } | null) => void }) {
  const [startPos, setStartPos] = useState<any | null>(null);
  const [currentPos, setCurrentPos] = useState<any | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tracking, setTracking] = useState(false);
  const [showMap, setShowMap] = useState(false);

  const [recentShots, setRecentShots] = useState<Shot[]>([]);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [selectedShape, setSelectedShape] = useState<ShotShape>('straight');
  const [discName, setDiscName] = useState('');
  const [myDiscs, setMyDiscs] = useState<string[]>([]);
  const currentAccuracyFeet = formatAccuracy(currentPos);
  const startAccuracyFeet = formatAccuracy(startPos);
  const displayedAccuracyFeet = startAccuracyFeet && currentAccuracyFeet
    ? Math.max(startAccuracyFeet, currentAccuracyFeet)
    : currentAccuracyFeet;
  const gpsGuidance = getGpsGuidance(currentAccuracyFeet);

  // Drawing state
  const [editedPath, setEditedPath] = useState<ThrowPathData | null>(null);
  const [canvasVersion, setCanvasVersion] = useState(0);

  const loadRecentShots = useCallback(async () => {
    const rows = await dbQuery<Shot>('SELECT * FROM Shots ORDER BY created_at DESC LIMIT 10');
    setRecentShots(rows);
  }, []);

  const loadMyDiscs = useCallback(async () => {
    const rows = await dbQuery<{ name: string }>('SELECT DISTINCT name FROM DiscCatalog d JOIN BagDiscs bd ON d.id = bd.disc_id');
    setMyDiscs(rows.map(r => r.name));
  }, []);

  useEffect(() => {
    loadRecentShots();
    loadMyDiscs();
  }, [loadRecentShots, loadMyDiscs]);

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 20902231; // Radius of earth in feet
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  useEffect(() => {
    let watchId: string | null = null;
    
    const startWatching = async () => {
      if (tracking) {
        try {
          watchId = await Geolocation.watchPosition(
            { enableHighAccuracy: true, maximumAge: 1000, timeout: 12000 },
            (pos, err) => {
              if (err) {
                setError(err.message);
                return;
              }
              if (pos) {
                setCurrentPos(pos.coords);
                if (startPos) {
                  const d = calculateDistance(
                    startPos.latitude, startPos.longitude,
                    pos.coords.latitude, pos.coords.longitude
                  );
                  setDistance(d);
                }
              }
            }
          );
        } catch (err: any) {
          setError(err.message || 'Geolocation failed');
          setTracking(false);
        }
      }
    };

    startWatching();

    return () => {
      if (watchId) {
        Geolocation.clearWatch({ id: watchId });
      }
    };
  }, [tracking, startPos]);

  const handleSetStart = () => {
    if (!currentPos || !gpsGuidance.ready) return;
    try { Haptics.impact({ style: ImpactStyle.Heavy }); } catch {}
    setStartPos(currentPos);
    setDistance(0);
    setTracking(true);
  };

  const handleReset = () => {
    setStartPos(null);
    setDistance(null);
    setTracking(false);
  };

  const saveShot = async () => {
    if (distance === null) return;
    const id = crypto.randomUUID();
    const shape = editedPath ? 'custom' : selectedShape;
    const pathJson = editedPath ? serializePath(editedPath) : serializePath({ ...generatePath(selectedShape as ThrowPreset, distance, false), preset: selectedShape as ThrowPreset });
    
    await dbRun('INSERT INTO Shots (id, disc_name, distance, shape, path_json, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [id, discName || 'Unknown Disc', Math.round(distance), shape, pathJson, Date.now()]);

    setShowSaveModal(false);
    setDiscName('');
    setEditedPath(null);
    handleReset();
    loadRecentShots();
  };

  const clearRecentShots = async () => {
    await dbRun('DELETE FROM Shots WHERE round_id IS NULL');
    loadRecentShots();
  };

  const getShapePath = (shape: string) => {
    switch (shape) {
      case 'hyzer': return "M 50 100 Q 10 50 50 0";
      case 'anhyzer': return "M 50 100 Q 90 50 50 0";
      case 'flex': return "M 50 100 C 90 80 10 20 50 0";
      default: return "M 50 100 L 50 0";
    }
  };

  return (
    <div className="flex flex-col gap-6 fade-up">
      <div className="flex flex-col mb-2">
        <h1 className="text-3xl font-black tracking-tight text-[var(--text-primary)]">Rangefinder</h1>
        <p className="text-[var(--text-muted)] text-sm font-medium">Measure and track your throws</p>
      </div>

      <div className="card bg-[var(--surface-1)] !p-4 sm:!p-6 flex flex-col gap-4 rounded-3xl shadow-2xl border border-[var(--border)] relative overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-2">
            <button 
              onClick={() => setShowMap(false)} 
              className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${!showMap ? 'bg-[var(--primary)] text-white' : 'bg-[var(--surface-3)] text-[var(--text-muted)]'}`}
            >
              Radar
            </button>
            <button 
              onClick={() => setShowMap(true)} 
              className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${showMap ? 'bg-[var(--primary)] text-white' : 'bg-[var(--surface-3)] text-[var(--text-muted)]'}`}
            >
              Satellite
            </button>
          </div>
          {tracking && (
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${gpsGuidance.className}`}>
              <div className={`w-1.5 h-1.5 rounded-full ${gpsGuidance.ready ? 'bg-green-400' : 'bg-amber-300 animate-pulse'}`} />
              <span className="text-[10px] font-black uppercase">Live GPS</span>
            </div>
          )}
        </div>

        <div className="relative h-[280px] rounded-[32px] overflow-hidden bg-[var(--surface-0)] border border-[var(--border)] shadow-inner">
          {showMap ? (
            <div className="absolute inset-0 bg-[#060606]">
              {currentPos ? (
                <iframe
                  title="Satellite Map"
                  className="w-full h-full grayscale-[20%] opacity-80"
                  src={`https://www.openstreetmap.org/export/embed.html?bbox=${currentPos.longitude - 0.002}%2C${currentPos.latitude - 0.001}%2C${currentPos.longitude + 0.002}%2C${currentPos.latitude + 0.001}&layer=mapnik&marker=${currentPos.latitude}%2C${currentPos.longitude}`}
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-full gap-3">
                  <div className="w-8 h-8 rounded-full border-2 border-[var(--primary)] border-t-transparent animate-spin" />
                  <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">Loading Map...</p>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Tactical Radar Background */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20">
                <div className="w-[100px] h-[100px] rounded-full border border-white/20" />
                <div className="w-[200px] h-[200px] rounded-full border border-white/10" />
                <div className="w-[300px] h-[300px] rounded-full border border-white/5" />
                <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:40px_40px]" />
              </div>

              {/* Dynamic Scaling Visualization */}
              <div className="absolute inset-0 flex items-center justify-center">
                {!startPos ? (
                  <div className="flex flex-col items-center gap-4">
                    <div className="relative">
                      <div className="w-16 h-16 rounded-full border-2 border-[var(--primary)]/20 animate-ping absolute inset-0" />
                      <div className={`w-16 h-16 rounded-full border-2 ${gpsGuidance.className} flex items-center justify-center`}>
                        <div className="w-4 h-4 rounded-full bg-[var(--primary)] shadow-[0_0_20px_rgba(124,111,247,0.5)]" />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="relative w-full h-full flex items-center justify-center">
                    {/* Measurement Line */}
                    <svg className="absolute inset-0 w-full h-full overflow-visible pointer-events-none">
                      <line 
                        x1="50%" y1="70%" x2="50%" y2="30%" 
                        stroke="var(--primary)" 
                        strokeWidth="2" 
                        strokeDasharray="4 4" 
                        className="animate-[dash_10s_linear_infinite]"
                      />
                    </svg>
                    
                    {/* Start Pin */}
                    <div className="absolute left-1/2 bottom-[30%] -translate-x-1/2 translate-y-1/2 flex flex-col items-center gap-1">
                      <div className="w-3 h-3 rounded-full bg-white shadow-lg border-2 border-[var(--surface-0)]" />
                      <span className="text-[9px] font-black uppercase text-white/50 tracking-widest">Start</span>
                    </div>

                    {/* End Pin (You) */}
                    <div className="absolute left-1/2 top-[30%] -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-2">
                      <div className="relative">
                        <div className="w-10 h-10 rounded-full bg-[var(--primary)]/20 animate-ping absolute -inset-0" />
                        <div className="w-10 h-10 rounded-full bg-[var(--primary)] shadow-xl flex items-center justify-center border-2 border-white/20">
                          <Navigation size={18} className="text-white fill-white" />
                        </div>
                      </div>
                      <span className="text-[10px] font-black uppercase text-[var(--primary)] tracking-widest">Landing</span>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* HUD Overlay */}
          <div className="absolute left-3 right-3 bottom-3 rounded-2xl bg-[var(--surface-2)]/80 backdrop-blur-md border border-[var(--border)] p-3">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl bg-[var(--primary-tonal)] text-[var(--primary)] flex items-center justify-center shrink-0 ${!gpsGuidance.ready ? 'animate-pulse' : ''}`}>
                <MapPin size={20} />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]">{gpsGuidance.label}</p>
                <p className="text-[11px] leading-tight text-[var(--text-muted)] mt-1 truncate">{gpsGuidance.message}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center gap-2 py-3">
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">Distance</span>
          <div className="flex items-baseline gap-2">
            <span className="text-7xl sm:text-8xl font-black text-[var(--primary)] tracking-tighter">
              {distance !== null ? Math.round(distance) : '0'}
            </span>
            <span className="text-xl font-bold text-[var(--text-muted)]">ft</span>
          </div>
          {displayedAccuracyFeet !== null && (
            <span className="text-[11px] font-bold text-[var(--text-muted)]">
              Estimated range: +/- {displayedAccuracyFeet} ft
            </span>
          )}
        </div>

        <div className="w-full flex gap-3">
          {!tracking ? (
            <button
              onClick={async () => {
                setError(null);
                try {
                  const perm = await Geolocation.checkPermissions();
                  if (perm.location !== 'granted') {
                    const req = await Geolocation.requestPermissions();
                    if (req.location !== 'granted') {
                      setError('Location permission denied');
                      return;
                    }
                  }
                  setTracking(true);
                } catch (err: any) {
                  setError(err.message || 'Geolocation permission failed');
                }
              }}
              className="w-full py-4 bg-[var(--primary)] text-white rounded-2xl font-black text-sm shadow-xl flex items-center justify-center gap-2 transition-all active:scale-95"
            >
              <Navigation size={18} /> ENABLE GPS
            </button>
          ) : !startPos ? (
            <button
              onClick={handleSetStart}
              disabled={!gpsGuidance.ready}
              className={`flex-1 py-5 rounded-3xl font-black text-sm shadow-xl flex items-center justify-center gap-2 ${
                gpsGuidance.ready
                  ? 'bg-[var(--primary)] text-white'
                  : 'bg-[var(--surface-3)] text-[var(--text-muted)] border border-[var(--border)]'
              }`}
            >
              SET START POINT
            </button>
          ) : (
            <>
              <button
                onClick={handleReset}
                className="w-16 h-16 rounded-3xl bg-[var(--surface-3)] flex items-center justify-center text-[var(--text-muted)] border border-[var(--border)]"
              >
                <RotateCcw size={24} />
              </button>
              <button
                onClick={() => setShowSaveModal(true)}
                className="flex-1 py-5 bg-[var(--primary)] text-white rounded-3xl font-black text-sm shadow-xl flex items-center justify-center gap-2"
              >
                <Save size={20} /> SAVE SHOT
              </button>
            </>
          )}
        </div>

        {error && (
          <p className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-2xl px-4 py-3">
            {error}
          </p>
        )}
      </div>

      {recentShots.length > 0 && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <History size={16} className="text-[var(--text-muted)]" />
              <h2 className="text-[11px] font-black tracking-[0.15em] text-[var(--text-muted)]">Recent Shots</h2>
            </div>
            <button onClick={clearRecentShots} className="text-[10px] font-black uppercase tracking-widest text-red-400 hover:text-red-300">Clear</button>
          </div>
          <div className="w-full h-px bg-[var(--border)]" />

          <div className="flex flex-col gap-2.5">
            {recentShots.map(shot => (
              <div key={shot.id} className="card !p-4 flex items-center justify-between bg-[var(--surface-1)]">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-[var(--surface-3)] flex items-center justify-center">
                    <svg width="24" height="24" viewBox="0 0 100 100" className="text-[var(--primary)]">
                      <path d={getShapePath(shot.shape)} fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round" />
                    </svg>
                  </div>
                  <div className="flex flex-col">
                    <span className="font-bold text-sm">{shot.disc_name}</span>
                    <span className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest">
                      {new Date(shot.created_at).toLocaleDateString()} • {shot.shape}
                    </span>
                  </div>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-xl font-black text-[var(--text-primary)]">{shot.distance}</span>
                  <span className="text-[10px] font-bold text-[var(--text-muted)]">ft</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Save Shot Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowSaveModal(false)} />
          <div className="relative w-full max-w-md bg-[var(--surface-2)] rounded-[32px] p-8 shadow-2xl border border-[var(--border)] animate-in zoom-in-95 duration-200">
            <h2 className="text-2xl font-black mb-6 tracking-tight">Record Shot</h2>

            <div className="space-y-6">
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black text-[var(--text-muted)] ml-1">What did you throw?</label>
                <div className="relative">
                  <input
                    type="text"
                    value={discName}
                    onChange={e => setDiscName(e.target.value)}
                    placeholder="Search or type disc name..."
                    className="w-full bg-[var(--surface-3)] p-4 rounded-2xl outline-none border border-[var(--border)] text-sm focus:border-[var(--primary)]"
                  />
                  {myDiscs.length > 0 && !discName && (
                    <div className="mt-2 flex gap-2 overflow-x-auto no-scrollbar pb-1">
                      {myDiscs.slice(0, 5).map(d => (
                        <button key={d} onClick={() => setDiscName(d)} className="px-3 py-1.5 rounded-lg bg-[var(--surface-3)] border border-[var(--border)] text-[10px] font-bold whitespace-nowrap">{d}</button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black text-[var(--text-muted)] ml-1">Shot Shape</label>
                  {editedPath && <span className="text-[8px] font-bold text-[var(--primary)] uppercase tracking-wider">Custom</span>}
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {(['straight', 'hyzer', 'anhyzer', 'flex'] as ShotShape[]).map(shape => (
                    <button
                      key={shape}
                      onClick={() => { setSelectedShape(shape); setEditedPath(null); setCanvasVersion(v => v + 1); }}
                      className={`flex flex-col items-center gap-2 p-3 rounded-2xl border transition-all ${
                        selectedShape === shape && !editedPath ? 'bg-[var(--primary-tonal)] border-[var(--primary)]' : 'bg-[var(--surface-3)] border-transparent'
                      }`}
                    >
                      <svg width="24" height="24" viewBox="0 0 100 100" className={selectedShape === shape && !editedPath ? 'text-[var(--primary)]' : 'text-[var(--text-muted)]'}>
                        <path d={getShapePath(shape)} fill="none" stroke="currentColor" strokeWidth="12" strokeLinecap="round" />
                      </svg>
                      <span className="text-[8px] font-black uppercase tracking-tighter">{shape}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <label className="text-[10px] font-black text-[var(--text-muted)] ml-1">Distance & Path</label>
                <div className="flex items-center gap-3 bg-[var(--surface-3)] p-4 rounded-2xl border border-[var(--border)]">
                  <input type="range" min={50} max={600} step={5} value={distance || 0} onChange={e => { setDistance(Number(e.target.value)); setEditedPath(null); setCanvasVersion(v => v + 1); }} className="flex-1 accent-[var(--primary)]" />
                  <div className="flex items-baseline gap-1 min-w-[60px] justify-end">
                    <span className="text-xl font-black text-[var(--primary)]">{Math.round(distance || 0)}</span>
                    <span className="text-[10px] font-bold text-[var(--text-muted)]">ft</span>
                  </div>
                </div>
                
                <div className="bg-[var(--surface-3)] border border-[var(--border)] rounded-2xl overflow-hidden p-2">
                  <EditablePathCanvas
                    initialPoints={generatePath(selectedShape as ThrowPreset, distance || 250, false).points}
                    distance={distance || 250}
                    preset={selectedShape as ThrowPreset}
                    resetVersion={canvasVersion}
                    onChange={setEditedPath}
                    onDistanceChange={setDistance}
                    onReset={() => { setEditedPath(null); setCanvasVersion(v => v + 1); }}
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowSaveModal(false)} className="flex-1 py-4 font-bold text-sm text-[var(--text-muted)]">Cancel</button>
              <button
                onClick={saveShot}
                className="flex-1 py-4 bg-[var(--primary)] text-white rounded-2xl font-black shadow-lg text-sm active:scale-95"
              >
                RECORD
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
