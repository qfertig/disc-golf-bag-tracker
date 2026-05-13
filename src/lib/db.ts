import { Capacitor } from '@capacitor/core';
import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';
import type { Database as SqlJsDatabase, SqlJsStatic, SqlValue } from 'sql.js';

type DbRow = Record<string, SqlValue>;

interface NativeDb {
  open(): Promise<void>;
  execute(sql: string): Promise<unknown>;
  query(sql: string, params?: SqlValue[]): Promise<{ values?: DbRow[] }>;
  run(sql: string, params?: SqlValue[]): Promise<unknown>;
}

interface CatalogDisc {
  id: string;
  name: string;
  brand?: string;
  category?: string;
  speed?: number | string;
  glide?: number | string;
  turn?: number | string;
  fade?: number | string;
  stability?: string;
}

const DB_NAME = 'discit_db';

// ─── Schema ─────────────────────────────────────────────────────────────────
const SCHEMA = `
  -- Core disc catalog (extended with pic, color, link, provenance)
  CREATE TABLE IF NOT EXISTS DiscCatalog (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    brand TEXT,
    category TEXT,
    speed INTEGER,
    glide INTEGER,
    turn INTEGER,
    fade INTEGER,
    stability TEXT,
    pic TEXT,
    color TEXT,
    background_color TEXT,
    link TEXT,
    name_slug TEXT,
    brand_slug TEXT,
    source_provenance TEXT DEFAULT 'discit'
  );

  CREATE TABLE IF NOT EXISTS Bags (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS BagDiscs (
    id TEXT PRIMARY KEY,
    bag_id TEXT NOT NULL,
    disc_id TEXT NOT NULL,
    plastic TEXT,
    weight TEXT,
    notes TEXT,
    FOREIGN KEY (bag_id) REFERENCES Bags(id),
    FOREIGN KEY (disc_id) REFERENCES DiscCatalog(id),
    UNIQUE(bag_id, disc_id)
  );

  CREATE TABLE IF NOT EXISTS Wishlist (
    id TEXT PRIMARY KEY,
    disc_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (disc_id) REFERENCES DiscCatalog(id),
    UNIQUE(disc_id)
  );

  CREATE TABLE IF NOT EXISTS Rounds (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    hole_count INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    players_json TEXT,
    course_id TEXT,
    weather_snapshot_id TEXT,
    daylight_snapshot_id TEXT,
    location_label TEXT
  );

  CREATE TABLE IF NOT EXISTS Scores (
    id TEXT PRIMARY KEY,
    round_id TEXT NOT NULL,
    player_id TEXT NOT NULL,
    hole_number INTEGER NOT NULL,
    par INTEGER NOT NULL,
    score INTEGER NOT NULL,
    FOREIGN KEY (round_id) REFERENCES Rounds(id),
    UNIQUE(round_id, player_id, hole_number)
  );

  CREATE TABLE IF NOT EXISTS Shots (
    id TEXT PRIMARY KEY,
    disc_name TEXT,
    disc_id TEXT,
    distance INTEGER,
    shape TEXT,
    lat REAL,
    lon REAL,
    location_label TEXT,
    created_at INTEGER NOT NULL
  );

  -- ── New tables for enrichment & portability ──────────────────────────────

  -- Cached weather responses from Open-Meteo
  CREATE TABLE IF NOT EXISTS WeatherSnapshots (
    id TEXT PRIMARY KEY,
    lat REAL NOT NULL,
    lon REAL NOT NULL,
    snapshot_type TEXT NOT NULL,
    data_json TEXT NOT NULL,
    fetched_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );

  -- Cached daylight data from SunriseSunset.io
  CREATE TABLE IF NOT EXISTS DaylightSnapshots (
    id TEXT PRIMARY KEY,
    lat REAL NOT NULL,
    lon REAL NOT NULL,
    date TEXT NOT NULL,
    data_json TEXT NOT NULL,
    fetched_at INTEGER NOT NULL,
    UNIQUE(date, lat, lon)
  );

  -- Cached Nominatim reverse geocoding results
  CREATE TABLE IF NOT EXISTS GeocodeCache (
    id TEXT PRIMARY KEY,
    lat_key TEXT NOT NULL,
    lon_key TEXT NOT NULL,
    display_name TEXT,
    city TEXT,
    state TEXT,
    country TEXT,
    raw_json TEXT,
    fetched_at INTEGER NOT NULL,
    UNIQUE(lat_key, lon_key)
  );

  -- Local course cache for offline use
  CREATE TABLE IF NOT EXISTS Courses (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    lat REAL,
    lon REAL,
    hole_count INTEGER,
    city TEXT,
    state TEXT,
    country TEXT,
    source TEXT DEFAULT 'user',
    source_id TEXT,
    raw_json TEXT,
    created_at INTEGER NOT NULL,
    last_used INTEGER
  );

  -- User-dropped location pins
  CREATE TABLE IF NOT EXISTS SavedLocations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    pin_type TEXT NOT NULL,
    lat REAL NOT NULL,
    lon REAL NOT NULL,
    location_label TEXT,
    course_id TEXT,
    notes TEXT,
    created_at INTEGER NOT NULL
  );

  -- Import audit log
  CREATE TABLE IF NOT EXISTS Imports (
    id TEXT PRIMARY KEY,
    import_type TEXT NOT NULL,
    source_format TEXT NOT NULL,
    total_records INTEGER,
    imported_records INTEGER,
    skipped_records INTEGER,
    errors_json TEXT,
    status TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  -- Export audit log
  CREATE TABLE IF NOT EXISTS Exports (
    id TEXT PRIMARY KEY,
    export_type TEXT NOT NULL,
    file_name TEXT,
    record_count INTEGER,
    categories_json TEXT,
    status TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  -- App settings key/value store
  CREATE TABLE IF NOT EXISTS AppSettings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );

  -- User-taken disc photos (persistent app storage, not temp camera URIs)
  CREATE TABLE IF NOT EXISTS DiscPhotos (
    id TEXT PRIMARY KEY,
    bag_disc_id TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_uri TEXT NOT NULL,
    thumb_uri TEXT,
    created_at INTEGER NOT NULL,
    UNIQUE(bag_disc_id)
  );

  -- Sync metadata for tracking last fetch times
  CREATE TABLE IF NOT EXISTS SyncMetadata (
    data_type TEXT PRIMARY KEY,
    last_synced_at INTEGER NOT NULL,
    record_count INTEGER,
    source TEXT
  );

  -- User-created custom courses (with optional cover photo)
  CREATE TABLE IF NOT EXISTS CustomCourses (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    hole_count INTEGER NOT NULL DEFAULT 18,
    city TEXT,
    notes TEXT,
    photo_uri TEXT,
    created_at INTEGER NOT NULL
  );

  -- Holes inside a custom course
  CREATE TABLE IF NOT EXISTS CustomCourseHoles (
    id TEXT PRIMARY KEY,
    course_id TEXT NOT NULL,
    hole_number INTEGER NOT NULL,
    par INTEGER NOT NULL DEFAULT 3,
    distance_ft INTEGER,
    notes TEXT,
    FOREIGN KEY (course_id) REFERENCES CustomCourses(id) ON DELETE CASCADE,
    UNIQUE(course_id, hole_number)
  );
`;

