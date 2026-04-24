import { describe, it, expect } from 'vitest';
import { detectContentType, buildManifestFiles } from '../../src/utils/manifest.js';
import type { HashedFile } from '../../src/utils/folder-walker.js';

describe('detectContentType', () => {
  it('maps common extensions to their standard MIME type', () => {
    expect(detectContentType('hero.png')).toBe('image/png');
    expect(detectContentType('hero.jpg')).toBe('image/jpeg');
    expect(detectContentType('logo.svg')).toBe('image/svg+xml');
    expect(detectContentType('demo.mp4')).toBe('video/mp4');
  });

  it('overrides glTF binary + JSON variants', () => {
    expect(detectContentType('model.glb')).toBe('model/gltf-binary');
    expect(detectContentType('scene.gltf')).toBe('model/gltf+json');
  });

  it('overrides shader sources to text/plain (with UTF-8 charset)', () => {
    expect(detectContentType('frag.glsl')).toBe('text/plain; charset=utf-8');
    expect(detectContentType('compute.wgsl')).toBe('text/plain; charset=utf-8');
  });

  it('appends charset=utf-8 to text/* and application/json', () => {
    expect(detectContentType('index.html')).toBe('text/html; charset=utf-8');
    expect(detectContentType('styles.css')).toBe('text/css; charset=utf-8');
    expect(detectContentType('scene.js')).toBe('text/javascript; charset=utf-8');
    expect(detectContentType('data.json')).toBe('application/json; charset=utf-8');
  });

  it('falls back to application/octet-stream for unknown extensions', () => {
    expect(detectContentType('mystery.xyzxyz')).toBe('application/octet-stream');
  });
});

describe('buildManifestFiles', () => {
  it('maps HashedFile[] to manifest entries with detected contentType', () => {
    const files: HashedFile[] = [
      { path: 'index.html', absolute: '/tmp/x', size: 100, sha256: 'a'.repeat(64) },
      { path: 'assets/hero.jpg', absolute: '/tmp/y', size: 2000, sha256: 'b'.repeat(64) },
    ];
    const manifest = buildManifestFiles(files);
    expect(manifest).toEqual([
      { path: 'index.html', sha256: 'a'.repeat(64), size: 100, contentType: 'text/html; charset=utf-8' },
      { path: 'assets/hero.jpg', sha256: 'b'.repeat(64), size: 2000, contentType: 'image/jpeg' },
    ]);
  });
});
