'use client';

import { useState, useEffect } from 'react';
import { MapPin, Plus, Trash2, Navigation } from 'lucide-react';
import { dbQuery, dbRun } from '@/lib/db';
import { reverseGeocode, shortLocation } from '@/lib/services/geocoding';
import { Geolocation } from '@capacitor/geolocation';

interface SavedPin {
  id: string;
  name: string;
  pin_type: string;
  lat: number;
  lon: number;
  location_label: string | null;
  notes: string | null;
  created_at: number;
}

const PIN_TYPES = [
  { value: 'tee', label: 'Tee', emoji: '🏌️' },
  { value: 'basket', label: 'Basket', emoji: '🎯' },
  { value: 'practice', label: 'Practice Spot', emoji: '⭕' },
  { value: 'start', label: 'Throw Start', emoji: '📍' },
];

export default function CourseCache() {
  const [pins, setPins] = useState<SavedPin[]>([]);
  const [adding, setAdding] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('tee');
  const [newLat, setNewLat] = useState<number | null>(null);
  const [newLon, setNewLon] = useState<number | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);

  const loadPins = async () => {
    const rows = await dbQuery<SavedPin>('SELECT * FROM SavedLocations ORDER BY created_at DESC');
    setPins(rows);
  };

  useEffect(() => { loadPins(); }, []);

  const getGPS = async () => {
    setGpsLoading(true);
    setGpsError(null);
    try {
      const perm = await Geolocation.requestPermissions();
      if (perm.location !== 'granted') {
        setGpsError('Location permission denied');
        setGpsLoading(false);
        return;
      }
      const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000 });
      setNewLat(pos.coords.latitude);
      setNewLon(pos.coords.longitude);
    } catch {
      setGpsError('Could not get GPS location');
    } finally {
      setGpsLoading(false);
    }
  };

  const savePin = async () => {
    if (!newName.trim() || newLat == null || newLon == null) return;

    const id = crypto.randomUUID();
    let locationLabel: string | null = null;
    try {
      // Opportunistic reverse geocoding — never blocks the save
      const label = await reverseGeocode(newLat, newLon);
      locationLabel = shortLocation(label);
    } catch { /* ignore */ }

    await dbRun(
      `INSERT INTO SavedLocations (id, name, pin_type, lat, lon, location_label, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, newName.trim(), newType, newLat, newLon, locationLabel, null, Date.now()]
    );

    setAdding(false);
    setNewName('');
    setNewLat(null);
    setNewLon(null);
    setNewType('tee');
    loadPins();
  };

  const deletePin = async (id: string) => {
    await dbRun('DELETE FROM SavedLocations WHERE id = ?', [id]);
    loadPins();
  };

  const pinTypeConfig = Object.fromEntries(PIN_TYPES.map(p => [p.value, p]));

  return (
    <div className="flex flex-col gap-4 fade-up pb-4">
      <div className="flex items-center justify-between mb-1">
        <div>
          <h2 className="text-2xl font-black tracking-tighter text-[var(--text-primary)]">Course Pins</h2>
          <p className="text-[var(--text-muted)] text-sm">Saved locations &amp; spots</p>
        </div>
        <button
          onClick={() => setAdding(v => !v)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--primary)] text-white text-xs font-bold shadow-lg active:scale-95 transition-all"
        >
          <Plus size={14} />
          Drop Pin
        </button>
      </div>

      {/* Add pin form */}
      {adding && (
        <div className="card !p-4 flex flex-col gap-3 bg-[var(--surface-1)] border-[var(--primary)]/30">
          <p className="text-xs font-black text-[var(--text-muted)] uppercase tracking-widest">New Location Pin</p>
          
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Pin name (e.g. Hole 7 tee)"
            className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--primary)] transition-colors"
          />

          <div className="flex gap-2 flex-wrap">
            {PIN_TYPES.map(pt => (
              <button
                key={pt.value}
                onClick={() => setNewType(pt.value)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all ${newType === pt.value ? 'bg-[var(--primary)] text-white' : 'bg-[var(--surface-2)] text-[var(--text-muted)]'}`}
              >
                {pt.emoji} {pt.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={getGPS}
              disabled={gpsLoading}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--surface-2)] text-[var(--text-muted)] text-xs font-bold active:scale-95 transition-all disabled:opacity-50"
            >
              <Navigation size={13} />
              {gpsLoading ? 'Getting GPS...' : 'Use Current GPS'}
            </button>
            {newLat != null && newLon != null && (
              <span className="text-[11px] text-green-400 font-semibold">
                📍 {newLat.toFixed(4)}, {newLon.toFixed(4)}
              </span>
            )}
          </div>

          {gpsError && <p className="text-xs text-red-400">{gpsError}</p>}

          <div className="flex gap-2">
            <button
              onClick={() => setAdding(false)}
              className="flex-1 py-2 rounded-xl bg-[var(--surface-2)] text-[var(--text-muted)] text-sm font-bold active:scale-95 transition-all"
            >
              Cancel
            </button>
            <button
              onClick={savePin}
              disabled={!newName.trim() || newLat == null}
              className="flex-1 py-2 rounded-xl bg-[var(--primary)] text-white text-sm font-bold shadow-md active:scale-95 transition-all disabled:opacity-40"
            >
              Save Pin
            </button>
          </div>
        </div>
      )}

      {/* Pin list */}
      {pins.length === 0 && !adding ? (
        <div className="flex flex-col items-center gap-3 py-12 text-[var(--text-muted)]">
          <MapPin size={36} className="opacity-20" />
          <p className="text-sm font-semibold">No saved pins yet</p>
          <p className="text-xs opacity-70 text-center px-6">Drop pins for tee boxes, baskets, and favorite practice spots. They work offline!</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {pins.map(pin => {
            const ptConf = pinTypeConfig[pin.pin_type];
            return (
              <div key={pin.id} className="card !p-3 flex items-center gap-3 bg-[var(--surface-1)]">
                <div className="w-9 h-9 rounded-xl bg-[var(--surface-2)] flex items-center justify-center text-lg shrink-0">
                  {ptConf?.emoji ?? '📍'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-[var(--text-primary)] truncate">{pin.name}</p>
                  <p className="text-[11px] text-[var(--text-muted)] truncate">
                    {pin.location_label ?? `${pin.lat.toFixed(4)}, ${pin.lon.toFixed(4)}`}
                  </p>
                  <p className="text-[10px] text-[var(--text-muted)] opacity-60 uppercase tracking-wider">
                    {ptConf?.label ?? pin.pin_type}
                  </p>
                </div>
                <button
                  onClick={() => deletePin(pin.id)}
                  className="p-2 rounded-xl text-[var(--text-muted)] hover:text-red-400 hover:bg-red-400/10 active:scale-90 transition-all"
                  aria-label="Delete pin"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[11px] text-[var(--text-muted)] opacity-50 text-center">
        Pins are stored locally and work fully offline. Location names are resolved when you have a connection.
      </p>
    </div>
  );
}