// ─── Safe migrations for existing tables ────────────────────────────────────
const MIGRATIONS = [
  // BagDiscs additions
  'ALTER TABLE BagDiscs ADD COLUMN plastic TEXT',
  'ALTER TABLE BagDiscs ADD COLUMN weight TEXT',
  'ALTER TABLE BagDiscs ADD COLUMN notes TEXT',
  // Rounds additions
  'ALTER TABLE Rounds ADD COLUMN players_json TEXT',
  'ALTER TABLE Rounds ADD COLUMN course_id TEXT',
  'ALTER TABLE Rounds ADD COLUMN weather_snapshot_id TEXT',
  'ALTER TABLE Rounds ADD COLUMN daylight_snapshot_id TEXT',
  'ALTER TABLE Rounds ADD COLUMN location_label TEXT',
  // Scores additions
  'ALTER TABLE Scores ADD COLUMN player_id TEXT',
  // Shots additions
  'ALTER TABLE Shots ADD COLUMN disc_id TEXT',
  'ALTER TABLE Shots ADD COLUMN lat REAL',
  'ALTER TABLE Shots ADD COLUMN lon REAL',
  'ALTER TABLE Shots ADD COLUMN location_label TEXT',
  // Shots — throw path sketcher additions
  'ALTER TABLE Shots ADD COLUMN path_json TEXT',
  'ALTER TABLE Shots ADD COLUMN throw_style TEXT',
  'ALTER TABLE Shots ADD COLUMN notes TEXT',
  // DiscCatalog additions
  'ALTER TABLE DiscCatalog ADD COLUMN pic TEXT',
  'ALTER TABLE DiscCatalog ADD COLUMN color TEXT',
  'ALTER TABLE DiscCatalog ADD COLUMN background_color TEXT',
  'ALTER TABLE DiscCatalog ADD COLUMN link TEXT',
  'ALTER TABLE DiscCatalog ADD COLUMN name_slug TEXT',
  'ALTER TABLE DiscCatalog ADD COLUMN brand_slug TEXT',
  'ALTER TABLE DiscCatalog ADD COLUMN source_provenance TEXT',
  // Shots — round linkage
  'ALTER TABLE Shots ADD COLUMN round_id TEXT',
  'ALTER TABLE Shots ADD COLUMN hole_number INTEGER',
];

