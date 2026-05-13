/**
 * Disc Photo Service
 *
 * Persists user-taken or library-chosen photos to app storage (Directory.Data),
 * NOT to temporary camera cache which can be cleared by the OS.
 *
 * Storage strategy:
 *   Native: @capacitor/filesystem Directory.Data → persistent across restarts
 *   Web: localStorage base64 fallback (dev/testing only)
 *
 * SQLite stores: { id, bag_disc_id, file_name, file_uri, width, height, created_at }
 * The file_uri is the persistent path, not the temporary camera result URI.
 */

import { Capacitor } from '@capacitor/core';
import { dbRun, dbQuery } from '@/lib/db';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DiscPhoto {
  id: string;
  bag_disc_id: string;
  file_name: string;
  file_uri: string;       // persistent app-storage path
  thumb_uri: string | null;
  created_at: number;
}

export type PhotoSource = 'camera' | 'library';

// ─── Save photo to persistent storage ────────────────────────────────────────

async function saveBase64ToFilesystem(base64: string, fileName: string): Promise<string> {
  const { Filesystem, Directory } = await import('@capacitor/filesystem');
  const result = await Filesystem.writeFile({
    path: `disc_photos/${fileName}`,
    data: base64,
    directory: Directory.Data,
    recursive: true,
  });
  return result.uri; // persistent file:// URI
}

async function readFileAsBase64(uri: string): Promise<string> {
  const { Filesystem } = await import('@capacitor/filesystem');
  const result = await Filesystem.readFile({ path: uri });
  return typeof result.data === 'string' ? result.data : '';
}

async function deleteFromFilesystem(uri: string): Promise<void> {
  try {
    const { Filesystem } = await import('@capacitor/filesystem');
    await Filesystem.deleteFile({ path: uri });
  } catch { /* file may already be gone */ }
}

// ─── Capture / Pick ───────────────────────────────────────────────────────────

export async function captureOrPickPhoto(source: PhotoSource): Promise<string | null> {
  try {
    const { Camera, CameraSource, CameraResultType } = await import('@capacitor/camera');

    const image = await Camera.getPhoto({
      source: source === 'camera' ? CameraSource.Camera : CameraSource.Photos,
      resultType: CameraResultType.Base64,
      quality: 72,
      width: 800,
      allowEditing: false,
      saveToGallery: false,
    });

    return image.base64String ?? null;
  } catch (err: unknown) {
    // User cancelled or permission denied — not an error worth surfacing
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes('cancel') || msg.toLowerCase().includes('denied')) return null;
    console.warn('[photos] captureOrPickPhoto error', err);
    return null;
  }
}

// ─── Save photo record ────────────────────────────────────────────────────────

export async function saveDiscPhoto(bagDiscId: string, base64: string): Promise<DiscPhoto | null> {
  try {
    const id = crypto.randomUUID();
    const fileName = `${bagDiscId}_${Date.now()}.jpg`;
    const now = Date.now();

    let fileUri: string;

    if (Capacitor.getPlatform() === 'web') {
      // Web fallback: store in localStorage (dev only)
      const key = `disc_photo_${id}`;
      localStorage.setItem(key, `data:image/jpeg;base64,${base64}`);
      fileUri = key; // use key as URI for web
    } else {
      fileUri = await saveBase64ToFilesystem(base64, fileName);
    }

    await dbRun(
      `INSERT OR REPLACE INTO DiscPhotos (id, bag_disc_id, file_name, file_uri, thumb_uri, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, bagDiscId, fileName, fileUri, null, now]
    );

    return { id, bag_disc_id: bagDiscId, file_name: fileName, file_uri: fileUri, thumb_uri: null, created_at: now };
  } catch (err) {
    console.error('[photos] saveDiscPhoto failed', err);
    return null;
  }
}

// ─── Load photo for display ───────────────────────────────────────────────────

export async function loadDiscPhoto(bagDiscId: string): Promise<string | null> {
  try {
    const rows = await dbQuery<DiscPhoto>(
      'SELECT * FROM DiscPhotos WHERE bag_disc_id = ? ORDER BY created_at DESC LIMIT 1',
      [bagDiscId]
    );
    if (!rows.length) return null;
    const photo = rows[0];

    if (Capacitor.getPlatform() === 'web') {
      return localStorage.getItem(photo.file_uri);
    }

    // Convert persistent file URI to displayable src
    // On native, Capacitor.convertFileSrc converts file:// to accessible http://localhost URL
    return Capacitor.convertFileSrc(photo.file_uri);
  } catch {
    return null;
  }
}

// ─── Get photo record ─────────────────────────────────────────────────────────

export async function getDiscPhotoRecord(bagDiscId: string): Promise<DiscPhoto | null> {
  const rows = await dbQuery<DiscPhoto>(
    'SELECT * FROM DiscPhotos WHERE bag_disc_id = ? ORDER BY created_at DESC LIMIT 1',
    [bagDiscId]
  );
  return rows[0] ?? null;
}

// ─── Delete photo ─────────────────────────────────────────────────────────────

export async function deleteDiscPhoto(bagDiscId: string): Promise<void> {
  try {
    const record = await getDiscPhotoRecord(bagDiscId);
    if (!record) return;

    if (Capacitor.getPlatform() === 'web') {
      localStorage.removeItem(record.file_uri);
    } else {
      await deleteFromFilesystem(record.file_uri);
    }

    await dbRun('DELETE FROM DiscPhotos WHERE bag_disc_id = ?', [bagDiscId]);
  } catch (err) {
    console.warn('[photos] deleteDiscPhoto failed', err);
  }
}

// ─── Export: get all photos as base64 map (for backup) ───────────────────────

export async function exportAllPhotosAsBase64(): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  try {
    const rows = await dbQuery<DiscPhoto>('SELECT * FROM DiscPhotos');
    for (const photo of rows) {
      try {
        let b64: string;
        if (Capacitor.getPlatform() === 'web') {
          const stored = localStorage.getItem(photo.file_uri) ?? '';
          b64 = stored.replace(/^data:image\/[^;]+;base64,/, '');
        } else {
          b64 = await readFileAsBase64(photo.file_uri);
        }
        result[photo.id] = b64;
      } catch { /* skip unreadable files */ }
    }
  } catch (err) {
    console.warn('[photos] exportAllPhotosAsBase64 failed', err);
  }
  return result;
}

// ─── Import: restore photos from base64 map ──────────────────────────────────

export async function restorePhotosFromBase64(
  photoRecords: DiscPhoto[],
  base64Map: Record<string, string>
): Promise<void> {
  for (const record of photoRecords) {
    const b64 = base64Map[record.id];
    if (!b64) continue;
    try {
      // Always re-save to local filesystem — do NOT trust the old file_uri path
      const newFileName = `restored_${record.bag_disc_id}_${Date.now()}.jpg`;
      let newUri: string;

      if (Capacitor.getPlatform() === 'web') {
        const key = `disc_photo_${record.id}`;
        localStorage.setItem(key, `data:image/jpeg;base64,${b64}`);
        newUri = key;
      } else {
        newUri = await saveBase64ToFilesystem(b64, newFileName);
      }

      await dbRun(
        `INSERT OR REPLACE INTO DiscPhotos (id, bag_disc_id, file_name, file_uri, thumb_uri, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [record.id, record.bag_disc_id, newFileName, newUri, null, record.created_at]
      );
    } catch (err) {
      console.warn('[photos] restorePhotosFromBase64 failed for', record.id, err);
    }
  }
}
