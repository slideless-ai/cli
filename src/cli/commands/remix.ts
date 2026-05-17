/**
 * `slideless remix <slug>` — start from a marketplace listing.
 *
 * Downloads a published listing's files into a FRESH local folder. The result
 * is unlinked — it has NO `slideless.json` — so the natural next step is
 * `slideless push` to create your OWN new presentation from it.
 *
 * No API key required: the marketplace is public.
 *
 * Usage:
 *   slideless remix acme-pitch-deck                 # → ./acme-pitch-deck/
 *   slideless remix acme-pitch-deck ./my-deck       # explicit dir
 *   slideless remix acme-pitch-deck --force         # overwrite a non-empty dir
 */

import { Command } from 'commander';
import { existsSync, statSync } from 'fs';
import { join, resolve } from 'path';

import {
  getMarketplaceListing,
  getMarketplaceListingFiles,
  buildMarketplaceDownloadUrl,
  recordMarketplaceRemix,
} from '../../utils/marketplace-client.js';
import { downloadDeck } from '../../utils/asset-downloader.js';
import { isDirEmpty, wipeDirectoryContents } from '../../utils/fs-helpers.js';
import { writeRemixMarker } from '../../utils/remix-marker.js';
import {
  exitWithError,
  emitJsonSuccess,
  emitJsonError,
  green,
  cyan,
  CHECK,
  CROSS,
  red,
  formatBytes,
} from '../utils/output.js';

interface RemixOptions {
  force?: boolean;
  apiUrl?: string;
  profile?: string;
  json?: boolean;
}

export const remixCommand = new Command('remix')
  .description('Download a marketplace listing into a fresh folder to start from')
  .argument('<slug>', 'Marketplace listing slug')
  .argument('[path]', 'Destination directory (default: ./<slug>)')
  .option('--force', 'Wipe a non-empty destination directory and write the files fresh')
  .option('--api-url <url>', 'Override base URL')
  .option('--profile <name>', 'Use a specific profile (for base URL only)')
  .option('--json', 'Output as JSON')
  .action(async (slug: string, pathArg: string | undefined, options: RemixOptions) => {
    const jsonMode = options.json ?? false;
    const fail = (code: string, message: string, status?: number): never => {
      if (jsonMode) emitJsonError({ code, message }, status);
      else exitWithError(message, 1);
      process.exit(1);
    };

    // 1. Fetch listing metadata.
    const listingResult = await getMarketplaceListing({
      apiUrl: options.apiUrl,
      profileName: options.profile,
      slug,
    });
    if (!listingResult.success) {
      if (jsonMode) emitJsonError(listingResult.error, listingResult.status);
      else {
        console.log('');
        console.log(`${CROSS} ${red('Listing not found')}`);
        console.log('');
        console.log(`  ${listingResult.error.message}`);
        console.log('');
      }
      process.exit(1);
    }
    const listing = listingResult.data;

    // 2. Fetch the pinned version's file manifest.
    const filesResult = await getMarketplaceListingFiles({
      apiUrl: options.apiUrl,
      profileName: options.profile,
      slug,
    });
    if (!filesResult.success) {
      if (jsonMode) emitJsonError(filesResult.error, filesResult.status);
      else exitWithError(filesResult.error.message, 1);
      process.exit(1);
    }
    const { files } = filesResult.data;

    // 3. Resolve the destination directory.
    const destination = pathArg ? resolve(pathArg) : join(process.cwd(), slug);
    if (existsSync(destination)) {
      const stats = statSync(destination);
      if (!stats.isDirectory()) {
        fail('invalid-argument', `Destination ${destination} exists and is not a directory.`);
      }
      if (!isDirEmpty(destination) && !options.force) {
        fail(
          'invalid-argument',
          `Destination ${destination} is non-empty. Pass --force to wipe and overwrite.`,
        );
      }
      if (options.force && !isDirEmpty(destination)) {
        wipeDirectoryContents(destination);
      }
    }

    if (!jsonMode) {
      console.log('');
      console.log(`🎨 Remixing "${listing.title}" → ${cyan(destination)}`);
      console.log(`   ${files.length} files, by ${listing.authorDisplayName}`);
      console.log('');
    }

    // 4. Download the files — public endpoint, no auth.
    const dl = await downloadDeck({
      apiUrl: options.apiUrl,
      profileName: options.profile,
      files,
      destination,
      assetUrlBuilder: (file) =>
        buildMarketplaceDownloadUrl({
          apiUrl: options.apiUrl,
          profileName: options.profile,
          slug,
          sha256: file.sha256,
        }),
      onProgress: (p) => {
        if (jsonMode || !p.currentFile) return;
        console.log(`  ${cyan('↓')} [${p.index ?? p.completed + 1}/${p.total}] ${p.currentFile.path} (${formatBytes(p.currentFile.size)})`);
      },
    });

    if (!dl.success) {
      const firstFailed = dl.failed?.[0];
      const msg = `Download failed: ${dl.failed?.length ?? 0} file(s).${firstFailed ? ' First error: ' + firstFailed.reason : ''}`;
      if (jsonMode) emitJsonError({ code: 'download-failed', message: msg, details: { failed: dl.failed } });
      else {
        console.log('');
        console.log(`${CROSS} ${red('Download failed')}`);
        for (const f of dl.failed ?? []) console.log(`  - ${f.path}: ${f.reason}`);
        console.log('');
      }
      process.exit(1);
    }

    // 5. Write the lineage marker so a future `slideless push` from this
    //    folder can record "remixed from <slug>". Best-effort.
    try {
      writeRemixMarker(destination, {
        remixedFromSlug: slug,
        remixedFromVersion: filesResult.data.publishedVersion,
        remixedFromTitle: listing.title,
        remixedAt: new Date().toISOString(),
      });
    } catch {
      // non-fatal — the remix still succeeded
    }

    // 6. Record the remix (fire-and-forget — never fail the remix on this).
    await recordMarketplaceRemix({ apiUrl: options.apiUrl, profileName: options.profile, slug }).catch(
      () => undefined,
    );

    if (jsonMode) {
      emitJsonSuccess({
        slug,
        sourcePresentationVersion: filesResult.data.publishedVersion,
        title: listing.title,
        path: destination,
        filesWritten: dl.filesWritten,
        bytes: dl.bytes,
      });
      return;
    }

    console.log('');
    console.log(`${CHECK} ${green('Remixed')}`);
    console.log('');
    console.log(`  Listing:        ${listing.title} (${slug})`);
    console.log(`  Files written:  ${dl.filesWritten}`);
    console.log(`  Total bytes:    ${formatBytes(dl.bytes)}`);
    console.log(`  Destination:    ${destination}`);
    console.log('');
    console.log(`This is a fresh, unlinked folder — there is no slideless.json.`);
    console.log(`Edit it, then run \`${cyan('slideless push --title "…"')}\` from inside it`);
    console.log(`to create your own presentation.`);
    console.log('');
  });
