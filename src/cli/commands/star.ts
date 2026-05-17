/**
 * `slideless star` / `unstar` / `stars` — GitHub-style stars for the marketplace.
 *
 *   slideless star <slug>     — star a listing
 *   slideless unstar <slug>   — remove your star
 *   slideless stars           — list the listings you have starred
 *
 * All three require an API key (starring is an authenticated, per-user action).
 */

import { Command } from 'commander';

import { resolveApiKey, API_KEY_MISSING_MESSAGE } from '../../utils/config.js';
import {
  starMarketplaceListing,
  unstarMarketplaceListing,
  listMyStarredListings,
} from '../../utils/marketplace-client.js';
import {
  exitWithError,
  emitJsonSuccess,
  emitJsonError,
  green,
  cyan,
  bold,
  CHECK,
  CROSS,
  red,
} from '../utils/output.js';

interface StarOptions {
  apiKey?: string;
  apiUrl?: string;
  profile?: string;
  json?: boolean;
}

function requireKey(options: StarOptions): string {
  const apiKey = resolveApiKey(options.apiKey, options.profile);
  if (!apiKey) {
    if (options.json) emitJsonError({ code: 'unauthenticated', message: API_KEY_MISSING_MESSAGE });
    else exitWithError(API_KEY_MISSING_MESSAGE, 1);
    process.exit(1);
  }
  return apiKey;
}

export const starCommand = new Command('star')
  .description('Star a marketplace listing')
  .argument('<slug>', 'Marketplace listing slug')
  .option('--api-key <key>', 'Override API key')
  .option('--api-url <url>', 'Override base URL')
  .option('--profile <name>', 'Use a specific profile')
  .option('--json', 'Output as JSON')
  .action(async (slug: string, options: StarOptions) => {
    const apiKey = requireKey(options);
    const result = await starMarketplaceListing({
      apiKey, apiUrl: options.apiUrl, profileName: options.profile, slug,
    });
    if (!result.success) {
      if (options.json) emitJsonError(result.error, result.status);
      else exitWithError(result.error.message, 1);
      process.exit(1);
    }
    if (options.json) {
      emitJsonSuccess(result.data);
      return;
    }
    console.log('');
    console.log(`${CHECK} ${green('Starred')} ${bold(slug)} — ${result.data.starCount} star${result.data.starCount === 1 ? '' : 's'}`);
    console.log('');
  });

export const unstarCommand = new Command('unstar')
  .description('Remove your star from a marketplace listing')
  .argument('<slug>', 'Marketplace listing slug')
  .option('--api-key <key>', 'Override API key')
  .option('--api-url <url>', 'Override base URL')
  .option('--profile <name>', 'Use a specific profile')
  .option('--json', 'Output as JSON')
  .action(async (slug: string, options: StarOptions) => {
    const apiKey = requireKey(options);
    const result = await unstarMarketplaceListing({
      apiKey, apiUrl: options.apiUrl, profileName: options.profile, slug,
    });
    if (!result.success) {
      if (options.json) emitJsonError(result.error, result.status);
      else exitWithError(result.error.message, 1);
      process.exit(1);
    }
    if (options.json) {
      emitJsonSuccess(result.data);
      return;
    }
    console.log('');
    console.log(`${CHECK} ${green('Unstarred')} ${bold(slug)} — ${result.data.starCount} star${result.data.starCount === 1 ? '' : 's'}`);
    console.log('');
  });

export const starsCommand = new Command('stars')
  .description('List the marketplace listings you have starred')
  .option('--api-key <key>', 'Override API key')
  .option('--api-url <url>', 'Override base URL')
  .option('--profile <name>', 'Use a specific profile')
  .option('--json', 'Output as JSON')
  .action(async (options: StarOptions) => {
    const apiKey = requireKey(options);
    const result = await listMyStarredListings({
      apiKey, apiUrl: options.apiUrl, profileName: options.profile,
    });
    if (!result.success) {
      if (options.json) emitJsonError(result.error, result.status);
      else exitWithError(result.error.message, 1);
      process.exit(1);
    }
    if (options.json) {
      emitJsonSuccess(result.data);
      return;
    }
    const { listings } = result.data;
    console.log('');
    if (listings.length === 0) {
      console.log('  You have not starred any listings yet.');
      console.log('');
      return;
    }
    console.log(`  ${bold('Your starred listings')} (${listings.length})`);
    console.log('');
    for (const l of listings) {
      console.log(`  ${green(l.slug)}  ${l.starCount} star${l.starCount === 1 ? '' : 's'}`);
      console.log(`    ${bold(l.title)} — ${l.description}`);
      console.log(`    remix:  ${cyan(`slideless remix ${l.slug}`)}`);
      console.log('');
    }
  });
