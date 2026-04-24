/**
 * Reference Scanner
 *
 * Best-effort static scan of HTML and CSS files in a deck, looking for
 * relative asset references that don't resolve to something in the uploaded
 * set. Produces warnings by default, errors when --strict. Parent-directory
 * refs (`../foo`) are always errors because they escape the deck root.
 *
 * This is diagnostic only — runtime-built URLs (JS concatenation, fetch()
 * with variable paths, three.js loaders) will always escape static detection.
 * The warning list exists to catch the common "I renamed the file but forgot
 * to update the HTML" mistake, not to be a full static analysis.
 */

import { readFileSync } from 'fs';
import { posix as path } from 'path';

export interface ReferenceIssue {
  file: string; // relative HTML/CSS file within the deck
  line: number;
  reference: string; // the raw reference string as found in source
  kind: 'parent-escape' | 'missing';
  message: string;
}

export interface ScanResult {
  errors: ReferenceIssue[];
  warnings: ReferenceIssue[];
}

function isExternal(raw: string): boolean {
  const r = raw.trim();
  if (!r) return true;
  if (r.startsWith('data:') || r.startsWith('blob:')) return true;
  if (r.startsWith('//')) return true;
  if (/^[a-z][a-z0-9+.-]*:/i.test(r)) return true; // http:, https:, mailto:, etc.
  if (r.startsWith('#')) return true; // fragment
  return false;
}

/** Extract candidate references from HTML (attribute values). */
function scanHtml(source: string): Array<{ raw: string; line: number }> {
  const hits: Array<{ raw: string; line: number }> = [];
  const attrs = ['src', 'href', 'poster', 'data-src', 'srcset', 'background'];
  const attrPattern = new RegExp(
    `\\b(${attrs.join('|')})\\s*=\\s*("([^"]+)"|'([^']+)')`,
    'gi',
  );
  let m: RegExpExecArray | null;
  while ((m = attrPattern.exec(source)) !== null) {
    const raw = m[3] ?? m[4] ?? '';
    const line = lineAt(source, m.index);
    if (m[1].toLowerCase() === 'srcset') {
      // Each candidate in srcset is "URL [descriptor]", comma-separated
      for (const piece of raw.split(',')) {
        const url = piece.trim().split(/\s+/)[0];
        if (url) hits.push({ raw: url, line });
      }
    } else {
      hits.push({ raw, line });
    }
  }
  return hits;
}

/** Extract url(...) and @import references from CSS. */
function scanCss(source: string): Array<{ raw: string; line: number }> {
  const hits: Array<{ raw: string; line: number }> = [];
  const urlPattern = /url\(\s*(['"]?)([^)'"]+)\1\s*\)/g;
  const importPattern = /@import\s+(['"])([^'"]+)\1/g;
  let m: RegExpExecArray | null;
  while ((m = urlPattern.exec(source)) !== null) {
    hits.push({ raw: m[2], line: lineAt(source, m.index) });
  }
  while ((m = importPattern.exec(source)) !== null) {
    hits.push({ raw: m[2], line: lineAt(source, m.index) });
  }
  return hits;
}

function lineAt(source: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < source.length; i++) {
    if (source.charCodeAt(i) === 0x0a) line++;
  }
  return line;
}

/**
 * Resolve a reference relative to the file it appears in. Returns null if
 * the reference escapes the deck root (so callers can emit a parent-escape
 * error rather than silently clamping at root).
 */
function resolveReference(fromFile: string, ref: string): string | null {
  const clean = ref.split('#')[0].split('?')[0];
  if (!clean) return null;
  // Work WITHOUT a leading slash so path.normalize cannot silently swallow
  // `../` that would escape the deck root. We count how many `..` segments
  // survive normalization; if any do, the reference escapes.
  const fromDir = path.dirname(fromFile);  // relative dir within deck
  let joined: string;
  if (clean.startsWith('/')) {
    // Root-absolute — relative to deck root, so drop the leading slash.
    joined = clean.replace(/^\/+/, '');
  } else if (fromDir === '.' || fromDir === '') {
    joined = clean;
  } else {
    joined = `${fromDir}/${clean}`;
  }
  const resolved = path.normalize(joined);
  if (resolved.startsWith('..') || resolved === '.') {
    return null;
  }
  return resolved;
}

export function scanReferences(opts: {
  deckRoot: string;
  files: Array<{ path: string; absolute: string }>;
}): ScanResult {
  const fileSet = new Set(opts.files.map((f) => f.path));
  const errors: ReferenceIssue[] = [];
  const warnings: ReferenceIssue[] = [];

  for (const f of opts.files) {
    const ext = f.path.toLowerCase().split('.').pop();
    let hits: Array<{ raw: string; line: number }> = [];
    if (ext === 'html' || ext === 'htm') {
      hits = scanHtml(readFileSync(f.absolute, 'utf-8'));
    } else if (ext === 'css') {
      hits = scanCss(readFileSync(f.absolute, 'utf-8'));
    } else {
      continue;
    }

    for (const hit of hits) {
      if (isExternal(hit.raw)) continue;
      const resolved = resolveReference(f.path, hit.raw);
      if (resolved === null) {
        errors.push({
          file: f.path,
          line: hit.line,
          reference: hit.raw,
          kind: 'parent-escape',
          message: `references outside the deck folder — decks must be self-contained`,
        });
        continue;
      }
      if (!fileSet.has(resolved)) {
        warnings.push({
          file: f.path,
          line: hit.line,
          reference: hit.raw,
          kind: 'missing',
          message: `file not found in deck: ${resolved}`,
        });
      }
    }
  }
  return { errors, warnings };
}
