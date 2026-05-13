/**
 * Full Backup / Restore Export System
 *
 * Separate from QR bag sharing (which is lightweight + social).
 * This handles file-based, full-history, migration-safe data portability.
 *
 * Export schema is versioned for long-term backward compatibility.
 * Schema version history:
 *   v1 — bags + bagDiscs only (legacy)
 *   v2 — full user data (current)
 */

import { dbQuery, dbRun } from '@/lib/db';
import { Capacitor } from '@capacitor/core';
import type { DiscPhoto } from '@/lib/services/photos';
import { exportAllPhotosAsBase64, restorePhotosFromBase64 } from '@/lib/services/photos';

// ─── Types ────────────────────────────────────────────────────────────────────

export const BACKUP_SCHEMA_VERSION = 3; // v3 adds photos

export type ExportCategory =
  | 'bags'
  | 'discs'
  | 'wishlist'
  | 'rounds'
  | 'shots'
  | 'locations'
  | 'settings'
  | 'photos';

export const ALL_CATEGORIES: ExportCategory[] = [
  'bags', 'discs', 'wishlist', 'rounds', 'shots', 'locations', 'settings', 'photos',
];

export interface BackupManifest {
  schema_version: number;
  app_version: string;
  exported_at: string;
  categories: ExportCategory[];
  record_counts: Record<string, number>;
  platform: string;
}

export interface BackupPayload {
  manifest: BackupManifest;
  bags?: object[];
  bag_discs?: object[];
  custom_discs?: object[];
  wishlist?: object[];
  rounds?: object[];
  scores?: object[];
  shots?: object[];
  saved_locations?: object[];
  settings?: object[];
  // Photos: array of DiscPhoto records + base64 map (id → base64 string)
  disc_photo_records?: DiscPhoto[];
  disc_photo_data?: Record<string, string>;
}

export interface RestoreResult {
  success: boolean;
  imported_counts: Record<string, number>;
  skipped_counts: Record<string, number>;
  errors: string[];
}

// ─── Single bag export (for QR/share — unchanged from legacy) ─────────────────

