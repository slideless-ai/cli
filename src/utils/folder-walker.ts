/**
 * Folder Walker
 *
 * Recursively walks a deck folder, streaming SHA-256 for each file,
 * respecting built-in ignores plus an optional `.slidelessignore` at the
 * folder root. Rejects symlinks that escape the root.
 */

import { createReadStream, readFileSync, realpathSync, statSync, lstatSync } from 'fs';
import { readdirSync, existsSync } from 'fs';
import { relative, resolve, join, sep } from 'path';
import { createHash } from 'crypto';
import { createRequire } from 'module';
import type { Ignore } from 'ignore';
// `ignore` v6 ships CommonJS where module.exports *is* the factory. In NodeNext
// with esModuleInterop, the default import surfaces as the namespace type
// rather than the function type — so we load it via createRequire which
// gives us the callable module.exports directly.
const require = createRequire(import.meta.url);
const ignore: (opts?: unknown) => Ignore = require('ignore');

const BUILT_IN_IGNORES = [
  '.git/',
  'node_modules/',
  '.DS_Store',
  'Thumbs.db',
  '.vercel/',
  '.next/',
  '*.log',
  '.slidelessignore',
];

export interface WalkedFile {
  /** Forward-slash relative path from the deck root (stable across platforms). */
  path: string;
  /** Absolute file path on disk. */
  absolute: string;
  /** File size in bytes. */
  size: number;
}

export interface HashedFile extends WalkedFile {
  sha256: string;
}

export interface WalkResult {
  files: WalkedFile[];
  totalBytes: number;
}

/** Normalize a platform-specific relative path to forward-slash form. */
function toPosix(p: string): string {
  return p.split(sep).join('/');
}

function loadIgnore(rootAbs: string): Ignore {
  const ig = ignore().add(BUILT_IN_IGNORES);
  const ignoreFile = join(rootAbs, '.slidelessignore');
  if (existsSync(ignoreFile)) {
    ig.add(readFileSync(ignoreFile, 'utf-8'));
  }
  return ig;
}

/**
 * Walk a deck folder. Returns the set of files that will be uploaded
 * (i.e. the not-ignored set). Does NOT hash — call hashFiles() separately
 * if you need hashes.
 */
export function walkDeck(rootPath: string): WalkResult {
  const rootAbs = resolve(rootPath);
  const rootReal = realpathSync(rootAbs);
  const rootStats = statSync(rootAbs);
  if (!rootStats.isDirectory()) {
    throw new Error(`Not a directory: ${rootPath}`);
  }

  const ig = loadIgnore(rootAbs);
  const files: WalkedFile[] = [];
  let totalBytes = 0;

  function visit(abs: string) {
    const rel = toPosix(relative(rootAbs, abs));
    // ignore() wants the path of the entry with a trailing slash for
    // directories. Test against the relative path.
    if (rel !== '') {
      // Use lstat so we can detect symlinks BEFORE following them. statSync
      // alone silently dereferences, which would let an escape-symlink sneak
      // past the realpath check below.
      let lstats;
      try {
        lstats = lstatSync(abs);
      } catch {
        return;
      }

      const isLink = lstats.isSymbolicLink();
      // Reject any symlink whose real target escapes the deck root.
      if (isLink) {
        let real: string;
        try {
          real = realpathSync(abs);
        } catch {
          return;
        }
        if (!real.startsWith(rootReal + sep) && real !== rootReal) {
          throw new Error(`Symlink "${rel}" escapes the deck folder root.`);
        }
      }

      // Use stat (follow link) only now that the link is known safe.
      const stats = isLink ? statSync(abs) : lstats;
      const candidate = stats.isDirectory() ? rel + '/' : rel;
      if (ig.ignores(candidate)) return;

      if (stats.isFile()) {
        files.push({ path: rel, absolute: abs, size: stats.size });
        totalBytes += stats.size;
        return;
      }
      if (!stats.isDirectory()) return;
    }

    const entries = readdirSync(abs);
    for (const e of entries) {
      visit(join(abs, e));
    }
  }

  visit(rootAbs);
  // Deterministic order for predictable manifests and progress output.
  files.sort((a, b) => a.path.localeCompare(b.path));
  return { files, totalBytes };
}

/** Hash all walked files, streaming so large files don't blow memory. */
export async function hashFiles(files: WalkedFile[]): Promise<HashedFile[]> {
  return Promise.all(
    files.map(
      (f) =>
        new Promise<HashedFile>((resolvePromise, reject) => {
          const hasher = createHash('sha256');
          const stream = createReadStream(f.absolute);
          stream.on('data', (chunk) => hasher.update(chunk));
          stream.on('end', () =>
            resolvePromise({
              ...f,
              sha256: hasher.digest('hex'),
            }),
          );
          stream.on('error', reject);
        }),
    ),
  );
}
