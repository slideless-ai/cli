/**
 * Tests for local-manifest: reading/writing slideless.json.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import {
  LOCAL_MANIFEST_FILENAME,
  hasLocalManifest,
  readLocalManifest,
  writeLocalManifest,
} from '../../src/utils/local-manifest.js';

describe('local-manifest', () => {
  let dir: string;

  beforeEach(() => {
    dir = join(tmpdir(), `slideless-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(dir, { recursive: true });
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('hasLocalManifest false when file absent', () => {
    expect(hasLocalManifest(dir)).toBe(false);
  });

  it('round-trip write+read', () => {
    writeLocalManifest(dir, {
      presentationId: '01HXYZ',
      lastPulledVersion: 7,
      lastPulledAt: '2026-04-24T12:00:00Z',
      role: 'owner',
    });
    expect(hasLocalManifest(dir)).toBe(true);
    expect(existsSync(join(dir, LOCAL_MANIFEST_FILENAME))).toBe(true);

    const r = readLocalManifest(dir);
    expect(r.presentationId).toBe('01HXYZ');
    expect(r.lastPulledVersion).toBe(7);
    expect(r.role).toBe('owner');
    expect(r.baseUrl).toBeUndefined();
  });

  it('preserves optional baseUrl', () => {
    writeLocalManifest(dir, {
      presentationId: 'abc',
      baseUrl: 'https://example.com',
      lastPulledVersion: 1,
      lastPulledAt: '2026-01-01T00:00:00Z',
      role: 'dev',
    });
    const r = readLocalManifest(dir);
    expect(r.baseUrl).toBe('https://example.com');
    expect(r.role).toBe('dev');
  });

  it('rejects invalid JSON', () => {
    writeFileSync(join(dir, LOCAL_MANIFEST_FILENAME), '{not json');
    expect(() => readLocalManifest(dir)).toThrow(/not valid JSON/);
  });

  it('rejects missing required fields', () => {
    writeFileSync(join(dir, LOCAL_MANIFEST_FILENAME), JSON.stringify({ presentationId: 'x' }));
    expect(() => readLocalManifest(dir)).toThrow(/lastPulledVersion/);
  });

  it('rejects invalid role value', () => {
    writeFileSync(
      join(dir, LOCAL_MANIFEST_FILENAME),
      JSON.stringify({
        presentationId: 'x',
        lastPulledVersion: 1,
        lastPulledAt: '2026-01-01T00:00:00Z',
        role: 'admin',
      }),
    );
    expect(() => readLocalManifest(dir)).toThrow(/role/);
  });
});
