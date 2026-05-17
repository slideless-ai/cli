/**
 * `slideless publish` — publish the current deck to the public marketplace.
 *
 * Run inside a linked deck folder (one with a `slideless.json`). Publishes a
 * pinned, immutable snapshot as a marketplace listing others can remix.
 *
 * Usage:
 *   slideless publish --kind presentation --description "A clean pitch deck"
 *   slideless publish --kind app --slug invoice-generator --description "…"
 *   slideless publish --kind plan --description "…" --tags pitch,startup --category business
 */

import { Command } from 'commander';

import { resolveApiKey, API_KEY_MISSING_MESSAGE } from '../../utils/config.js';
import { readLocalManifest } from '../../utils/local-manifest.js';
import { publishMarketplaceListing } from '../../utils/marketplace-client.js';
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
  yellow,
} from '../utils/output.js';

interface PublishOptions {
  kind?: string;
  interactive?: boolean;
  slug?: string;
  title?: string;
  description?: string;
  readme?: string;
  tags?: string;
  category?: string;
  version?: string;
  thumbnail?: string;
  apiKey?: string;
  apiUrl?: string;
  profile?: string;
  json?: boolean;
}

export const publishCommand = new Command('publish')
  .description('Publish the current deck to the Slideless marketplace')
  .option('--kind <kind>', 'Listing kind: "presentation", "app", or "plan" (required)')
  .option('--interactive', 'Mark the listing as interactive (forced on for apps)')
  .option('--description <text>', 'Short description shown in the marketplace (required)')
  .option('--slug <slug>', 'Custom URL slug (kebab-case; derived from the title if omitted)')
  .option('--title <title>', 'Listing title (defaults to the presentation title)')
  .option('--readme <text>', 'Optional longer markdown description')
  .option('--tags <tags>', 'Comma-separated tags (e.g. pitch,startup)')
  .option('--category <category>', 'A single category (business, marketing, education, …)')
  .option('--version <N>', 'Pin to a specific version (default: current)')
  .option('--thumbnail <path>', 'Manifest-relative path of a thumbnail asset')
  .option('--api-key <key>', 'Override API key')
  .option('--api-url <url>', 'Override base URL')
  .option('--profile <name>', 'Use a specific profile')
  .option('--json', 'Output as JSON')
  .action(async (options: PublishOptions) => {
    const jsonMode = options.json ?? false;

    const fail = (code: string, message: string, status?: number): never => {
      if (jsonMode) emitJsonError({ code, message }, status);
      else exitWithError(message, 1);
      process.exit(1);
    };

    const apiKey = resolveApiKey(options.apiKey, options.profile);
    if (!apiKey) fail('unauthenticated', API_KEY_MISSING_MESSAGE);

    if (
      options.kind !== 'presentation' &&
      options.kind !== 'app' &&
      options.kind !== 'plan'
    ) {
      fail(
        'invalid-argument',
        '--kind is required and must be "presentation", "app", or "plan".',
      );
    }
    const description = (options.description ?? '').trim();
    if (!description) fail('invalid-argument', '--description is required.');

    let version: number | undefined;
    if (options.version !== undefined) {
      version = Number(options.version);
      if (!Number.isInteger(version) || version < 1) {
        fail('invalid-argument', '--version must be a positive integer.');
      }
    }

    // Resolve the linked presentation from slideless.json in the cwd.
    let presentationId: string;
    try {
      presentationId = readLocalManifest(process.cwd()).presentationId;
    } catch (err) {
      fail('no-local-manifest', err instanceof Error ? err.message : String(err));
      return;
    }

    const tags = options.tags
      ? options.tags.split(',').map((t) => t.trim()).filter(Boolean)
      : undefined;

    const result = await publishMarketplaceListing({
      apiKey: apiKey!,
      apiUrl: options.apiUrl,
      profileName: options.profile,
      presentationId,
      kind: options.kind as 'presentation' | 'app' | 'plan',
      interactive: options.interactive,
      description,
      slug: options.slug,
      title: options.title,
      readme: options.readme,
      tags,
      category: options.category,
      version,
      thumbnailPath: options.thumbnail,
    });

    if (!result.success) {
      if (jsonMode) emitJsonError(result.error, result.status);
      else {
        console.log('');
        console.log(`${CROSS} ${red('Publish failed')}`);
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

    const { slug, kind, marketplaceUrl, publishedVersion } = result.data;
    console.log('');
    console.log(`${CHECK} ${green('Published to the marketplace')}`);
    console.log('');
    console.log(`  Slug:       ${bold(slug)}`);
    console.log(`  Kind:       ${kind}`);
    console.log(`  Version:    v${publishedVersion}`);
    console.log(`  Listing:    ${cyan(marketplaceUrl)}`);
    console.log('');
    console.log(`  Anyone can now remix it with:`);
    console.log(`    ${cyan(`slideless remix ${slug}`)}`);
    console.log('');
  });
