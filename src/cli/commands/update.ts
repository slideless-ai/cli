/**
 * `slideless update` — replace a deck at an existing shareId in place.
 *
 * Same deck resolution rules as `slideless share`: a folder becomes a
 * content-addressed bundle, a .html file uploads as a 1-file deck. Only
 * changed files are re-uploaded (content-addressed dedup).
 *
 * Usage:
 *   slideless update <shareId> <path>
 *   slideless update <shareId> <path> --title "New title"
 *   slideless update <shareId> <path> --entry custom.html
 */

import { Command } from 'commander';
import { existsSync, statSync } from 'fs';
import { basename, dirname, resolve } from 'path';
import {
  resolveApiKey,
  API_KEY_MISSING_MESSAGE,
} from '../../utils/config.js';
import { walkDeck, hashFiles } from '../../utils/folder-walker.js';
import { scanReferences } from '../../utils/reference-scanner.js';
import { buildManifestFiles } from '../../utils/manifest.js';
import { uploadDeck } from '../../utils/asset-uploader.js';
import {
  exitWithError,
  emitJsonSuccess,
  emitJsonError,
  green,
  cyan,
  CHECK,
  CROSS,
  red,
  yellow,
  formatBytes,
} from '../utils/output.js';

interface UpdateOptions {
  title?: string;
  entry?: string;
  strict?: boolean;
  apiKey?: string;
  apiUrl?: string;
  profile?: string;
  json?: boolean;
}

export const updateCommand = new Command('update')
  .description('Replace the deck at an existing share (URL unchanged, version bumped)')
  .argument('<shareId>', 'The shareId returned by `slideless share`')
  .argument('<path>', 'Path to the new deck folder or .html file')
  .option('--title <title>', 'Optional new title')
  .option('--entry <filename>', 'Entry HTML file name (folder mode; default: index.html)')
  .option('--strict', 'Fail on static-scan warnings (unresolved references)')
  .option('--api-key <key>', 'Override API key')
  .option('--api-url <url>', 'Override base URL')
  .option('--profile <name>', 'Use a specific profile')
  .option('--json', 'Output as JSON')
  .action(async (shareId: string, path: string, options: UpdateOptions) => {
    const apiKey = resolveApiKey(options.apiKey, options.profile);
    if (!apiKey) {
      if (options.json) {
        emitJsonError({ code: 'unauthenticated', message: API_KEY_MISSING_MESSAGE });
        process.exit(1);
      }
      exitWithError(API_KEY_MISSING_MESSAGE, 1);
    }

    const abs = resolve(path);
    if (!existsSync(abs)) {
      const msg = `Path not found: ${abs}`;
      if (options.json) emitJsonError({ code: 'invalid-argument', message: msg });
      else exitWithError(msg, 1);
      process.exit(1);
    }

    const stats = statSync(abs);
    let deckRoot: string;
    let entryPath: string;
    if (stats.isFile()) {
      deckRoot = dirname(abs);
      entryPath = basename(abs);
    } else if (stats.isDirectory()) {
      deckRoot = abs;
      entryPath = options.entry || 'index.html';
      if (!existsSync(`${deckRoot}/${entryPath}`)) {
        const msg = `Entry file "${entryPath}" not found inside ${deckRoot}. Pass --entry to override the default index.html.`;
        if (options.json) emitJsonError({ code: 'invalid-argument', message: msg });
        else exitWithError(msg, 1);
        process.exit(1);
      }
    } else {
      const msg = `Not a file or directory: ${abs}`;
      if (options.json) emitJsonError({ code: 'invalid-argument', message: msg });
      else exitWithError(msg, 1);
      process.exit(1);
    }

    let walked;
    try {
      walked = walkDeck(deckRoot);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (options.json) emitJsonError({ code: 'invalid-argument', message: msg });
      else exitWithError(msg, 1);
      process.exit(1);
    }

    if (stats.isFile()) {
      walked.files = walked.files.filter((f) => f.path === entryPath);
      walked.totalBytes = walked.files.reduce((a, f) => a + f.size, 0);
    }

    const scan = scanReferences({ deckRoot, files: walked.files });
    if (scan.errors.length > 0) {
      const lines = scan.errors.map((e) => `  ${e.file}:${e.line}  "${e.reference}"  ${e.message}`);
      const msg = `Static scan errors:\n${lines.join('\n')}`;
      if (options.json) {
        emitJsonError({ code: 'invalid-argument', message: msg, details: { errors: scan.errors } });
      } else {
        console.log('');
        console.log(`${CROSS} ${red('Static scan errors')}`);
        for (const l of lines) console.log(l);
        console.log('');
      }
      process.exit(1);
    }
    if (scan.warnings.length > 0) {
      if (options.strict) {
        const lines = scan.warnings.map((e) => `  ${e.file}:${e.line}  "${e.reference}"  ${e.message}`);
        const msg = `Static scan warnings (--strict):\n${lines.join('\n')}`;
        if (options.json) {
          emitJsonError({ code: 'invalid-argument', message: msg, details: { warnings: scan.warnings } });
        } else {
          console.log('');
          console.log(`${CROSS} ${red('Static scan warnings (--strict)')}`);
          for (const l of lines) console.log(l);
          console.log('');
        }
        process.exit(1);
      }
      if (!options.json) {
        for (const w of scan.warnings) {
          console.log(`${yellow('⚠')}  ${w.file}:${w.line}  "${w.reference}"  ${w.message}`);
        }
      }
    }

    const hashed = await hashFiles(walked.files);
    const manifestFiles = buildManifestFiles(hashed);

    if (!options.json) {
      console.log('');
      console.log(`📦 Deck:  ${cyan(deckRoot)}`);
      console.log(`📝 Entry: ${entryPath}`);
      console.log(`📁 Files: ${hashed.length} (${formatBytes(walked.totalBytes)})`);
      console.log('');
    }

    const result = await uploadDeck({
      apiKey,
      apiUrl: options.apiUrl,
      profileName: options.profile,
      shareId,
      title: options.title ?? '',  // empty string → backend preserves existing title
      entryPath,
      files: hashed,
      manifestFiles,
      onProgress: (p) => {
        if (options.json) return;
        if (p.phase === 'precheck') console.log(`  ${cyan('→')} Prechecking…`);
        else if (p.phase === 'upload' && p.currentFile) {
          const idx = `[${p.uploadIndex}/${p.uploadTotal}]`;
          console.log(
            `  ${cyan('↑')} ${idx} ${p.currentFile.path} (${formatBytes(p.currentFile.size)})`,
          );
        } else if (p.phase === 'commit') console.log(`  ${cyan('→')} Committing version…`);
      },
    });

    if (!result.success) {
      if (options.json) emitJsonError(result.error, result.status);
      else {
        console.log('');
        console.log(`${CROSS} ${red(`${result.phase} failed`)}`);
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
    console.log(`  Share ID:        ${result.data.shareId}`);
    console.log(`  Version:         ${result.data.version}`);
    console.log(`  Assets uploaded: ${result.data.assetsUploaded}`);
    console.log(`  Assets deduped:  ${result.data.assetsDeduped}`);
    console.log(`  Total bytes:     ${formatBytes(result.data.totalBytes)}`);
    console.log(`  Share URL:       ${cyan(result.data.shareUrl)}`);
    console.log('');
  });
