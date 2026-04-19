/**
 * Show details for a single presentation, including per-token view counts.
 */

import { Command } from 'commander';
import {
  resolveApiKey,
  API_KEY_MISSING_MESSAGE,
} from '../../utils/config.js';
import { getSharedPresentationInfo } from '../../utils/presentations-client.js';
import {
  exitWithError,
  emitJsonSuccess,
  emitJsonError,
  red,
  cyan,
  yellow,
  CROSS,
  formatDate,
} from '../utils/output.js';

export const getCommand = new Command('get')
  .description('Show details for a single presentation')
  .argument('<shareId>', 'The shareId to look up')
  .option('--api-key <key>', 'Override API key')
  .option('--api-url <url>', 'Override base URL')
  .option('--profile <name>', 'Use a specific profile')
  .option('--json', 'Output as JSON')
  .action(async (shareId: string, options: {
    apiKey?: string;
    apiUrl?: string;
    profile?: string;
    json?: boolean;
  }) => {
    const apiKey = resolveApiKey(options.apiKey, options.profile);
    if (!apiKey) {
      if (options.json) {
        emitJsonError({ code: 'unauthenticated', message: API_KEY_MISSING_MESSAGE });
        process.exit(1);
      }
      exitWithError(API_KEY_MISSING_MESSAGE, 1);
    }

    const result = await getSharedPresentationInfo({
      apiKey,
      apiUrl: options.apiUrl,
      profileName: options.profile,
      shareId,
    });

    if (!result.success) {
      if (options.json) {
        emitJsonError(result.error, result.status);
      } else {
        console.log('');
        console.log(`${CROSS} ${red('Failed to fetch presentation')}`);
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

    const p = result.data;
    console.log('');
    console.log(`${p.title}${p.archived ? ' ' + yellow('[ARCHIVED]') : ''}`);
    console.log('');
    console.log(`  Share ID:     ${p.id}`);
    console.log(`  Version:      ${p.version}`);
    console.log(`  Created:      ${formatDate(p.createdAt)}`);
    console.log(`  Updated:      ${formatDate(p.updatedAt)}`);
    if (p.expiresAt) {
      console.log(`  Expires:      ${formatDate(p.expiresAt)}`);
    }
    console.log(`  Total views:  ${p.totalViews}`);
    if (p.lastViewedAt) {
      console.log(`  Last viewed:  ${formatDate(p.lastViewedAt)}`);
    }
    if (p.primaryShareUrl) {
      console.log(`  Share URL:    ${cyan(p.primaryShareUrl)}`);
    }
    console.log('');
    console.log(`  Tokens (${p.tokens.length}):`);
    for (const t of p.tokens) {
      const status = t.revoked ? yellow('[REVOKED]') : '';
      console.log(`    \u2022 ${t.name} ${status}`.trimEnd());
      console.log(`      ID:           ${t.tokenId}`);
      console.log(`      Created:      ${formatDate(t.createdAt)}`);
      console.log(`      Views:        ${t.accessCount}`);
      if (t.lastAccessedAt) {
        console.log(`      Last access:  ${formatDate(t.lastAccessedAt)}`);
      }
      if (!t.revoked) {
        console.log(`      URL:          ${cyan(t.shareUrl)}`);
      }
    }
    console.log('');
  });
