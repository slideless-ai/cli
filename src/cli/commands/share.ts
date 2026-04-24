/**
 * `slideless share` — mint a viewer token for an existing presentation.
 *
 * In v0.5 `share` does ONE thing: create a named viewer URL. Uploading is
 * handled by `push`; revoking is `unshare`. This replaces both the old
 * `share <path>` (upload) and `token add` (mint token) commands.
 *
 * Usage:
 *   slideless share <id>                             # mints a "default" token
 *   slideless share <id> --name "Acme"               # named token
 *   slideless share <id> --pin 3                     # pin to version 3
 */

import { Command } from 'commander';

import {
  resolveApiKey,
  API_KEY_MISSING_MESSAGE,
} from '../../utils/config.js';
import { addPresentationToken } from '../../utils/presentations-client.js';
import type { TokenVersionMode } from '../../types/api.js';
import {
  exitWithError,
  emitJsonSuccess,
  emitJsonError,
  green,
  cyan,
  CHECK,
  CROSS,
  red,
  yellow,
} from '../utils/output.js';

interface ShareOptions {
  name?: string;
  pin?: string;
  apiKey?: string;
  apiUrl?: string;
  profile?: string;
  json?: boolean;
}

export const shareCommand = new Command('share')
  .description('Mint a public viewer token for an existing presentation')
  .argument('<presentationId>', 'Presentation ID to share')
  .option('--name <name>', 'Human-readable label for the token (default: "default")')
  .option('--pin <version>', 'Pin the token to a specific version (default: follows latest)')
  .option('--api-key <key>', 'Override API key')
  .option('--api-url <url>', 'Override base URL')
  .option('--profile <name>', 'Use a specific profile')
  .option('--json', 'Output as JSON')
  .action(async (presentationId: string, options: ShareOptions) => {
    const jsonMode = options.json ?? false;
    const apiKey = resolveApiKey(options.apiKey, options.profile);
    if (!apiKey) {
      if (jsonMode) {
        emitJsonError({ code: 'unauthenticated', message: API_KEY_MISSING_MESSAGE });
        process.exit(1);
      }
      exitWithError(API_KEY_MISSING_MESSAGE, 1);
    }

    let versionMode: TokenVersionMode | undefined;
    if (options.pin !== undefined) {
      const v = Number(options.pin);
      if (!Number.isInteger(v) || v < 1) {
        const msg = '--pin must be a positive integer';
        if (jsonMode) emitJsonError({ code: 'invalid-argument', message: msg });
        else exitWithError(msg, 1);
        process.exit(1);
      }
      versionMode = { type: 'pinned', version: v };
    }

    const tokenName = (options.name ?? 'default').trim() || 'default';

    const result = await addPresentationToken({
      apiKey,
      apiUrl: options.apiUrl,
      profileName: options.profile,
      presentationId: presentationId,
      tokenName,
      versionMode,
    });

    if (!result.success) {
      if (jsonMode) emitJsonError(result.error, result.status);
      else {
        console.log('');
        console.log(`${CROSS} ${red('Share failed')}`);
        console.log('');
        console.log(`  ${result.error.message}`);
        if (result.status) console.log(`  HTTP ${result.status} · ${result.error.code}`);
        if (result.error.nextAction) {
          console.log('');
          console.log(`  ${yellow('Next:')} ${result.error.nextAction}`);
        }
        console.log('');
      }
      process.exit(1);
    }

    if (jsonMode) {
      emitJsonSuccess(result.data);
      return;
    }

    const { tokenId, shareUrl } = result.data;
    console.log('');
    console.log(`${CHECK} ${green('Viewer URL minted')}`);
    console.log('');
    console.log(`  Presentation:  ${presentationId}`);
    console.log(`  Token name:    ${tokenName}`);
    console.log(`  Token ID:      ${tokenId}`);
    if (versionMode?.type === 'pinned') console.log(`  Pinned to:     v${versionMode.version}`);
    console.log(`  Share URL:     ${cyan(shareUrl)}`);
    console.log('');
  });