let _sqlite: SQLiteConnection | null = null;
let _nativeDb: NativeDb | null = null;
let _sqlJs: SqlJsStatic | null = null;
let _webDb: SqlJsDatabase | null = null;

function isWeb(): boolean {
  return Capacitor.getPlatform() === 'web';
}

function loadWebDb(SQL: SqlJsStatic): SqlJsDatabase {
  const saved = localStorage.getItem('discit_db');
  if (saved) {
    const binaryStr = atob(saved);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    return new SQL.Database(bytes);
  }
  return new SQL.Database();
}

function persistWebDb() {
  if (!_webDb) return;
  const data = _webDb.export();
  const binary = new Uint8Array(data);
  let binaryStr = '';
  const chunkSize = 8192;
  for (let i = 0; i < binary.length; i += chunkSize) {
    const chunk = binary.subarray(i, i + chunkSize);
    binaryStr += String.fromCharCode(...chunk);
  }
  const base64 = btoa(binaryStr);
  localStorage.setItem('discit_db', base64);
}

export const initializeDB = async (onProgress: (step: string) => void): Promise<boolean> => {
  try {
    if (isWeb()) {
      onProgress('Loading SQLite engine...');
      const initSqlJs = (await import('sql.js')).default;
      _sqlJs = await initSqlJs({ locateFile: () => '/sql-wasm.wasm' });
      onProgress('Opening database...');
      _webDb = loadWebDb(_sqlJs);
      onProgress('Creating tables...');
      _webDb.run(SCHEMA);

      // Run all migrations silently — each may already exist
      for (const migration of MIGRATIONS) {
        try { _webDb.run(migration); } catch (_) {}
      }

      persistWebDb();
    } else {
      onProgress('Opening native database...');
      if (!_sqlite) _sqlite = new SQLiteConnection(CapacitorSQLite);
      const ret = await _sqlite.checkConnectionsConsistency();
      const isConn = (await _sqlite.isConnection(DB_NAME, false)).result;
      if (ret.result && isConn) {
        _nativeDb = await _sqlite.retrieveConnection(DB_NAME, false);
      } else {
        _nativeDb = await _sqlite.createConnection(DB_NAME, false, 'no-encryption', 1, false);
      }
      await _nativeDb.open();
      onProgress('Creating tables...');
      await _nativeDb.execute(SCHEMA);

      for (const migration of MIGRATIONS) {
        try { await _nativeDb.execute(migration); } catch (_) {}
      }
    }
    return true;
  } catch (error: unknown) {
    console.error('Failed to initialize DB:', error);
    throw new Error(error instanceof Error ? error.message : String(error));
  }
};

