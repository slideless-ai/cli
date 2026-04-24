/**
 * `slideless unshare` — revoke one viewer token, or all of them.
 *
 * Without `--token`: revokes every active token on the presentation (makes
 * the deck "unshared" — existing URLs stop working, but the deck itself
 * still exists and collaborators can still push). `--token <id>` scopes the
 * revocation to a single token.
 *
 * Usage:
 *   slideless unshare <id>                    # revoke all tokens
 *   slideless unshare <id> --token <tokenId>  # revoke one
 */

import { Command } from 'commander';

import {
  resolveApiKey,
  API_KEY_MISSING_MESSAGE,
} from '../../utils/config.js';
import { unsharePresentation } from '../../utils/presentations-client.js';
import {
  exitWithError,
  emitJsonSuccess,
  emitJsonError,
  green,
  CHECK,
  CROSS,
  red,
  yellow,
} from '../utils/output.js';

interface UnshareOptions {
  token?: string;
  apiKey?: string;
  apiUrl?: string;
  profile?: string;
  json?: boolean;
}

export const unshareCommand = new Command('unshare')
  .description('Revoke one token (--token) or every token on the presentation')
  .argument('<presentationId>', 'Presentation ID to unshare')
  .option('--token <tokenId>', 'Revoke only this token')
  .option('--api-key <key>', 'Override API key')
  .option('--api-url <url>', 'Override base URL')
  .option('--profile <name>', 'Use a specific profile')
  .option('--json', 'Output as JSON')
  .action(async (presentationId: string, options: UnshareOptions) => {
    const jsonMode = options.json ?? false;
    const apiKey = resolveApiKey(options.apiKey, options.profile);
    if (!apiKey) {
      if (jsonMode) {
        emitJsonError({ code: 'unauthenticated', message: API_KEY_MISSING_MESSAGE });
        process.exit(1);
      }
      exitWithError(API_KEY_MISSING_MESSAGE, 1);
    }

    const result = await unsharePresentation({
      apiKey,
      apiUrl: options.apiUrl,
      profileName: options.profile,
      presentationId: presentationId,
      tokenId: options.token,
    });

    if (!result.success) {
      if (jsonMode) emitJsonError(result.error, result.status);
      else {
        console.log('');
        console.log(`${CROSS} ${red('Unshare failed')}`);
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

    console.log('');
    if (options.token) {
      console.log(`${CHECK} ${green('Token revoked')}`);
      console.log('');
      console.log(`  Presentation: ${presentationId}`);
      console.log(`  Token ID:     ${options.token}`);
    } else {
      console.log(`${CHECK} ${green(`Unshared (${result.data.tokensRevoked} token${result.data.tokensRevoked === 1 ? '' : 's'} revoked)`)}`);
      console.log('');
      console.log(`  Presentation: ${presentationId}`);
      console.log(`  The deck still exists. Run \`slideless share ${presentationId}\` to mint a new URL.`);
    }
    console.log('');
  });
