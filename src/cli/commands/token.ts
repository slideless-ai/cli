/**
 * Token operations on an existing presentation.
 *
 * Today:
 *   slideless token add <shareId> --name "Acme Corp"    # mint a new named token
 *
 * Structured as a parent command with subcommands so future operations
 * (`list`, `revoke`, etc.) can slot in without reshuffling the UX.
 */

import { Command } from 'commander';

import {
  resolveApiKey,
  API_KEY_MISSING_MESSAGE,
} from '../../utils/config.js';
import { addPresentationToken } from '../../utils/presentations-client.js';
import {
  CHECK,
  CROSS,
  cyan,
  emitJsonError,
  emitJsonSuccess,
  exitWithError,
  green,
  red,
  yellow,
} from '../utils/output.js';

const addSubcommand = new Command('add')
  .description('Create a new named token for an existing presentation')
  .argument('<shareId>', 'Share ID of the presentation')
  .requiredOption('--name <tokenName>', 'Human-readable label for the token (e.g. recipient name)')
  .option('--api-key <key>', 'Override API key')
  .option('--api-url <url>', 'Override base URL')
  .option('--profile <name>', 'Use a specific profile')
  .option('--json', 'Output as JSON')
  .action(async (shareId: string, options: {
    name: string;
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

    const tokenName = (options.name ?? '').trim();
    if (!tokenName) {
      if (jsonMode) {
        emitJsonError({ code: 'invalid-argument', message: '--name is required and cannot be empty' });
        process.exit(1);
      }
      exitWithError('--name is required and cannot be empty', 1);
    }

    const result = await addPresentationToken({
      apiKey,
      apiUrl: options.apiUrl,
      profileName: options.profile,
      shareId,
      tokenName,
    });

    if (!result.success) {
      if (jsonMode) {
        emitJsonError(result.error, result.status);
      } else {
        console.log('');
        console.log(`${CROSS} ${red('Add token failed')}`);
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
    console.log(`${CHECK} ${green('Token created')}`);
    console.log('');
    console.log(`  Name:       ${tokenName}`);
    console.log(`  Token ID:   ${tokenId}`);
    console.log(`  Share URL:  ${cyan(shareUrl)}`);
    console.log('');
  });

export const tokenCommand = new Command('token')
  .description('Manage per-recipient tokens on an existing presentation')
  .addCommand(addSubcommand);
