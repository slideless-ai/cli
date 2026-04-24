/**
 * Local manifest (`slideless.json`)
 *
 * Every pulled/pushed deck carries a visible `slideless.json` at the folder
 * root. It's how `push` knows whether to mint a new presentation or update
 * an existing one, and how `pull` decides whether to overwrite an existing
 * folder. The file is excluded from upload via the built-in ignore list in
 * `folder-walker.ts`.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';

export const LOCAL_MANIFEST_FILENAME = 'slideless.json';

export interface LocalManifest {
  presentationId: string;
  baseUrl?: string;
  lastPulledVersion: number;
  lastPulledAt: string;
  role: 'owner' | 'dev';
}

export function localManifestPath(deckRoot: string): string {
  return join(resolve(deckRoot), LOCAL_MANIFEST_FILENAME);
}

export function hasLocalManifest(deckRoot: string): boolean {
  return existsSync(localManifestPath(deckRoot));
}

function validateManifest(raw: unknown): LocalManifest {
  if (!raw || typeof raw !== 'object') {
    throw new Error('slideless.json: expected an object');
  }
  const r = raw as Record<string, unknown>;
  if (typeof r.presentationId !== 'string' || r.presentationId.length === 0) {
    throw new Error('slideless.json: presentationId (string) is required');
  }
  if (typeof r.lastPulledVersion !== 'number' || !Number.isFinite(r.lastPulledVersion) || r.lastPulledVersion < 1) {
    throw new Error('slideless.json: lastPulledVersion (positive integer) is required');
  }
  if (typeof r.lastPulledAt !== 'string') {
    throw new Error('slideless.json: lastPulledAt (ISO string) is required');
  }
  if (r.role !== 'owner' && r.role !== 'dev') {
    throw new Error('slideless.json: role must be "owner" or "dev"');
  }
  if (r.baseUrl !== undefined && typeof r.baseUrl !== 'string') {
    throw new Error('slideless.json: baseUrl must be a string when present');
  }
  return {
    presentationId: r.presentationId,
    baseUrl: (r.baseUrl as string | undefined) ?? undefined,
    lastPulledVersion: r.lastPulledVersion,
    lastPulledAt: r.lastPulledAt,
    role: r.role,
  };
}

export function readLocalManifest(deckRoot: string): LocalManifest {
  const path = localManifestPath(deckRoot);
  if (!existsSync(path)) {
    throw new Error(`No slideless.json found in ${deckRoot}. Run \`slideless push --title "…"\` to create a new deck, or \`slideless pull <id>\` to fetch an existing one.`);
  }
  const raw = readFileSync(path, 'utf-8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`slideless.json is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
  return validateManifest(parsed);
}

export function writeLocalManifest(deckRoot: string, manifest: LocalManifest): void {
  const path = localManifestPath(deckRoot);
  const normalized: LocalManifest = {
    presentationId: manifest.presentationId,
    lastPulledVersion: manifest.lastPulledVersion,
    lastPulledAt: manifest.lastPulledAt,
    role: manifest.role,
    ...(manifest.baseUrl ? { baseUrl: manifest.baseUrl } : {}),
  };
  writeFileSync(path, JSON.stringify(normalized, null, 2) + '\n', { mode: 0o644 });
}
