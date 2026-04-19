/**
 * Share an HTML file. With `--update <shareId>`, replaces an existing share's
 * HTML in place (URL unchanged, view counts preserved). Otherwise creates a new share.
 *
 * Usage:
 *   slideless share <path> --title "..."
 *   slideless share <path> --title "..." --update <shareId>
 *   cat deck.html | slideless share - --title "..."
 */

import { Command } from 'commander';
import { readFileSync, statSync } from 'fs';
import { resolve } from 'path';
import {
  resolveApiKey,
  API_KEY_MISSING_MESSAGE,
} from '../../utils/config.js';
import {
  uploadSharedPresentation,
  updateSharedPresentation,
} from '../../utils/presentations-client.js';
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

const MAX_HTML_BYTES = 10 * 1024 * 1024;

export const shareCommand = new Command('share')
  .description('Upload an HTML file as a public presentation (or update with --update)')
  .argument('<path>', 'Path to the .html file (use "-" for stdin)')
  .requiredOption('--title <title>', 'Display title for the presentation')
  .option('--update <shareId>', 'Update an existing share in place')
  .option('--api-key <key>', 'Override API key')
  .option('--api-url <url>', 'Override base URL')
  .option('--profile <name>', 'Use a specific profile')
  .option('--json', 'Output as JSON')
  .action(async (path: string, options: {
    title: string;
    update?: string;
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

    const html = await readHtml(path, options.json ?? false);
    const bytes = Buffer.byteLength(html, 'utf-8');
    if (bytes > MAX_HTML_BYTES) {
      const msg = `HTML payload too large (${formatBytes(bytes)}). Max allowed: ${formatBytes(MAX_HTML_BYTES)}.`;
      if (options.json) {
        emitJsonError({ code: 'payload-too-large', message: msg });
        process.exit(1);
      }
      exitWithError(msg, 1);
    }

    if (options.update) {
      const result = await updateSharedPresentation({
        apiKey,
        apiUrl: options.apiUrl,
        profileName: options.profile,
        shareId: options.update,
        html,
        title: options.title,
      });

      if (!result.success) {
        if (options.json) {
          emitJsonError(result.error, result.status);
        } else {
          console.log('');
          console.log(`${CROSS} ${red('Update failed')}`);
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

      console.log('');
      console.log(`${CHECK} ${green(`Updated to version ${result.data.version}`)}`);
      console.log('');
      console.log(`  Share ID:  ${result.data.shareId}`);
      console.log(`  Share URL: ${cyan(result.data.shareUrl)}`);
      console.log('');
      console.log('Same URL — viewers see the new content on next load.');
      console.log('');
      return;
    }

    const result = await uploadSharedPresentation({
      apiKey,
      apiUrl: options.apiUrl,
      profileName: options.profile,
      html,
      title: options.title,
    });

    if (!result.success) {
      if (options.json) {
        emitJsonError(result.error, result.status);
      } else {
        console.log('');
        console.log(`${CROSS} ${red('Upload failed')}`);
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

    console.log('');
    console.log(`${CHECK} ${green('Presentation shared')}`);
    console.log('');
    console.log(`  Share ID:  ${result.data.shareId}`);
    console.log(`  Token ID:  ${result.data.tokenId}`);
    console.log(`  Share URL: ${cyan(result.data.shareUrl)}`);
    console.log('');
    console.log(`Tip: save the share ID to update this presentation later:`);
    console.log(`  slideless update ${result.data.shareId} ./<new-html>`);
    console.log('');
  });

async function readHtml(path: string, jsonMode: boolean): Promise<string> {
  if (path === '-') {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    return Buffer.concat(chunks).toString('utf-8');
  }

  const abs = resolve(path);
  let stats;
  try {
    stats = statSync(abs);
  } catch (error) {
    const msg = `File not found: ${abs}`;
    if (jsonMode) {
      emitJsonError({ code: 'invalid-argument', message: msg });
      process.exit(1);
    }
    exitWithError(msg, 1);
  }
  if (!stats.isFile()) {
    const msg = `Not a regular file: ${abs}`;
    if (jsonMode) {
      emitJsonError({ code: 'invalid-argument', message: msg });
      process.exit(1);
    }
    exitWithError(msg, 1);
  }
  return readFileSync(abs, 'utf-8');
}
