/**
 * `slideless unpublish <slug>` — remove a listing from the marketplace.
 *
 * Hard-deletes the listing and its stars, and revokes the public preview
 * token on the source deck. The presentation itself is untouched.
 *
 * Usage:
 *   slideless unpublish acme-pitch-deck
 */

import { Command } from 'commander';
import { createInterface } from 'readline/promises';

import { resolveApiKey, API_KEY_MISSING_MESSAGE } from '../../utils/config.js';
import { deleteMarketplaceListing } from '../../utils/marketplace-client.js';
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

interface UnpublishOptions {
  yes?: boolean;
  apiKey?: string;
  apiUrl?: string;
  profile?: string;
  json?: boolean;
}

async function promptYes(slug: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(
      `${yellow('⚠')}  This removes the marketplace listing "${slug}" (and its stars). The presentation itself is kept.\nType "unpublish" to confirm: `,
    );
    return answer.trim().toLowerCase() === 'unpublish';
  } finally {
    rl.close();
  }
}

export const unpublishCommand = new Command('unpublish')
  .description('Remove one of your listings from the marketplace')
  .argument('<slug>', 'Marketplace listing slug')
  .option('--yes', 'Skip interactive confirmation')
  .option('--api-key <key>', 'Override API key')
  .option('--api-url <url>', 'Override base URL')
  .option('--profile <name>', 'Use a specific profile')
  .option('--json', 'Output as JSON')
  .action(async (slug: string, options: UnpublishOptions) => {
    const jsonMode = options.json ?? false;
    const apiKey = resolveApiKey(options.apiKey, options.profile);
    if (!apiKey) {
      if (jsonMode) emitJsonError({ code: 'unauthenticated', message: API_KEY_MISSING_MESSAGE });
      else exitWithError(API_KEY_MISSING_MESSAGE, 1);
      process.exit(1);
    }

    if (!options.yes && !jsonMode) {
      const ok = await promptYes(slug);
      if (!ok) {
        console.log('Aborted.');
        process.exit(1);
      }
    } else if (!options.yes && jsonMode) {
      emitJsonError({ code: 'invalid-argument', message: 'Pass --yes in non-interactive mode.' });
      process.exit(1);
    }

    const result = await deleteMarketplaceListing({
      apiKey: apiKey!,
      apiUrl: options.apiUrl,
      profileName: options.profile,
      slug,
    });

    if (!result.success) {
      if (jsonMode) emitJsonError(result.error, result.status);
      else {
        console.log('');
        console.log(`${CROSS} ${red('Unpublish failed')}`);
        console.log(`  ${result.error.message}`);
        console.log('');
      }
      process.exit(1);
    }

    if (jsonMode) {
      emitJsonSuccess(result.data);
      return;
    }
    console.log('');
    console.log(`${CHECK} ${green('Unpublished')} — "${slug}" is no longer on the marketplace.`);
    console.log('');
  });
