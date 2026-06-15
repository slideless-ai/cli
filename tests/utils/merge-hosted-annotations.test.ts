/**
 * Tests for mergeHostedAnnotations: appending pre-formed (hosted) annotations
 * into `.slideless/annotations.json` while preserving their id + createdAt,
 * deduping by id, and never clobbering existing local notes.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import {
  addAnnotation,
  readAnnotations,
  mergeHostedAnnotations,
  type PreformedAnnotation,
} from '../../src/utils/annotations-store.js';

function hosted(overrides: Partial<PreformedAnnotation> = {}): PreformedAnnotation {
  return {
    id: 'hosted-1',
    createdAt: '2026-06-10T00:00:00.000Z',
    processed: false,
    note: 'tighten this',
    entryFile: 'index.html',
    selectedText: 'the thing',
    context: { before: 'a', after: 'b' },
    anchor: { container: { kind: 'slide', index: 2, heading: 'Intro' }, selector: '#h' },
    deckVersion: 4,
    source: 'hosted',
    author: 'Acme viewer',
    ...overrides,
  };
}

describe('mergeHostedAnnotations', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'slideless-merge-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('appends hosted annotations preserving id, createdAt, and hosted fields', () => {
    const res = mergeHostedAnnotations(root, [hosted()]);
    expect(res).toEqual({ added: 1, skipped: 0 });

    const list = readAnnotations(root).annotations;
    expect(list).toHaveLength(1);
    const a = list[0];
    expect(a.id).toBe('hosted-1');
    expect(a.createdAt).toBe('2026-06-10T00:00:00.000Z');
    expect(a.source).toBe('hosted');
    expect(a.author).toBe('Acme viewer');
    expect(a.deckVersion).toBe(4);
    expect(a.processed).toBe(false);
    expect(a.anchor.container.kind).toBe('slide');
    expect(a.anchor.container.index).toBe(2);
  });

  it('dedupes by hosted id across re-pulls (idempotent)', () => {
    const first = mergeHostedAnnotations(root, [hosted()]);
    expect(first.added).toBe(1);
    const second = mergeHostedAnnotations(root, [hosted({ note: 'changed remotely' })]);
    expect(second).toEqual({ added: 0, skipped: 1 });

    const list = readAnnotations(root).annotations;
    expect(list).toHaveLength(1);
    // The original local copy is preserved — re-pull never clobbers it.
    expect(list[0].note).toBe('tighten this');
  });

  it('never clobbers existing local notes', () => {
    const local = addAnnotation(root, {
      note: 'my local note',
      entryFile: 'index.html',
      selectedText: 's',
    });
    const res = mergeHostedAnnotations(root, [hosted({ id: 'hosted-2' })]);
    expect(res.added).toBe(1);

    const list = readAnnotations(root).annotations;
    expect(list).toHaveLength(2);
    const localStill = list.find((a) => a.id === local.id);
    expect(localStill?.note).toBe('my local note');
    expect(localStill?.source).toBe('local');
  });

  it('adds new and skips already-present in a mixed batch', () => {
    mergeHostedAnnotations(root, [hosted({ id: 'a' })]);
    const res = mergeHostedAnnotations(root, [
      hosted({ id: 'a' }),
      hosted({ id: 'b' }),
      hosted({ id: 'c' }),
    ]);
    expect(res).toEqual({ added: 2, skipped: 1 });
    expect(readAnnotations(root).annotations).toHaveLength(3);
  });

  it('drops malformed entries (missing id) without throwing', () => {
    const res = mergeHostedAnnotations(root, [
      hosted(),
      { ...hosted({ id: '' }) },
      // @ts-expect-error intentionally malformed
      null,
    ]);
    expect(res.added).toBe(1);
    expect(readAnnotations(root).annotations).toHaveLength(1);
  });

  it('does not write the file when nothing is added', () => {
    const res = mergeHostedAnnotations(root, []);
    expect(res).toEqual({ added: 0, skipped: 0 });
    // Nothing written → readAnnotations still returns the empty shape.
    expect(readAnnotations(root).annotations).toEqual([]);
  });

  it('defaults missing optional fields (createdAt, source, deckVersion, author)', () => {
    mergeHostedAnnotations(
      root,
      [{ id: 'bare', note: 'n', entryFile: 'i.html', selectedText: 's' }],
      '2026-06-15T00:00:00.000Z',
    );
    const a = readAnnotations(root).annotations[0];
    expect(a.createdAt).toBe('2026-06-15T00:00:00.000Z');
    expect(a.source).toBe('local');
    expect(a.deckVersion).toBeNull();
    expect(a.author).toBeNull();
    expect(a.processed).toBe(false);
  });
});
