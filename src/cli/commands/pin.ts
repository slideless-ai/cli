/**
 * `slideless pin` — set a token's versionMode (pinned vs latest).
 *
 * Only the presentation owner can change pinning. Recipients whose token is
 * pinned to version N see only that version — they never see later rewrites,
 * which is the whole point (owners pin before sending out a deck they don't
 * want to accidentally change).
 *
 * Usage:
 *   slideless pin <shareId> <tokenId> --to-version <N>
 *   slideless pin <shareId> <tokenId> --latest
 *
 * Note the flag is --to-version (not --version) to avoid clobbering
 * Commander's program-level --version flag.
 */

import { Command } from 'commander';
import {
  resolveApiKey,
  API_KEY_MISSING_MESSAGE,
} from '../../utils/config.js';
import { setTokenVersionMode } from '../../utils/presentations-client.js';
import {
  exitWithError,
  emitJsonSuccess,
  emitJsonError,
  green,
  CHECK,
  CROSS,
  red,
} from '../utils/output.js';
import type { TokenVersionMode } from '../../types/api.js';

interface PinOptions {
  toVersion?: string;
  latest?: boolean;
  apiKey?: string;
  apiUrl?: string;
  profile?: string;
  json?: boolean;
}

export const pinCommand = new Command('pin')
  .description(`Set a token's version mode: pin to a specific version or follow latest`)
  .argument('<shareId>', 'Presentation shareId')
  .argument('<tokenId>', 'Token to update')
  .option('--to-version <n>', 'Pin to a specific version number (positive integer)')
  .option('--latest', 'Follow the latest version (default on new tokens)')
  .option('--api-key <key>', 'Override API key')
  .option('--api-url <url>', 'Override base URL')
  .option('--profile <name>', 'Use a specific profile')
  .option('--json', 'Output as JSON')
  .action(async (shareId: string, tokenId: string, options: PinOptions) => {
    const apiKey = resolveApiKey(options.apiKey, options.profile);
    if (!apiKey) {
      if (options.json) emitJsonError({ code: 'unauthenticated', message: API_KEY_MISSING_MESSAGE });
      else exitWithError(API_KEY_MISSING_MESSAGE, 1);
      process.exit(1);
    }

    const wantsPinned = typeof options.toVersion === 'string';
    if (wantsPinned === !!options.latest) {
      const msg = 'Pass exactly one of --to-version <N> or --latest.';
      if (options.json) emitJsonError({ code: 'invalid-argument', message: msg });
      else exitWithError(msg, 1);
      process.exit(1);
    }

    let versionMode: TokenVersionMode;
    if (wantsPinned) {
      const n = Number.parseInt(options.toVersion!, 10);
      if (!Number.isInteger(n) || n < 1) {
        const msg = '--to-version must be a positive integer';
        if (options.json) emitJsonError({ code: 'invalid-argument', message: msg });
        else exitWithError(msg, 1);
        process.exit(1);
      }
      versionMode = { type: 'pinned', version: n };
    } else {
      versionMode = { type: 'latest' };
    }

    const result = await setTokenVersionMode({
      apiKey,
      apiUrl: options.apiUrl,
      profileName: options.profile,
      shareId,
      tokenId,
      versionMode,
    });

    if (!result.success) {
      if (options.json) emitJsonError(result.error, result.status);
      else {
        console.log('');
        console.log(`${CROSS} ${red('Pin failed')}`);
        console.log('');
        console.log(`  ${result.error.message}`);
        if (result.status) console.log(`  HTTP ${result.status}`);
        console.log('');
      }
      process.exit(1);
    }

    if (options.json) {
      emitJsonSuccess(result.data);
      return;
    }

    const label =
      result.data.versionMode.type === 'pinned'
        ? `pinned to version ${result.data.versionMode.version}`
        : 'following latest';
    console.log('');
    console.log(`${CHECK} ${green(`Token ${label}`)}`);
    console.log('');
    console.log('Recipients of this token will now see:');
    console.log(`  ${label}`);
    console.log('');
  });
