/**
 * Remix lineage marker (`.slideless-remix.json`)
 *
 * `slideless remix` writes this small marker into the fresh folder it creates.
 * It is NOT a `slideless.json` — the folder stays unlinked — it only records
 * which marketplace listing the folder was remixed from.
 *
 * `slideless push`, when it creates a brand-new presentation, reads the marker
 * and forwards the lineage to the backend so a listing later published from
 * this folder can show "Remixed from <X>". The marker is excluded from upload
 * by the built-in ignore list in `folder-walker.ts`.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';

export const REMIX_MARKER_FILENAME = '.slideless-remix.json';

export interface RemixMarker {
  remixedFromSlug: string;
  remixedFromVersion: number;
  remixedFromTitle: string;
  remixedAt: string;
}

function markerPath(deckRoot: string): string {
  return join(resolve(deckRoot), REMIX_MARKER_FILENAME);
}

export function writeRemixMarker(deckRoot: string, marker: RemixMarker): void {
  writeFileSync(markerPath(deckRoot), JSON.stringify(marker, null, 2) + '\n', { mode: 0o644 });
}

/** Returns the marker if present and well-formed, else null (never throws). */
export function readRemixMarker(deckRoot: string): RemixMarker | null {
  const path = markerPath(deckRoot);
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8')) as Partial<RemixMarker>;
    if (typeof raw.remixedFromSlug !== 'string' || raw.remixedFromSlug.length === 0) return null;
    return {
      remixedFromSlug: raw.remixedFromSlug,
      remixedFromVersion:
        typeof raw.remixedFromVersion === 'number' && raw.remixedFromVersion >= 1
          ? raw.remixedFromVersion
          : 1,
      remixedFromTitle: typeof raw.remixedFromTitle === 'string' ? raw.remixedFromTitle : '',
      remixedAt: typeof raw.remixedAt === 'string' ? raw.remixedAt : '',
    };
  } catch {
    return null;
  }
}
