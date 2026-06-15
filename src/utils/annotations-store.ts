/**
 * Annotations store (`.slideless/annotations.json`)
 *
 * Local-only feedback gathered while running `slideless dev`. The browser
 * overlay POSTs a selection + a remark; we persist it here so a downstream
 * process (or a human) can later apply the changes. This file is gathering
 * only — nothing in the CLI reads it back to mutate the deck.
 *
 * The `.slideless/` folder is created lazily on first save and is excluded
 * from upload + the dev watcher via the built-in ignore list in
 * `folder-walker.ts` (so writing a note never triggers a reload loop or gets
 * pushed).
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, resolve } from 'path';
import { randomUUID } from 'crypto';

export const ANNOTATIONS_DIRNAME = '.slideless';
export const ANNOTATIONS_FILENAME = 'annotations.json';
// v2 added deckVersion/source/author. Reads still accept v1 files (missing
// fields are backfilled with defaults on read); writes are always v2.
export const ANNOTATIONS_FILE_VERSION = 2;

/** Where an annotation came from: the local dev overlay, or pulled from hosted. */
export type AnnotationSource = 'local' | 'hosted';

/** Where the selection sat, recorded richly but used best-effort. */
export interface AnnotationAnchor {
  /** Nearest `[data-slide]` / `[data-panel]` container, if any. */
  container: {
    kind: 'slide' | 'panel' | null;
    /** Zero-based index from the data attribute, or null when unknown. */
    index: number | null;
    /** Visible heading text of the container, for human/agent orientation. */
    heading: string | null;
  };
  /** Best-effort CSS selector for the anchored element. */
  selector: string | null;
}

export interface Annotation {
  id: string;
  createdAt: string;
  /** Flipped true by the downstream process once it has consumed the note. */
  processed: boolean;
  note: string;
  /** The served page the selection was made on (e.g. `index.html`). */
  entryFile: string;
  selectedText: string;
  context: { before: string; after: string };
  anchor: AnnotationAnchor;
  /** Deck version this note was made against (null if the deck was never pushed). */
  deckVersion: number | null;
  /** Where the note originated. */
  source: AnnotationSource;
  /** Who made it: the API key name locally, the share token name when hosted. */
  author: string | null;
}

export interface AnnotationsFile {
  version: number;
  annotations: Annotation[];
}

/** Fields the client supplies; the server owns id/createdAt/processed. */
export interface AnnotationInput {
  note: string;
  entryFile: string;
  selectedText: string;
  context?: { before?: string; after?: string };
  anchor?: Partial<AnnotationAnchor>;
  /** Deck version stamp (resolved by the caller); defaults to null. */
  deckVersion?: number | null;
  /** Origin; defaults to 'local'. */
  source?: AnnotationSource;
  /** Author name; defaults to null. */
  author?: string | null;
}

export function annotationsDir(deckRoot: string): string {
  return join(resolve(deckRoot), ANNOTATIONS_DIRNAME);
}

export function annotationsPath(deckRoot: string): string {
  return join(annotationsDir(deckRoot), ANNOTATIONS_FILENAME);
}

function emptyFile(): AnnotationsFile {
  return { version: ANNOTATIONS_FILE_VERSION, annotations: [] };
}

/** Backfill v2 fields on annotations read from disk (v1 files lack them). */
function normalizeReadAnnotation(a: Annotation): Annotation {
  return {
    ...a,
    deckVersion: typeof a.deckVersion === 'number' ? a.deckVersion : null,
    source: a.source === 'hosted' ? 'hosted' : 'local',
    author: typeof a.author === 'string' ? a.author : null,
  };
}

function normalizeAnchor(anchor?: Partial<AnnotationAnchor>): AnnotationAnchor {
  const container = anchor?.container;
  const kind =
    container?.kind === 'slide' || container?.kind === 'panel'
      ? container.kind
      : null;
  const index =
    typeof container?.index === 'number' && Number.isFinite(container.index)
      ? container.index
      : null;
  const heading =
    typeof container?.heading === 'string' ? container.heading : null;
  const selector = typeof anchor?.selector === 'string' ? anchor.selector : null;
  return { container: { kind, index, heading }, selector };
}

/**
 * Read the annotations file. Returns an empty, valid shape when the file is
 * absent or malformed — callers (the dev server) never need to handle throws.
 */
export function readAnnotations(deckRoot: string): AnnotationsFile {
  const path = annotationsPath(deckRoot);
  if (!existsSync(path)) return emptyFile();
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as unknown;
    if (!parsed || typeof parsed !== 'object') return emptyFile();
    const list = (parsed as { annotations?: unknown }).annotations;
    if (!Array.isArray(list)) return emptyFile();
    // Keep only entries that carry the bare minimum we need.
    const annotations = list
      .filter(
        (a): a is Annotation =>
          !!a &&
          typeof a === 'object' &&
          typeof (a as Annotation).id === 'string' &&
          typeof (a as Annotation).note === 'string',
      )
      .map(normalizeReadAnnotation);
    return { version: ANNOTATIONS_FILE_VERSION, annotations };
  } catch {
    return emptyFile();
  }
}

function writeAnnotations(deckRoot: string, file: AnnotationsFile): void {
  const dir = annotationsDir(deckRoot);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(annotationsPath(deckRoot), JSON.stringify(file, null, 2) + '\n', {
    mode: 0o644,
  });
}

/** Append a new annotation; server owns id/createdAt/processed. */
export function addAnnotation(
  deckRoot: string,
  input: AnnotationInput,
  now: string = new Date().toISOString(),
): Annotation {
  const file = readAnnotations(deckRoot);
  const annotation: Annotation = {
    id: randomUUID(),
    createdAt: now,
    processed: false,
    note: typeof input.note === 'string' ? input.note : '',
    entryFile: typeof input.entryFile === 'string' ? input.entryFile : '',
    selectedText:
      typeof input.selectedText === 'string' ? input.selectedText : '',
    context: {
      before:
        typeof input.context?.before === 'string' ? input.context.before : '',
      after:
        typeof input.context?.after === 'string' ? input.context.after : '',
    },
    anchor: normalizeAnchor(input.anchor),
    deckVersion:
      typeof input.deckVersion === 'number' ? input.deckVersion : null,
    source: input.source === 'hosted' ? 'hosted' : 'local',
    author: typeof input.author === 'string' ? input.author : null,
  };
  file.annotations.push(annotation);
  writeAnnotations(deckRoot, file);
  return annotation;
}

/** Edit the note text and/or toggle `processed`. Returns the updated entry. */
export function updateAnnotation(
  deckRoot: string,
  id: string,
  patch: { note?: string; processed?: boolean },
): Annotation | null {
  const file = readAnnotations(deckRoot);
  const target = file.annotations.find((a) => a.id === id);
  if (!target) return null;
  if (typeof patch.note === 'string') target.note = patch.note;
  if (typeof patch.processed === 'boolean') target.processed = patch.processed;
  writeAnnotations(deckRoot, file);
  return target;
}

/** Remove an annotation. Returns true if one was deleted. */
export function removeAnnotation(deckRoot: string, id: string): boolean {
  const file = readAnnotations(deckRoot);
  const next = file.annotations.filter((a) => a.id !== id);
  if (next.length === file.annotations.length) return false;
  writeAnnotations(deckRoot, { ...file, annotations: next });
  return true;
}
