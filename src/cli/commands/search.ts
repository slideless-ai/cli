/**
 * `slideless search [query]` — browse the public marketplace.
 *
 * No API key required. The optional free-text query filters the fetched page
 * by title / description / slug / tags. This is the agent-facing discovery
 * path — pair it with `--json` and pipe a slug into `slideless remix`.
 *
 * Usage:
 *   slideless search                              # latest listings
 *   slideless search pitch --kind presentation    # text + kind filter
 *   slideless search --sort stars --json          # most-starred, as JSON
 */

import { Command } from 'commander';

import { listMarketplaceListings } from '../../utils/marketplace-client.js';
import type { MarketplacePublicListing } from '../../types/api.js';
import {
  exitWithError,
  emitJsonSuccess,
  emitJsonError,
  bold,
  cyan,
  green,
  yellow,
  CROSS,
  red,
} from '../utils/output.js';

interface SearchOptions {
  kind?: string;
  tag?: string;
  category?: string;
  sort?: string;
  limit?: string;
  apiUrl?: string;
  profile?: string;
  json?: boolean;
}

export const searchCommand = new Command('search')
  .description('Browse and search the Slideless marketplace')
  .argument('[query]', 'Optional free-text filter (title, description, slug, tags)')
  .option('--kind <kind>', 'Filter by kind: "presentation", "app", or "plan"')
  .option('--tag <tag>', 'Filter by a single tag')
  .option('--category <category>', 'Filter by category')
  .option('--sort <sort>', 'Sort: "recent" (default), "popular", "stars"')
  .option('--limit <N>', 'Max results (1–50, default 24)')
  .option('--api-url <url>', 'Override base URL')
  .option('--profile <name>', 'Use a specific profile (for base URL only)')
  .option('--json', 'Output as JSON')
  .action(async (query: string | undefined, options: SearchOptions) => {
    const jsonMode = options.json ?? false;

    if (
      options.kind &&
      options.kind !== 'presentation' &&
      options.kind !== 'app' &&
      options.kind !== 'plan'
    ) {
      const msg = '--kind must be "presentation", "app", or "plan".';
      if (jsonMode) emitJsonError({ code: 'invalid-argument', message: msg });
      else exitWithError(msg, 1);
      process.exit(1);
    }
    const sort =
      options.sort === 'popular' || options.sort === 'stars' ? options.sort : 'recent';
    let limit: number | undefined;
    if (options.limit !== undefined) {
      limit = Number(options.limit);
      if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
        const msg = '--limit must be an integer between 1 and 50.';
        if (jsonMode) emitJsonError({ code: 'invalid-argument', message: msg });
        else exitWithError(msg, 1);
        process.exit(1);
      }
    }

    const result = await listMarketplaceListings({
      apiUrl: options.apiUrl,
      profileName: options.profile,
      kind: options.kind as 'presentation' | 'app' | 'plan' | undefined,
      tag: options.tag,
      category: options.category,
      sort,
      limit,
    });

    if (!result.success) {
      if (jsonMode) emitJsonError(result.error, result.status);
      else {
        console.log('');
        console.log(`${CROSS} ${red('Search failed')}`);
        console.log(`  ${result.error.message}`);
        console.log('');
      }
      process.exit(1);
    }

    let listings: MarketplacePublicListing[] = result.data.listings;
    if (query && query.trim().length > 0) {
      const q = query.trim().toLowerCase();
      listings = listings.filter(
        (l) =>
          l.title.toLowerCase().includes(q) ||
          l.description.toLowerCase().includes(q) ||
          l.slug.toLowerCase().includes(q) ||
          l.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }

    if (jsonMode) {
      emitJsonSuccess({ listings, nextCursor: result.data.nextCursor });
      return;
    }

    console.log('');
    if (listings.length === 0) {
      console.log('  No listings found.');
      console.log('');
      return;
    }
    console.log(`  ${bold('Marketplace')} — ${listings.length} listing${listings.length === 1 ? '' : 's'}`);
    console.log('');
    for (const l of listings) {
      const kindColor =
        l.kind === 'app' ? yellow : l.kind === 'plan' ? green : cyan;
      const kindBadge = kindColor(`[${l.kind}]`);
      const interactiveBadge = l.interactive ? ` ${yellow('⚡interactive')}` : '';
      console.log(`  ${green(l.slug)}  ${kindBadge}${interactiveBadge}  ${l.starCount} stars  ${l.remixCount} remixes`);
      console.log(`    ${bold(l.title)} — ${l.description}`);
      if (l.tags.length > 0) console.log(`    tags: ${l.tags.join(', ')}`);
      console.log(`    remix:  slideless remix ${l.slug}`);
      console.log('');
    }
  });
