/**
 * Revoke a shared presentation or a single recipient token.
 *
 * Two modes:
 *   slideless revoke <shareId>                     # archive the whole presentation
 *   slideless revoke <shareId> --token <tokenId>   # revoke a single token
 */

import { Command } from 'commander';

import {
  resolveApiKey,
  API_KEY_MISSING_MESSAGE,
} from '../../utils/config.js';
import { revokeSharedPresentation } from '../../utils/presentations-client.js';
import {
  CHECK,
  CROSS,
  emitJsonError,
  emitJsonSuccess,
  exitWithError,
  green,
  red,
  yellow,
} from '../utils/output.js';

export const revokeCommand = new Command('revoke')
  .description('Revoke a shared presentation (archive) or a single recipient token')
  .argument('<shareId>', 'Share ID of the presentation')
  .option('--token <tokenId>', 'Revoke only this token; omit to archive the whole presentation')
  .option('--api-key <key>', 'Override API key')
  .option('--api-url <url>', 'Override base URL')
  .option('--profile <name>', 'Use a specific profile')
  .option('--json', 'Output as JSON')
  .action(async (shareId: string, options: {
    token?: string;
    apiKey?: string;
    apiUrl?: string;
    profile?: string;
    json?: boolean;
  }) => {
    const jsonMode = options.json ?? false;

    const apiKey = resolveApiKey(options.apiKey, options.profile);
    if (!apiKey) {
      if (jsonMode) {
        emitJsonError({ code: 'unauthenticated', message: API_KEY_MISSING_MESSAGE });
        process.exit(1);
      }
      exitWithError(API_KEY_MISSING_MESSAGE, 1);
    }

    const result = await revokeSharedPresentation({
      apiKey,
      apiUrl: options.apiUrl,
      profileName: options.profile,
      shareId,
      tokenId: options.token,
    });

    if (!result.success) {
      if (jsonMode) {
        emitJsonError(result.error, result.status);
      } else {
        console.log('');
        console.log(`${CROSS} ${red('Revoke failed')}`);
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
      console.log(`  Share ID:  ${shareId}`);
      console.log(`  Token ID:  ${options.token}`);
    } else {
      console.log(`${CHECK} ${green('Presentation archived')}`);
      console.log('');
      console.log(`  Share ID:  ${shareId}`);
      console.log(`  All tokens on this presentation will stop working.`);
    }
    console.log('');
  });
