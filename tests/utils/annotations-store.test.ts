/**
 * Tests for annotations-store: read/add/update/remove over
 * `.slideless/annotations.json`, plus malformed-file tolerance.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import {
  annotationsDir,
  annotationsPath,
  readAnnotations,
  addAnnotation,
  updateAnnotation,
  removeAnnotation,
} from '../../src/utils/annotations-store.js';

describe('annotations-store', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'slideless-anno-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('returns an empty shape when the file is absent', () => {
    const file = readAnnotations(root);
    expect(file.annotations).toEqual([]);
    expect(file.version).toBe(2);
  });

  it('lazily creates .slideless/ on first save', () => {
    expect(existsSync(annotationsDir(root))).toBe(false);
    addAnnotation(root, { note: 'hi', entryFile: 'index.html', selectedText: 'x' });
    expect(existsSync(annotationsPath(root))).toBe(true);
  });

  it('assigns id/createdAt/processed and stores the payload', () => {
    const a = addAnnotation(
      root,
      {
        note: 'punchier',
        entryFile: 'index.html',
        selectedText: 'the thing',
        context: { before: 'a', after: 'b' },
        anchor: { container: { kind: 'slide', index: 3, heading: 'Arch' }, selector: '#h' },
      },
      '2026-06-14T00:00:00.000Z',
    );
    expect(a.id).toMatch(/[0-9a-f-]{36}/);
    expect(a.createdAt).toBe('2026-06-14T00:00:00.000Z');
    expect(a.processed).toBe(false);
    expect(a.anchor.container.kind).toBe('slide');
    expect(a.anchor.container.index).toBe(3);
    expect(a.anchor.selector).toBe('#h');

    const onDisk = readAnnotations(root);
    expect(onDisk.annotations).toHaveLength(1);
    expect(onDisk.annotations[0].id).toBe(a.id);
  });

  it('normalizes a missing/garbage anchor to nulls', () => {
    const a = addAnnotation(root, { note: 'n', entryFile: 'index.html', selectedText: 's' });
    expect(a.anchor).toEqual({
      container: { kind: null, index: null, heading: null },
      selector: null,
    });
  });

  it('gives each annotation a distinct id even for identical text', () => {
    const a = addAnnotation(root, { note: 'one', entryFile: 'i.html', selectedText: 'dup' });
    const b = addAnnotation(root, { note: 'two', entryFile: 'i.html', selectedText: 'dup' });
    expect(a.id).not.toBe(b.id);
    expect(readAnnotations(root).annotations).toHaveLength(2);
  });

  it('updates note and toggles processed', () => {
    const a = addAnnotation(root, { note: 'n', entryFile: 'i.html', selectedText: 's' });
    const e1 = updateAnnotation(root, a.id, { note: 'edited' });
    expect(e1?.note).toBe('edited');
    const e2 = updateAnnotation(root, a.id, { processed: true });
    expect(e2?.processed).toBe(true);
    // Note untouched when only toggling processed.
    expect(e2?.note).toBe('edited');
    expect(readAnnotations(root).annotations[0].processed).toBe(true);
  });

  it('returns null updating an unknown id', () => {
    expect(updateAnnotation(root, 'nope', { note: 'x' })).toBeNull();
  });

  it('removes an annotation and reports success', () => {
    const a = addAnnotation(root, { note: 'n', entryFile: 'i.html', selectedText: 's' });
    expect(removeAnnotation(root, a.id)).toBe(true);
    expect(readAnnotations(root).annotations).toHaveLength(0);
    expect(removeAnnotation(root, a.id)).toBe(false);
  });

  it('tolerates a malformed JSON file (returns empty, rewrites cleanly)', () => {
    mkdirSync(annotationsDir(root), { recursive: true });
    writeFileSync(annotationsPath(root), '{ this is not json');
    expect(readAnnotations(root).annotations).toEqual([]);
    // Next save rewrites a valid file.
    const a = addAnnotation(root, { note: 'n', entryFile: 'i.html', selectedText: 's' });
    expect(readAnnotations(root).annotations).toHaveLength(1);
    expect(readAnnotations(root).annotations[0].id).toBe(a.id);
  });

  it('drops entries that lack the minimum fields', () => {
    mkdirSync(annotationsDir(root), { recursive: true });
    writeFileSync(
      annotationsPath(root),
      JSON.stringify({
        version: 1,
        annotations: [{ id: 'ok', note: 'keep' }, { note: 'no id' }, { id: 'no-note' }, 42],
      }),
    );
    const list = readAnnotations(root).annotations;
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('ok');
  });

  // ── v2: deckVersion / source / author ──────────────────────────────────

  it('stores deckVersion/source/author when provided', () => {
    const a = addAnnotation(root, {
      note: 'n',
      entryFile: 'index.html',
      selectedText: 's',
      deckVersion: 7,
      source: 'hosted',
      author: 'Acme key',
    });
    expect(a.deckVersion).toBe(7);
    expect(a.source).toBe('hosted');
    expect(a.author).toBe('Acme key');
    const onDisk = readAnnotations(root).annotations[0];
    expect(onDisk.deckVersion).toBe(7);
    expect(onDisk.source).toBe('hosted');
    expect(onDisk.author).toBe('Acme key');
  });

  it('defaults the v2 fields (null / local / null) when omitted', () => {
    const a = addAnnotation(root, { note: 'n', entryFile: 'i.html', selectedText: 's' });
    expect(a.deckVersion).toBeNull();
    expect(a.source).toBe('local');
    expect(a.author).toBeNull();
  });

  it('writes the file at schema version 2', () => {
    addAnnotation(root, { note: 'n', entryFile: 'i.html', selectedText: 's' });
    const raw = JSON.parse(readFileSync(annotationsPath(root), 'utf-8'));
    expect(raw.version).toBe(2);
  });

  it('backfills v2 fields when reading a v1 file (no deckVersion/source/author)', () => {
    mkdirSync(annotationsDir(root), { recursive: true });
    writeFileSync(
      annotationsPath(root),
      JSON.stringify({
        version: 1,
        annotations: [{ id: 'old', note: 'legacy', entryFile: 'i.html', selectedText: 's' }],
      }),
    );
    const a = readAnnotations(root).annotations[0];
    expect(a.deckVersion).toBeNull();
    expect(a.source).toBe('local');
    expect(a.author).toBeNull();
  });
});
