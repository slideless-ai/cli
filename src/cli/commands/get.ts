/**
 * Show details for a single presentation.
 *
 * For owner callers: tokens + collaborators section.
 * For dev collaborators: read-only view, no tokens / collaborators.
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
  .argument('<presentationId>', 'The presentation ID to look up')
  .option('--api-key <key>', 'Override API key')
  .option('--api-url <url>', 'Override base URL')
  .option('--profile <name>', 'Use a specific profile')
  .option('--json', 'Output as JSON')
  .action(async (presentationId: string, options: {
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
      presentationId: presentationId,
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
    console.log(`${p.title}  ${yellow(`[${p.role}]`)}`);
    console.log('');
    console.log(`  Presentation ID:  ${p.id}`);
    console.log(`  Version:          ${p.currentVersion}`);
    console.log(`  Created:          ${formatDate(p.createdAt)}`);
    console.log(`  Updated:          ${formatDate(p.updatedAt)}`);
    if (p.expiresAt) console.log(`  Expires:          ${formatDate(p.expiresAt)}`);
    console.log(`  Total views:      ${p.totalViews}`);
    if (p.lastViewedAt) console.log(`  Last viewed:      ${formatDate(p.lastViewedAt)}`);
    if (p.primaryShareUrl) console.log(`  Primary URL:      ${cyan(p.primaryShareUrl)}`);

    if (p.role === 'owner') {
      console.log('');
      console.log(`  Tokens (${p.tokens.length}):`);
      if (p.tokens.length === 0) {
        console.log(`    (none — run \`slideless share ${p.id}\` to mint a viewer URL)`);
      }
      for (const t of p.tokens) {
        const status = t.revoked ? yellow('[REVOKED]') : '';
        console.log(`    • ${t.name} ${status}`.trimEnd());
        console.log(`      ID:           ${t.tokenId}`);
        console.log(`      Created:      ${formatDate(t.createdAt)}`);
        console.log(`      Views:        ${t.accessCount}`);
        if (t.lastAccessedAt) console.log(`      Last access:  ${formatDate(t.lastAccessedAt)}`);
        if (!t.revoked) console.log(`      URL:          ${cyan(t.shareUrl)}`);
      }

      console.log('');
      console.log(`  Collaborators (${p.collaborators.length}):`);
      if (p.collaborators.length === 0) {
        console.log(`    (none — run \`slideless invite ${p.id} --email <addr>\` to add one)`);
      }
      for (const c of p.collaborators) {
        const status = c.status === 'active' ? '' : yellow(`[${c.status.toUpperCase()}]`);
        console.log(`    • ${c.email} ${status}`.trimEnd());
        console.log(`      ID:           ${c.collaboratorId}`);
        console.log(`      Role:         ${c.role}`);
        console.log(`      Invited:      ${formatDate(c.invitedAt)}`);
        if (c.acceptedAt) console.log(`      Accepted:     ${formatDate(c.acceptedAt)}`);
        if (c.revokedAt) console.log(`      Revoked:      ${formatDate(c.revokedAt)}`);
      }
    } else {
      console.log('');
      console.log(`  ${yellow('You have dev access via an active collaborator invite.')}`);
      console.log(`  Run \`slideless pull ${p.id}\` to download the deck and edit it.`);
    }
    console.log('');
  });
