/**
 * Parallel asset downloader used by `slideless pull`.
 *
 * Streams each asset through the authenticated `downloadPresentationAsset`
 * endpoint, writes it to the target path, and verifies the SHA-256 hash at
 * end-of-stream. Rejects with `hash-mismatch` if the server sent bytes that
 * don't match the manifest — closing the loop even if the bucket were
 * compromised.
 */

import { createHash } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { dirname, join, resolve, sep } from 'path';

import { buildDownloadAssetUrl } from './presentations-client.js';
import type { ManifestFileInput } from '../types/api.js';

export interface DownloadDeckOptions {
  apiKey: string;
  apiUrl?: string;
  profileName?: string;
  presentationId: string;
  version?: number;
  files: ManifestFileInput[];
  destination: string;
  concurrency?: number;
  onProgress?: (p: DownloadProgress) => void;
}

export interface DownloadProgress {
  completed: number;
  total: number;
  currentFile?: { path: string; size: number };
}

export interface DownloadDeckResult {
  success: boolean;
  filesWritten: number;
  bytes: number;
  failed?: Array<{ path: string; reason: string }>;
}

function resolveSafePath(destination: string, relative: string): string {
  const destAbs = resolve(destination);
  // Manifest paths are validated server-side (no `..`, no absolute paths),
  // but we defense-in-depth check the resolved path stays inside the
  // destination directory.
  const joined = resolve(destAbs, relative);
  const sepped = joined.endsWith(sep) ? joined : joined + sep;
  const destSepped = destAbs.endsWith(sep) ? destAbs : destAbs + sep;
  if (!sepped.startsWith(destSepped) && joined !== destAbs) {
    throw new Error(`Asset path "${relative}" escapes destination directory`);
  }
  return joined;
}

async function downloadOne(
  opts: DownloadDeckOptions,
  file: ManifestFileInput,
): Promise<{ bytes: number }> {
  const url = buildDownloadAssetUrl({
    apiUrl: opts.apiUrl,
    profileName: opts.profileName,
    presentationId: opts.presentationId,
    sha256: file.sha256,
    version: opts.version,
  });

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      Accept: '*/*',
    },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`HTTP ${response.status} for ${file.path}: ${text.slice(0, 200)}`);
  }
  if (!response.body) {
    throw new Error(`No response body for ${file.path}`);
  }

  const hasher = createHash('sha256');
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  const reader = response.body.getReader();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) {
      const buf = Buffer.from(value);
      hasher.update(buf);
      chunks.push(buf);
      totalBytes += buf.length;
    }
  }
  const actual = hasher.digest('hex');
  if (actual !== file.sha256) {
    throw new Error(
      `hash-mismatch for ${file.path}: expected ${file.sha256.slice(0, 12)}…, got ${actual.slice(0, 12)}…`,
    );
  }

  const destPath = resolveSafePath(opts.destination, file.path);
  await mkdir(dirname(destPath), { recursive: true });
  await writeFile(destPath, Buffer.concat(chunks));
  return { bytes: totalBytes };
}

export async function downloadDeck(opts: DownloadDeckOptions): Promise<DownloadDeckResult> {
  const concurrency = Math.max(1, Math.min(opts.concurrency ?? 6, 16));
  const pending = [...opts.files];
  const total = pending.length;
  let completed = 0;
  let bytes = 0;
  const failed: Array<{ path: string; reason: string }> = [];

  async function worker(): Promise<void> {
    while (pending.length > 0) {
      const next = pending.shift();
      if (!next) break;
      opts.onProgress?.({ completed, total, currentFile: { path: next.path, size: next.size } });
      try {
        const r = await downloadOne(opts, next);
        bytes += r.bytes;
      } catch (err) {
        failed.push({ path: next.path, reason: err instanceof Error ? err.message : String(err) });
      } finally {
        completed += 1;
        opts.onProgress?.({ completed, total });
      }
    }
  }

  const workers: Promise<void>[] = [];
  for (let i = 0; i < concurrency; i++) workers.push(worker());
  await Promise.all(workers);

  if (failed.length > 0) {
    return { success: false, filesWritten: completed - failed.length, bytes, failed };
  }
  return { success: true, filesWritten: completed, bytes };
}

/**
 * Small helper to derive a default destination directory name from the title.
 */
export function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'slideless-deck'
  );
}

export function defaultDestination(cwd: string, title: string | undefined, presentationId: string): string {
  const base = title ? slugify(title) : presentationId;
  return join(cwd, base);
}
