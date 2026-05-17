/**
 * `slideless listing` — manage and inspect marketplace listings.
 *
 *   slideless listing get <slug>      — show full listing detail (public)
 *   slideless listing update <slug>   — patch listing metadata / status (authed)
 */

import { Command } from 'commander';

import { resolveApiKey, API_KEY_MISSING_MESSAGE } from '../../utils/config.js';
import {
  getMarketplaceListing,
  updateMarketplaceListing,
  listMarketplaceRemixes,
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
  formatBytes,
  formatDate,
} from '../utils/output.js';

interface GetOptions {
  apiUrl?: string;
  profile?: string;
  json?: boolean;
}

interface UpdateOptions extends GetOptions {
  title?: string;
  description?: string;
  readme?: string;
  tags?: string;
  category?: string;
  status?: string;
  interactive?: boolean;
  republishVersion?: string;
  apiKey?: string;
}

const getSubcommand = new Command('get')
  .description('Show full detail for a marketplace listing')
  .argument('<slug>', 'Marketplace listing slug')
  .option('--api-url <url>', 'Override base URL')
  .option('--profile <name>', 'Use a specific profile (for base URL only)')
  .option('--json', 'Output as JSON')
  .action(async (slug: string, options: GetOptions) => {
    const result = await getMarketplaceListing({
      apiUrl: options.apiUrl,
      profileName: options.profile,
      slug,
    });
    if (!result.success) {
      if (options.json) emitJsonError(result.error, result.status);
      else exitWithError(result.error.message, 1);
      process.exit(1);
    }
    // Fetch descendant listings (remixes of this one) for the detail view.
    const remixesResult = await listMarketplaceRemixes({
      apiUrl: options.apiUrl,
      profileName: options.profile,
      slug,
    });
    const remixes = remixesResult.success ? remixesResult.data.remixes : [];

    if (options.json) {
      emitJsonSuccess({ ...result.data, remixes });
      return;
    }
    const l = result.data;
    console.log('');
    console.log(`  ${bold(l.title)}  ${cyan(`[${l.kind}]`)}`);
    console.log(`  ${l.description}`);
    console.log('');
    console.log(`  Slug:        ${l.slug}`);
    console.log(`  Status:      ${l.status}`);
    console.log(`  Kind:        ${l.kind}`);
    console.log(`  Interactive: ${l.interactive ? 'yes' : 'no'}`);
    console.log(`  Author:      ${l.authorDisplayName}`);
    console.log(`  Version:     v${l.publishedVersion}  (${l.fileCount} files, ${formatBytes(l.totalBytes)})`);
    console.log(`  Stars:       ${l.starCount}`);
    console.log(`  Remixes:     ${l.remixCount}`);
    console.log(`  Views:       ${l.viewCount}`);
    if (l.remixedFromSlug) {
      console.log(`  Remixed from: ${l.remixedFromTitle ?? l.remixedFromSlug} (${l.remixedFromSlug})`);
    }
    if (l.category) console.log(`  Category:    ${l.category}`);
    if (l.tags.length > 0) console.log(`  Tags:        ${l.tags.join(', ')}`);
    console.log(`  Published:   ${formatDate(l.createdAt)}`);
    console.log(`  Preview:     ${cyan(l.previewUrl)}`);
    if (remixes.length > 0) {
      console.log('');
      console.log(`  Remixes of this (${remixes.length}):`);
      for (const r of remixes) {
        console.log(`    ${green(r.slug)} — ${r.title} by ${r.authorDisplayName}`);
      }
    }
    console.log('');
    console.log(`  Remix it:    ${cyan(`slideless remix ${l.slug}`)}`);
    console.log('');
  });

const updateSubcommand = new Command('update')
  .description('Update a marketplace listing you authored')
  .argument('<slug>', 'Marketplace listing slug')
  .option('--title <title>', 'New title')
  .option('--description <text>', 'New description')
  .option('--readme <text>', 'New readme (empty string clears it)')
  .option('--tags <tags>', 'Comma-separated tags (replaces existing)')
  .option('--category <category>', 'New category')
  .option('--status <status>', 'Visibility: "public" or "unlisted"')
  .option('--interactive', 'Mark the listing as interactive (ignored for apps; omit to leave unchanged)')
  .option('--no-interactive', 'Mark the listing as non-interactive')
  .option('--republish-version <N>', 'Re-pin the listing to a newer version')
  .option('--api-key <key>', 'Override API key')
  .option('--api-url <url>', 'Override base URL')
  .option('--profile <name>', 'Use a specific profile')
  .option('--json', 'Output as JSON')
  .action(async (slug: string, options: UpdateOptions) => {
    const jsonMode = options.json ?? false;
    const apiKey = resolveApiKey(options.apiKey, options.profile);
    if (!apiKey) {
      if (jsonMode) emitJsonError({ code: 'unauthenticated', message: API_KEY_MISSING_MESSAGE });
      else exitWithError(API_KEY_MISSING_MESSAGE, 1);
      process.exit(1);
    }

    if (options.status && options.status !== 'public' && options.status !== 'unlisted') {
      const msg = '--status must be "public" or "unlisted".';
      if (jsonMode) emitJsonError({ code: 'invalid-argument', message: msg });
      else exitWithError(msg, 1);
      process.exit(1);
    }
    let republishVersion: number | undefined;
    if (options.republishVersion !== undefined) {
      republishVersion = Number(options.republishVersion);
      if (!Number.isInteger(republishVersion) || republishVersion < 1) {
        const msg = '--republish-version must be a positive integer.';
        if (jsonMode) emitJsonError({ code: 'invalid-argument', message: msg });
        else exitWithError(msg, 1);
        process.exit(1);
      }
    }

    const result = await updateMarketplaceListing({
      apiKey: apiKey!,
      apiUrl: options.apiUrl,
      profileName: options.profile,
      slug,
      title: options.title,
      description: options.description,
      readme: options.readme,
      tags: options.tags ? options.tags.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
      category: options.category,
      status: options.status as 'public' | 'unlisted' | undefined,
      interactive: options.interactive,
      republishVersion,
    });

    if (!result.success) {
      if (jsonMode) emitJsonError(result.error, result.status);
      else {
        console.log('');
        console.log(`${CROSS} ${red('Update failed')}`);
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
    console.log(`${CHECK} ${green('Listing updated')} — ${result.data.slug}`);
    console.log('');
  });

export const listingCommand = new Command('listing')
  .description('Manage and inspect marketplace listings')
  .addCommand(getSubcommand)
  .addCommand(updateSubcommand);
