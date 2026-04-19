/**
 * Replace the HTML at an existing share. URL unchanged, view counts preserved.
 *
 * Usage:
 *   slideless update <shareId> <path>
 *   slideless update <shareId> <path> --title "New title"
 */

import { Command } from 'commander';
import { readFileSync, statSync } from 'fs';
import { resolve } from 'path';
import {
  resolveApiKey,
  API_KEY_MISSING_MESSAGE,
} from '../../utils/config.js';
import { updateSharedPresentation } from '../../utils/presentations-client.js';
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

export const updateCommand = new Command('update')
  .description('Replace the HTML at an existing share (URL unchanged)')
  .argument('<shareId>', 'The shareId returned by `slideless share`')
  .argument('<path>', 'Path to the new .html file (use "-" for stdin)')
  .option('--title <title>', 'Optional new title')
  .option('--api-key <key>', 'Override API key')
  .option('--api-url <url>', 'Override base URL')
  .option('--profile <name>', 'Use a specific profile')
  .option('--json', 'Output as JSON')
  .action(async (shareId: string, path: string, options: {
    title?: string;
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

    const result = await updateSharedPresentation({
      apiKey,
      apiUrl: options.apiUrl,
      profileName: options.profile,
      shareId,
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
  try {
    const stats = statSync(abs);
    if (!stats.isFile()) {
      const msg = `Not a regular file: ${abs}`;
      if (jsonMode) {
        emitJsonError({ code: 'invalid-argument', message: msg });
        process.exit(1);
      }
      exitWithError(msg, 1);
    }
  } catch {
    const msg = `File not found: ${abs}`;
    if (jsonMode) {
      emitJsonError({ code: 'invalid-argument', message: msg });
      process.exit(1);
    }
    exitWithError(msg, 1);
  }
  return readFileSync(abs, 'utf-8');
}
