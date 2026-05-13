/**
 * CSV Parser for disc import
 *
 * Supports manual field mapping, duplicate detection, and preview before commit.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ParsedRow {
  [key: string]: string;
}

export interface DiscImportRow {
  name: string;
  brand: string | null;
  plastic: string | null;
  weight: string | null;
  speed: number | null;
  glide: number | null;
  turn: number | null;
  fade: number | null;
  notes: string | null;
  status: 'in_bag' | 'wishlist' | null;
}

export type FieldMap = {
  name: string;
  brand?: string;
  plastic?: string;
  weight?: string;
  speed?: string;
  glide?: string;
  turn?: string;
  fade?: string;
  notes?: string;
  status?: string;
};

export type DuplicateMatch = 'exact' | 'probable' | 'new';

export interface ImportRowResult {
  raw: ParsedRow;
  mapped: DiscImportRow | null;
  duplicate: DuplicateMatch;
  error?: string;
}

export interface ImportPreview {
  headers: string[];
  rows: ImportRowResult[];
  total: number;
  valid_count: number;
  exact_duplicate_count: number;
  probable_duplicate_count: number;
  new_count: number;
  parse_errors: number;
}

// ─── CSV tokenizer ────────────────────────────────────────────────────────────

export function parseCSV(raw: string): ParsedRow[] {
  const lines = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  if (lines.length < 2) return [];

  // Parse headers
  const headers = tokenizeLine(lines[0]);

  const rows: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = tokenizeLine(line);
    const row: ParsedRow = {};
    headers.forEach((h, idx) => {
      row[h.trim()] = (values[idx] ?? '').trim();
    });
    rows.push(row);
  }
  return rows;
}

function tokenizeLine(line: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inQuote = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuote = !inQuote;
      }
    } else if (ch === ',' && !inQuote) {
      tokens.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  tokens.push(current);
  return tokens;
}

// ─── Field mapping ────────────────────────────────────────────────────────────

function safeFloat(v: string | undefined): number | null {
  if (!v || v.trim() === '') return null;
  const n = parseFloat(v.replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? null : n;
}

export function mapFields(rows: ParsedRow[], fieldMap: FieldMap): DiscImportRow[] {
  return rows.map(row => ({
    name: row[fieldMap.name]?.trim() ?? '',
    brand: fieldMap.brand ? (row[fieldMap.brand]?.trim() || null) : null,
    plastic: fieldMap.plastic ? (row[fieldMap.plastic]?.trim() || null) : null,
    weight: fieldMap.weight ? (row[fieldMap.weight]?.trim() || null) : null,
    speed: fieldMap.speed ? safeFloat(row[fieldMap.speed]) : null,
    glide: fieldMap.glide ? safeFloat(row[fieldMap.glide]) : null,
    turn: fieldMap.turn ? safeFloat(row[fieldMap.turn]) : null,
    fade: fieldMap.fade ? safeFloat(row[fieldMap.fade]) : null,
    notes: fieldMap.notes ? (row[fieldMap.notes]?.trim() || null) : null,
    status: fieldMap.status
      ? (row[fieldMap.status]?.toLowerCase().includes('wish') ? 'wishlist' : 'in_bag')
      : null,
  }));
}

// ─── Duplicate detection ──────────────────────────────────────────────────────

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
}

function stringSimilarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1;
  if (!na || !nb) return 0;

  // Simple Jaccard similarity on character bigrams
  function bigrams(s: string): Set<string> {
    const set = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
    return set;
  }

  const ba = bigrams(na);
  const bb = bigrams(nb);
  let intersection = 0;
  for (const bg of ba) { if (bb.has(bg)) intersection++; }
  const union = ba.size + bb.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export interface ExistingDisc {
  name: string;
  brand: string | null;
}

export function detectDuplicate(
  incoming: DiscImportRow,
  existing: ExistingDisc[]
): DuplicateMatch {
  const inName = normalize(incoming.name);
  const inBrand = normalize(incoming.brand ?? '');

  for (const ex of existing) {
    const exName = normalize(ex.name);
    const exBrand = normalize(ex.brand ?? '');

    // Exact match: same name + brand
    if (inName === exName && (inBrand === exBrand || !inBrand || !exBrand)) {
      return 'exact';
    }

    // Probable match: high name similarity + same brand
    const nameSim = stringSimilarity(inName, exName);
    if (nameSim >= 0.85 && (inBrand === exBrand || !inBrand || !exBrand)) {
      return 'probable';
    }
  }
  return 'new';
}

// ─── Full validation ──────────────────────────────────────────────────────────

export function validateImportBatch(
  rows: ParsedRow[],
  fieldMap: FieldMap,
  existingDiscs: ExistingDisc[]
): ImportPreview {
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  const mapped = mapFields(rows, fieldMap);
  const results: ImportRowResult[] = [];

  let valid = 0, exact = 0, probable = 0, newCount = 0, errors = 0;

  for (let i = 0; i < rows.length; i++) {
    const m = mapped[i];
    if (!m.name) {
      results.push({ raw: rows[i], mapped: null, duplicate: 'new', error: 'Missing disc name' });
      errors++;
      continue;
    }

    const dup = detectDuplicate(m, existingDiscs);
    results.push({ raw: rows[i], mapped: m, duplicate: dup });
    valid++;
    if (dup === 'exact') exact++;
    else if (dup === 'probable') probable++;
    else newCount++;
  }

  return {
    headers,
    rows: results,
    total: rows.length,
    valid_count: valid,
    exact_duplicate_count: exact,
    probable_duplicate_count: probable,
    new_count: newCount,
    parse_errors: errors,
  };
}

// ─── Auto field map detection ─────────────────────────────────────────────────
// Try to intelligently guess which CSV columns map to which disc fields

export function autoDetectFieldMap(headers: string[]): Partial<FieldMap> {
  const map: Partial<FieldMap> = {};
  const lower = headers.map(h => h.toLowerCase().trim());

  const find = (patterns: string[]): string | undefined => {
    for (const p of patterns) {
      const idx = lower.findIndex(h => h.includes(p));
      if (idx >= 0) return headers[idx];
    }
    return undefined;
  };

  map.name = find(['disc name', 'name', 'mold']) ?? headers[0];
  map.brand = find(['brand', 'manufacturer', 'company', 'maker']);
  map.plastic = find(['plastic', 'material', 'blend']);
  map.weight = find(['weight', 'grams', 'g']);
  map.speed = find(['speed']);
  map.glide = find(['glide']);
  map.turn = find(['turn']);
  map.fade = find(['fade']);
  map.notes = find(['notes', 'comment', 'description']);
  map.status = find(['status', 'wishlist', 'bag', 'owned']);

  return map;
}
