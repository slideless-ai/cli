/**
 * `slideless push` — upload content (new or existing).
 *
 * Detects new vs update via the presence of `slideless.json` at the deck root:
 * - No `slideless.json` → new presentation. Requires `--title`. On success
 *   writes `slideless.json` with `role: owner` and `lastPulledVersion: 1`.
 * - Has `slideless.json` → update. Calls commit with `expectedBaseVersion`
 *   so concurrent collaborators can't stomp each other. `--force` bypasses.
 *
 * Replaces the pre-v0.5 `share <path>` and `update <id> <path>` commands.
 *
 * Usage:
 *   slideless push                                 # cwd, uses slideless.json
 *   slideless push ./my-deck --title "Q2 Review"   # new
 *   slideless push ./my-deck                        # update (reads slideless.json)
 *   slideless push --force                          # bypass conflict check
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
  hasLocalManifest,
  readLocalManifest,
  writeLocalManifest,
} from '../../utils/local-manifest.js';
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

interface PushOptions {
  title?: string;
  entry?: string;
  message?: string;
  force?: boolean;
  strict?: boolean;
  apiKey?: string;
  apiUrl?: string;
  profile?: string;
  json?: boolean;
}

export const pushCommand = new Command('push')
  .description('Upload content (new presentation, or update an existing one)')
  .argument('[path]', 'Path to deck folder (or single HTML file). Default: current directory.')
  .option('--title <title>', 'Display title (required on new uploads)')
  .option('--entry <filename>', 'Entry HTML file name (folder mode; default: index.html)')
  .option('--message <msg>', 'Short commit-like message (logged; not stored)')
  .option('--force', 'Bypass version-conflict check on updates')
  .option('--strict', 'Fail on static-scan warnings (unresolved references)')
  .option('--api-key <key>', 'Override API key')
  .option('--api-url <url>', 'Override base URL')
  .option('--profile <name>', 'Use a specific profile')
  .option('--json', 'Output as JSON')
  .action(async (pathArg: string | undefined, options: PushOptions) => {
    const jsonMode = options.json ?? false;
    const apiKey = resolveApiKey(options.apiKey, options.profile);
    if (!apiKey) {
      if (jsonMode) {
        emitJsonError({ code: 'unauthenticated', message: API_KEY_MISSING_MESSAGE });
        process.exit(1);
      }
      exitWithError(API_KEY_MISSING_MESSAGE, 1);
    }

    const abs = resolve(pathArg ?? '.');
    if (!existsSync(abs)) {
      const msg = `Path not found: ${abs}`;
      if (jsonMode) emitJsonError({ code: 'invalid-argument', message: msg });
      else exitWithError(msg, 1);
      process.exit(1);
    }

    const stats = statSync(abs);
    let deckRoot: string;
    let entryPath: string;
    if (stats.isFile()) {
      deckRoot = dirname(abs);
      entryPath = basename(abs);
      if (options.entry && options.entry !== entryPath) {
        const msg = `--entry ${options.entry} conflicts with the file you passed (${entryPath}).`;
        if (jsonMode) emitJsonError({ code: 'invalid-argument', message: msg });
        else exitWithError(msg, 1);
        process.exit(1);
      }
    } else if (stats.isDirectory()) {
      deckRoot = abs;
      entryPath = options.entry || 'index.html';
      if (!existsSync(`${deckRoot}/${entryPath}`)) {
        const msg = `Entry file "${entryPath}" not found inside ${deckRoot}. Pass --entry to override the default index.html.`;
        if (jsonMode) emitJsonError({ code: 'invalid-argument', message: msg });
        else exitWithError(msg, 1);
        process.exit(1);
      }
    } else {
      const msg = `Not a file or directory: ${abs}`;
      if (jsonMode) emitJsonError({ code: 'invalid-argument', message: msg });
      else exitWithError(msg, 1);
      process.exit(1);
    }

    // Decide new-vs-update from slideless.json presence.
    const existingManifest = hasLocalManifest(deckRoot);
    let presentationId: string | undefined;
    let expectedBaseVersion: number | undefined;
    let priorRole: 'owner' | 'dev' | undefined;

    if (existingManifest) {
      try {
        const m = readLocalManifest(deckRoot);
        presentationId = m.presentationId;
        priorRole = m.role;
        expectedBaseVersion = options.force ? undefined : m.lastPulledVersion;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (jsonMode) emitJsonError({ code: 'invalid-argument', message: msg });
        else exitWithError(msg, 1);
        process.exit(1);
      }
    } else {
      // Brand-new presentation; --title is required.
      if (!options.title || options.title.trim().length === 0) {
        const msg = 'New presentations require --title. For updates, push from a folder that already contains slideless.json.';
        if (jsonMode) emitJsonError({ code: 'invalid-argument', message: msg });
        else exitWithError(msg, 1);
        process.exit(1);
      }
    }

    // Walk + hash.
    let walked;
    try {
      walked = walkDeck(deckRoot);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (jsonMode) emitJsonError({ code: 'invalid-argument', message: msg });
      else exitWithError(msg, 1);
      process.exit(1);
    }

    if (stats.isFile()) {
      walked.files = walked.files.filter((f) => f.path === entryPath);
      walked.totalBytes = walked.files.reduce((a, f) => a + f.size, 0);
    }

    if (!walked.files.some((f) => f.path === entryPath)) {
      const msg = `Entry file "${entryPath}" is not present in the walked file set (check .slidelessignore).`;
      if (jsonMode) emitJsonError({ code: 'invalid-argument', message: msg });
      else exitWithError(msg, 1);
      process.exit(1);
    }

    const scan = scanReferences({ deckRoot, files: walked.files });
    if (scan.errors.length > 0) {
      const lines = scan.errors.map((e) => `  ${e.file}:${e.line}  "${e.reference}"  ${e.message}`);
      if (jsonMode) {
        emitJsonError({ code: 'invalid-argument', message: `Static scan errors:\n${lines.join('\n')}`, details: { errors: scan.errors } });
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
        if (jsonMode) {
          emitJsonError({ code: 'invalid-argument', message: `Static scan warnings (--strict):\n${lines.join('\n')}`, details: { warnings: scan.warnings } });
        } else {
          console.log('');
          console.log(`${CROSS} ${red('Static scan warnings (--strict)')}`);
          for (const l of lines) console.log(l);
          console.log('');
        }
        process.exit(1);
      }
      if (!jsonMode) {
        for (const w of scan.warnings) {
          console.log(`${yellow('⚠')}  ${w.file}:${w.line}  "${w.reference}"  ${w.message}`);
        }
      }
    }

    const hashed = await hashFiles(walked.files);
    const manifestFiles = buildManifestFiles(hashed);

    if (!jsonMode) {
      console.log('');
      console.log(`📦 Deck:  ${cyan(deckRoot)}`);
      console.log(`📝 Entry: ${entryPath}`);
      console.log(`📁 Files: ${hashed.length} (${formatBytes(walked.totalBytes)})`);
      if (presentationId) {
        console.log(`🔄 Update: ${presentationId}${expectedBaseVersion ? ` (base v${expectedBaseVersion})` : ' (forced)'}`);
      } else {
        console.log(`✨ New presentation: "${options.title}"`);
      }
      if (options.message) console.log(`💬 Message: ${options.message}`);
      console.log('');
    }

    const effectiveTitle = options.title ?? '';

    const result = await uploadDeck({
      apiKey,
      apiUrl: options.apiUrl,
      profileName: options.profile,
      presentationId,
      title: effectiveTitle,
      entryPath,
      files: hashed,
      manifestFiles,
      expectedBaseVersion,
      onProgress: (p) => {
        if (jsonMode) return;
        if (p.phase === 'precheck') console.log(`  ${cyan('→')} Prechecking…`);
        else if (p.phase === 'upload' && p.currentFile) {
          const idx = `[${p.uploadIndex}/${p.uploadTotal}]`;
          console.log(`  ${cyan('↑')} ${idx} ${p.currentFile.path} (${formatBytes(p.currentFile.size)})`);
        } else if (p.phase === 'commit') console.log(`  ${cyan('→')} Committing version…`);
      },
    });

    if (!result.success) {
      // Friendly conflict message.
      if (result.error.code === 'conflict') {
        const serverVersion = (result.error.details as { serverVersion?: number } | undefined)?.serverVersion;
        const hint = `Remote has a newer version${serverVersion ? ` (v${serverVersion})` : ''}. Run \`slideless pull ${presentationId ?? '<id>'}\` to sync, or pass \`--force\` to overwrite.`;
        if (jsonMode) {
          emitJsonError({ ...result.error, nextAction: hint }, result.status);
        } else {
          console.log('');
          console.log(`${CROSS} ${red('Push conflict')}`);
          console.log('');
          console.log(`  ${result.error.message}`);
          console.log(`  ${yellow('Next:')} ${hint}`);
          console.log('');
        }
        process.exit(1);
      }
      if (jsonMode) {
        emitJsonError(result.error, result.status);
      } else {
        console.log('');
        console.log(`${CROSS} ${red(`${result.phase} failed`)}`);
        console.log('');
        console.log(`  ${result.error.message}`);
        if (result.status) console.log(`  HTTP ${result.status}`);
        console.log('');
      }
      process.exit(1);
    }

    const { presentationId: pushedId, version } = result.data;
    const role = result.data.role ?? priorRole ?? 'owner';

    try {
      writeLocalManifest(deckRoot, {
        presentationId: pushedId,
        lastPulledVersion: version,
        lastPulledAt: new Date().toISOString(),
        role,
      });
    } catch (err) {
      if (!jsonMode) {
        console.log(`${yellow('⚠')} Pushed, but failed to write slideless.json: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (jsonMode) {
      emitJsonSuccess({
        ...result.data,
        isNew: !presentationId,
        slidelessJson: 'slideless.json',
      });
      return;
    }

    console.log('');
    console.log(`${CHECK} ${green(presentationId ? `Updated to version ${version}` : `Created presentation v1`)}`);
    console.log('');
    console.log(`  Presentation ID: ${pushedId}`);
    console.log(`  Version:         ${version}`);
    console.log(`  Role:            ${role}`);
    console.log(`  Assets uploaded: ${result.data.assetsUploaded}`);
    console.log(`  Assets deduped:  ${result.data.assetsDeduped}`);
    console.log(`  Total bytes:     ${formatBytes(result.data.totalBytes)}`);
    console.log(`  Local manifest:  slideless.json updated (v${version})`);
    console.log('');
    if (!presentationId) {
      console.log(`Tip: the deck is stored but not yet public. Mint a viewer URL with:`);
      console.log(`  slideless share ${pushedId}`);
      console.log('');
    }
  });
