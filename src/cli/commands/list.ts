/**
 * List the user's presentations.
 *
 * Usage:
 *   slideless list
 *   slideless list --json
 */

import { Command } from 'commander';
import {
  resolveApiKey,
  API_KEY_MISSING_MESSAGE,
} from '../../utils/config.js';
import { listMyPresentations } from '../../utils/presentations-client.js';
import {
  exitWithError,
  emitJsonSuccess,
  emitJsonError,
  red,
  cyan,
  CROSS,
  formatDate,
} from '../utils/output.js';

export const listCommand = new Command('list')
  .description('List your presentations')
  .option('--api-key <key>', 'Override API key')
  .option('--api-url <url>', 'Override base URL')
  .option('--profile <name>', 'Use a specific profile')
  .option('--json', 'Output as JSON')
  .action(async (options: { apiKey?: string; apiUrl?: string; profile?: string; json?: boolean }) => {
    const apiKey = resolveApiKey(options.apiKey, options.profile);
    if (!apiKey) {
      if (options.json) {
        emitJsonError({ code: 'unauthenticated', message: API_KEY_MISSING_MESSAGE });
        process.exit(1);
      }
      exitWithError(API_KEY_MISSING_MESSAGE, 1);
    }

    const result = await listMyPresentations({
      apiKey,
      apiUrl: options.apiUrl,
      profileName: options.profile,
    });

    if (!result.success) {
      if (options.json) {
        emitJsonError(result.error, result.status);
      } else {
        console.log('');
        console.log(`${CROSS} ${red('Failed to list presentations')}`);
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

    const items = result.data.presentations;
    if (items.length === 0) {
      console.log('');
      console.log('No presentations yet. Run `slideless share <path> --title "..."` to create one.');
      console.log('');
      return;
    }

    console.log('');
    console.log(`Presentations (${items.length})`);
    console.log('');

    // Compact table: ID | Title | v | Views | Updated | URL
    const idLen = 36;
    const titleLen = 32;
    const versionLen = 4;
    const viewsLen = 6;
    const updatedLen = 24;

    console.log(`  ${'ID'.padEnd(idLen)}  ${'TITLE'.padEnd(titleLen)}  ${'V'.padEnd(versionLen)}  ${'VIEWS'.padEnd(viewsLen)}  ${'UPDATED'.padEnd(updatedLen)}  URL`);
    console.log(`  ${'-'.repeat(idLen)}  ${'-'.repeat(titleLen)}  ${'-'.repeat(versionLen)}  ${'-'.repeat(viewsLen)}  ${'-'.repeat(updatedLen)}  ---`);
    for (const p of items) {
      const id = p.id.slice(0, idLen).padEnd(idLen);
      const title = (p.archived ? '[archived] ' + p.title : p.title).slice(0, titleLen).padEnd(titleLen);
      const v = String(p.currentVersion).padEnd(versionLen);
      const views = String(p.totalViews).padEnd(viewsLen);
      const updated = formatDate(p.updatedAt).slice(0, updatedLen).padEnd(updatedLen);
      const url = p.shareUrl ? cyan(p.shareUrl) : '-';
      console.log(`  ${id}  ${title}  ${v}  ${views}  ${updated}  ${url}`);
    }
    console.log('');
  });
