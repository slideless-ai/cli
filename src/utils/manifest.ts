/**
 * Manifest helpers — build the `files[]` array for commitPresentationVersion
 * and detect MIME types from file extensions.
 */

import mime from 'mime-types';
import type { HashedFile } from './folder-walker.js';
import type { ManifestFileInput } from '../types/api.js';

/** Overrides for MIME types the default `mime-types` table misses or gets wrong. */
const MIME_OVERRIDES: Record<string, string> = {
  glb: 'model/gltf-binary',
  gltf: 'model/gltf+json',
  usdz: 'model/vnd.usdz+zip',
  glsl: 'text/plain',
  wgsl: 'text/plain',
  hdr: 'image/vnd.radiance',
  webmanifest: 'application/manifest+json',
  js: 'text/javascript',
  mjs: 'text/javascript',
  cjs: 'text/javascript',
};

function withCharset(mimeType: string): string {
  // Text-based formats get an explicit UTF-8 charset so the browser decodes
  // them correctly regardless of byte-order or header guesswork.
  if (mimeType.includes('charset=')) return mimeType;
  if (mimeType.startsWith('text/') || mimeType === 'application/json') {
    return `${mimeType}; charset=utf-8`;
  }
  return mimeType;
}

export function detectContentType(filePath: string): string {
  const ext = filePath.toLowerCase().split('.').pop() ?? '';
  if (MIME_OVERRIDES[ext]) return withCharset(MIME_OVERRIDES[ext]);
  const resolved = mime.lookup(filePath);
  if (typeof resolved === 'string') return withCharset(resolved);
  return 'application/octet-stream';
}

export function buildManifestFiles(files: HashedFile[]): ManifestFileInput[] {
  return files.map((f) => ({
    path: f.path,
    sha256: f.sha256,
    size: f.size,
    contentType: detectContentType(f.path),
  }));
}
