import { dbQuery, dbRun } from './db';
import { Capacitor } from '@capacitor/core';

export const exportBags = async (): Promise<boolean> => {
  try {
    const bags = await dbQuery('SELECT * FROM Bags');
    const bagDiscs = await dbQuery('SELECT * FROM BagDiscs');
    const exportData = JSON.stringify({ version: 1, bags, bagDiscs });
    const fileName = `discit-export-${Date.now()}.json`;

    if (Capacitor.getPlatform() !== 'web') {
      const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
      const { Share } = await import('@capacitor/share');
      const result = await Filesystem.writeFile({ path: fileName, data: exportData, directory: Directory.Cache, encoding: Encoding.UTF8 });
      await Share.share({ title: 'DiscIt Bags Export', url: result.uri, dialogTitle: 'Share Bag Data' });
    } else {
      const blob = new Blob([exportData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    }
    return true;
  } catch (err) {
    console.error('Export error', err);
    return false;
  }
};

export const importBags = async (jsonString: string): Promise<boolean> => {
  try {
    const data = JSON.parse(jsonString);
    if (!data.version || !data.bags || !data.bagDiscs) throw new Error('Invalid schema');

    const idMap: Record<string, string> = {};

    for (const b of data.bags) {
      const newId = crypto.randomUUID();
      idMap[b.id] = newId;
      await dbRun('INSERT INTO Bags (id, name, created_at) VALUES (?, ?, ?)', [newId, `${b.name} (Imported)`, Date.now()]);
    }

    for (const bd of data.bagDiscs) {
      if (idMap[bd.bag_id]) {
        await dbRun('INSERT OR IGNORE INTO BagDiscs (id, bag_id, disc_id) VALUES (?, ?, ?)', [crypto.randomUUID(), idMap[bd.bag_id], bd.disc_id]);
      }
    }
    return true;
  } catch (err) {
    console.error('Import error', err);
    return false;
  }
};

/**
 * Packs a single bag into a URL-safe string.
 * Format: name|discId1,discId2,discId3
 */
export const packBagForSharing = async (bagId: string, bagName: string): Promise<string> => {
  const discs = await dbQuery<{ disc_id: string }>(
    'SELECT disc_id FROM BagDiscs WHERE bag_id = ?',
    [bagId]
  );
  const discIds = discs.map(d => d.disc_id).join(',');
  const raw = `${bagName}|${discIds}`;
  return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
};

/**
 * Unpacks a bag from a shared string and saves it.
 */
export const unpackSharedBag = async (packed: string): Promise<string | null> => {
  try {
    const base64 = packed.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = atob(base64);
    const [name, discIdsRaw] = decoded.split('|');
    const discIds = discIdsRaw.split(',').filter(Boolean);

    if (!name || discIds.length === 0) return null;

    const newBagId = crypto.randomUUID();
    await dbRun('INSERT INTO Bags (id, name, created_at) VALUES (?, ?, ?)', [newBagId, `${name} (Shared)`, Date.now()]);

    for (const dId of discIds) {
      await dbRun(
        'INSERT OR IGNORE INTO BagDiscs (id, bag_id, disc_id) VALUES (?, ?, ?)',
        [crypto.randomUUID(), newBagId, dId]
      );
    }
    return newBagId;
  } catch (err) {
    console.error('Failed to unpack bag:', err);
    return null;
  }
};