export const dbQuery = async <T extends object = DbRow>(sql: string, params: SqlValue[] = []): Promise<T[]> => {
  if (isWeb()) {
    if (!_webDb) throw new Error('Web database not initialized');
    const stmt = _webDb.prepare(sql);
    if (params.length > 0) stmt.bind(params);
    const rows: DbRow[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows as unknown as T[];
  } else {
    if (!_nativeDb) throw new Error('Native database not initialized');
    const res = await _nativeDb.query(sql, params);
    return (res.values || []) as unknown as T[];
  }
};

export const dbRun = async (sql: string, params: SqlValue[] = []): Promise<void> => {
  if (isWeb()) {
    if (!_webDb) throw new Error('Web database not initialized');
    _webDb.run(sql, params);
    persistWebDb();
  } else {
    if (!_nativeDb) throw new Error('Native database not initialized');
    await _nativeDb.run(sql, params);
  }
};

export const seedCatalog = async (onProgress: (step: string) => void, force = false): Promise<void> => {
  const countRes = await dbQuery<{ count: number | string | null }>('SELECT COUNT(*) as count FROM DiscCatalog');
  const currentCount = Number(countRes[0]?.count ?? 0);

  if (!force && currentCount > 5) {
    onProgress('Catalog already loaded');
    return;
  }

  onProgress('Fetching disc catalog from DiscIt API...');
  try {
    const response = await fetch('https://discit-api.fly.dev/disc');
    if (!response.ok) throw new Error(`API returned ${response.status}`);
    const discs = await response.json() as CatalogDisc[];

    if (force || currentCount <= 5) {
      await dbRun('DELETE FROM DiscCatalog WHERE id NOT IN (SELECT disc_id FROM BagDiscs) AND id NOT IN (SELECT disc_id FROM Wishlist)');
    }

    for (const disc of discs) {
      await dbRun(
        `INSERT OR IGNORE INTO DiscCatalog
          (id, name, brand, category, speed, glide, turn, fade, stability, pic, color, background_color, link, name_slug, brand_slug, source_provenance)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          disc.id, disc.name,
          disc.brand ?? null, disc.category ?? null,
          disc.speed ?? null, disc.glide ?? null, disc.turn ?? null, disc.fade ?? null,
          disc.stability ?? null,
          (disc as any).pic ?? null, (disc as any).color ?? null,
          (disc as any).background_color ?? null, (disc as any).link ?? null,
          (disc as any).name_slug ?? null, (disc as any).brand_slug ?? null,
          'discit',
        ]
      );
    }

    // Record sync metadata
    await dbRun(
      `INSERT OR REPLACE INTO SyncMetadata (data_type, last_synced_at, record_count, source)
       VALUES (?, ?, ?, ?)`,
      ['disc_catalog', Date.now(), discs.length, 'discit-api']
    );

    onProgress(`Successfully synced ${discs.length} discs`);
  } catch (err) {
    console.warn('Could not fetch disc catalog from DiscIt API, using fallback', err);
    if (currentCount === 0) {
      const fallback = [
        { id: '1', name: 'Destroyer', brand: 'Innova', category: 'Distance Driver', speed: 12, glide: 5, turn: -1, fade: 3, stability: 'Overstable' },
        { id: '2', name: 'Buzzz', brand: 'Discraft', category: 'Midrange', speed: 5, glide: 4, turn: -1, fade: 1, stability: 'Neutral' },
        { id: '3', name: 'Aviar', brand: 'Innova', category: 'Putter', speed: 2, glide: 3, turn: 0, fade: 1, stability: 'Neutral' },
        { id: '4', name: 'Scorch', brand: 'Discraft', category: 'Distance Driver', speed: 11, glide: 6, turn: -2, fade: 2, stability: 'Understable' },
        { id: '5', name: 'Zone', brand: 'Discraft', category: 'Approach Disc', speed: 4, glide: 3, turn: 0, fade: 3, stability: 'Overstable' },
      ];
      for (const disc of fallback) {
        await dbRun(
          `INSERT OR IGNORE INTO DiscCatalog (id, name, brand, category, speed, glide, turn, fade, stability, source_provenance)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [disc.id, disc.name, disc.brand, disc.category, disc.speed, disc.glide, disc.turn, disc.fade, disc.stability, 'fallback']
        );
      }
      onProgress('Loaded fallback discs');
    } else {
      onProgress('Offline: Using existing local catalog');
    }
  }
};

// ─── App Settings helpers ────────────────────────────────────────────────────
export const getSetting = async (key: string): Promise<string | null> => {
  const rows = await dbQuery<{ value: string }>('SELECT value FROM AppSettings WHERE key = ?', [key]);
  return rows[0]?.value ?? null;
};

export const setSetting = async (key: string, value: string): Promise<void> => {
  await dbRun(
    'INSERT OR REPLACE INTO AppSettings (key, value, updated_at) VALUES (?, ?, ?)',
    [key, value, Date.now()]
  );
};
