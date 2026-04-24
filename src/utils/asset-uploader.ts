/**
 * Asset Uploader — drives precheck → upload missing → commit for a deck.
 *
 * Called by `slideless share <folder>` and `slideless update <presentationId> <folder>`.
 * Emits progress callbacks so the CLI can render a live upload indicator.
 */

import {
  precheckAssets,
  uploadPresentationAsset,
  commitPresentationVersion,
} from './presentations-client.js';
import type { HashedFile } from './folder-walker.js';
import type {
  ApiResult,
} from './api-client.js';
import type {
  CommitPresentationVersionOutput,
  ManifestFileInput,
} from '../types/api.js';

export interface UploadProgress {
  phase: 'precheck' | 'upload' | 'commit' | 'done';
  uploadIndex?: number;
  uploadTotal?: number;
  currentFile?: { path: string; size: number };
  assetsUploaded?: number;
  assetsDeduped?: number;
}

export interface UploadDeckOptions {
  apiKey: string;
  apiUrl?: string;
  profileName?: string;
  presentationId?: string;          // undefined for new-presentation flow
  title: string;
  entryPath: string;
  files: HashedFile[];
  manifestFiles: ManifestFileInput[];  // aligned with `files` by sha256
  /** Optimistic-concurrency guard. Server returns 409 on mismatch. */
  expectedBaseVersion?: number;
  onProgress?: (p: UploadProgress) => void;
}

export interface UploadDeckSuccess {
  success: true;
  status: number;
  data: CommitPresentationVersionOutput & {
    assetsUploaded: number;
    assetsDeduped: number;
    totalBytes: number;
  };
}

export interface UploadDeckFailure {
  success: false;
  status: number;
  error: { code: string; message: string; nextAction?: string; details?: Record<string, unknown> };
  phase: 'precheck' | 'upload' | 'commit';
}

export type UploadDeckResult = UploadDeckSuccess | UploadDeckFailure;

function wrapFailure<T>(r: Extract<ApiResult<T>, { success: false }>, phase: UploadDeckFailure['phase']): UploadDeckFailure {
  return { success: false, status: r.status, error: r.error, phase };
}

export async function uploadDeck(opts: UploadDeckOptions): Promise<UploadDeckResult> {
  const {
    apiKey,
    apiUrl,
    profileName,
    presentationId,
    title,
    entryPath,
    files,
    manifestFiles,
    expectedBaseVersion,
    onProgress,
  } = opts;
  const report = (p: UploadProgress) => onProgress?.(p);

  // Deduplicate the hash list (a deck can reference the same blob at many paths).
  const uniqueHashes = Array.from(new Set(files.map((f) => f.sha256)));

  report({ phase: 'precheck' });

  const pre = await precheckAssets({
    apiKey,
    apiUrl,
    profileName,
    presentationId,
    hashes: uniqueHashes,
  });
  if (!pre.success) return wrapFailure(pre, 'precheck');

  const { missing, sessionId, presentationId: reservedShareId } = pre.data;
  const effectiveShareId = presentationId ?? reservedShareId;
  const missingSet = new Set(missing);

  // Build a path-per-hash picker so we upload one physical file per missing hash
  // (dedupe by hash: if multiple paths share a hash, upload one).
  const fileByHash = new Map<string, HashedFile>();
  for (const f of files) {
    if (!fileByHash.has(f.sha256)) fileByHash.set(f.sha256, f);
  }

  let uploadedCount = 0;
  const toUpload = Array.from(missingSet).map((h) => fileByHash.get(h)!).filter(Boolean);

  for (let i = 0; i < toUpload.length; i++) {
    const f = toUpload[i];
    const m = manifestFiles.find((mf) => mf.sha256 === f.sha256);
    if (!m) continue;
    report({
      phase: 'upload',
      uploadIndex: i + 1,
      uploadTotal: toUpload.length,
      currentFile: { path: f.path, size: f.size },
    });
    const r = await uploadPresentationAsset({
      apiKey,
      apiUrl,
      profileName,
      presentationId: presentationId,
      sessionId: sessionId,
      sha256: f.sha256,
      contentType: m.contentType,
      absolutePath: f.absolute,
    });
    if (!r.success) return wrapFailure(r, 'upload');
    uploadedCount++;
  }

  report({ phase: 'commit' });

  const commit = await commitPresentationVersion({
    apiKey,
    apiUrl,
    profileName,
    presentationId,
    sessionId,
    title,
    entryPath,
    files: manifestFiles,
    expectedBaseVersion,
  });
  if (!commit.success) return wrapFailure(commit, 'commit');

  const totalBytes = files.reduce((acc, f) => acc + f.size, 0);
  const assetsDeduped = uniqueHashes.length - uploadedCount;

  report({
    phase: 'done',
    assetsUploaded: uploadedCount,
    assetsDeduped,
  });

  return {
    success: true,
    status: commit.status,
    data: {
      ...commit.data,
      assetsUploaded: uploadedCount,
      assetsDeduped,
      totalBytes,
      presentationId: commit.data.presentationId ?? effectiveShareId ?? '',
    },
  };
}
