import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { walkDeck, hashFiles } from '../../src/utils/folder-walker.js';

describe('walkDeck', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'slideless-walk-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('returns all files with deterministic (sorted) order', () => {
    writeFileSync(join(root, 'index.html'), '<html></html>');
    writeFileSync(join(root, 'styles.css'), 'body {}');
    mkdirSync(join(root, 'images'));
    writeFileSync(join(root, 'images', 'b.png'), 'x');
    writeFileSync(join(root, 'images', 'a.png'), 'x');

    const result = walkDeck(root);
    expect(result.files.map((f) => f.path)).toEqual([
      'images/a.png',
      'images/b.png',
      'index.html',
      'styles.css',
    ]);
    expect(result.totalBytes).toBeGreaterThan(0);
  });

  it('ignores .git, node_modules, .DS_Store by default', () => {
    writeFileSync(join(root, 'index.html'), '<html></html>');
    mkdirSync(join(root, '.git'));
    writeFileSync(join(root, '.git', 'HEAD'), 'ref: refs/...');
    mkdirSync(join(root, 'node_modules'));
    writeFileSync(join(root, 'node_modules', 'pkg.json'), '{}');
    writeFileSync(join(root, '.DS_Store'), 'osx junk');

    const result = walkDeck(root);
    expect(result.files.map((f) => f.path)).toEqual(['index.html']);
  });

  it('respects a .slidelessignore file at the root', () => {
    writeFileSync(join(root, 'index.html'), '<html></html>');
    writeFileSync(join(root, 'secret.txt'), 'hush');
    mkdirSync(join(root, 'drafts'));
    writeFileSync(join(root, 'drafts', 'wip.html'), '<wip>');
    writeFileSync(
      join(root, '.slidelessignore'),
      ['secret.txt', 'drafts/', ''].join('\n'),
    );

    const result = walkDeck(root);
    expect(result.files.map((f) => f.path)).toEqual(['index.html']);
  });

  it('throws on symlinks that escape the root', () => {
    const outside = mkdtempSync(join(tmpdir(), 'slideless-outside-'));
    try {
      writeFileSync(join(outside, 'secret.txt'), 'nope');
      writeFileSync(join(root, 'index.html'), '<html></html>');
      symlinkSync(outside, join(root, 'link'));

      expect(() => walkDeck(root)).toThrow(/escapes the deck folder root/);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it('rejects a path that is not a directory', () => {
    const filePath = join(root, 'file.html');
    writeFileSync(filePath, 'hi');
    expect(() => walkDeck(filePath)).toThrow(/Not a directory/);
  });
});

describe('hashFiles', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'slideless-hash-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('computes stable SHA-256 per file', async () => {
    writeFileSync(join(root, 'a.txt'), 'hello');
    writeFileSync(join(root, 'b.txt'), 'hello');
    writeFileSync(join(root, 'c.txt'), 'world');

    const walked = walkDeck(root);
    const hashed = await hashFiles(walked.files);
    const byPath = Object.fromEntries(hashed.map((h) => [h.path, h.sha256]));
    // same content => same hash
    expect(byPath['a.txt']).toBe(byPath['b.txt']);
    // different content => different hash
    expect(byPath['a.txt']).not.toBe(byPath['c.txt']);
    // hex-encoded sha256 = 64 lowercase hex chars
    expect(byPath['a.txt']).toMatch(/^[0-9a-f]{64}$/);
  });
});
