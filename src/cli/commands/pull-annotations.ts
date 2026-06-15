/**
 * `slideless pull-annotations` — pull hosted annotations into the local
 * `.slideless/annotations.json` so the existing local apply flow consumes
 * local + hosted notes uniformly.
 *
 * Hosted annotations are owner-only and stored server-side (gathered by viewers
 * through the hosted overlay). This command merges them into the same file
 * `slideless dev` writes to, deduping by the hosted annotation id so re-pulls
 * are idempotent and never clobber local notes.
 *
 * Usage:
 *   slideless pull-annotations 01HXYZ...           # all versions
 *   slideless pull-annotations                     # presentationId from slideless.json
 *   slideless pull-annotations 01HXYZ... --at 3    # only notes against version 3
 *   slideless pull-annotations --path ./my-deck    # explicit deck dir
 */

import { Command } from 'commander';

import {
  resolveApiKey,
  API_KEY_MISSING_MESSAGE,
} from '../../utils/config.js';
import { listAnnotations } from '../../utils/presentations-client.js';
import {
  mergeHostedAnnotations,
  type PreformedAnnotation,
} from '../../utils/annotations-store.js';
import { readLocalManifest } from '../../utils/local-manifest.js';
import type { PresentationAnnotationInfo } from '../../types/api.js';
import {
  exitWithError,
  emitJsonSuccess,
  emitJsonError,
  green,
  cyan,
  CHECK,
  CROSS,
  red,
} from '../utils/output.js';

interface PullAnnotationsOptions {
  at?: string;
  path?: string;
  apiKey?: string;
  apiUrl?: string;
  profile?: string;
  json?: boolean;
}

/** Map a hosted annotation into the local v2 (pre-formed) shape. */
function toLocal(a: PresentationAnnotationInfo): PreformedAnnotation {
  return {
    id: a.id,
    createdAt: a.createdAt,
    processed: a.processed === true,
    note: a.note,
    entryFile: a.entryFile,
    selectedText: a.selectedText,
    context: { before: a.context?.before, after: a.context?.after },
    anchor: a.anchor,
    deckVersion: typeof a.deckVersion === 'number' ? a.deckVersion : null,
    source: 'hosted',
    author: typeof a.author === 'string' ? a.author : null,
  };
}

export const pullAnnotationsCommand = new Command('pull-annotations')
  .description(
    'Pull hosted annotations into the local .slideless/annotations.json (owner-only)',
  )
  .argument(
    '[presentationId]',
    'Presentation ID (default: presentationId from the local slideless.json)',
  )
  .option('--at <N>', 'Only pull notes made against a specific version (default: all)')
  .option('--path <dir>', 'Deck directory (default: current directory)', '.')
  .option('--api-key <key>', 'Override API key')
  .option('--api-url <url>', 'Override base URL')
  .option('--profile <name>', 'Use a specific profile')
  .option('--json', 'Output as JSON')
  .action(async (presentationIdArg: string | undefined, options: PullAnnotationsOptions) => {
    const jsonMode = options.json ?? false;
    const deckRoot = options.path ?? '.';

    const apiKey = resolveApiKey(options.apiKey, options.profile);
    if (!apiKey) {
      if (jsonMode) {
        emitJsonError({ code: 'unauthenticated', message: API_KEY_MISSING_MESSAGE });
        process.exit(1);
      }
      exitWithError(API_KEY_MISSING_MESSAGE, 1);
    }

    // Resolve presentationId + default version filter from the local manifest
    // when running inside a pulled deck.
    let presentationId = presentationIdArg;
    let defaultVersion: number | undefined;
    if (!presentationId || options.at === undefined) {
      try {
        const manifest = readLocalManifest(deckRoot);
        if (!presentationId) presentationId = manifest.presentationId;
        // Only default the version filter to this deck's version when the
        // presentationId ALSO came from this manifest. An explicit, possibly
        // unrelated <presentationId> must NOT be silently filtered to the local
        // deck's version (it would yield empty/wrong results).
        if (!presentationIdArg) defaultVersion = manifest.lastPulledVersion;
      } catch {
        // No manifest — fine as long as a presentationId was passed explicitly.
      }
    }

    if (!presentationId) {
      const msg =
        'No presentation ID given and no slideless.json found. Pass <presentationId> or run from inside a pulled deck.';
      if (jsonMode) emitJsonError({ code: 'invalid-argument', message: msg });
      else exitWithError(msg, 1);
      process.exit(1);
    }

    let version: number | undefined;
    if (options.at !== undefined) {
      version = Number(options.at);
      if (!Number.isInteger(version) || version < 1) {
        const msg = '--at must be a positive integer';
        if (jsonMode) emitJsonError({ code: 'invalid-argument', message: msg });
        else exitWithError(msg, 1);
        process.exit(1);
      }
    } else {
      version = defaultVersion;
    }

    const result = await listAnnotations({
      apiKey: apiKey!,
      apiUrl: options.apiUrl,
      profileName: options.profile,
      presentationId,
      version,
    });

    if (!result.success) {
      if (jsonMode) emitJsonError(result.error, result.status);
      else {
        console.log('');
        console.log(`${CROSS} ${red('Failed to fetch annotations')}`);
        console.log('');
        console.log(`  ${result.error.message}`);
        if (result.status) console.log(`  HTTP ${result.status}`);
        console.log('');
      }
      process.exit(1);
    }

    const hosted = result.data.annotations ?? [];
    const { added, skipped } = mergeHostedAnnotations(
      deckRoot,
      hosted.map(toLocal),
    );

    if (jsonMode) {
      emitJsonSuccess({ pulled: added, skipped, total: hosted.length });
      return;
    }

    const authors = Array.from(
      new Set(
        hosted
          .map((a) => (typeof a.author === 'string' ? a.author.trim() : ''))
          .filter((a) => a.length > 0),
      ),
    );
    const authorList =
      authors.length === 0
        ? 'hosted viewers'
        : authors.length <= 3
          ? authors.join(', ')
          : `${authors.slice(0, 3).join(', ')} +${authors.length - 3} more`;

    console.log('');
    if (added === 0) {
      console.log(`${CHECK} ${green('Up to date')} — no new annotations`);
      if (skipped > 0) {
        console.log(`  ${skipped} already present locally`);
      }
    } else {
      console.log(
        `${CHECK} ${green(`Pulled ${added} new annotation${added === 1 ? '' : 's'}`)} from ${cyan(authorList)}`,
      );
      if (skipped > 0) {
        console.log(`  Skipped ${skipped} duplicate${skipped === 1 ? '' : 's'}`);
      }
    }
    console.log('');
  });