export async function exportBag(bagId: string, bagName: string): Promise<string> {
  const discs = await dbQuery<{ disc_id: string }>('SELECT disc_id FROM BagDiscs WHERE bag_id = ?', [bagId]);
  const discIds = discs.map(d => d.disc_id).join(',');
  const raw = `${bagName}|${discIds}`;
  return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// ─── Full / selective export ──────────────────────────────────────────────────

export async function buildBackupPayload(categories: ExportCategory[]): Promise<BackupPayload> {
  const payload: BackupPayload = {
    manifest: {
      schema_version: BACKUP_SCHEMA_VERSION,
      app_version: '1.2.0',
      exported_at: new Date().toISOString(),
      categories,
      record_counts: {},
      platform: Capacitor.getPlatform(),
    },
  };

  if (categories.includes('bags')) {
    const bags = await dbQuery('SELECT * FROM Bags');
    const bagDiscs = await dbQuery('SELECT * FROM BagDiscs');
    payload.bags = bags;
    payload.bag_discs = bagDiscs;
    payload.manifest.record_counts.bags = bags.length;
    payload.manifest.record_counts.bag_discs = bagDiscs.length;
  }

  if (categories.includes('discs')) {
    const discs = await dbQuery(
      "SELECT * FROM DiscCatalog WHERE source_provenance IN ('user', 'import', 'custom')"
    );
    payload.custom_discs = discs;
    payload.manifest.record_counts.custom_discs = discs.length;
  }

  if (categories.includes('wishlist')) {
    const wishlist = await dbQuery('SELECT * FROM Wishlist');
    payload.wishlist = wishlist;
    payload.manifest.record_counts.wishlist = wishlist.length;
  }

  if (categories.includes('rounds')) {
    const rounds = await dbQuery('SELECT * FROM Rounds');
    const scores = await dbQuery('SELECT * FROM Scores');
    payload.rounds = rounds;
    payload.scores = scores;
    payload.manifest.record_counts.rounds = rounds.length;
    payload.manifest.record_counts.scores = scores.length;
  }

  if (categories.includes('shots')) {
    const shots = await dbQuery('SELECT * FROM Shots');
    payload.shots = shots;
    payload.manifest.record_counts.shots = shots.length;
  }

  if (categories.includes('locations')) {
    const locations = await dbQuery('SELECT * FROM SavedLocations');
    payload.saved_locations = locations;
    payload.manifest.record_counts.saved_locations = locations.length;
  }

  if (categories.includes('settings')) {
    const settings = await dbQuery('SELECT * FROM AppSettings');
    payload.settings = settings;
    payload.manifest.record_counts.settings = settings.length;
  }

  if (categories.includes('photos')) {
    const photoRecords = await dbQuery<DiscPhoto>('SELECT * FROM DiscPhotos');
    const photoData = await exportAllPhotosAsBase64();
    payload.disc_photo_records = photoRecords;
    payload.disc_photo_data = photoData;
    payload.manifest.record_counts.disc_photos = photoRecords.length;
  }

  return payload;
}

export async function downloadBackup(categories: ExportCategory[]): Promise<boolean> {
  try {
    const payload = await buildBackupPayload(categories);
    const json = JSON.stringify(payload, null, 2);
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const fileName = `bagtracker-backup-${ts}.json`;

    if (Capacitor.getPlatform() !== 'web') {
      const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
      const { Share } = await import('@capacitor/share');
      const result = await Filesystem.writeFile({ path: fileName, data: json, directory: Directory.Cache, encoding: Encoding.UTF8 });
      await Share.share({ title: 'BagTracker Backup', url: result.uri, dialogTitle: 'Save Backup File' });
    } else {
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    // Log export
    await dbRun(
      `INSERT INTO Exports (id, export_type, file_name, record_count, categories_json, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        crypto.randomUUID(),
        categories.length === ALL_CATEGORIES.length ? 'full' : 'selective',
        fileName,
        Object.values(payload.manifest.record_counts).reduce((a, b) => a + b, 0),
        JSON.stringify(categories),
        'success',
        Date.now(),
      ]
    );

    // Persist last backup timestamp to durable Preferences (survives updates/reboots)
    try {
      const { Preferences } = await import('@capacitor/preferences');
      await Preferences.set({ key: 'lastBackupAt', value: String(Date.now()) });
    } catch { /* Preferences unavailable in some environments */ }

    return true;
  } catch (err) {
    console.error('[backup] Export failed', err);
    return false;
  }
}

// ─── Restore ──────────────────────────────────────────────────────────────────

export function validateBackupPayload(raw: unknown): { valid: boolean; errors: string[]; payload?: BackupPayload } {
  const errors: string[] = [];

  if (typeof raw !== 'object' || raw === null) {
    return { valid: false, errors: ['Invalid JSON structure'] };
  }

  const p = raw as Record<string, unknown>;

  if (!p.manifest) {
    errors.push('Missing manifest block');
  } else {
    const m = p.manifest as Record<string, unknown>;
    if (typeof m.schema_version !== 'number') errors.push('Missing schema_version in manifest');
    if (typeof m.exported_at !== 'string') errors.push('Missing exported_at in manifest');
    if (!Array.isArray(m.categories)) errors.push('Missing categories in manifest');
  }

  return {
    valid: errors.length === 0,
    errors,
    payload: errors.length === 0 ? (raw as BackupPayload) : undefined,
  };
}

export async function restoreFromBackup(
  payload: BackupPayload,
  mode: 'merge' | 'restore'
): Promise<RestoreResult> {
  const result: RestoreResult = {
    success: false,
    imported_counts: {},
    skipped_counts: {},
    errors: [],
  };

  // sv() casts unknown → SqlValue for dbRun params from deserialized JSON
  const sv = (v: unknown): string | number | null => {
    if (v === undefined || v === null) return null;
    if (typeof v === 'string' || typeof v === 'number') return v;
    return String(v);
  };

  try {
    // Restore bags
    if (payload.bags?.length) {
      let imp = 0, skip = 0;
      for (const bag of payload.bags as Record<string, unknown>[]) {
        try {
          if (mode === 'restore') {
            await dbRun(
              'INSERT OR REPLACE INTO Bags (id, name, created_at) VALUES (?, ?, ?)',
              [sv(bag.id), sv(bag.name), sv(bag.created_at)]
            );
          } else {
            await dbRun(
              'INSERT OR IGNORE INTO Bags (id, name, created_at) VALUES (?, ?, ?)',
              [sv(bag.id), sv(bag.name), sv(bag.created_at)]
            );
          }
          imp++;
        } catch { skip++; }
      }
      result.imported_counts.bags = imp;
      result.skipped_counts.bags = skip;
    }

    // Restore bag discs
    if (payload.bag_discs?.length) {
      let imp = 0, skip = 0;
      for (const bd of payload.bag_discs as Record<string, unknown>[]) {
        try {
          await dbRun(
            'INSERT OR IGNORE INTO BagDiscs (id, bag_id, disc_id, plastic, weight, notes) VALUES (?, ?, ?, ?, ?, ?)',
            [sv(bd.id), sv(bd.bag_id), sv(bd.disc_id), sv(bd.plastic) ?? null, sv(bd.weight) ?? null, sv(bd.notes) ?? null]
          );
          imp++;
        } catch { skip++; }
      }
      result.imported_counts.bag_discs = imp;
      result.skipped_counts.bag_discs = skip;
    }

    // Restore custom discs
    if (payload.custom_discs?.length) {
      let imp = 0, skip = 0;
      for (const disc of payload.custom_discs as Record<string, unknown>[]) {
        try {
          await dbRun(
            `INSERT OR IGNORE INTO DiscCatalog
               (id, name, brand, category, speed, glide, turn, fade, stability, source_provenance)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [sv(disc.id), sv(disc.name), sv(disc.brand), sv(disc.category),
             sv(disc.speed), sv(disc.glide), sv(disc.turn), sv(disc.fade), sv(disc.stability), 'import']
          );
          imp++;
        } catch { skip++; }
      }
      result.imported_counts.custom_discs = imp;
      result.skipped_counts.custom_discs = skip;
    }

    // Restore rounds
    if (payload.rounds?.length) {
      let imp = 0, skip = 0;
      for (const round of payload.rounds as Record<string, unknown>[]) {
        try {
          await dbRun(
            `INSERT OR IGNORE INTO Rounds (id, name, hole_count, created_at, players_json, course_id, location_label)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [sv(round.id), sv(round.name), sv(round.hole_count), sv(round.created_at),
             sv(round.players_json) ?? null, sv(round.course_id) ?? null, sv(round.location_label) ?? null]
          );
          imp++;
        } catch { skip++; }
      }
      result.imported_counts.rounds = imp;
      result.skipped_counts.rounds = skip;
    }

    // Restore scores
    if (payload.scores?.length) {
      let imp = 0, skip = 0;
      for (const score of payload.scores as Record<string, unknown>[]) {
        try {
          await dbRun(
            'INSERT OR IGNORE INTO Scores (id, round_id, player_id, hole_number, par, score) VALUES (?, ?, ?, ?, ?, ?)',
            [sv(score.id), sv(score.round_id), sv(score.player_id) ?? 'player_1', sv(score.hole_number), sv(score.par), sv(score.score)]
          );
          imp++;
        } catch { skip++; }
      }
      result.imported_counts.scores = imp;
      result.skipped_counts.scores = skip;
    }

    // Restore shots
    if (payload.shots?.length) {
      let imp = 0, skip = 0;
      for (const shot of payload.shots as Record<string, unknown>[]) {
        try {
          await dbRun(
            `INSERT OR IGNORE INTO Shots (id, disc_name, disc_id, distance, shape, lat, lon, location_label, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [sv(shot.id), sv(shot.disc_name) ?? null, sv(shot.disc_id) ?? null, sv(shot.distance), sv(shot.shape) ?? null,
             sv(shot.lat) ?? null, sv(shot.lon) ?? null, sv(shot.location_label) ?? null, sv(shot.created_at)]
          );
          imp++;
        } catch { skip++; }
      }
      result.imported_counts.shots = imp;
      result.skipped_counts.shots = skip;
    }

    // Restore locations
    if (payload.saved_locations?.length) {
      let imp = 0, skip = 0;
      for (const loc of payload.saved_locations as Record<string, unknown>[]) {
        try {
          await dbRun(
            `INSERT OR IGNORE INTO SavedLocations (id, name, pin_type, lat, lon, location_label, notes, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [sv(loc.id), sv(loc.name), sv(loc.pin_type), sv(loc.lat), sv(loc.lon),
             sv(loc.location_label) ?? null, sv(loc.notes) ?? null, sv(loc.created_at)]
          );
          imp++;
        } catch { skip++; }
      }
      result.imported_counts.saved_locations = imp;
      result.skipped_counts.saved_locations = skip;
    }

    // Restore settings (only in restore mode — don't overwrite user settings in merge)
    if (mode === 'restore' && payload.settings?.length) {
      let imp = 0;
      for (const setting of payload.settings as Record<string, unknown>[]) {
        try {
          await dbRun(
            'INSERT OR IGNORE INTO AppSettings (key, value, updated_at) VALUES (?, ?, ?)',
            [sv(setting.key), sv(setting.value), sv(setting.updated_at) ?? Date.now()]
          );
          imp++;
        } catch { /* skip */ }
      }
      result.imported_counts.settings = imp;
    }

    // Restore disc photos — always re-save to local storage, never trust old URIs
    if (payload.disc_photo_records?.length && payload.disc_photo_data) {
      await restorePhotosFromBase64(payload.disc_photo_records, payload.disc_photo_data);
      result.imported_counts.disc_photos = payload.disc_photo_records.length;
    }

    // Log import
    const totalImported = Object.values(result.imported_counts).reduce((a, b) => a + b, 0);
    await dbRun(
      `INSERT INTO Imports (id, import_type, source_format, total_records, imported_records, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [crypto.randomUUID(), mode, 'json_backup', 0, totalImported, 'success', Date.now()]
    );

    result.success = true;
  } catch (err) {
    console.error('[backup] Restore failed', err);
    result.errors.push(err instanceof Error ? err.message : 'Unknown restore error');
  }

  return result;
}

// ─── Read backup file ─────────────────────────────────────────────────────────

export async function readBackupFile(): Promise<{ json: string; fileName: string } | null> {
  if (Capacitor.getPlatform() !== 'web') {
    try {
      const { FilePicker } = await import('@capawesome/capacitor-file-picker');
      const result = await FilePicker.pickFiles({ types: ['application/json'], limit: 1 });
      const file = result.files[0];
      if (!file || !file.data) return null;
      return { json: atob(file.data), fileName: file.name ?? 'backup.json' };
    } catch {
      return null;
    }
  } else {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) { resolve(null); return; }
        const text = await file.text();
        resolve({ json: text, fileName: file.name });
      };
      document.body.appendChild(input);
      input.click();
      document.body.removeChild(input);
    });
  }
}

export async function readImportFile(): Promise<{ content: string; fileName: string; format: 'csv' | 'json' } | null> {
  if (Capacitor.getPlatform() !== 'web') {
    try {
      const { FilePicker } = await import('@capawesome/capacitor-file-picker');
      const result = await FilePicker.pickFiles({ types: ['text/csv', 'application/json'], limit: 1 });
      const file = result.files[0];
      if (!file || !file.data) return null;
      const ext = (file.name ?? '').toLowerCase().endsWith('.csv') ? 'csv' : 'json';
      return { content: atob(file.data), fileName: file.name ?? 'import', format: ext };
    } catch {
      return null;
    }
  } else {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.csv,.json,text/csv,application/json';
      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) { resolve(null); return; }
        const text = await file.text();
        const format = file.name.toLowerCase().endsWith('.csv') ? 'csv' : 'json';
        resolve({ content: text, fileName: file.name, format });
      };
      document.body.appendChild(input);
      input.click();
      document.body.removeChild(input);
    });
  }
}
