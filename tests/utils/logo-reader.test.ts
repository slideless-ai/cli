import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { loadLogoFile } from '../../src/utils/logo-reader.js';

describe('loadLogoFile', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'slideless-logo-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('rejects unsupported extensions', async () => {
    const path = join(dir, 'logo.gif');
    writeFileSync(path, Buffer.from([0, 1, 2]));
    const res = await loadLogoFile(path);
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.code).toBe('LOGO_INVALID_FORMAT');
  });

  it('rejects files larger than 2 MB', async () => {
    const path = join(dir, 'big.png');
    writeFileSync(path, Buffer.alloc(2 * 1024 * 1024 + 1, 0));
    const res = await loadLogoFile(path);
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.code).toBe('LOGO_TOO_LARGE');
  });

  it('returns base64 + contentType for a small png', async () => {
    const path = join(dir, 'small.png');
    writeFileSync(path, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const res = await loadLogoFile(path);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.contentType).toBe('image/png');
      expect(Buffer.from(res.data.data, 'base64')).toEqual(
        Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      );
    }
  });

  it('returns LOGO_READ_FAILED for a missing path', async () => {
    const res = await loadLogoFile(join(dir, 'does-not-exist.png'));
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.code).toBe('LOGO_READ_FAILED');
  });
});
