/**
 * `slideless pull` — download a presentation to a local folder.
 *
 * Writes `slideless.json` at the target root so subsequent `slideless push`
 * calls in that folder know what presentation to update.
 *
 * Usage:
 *   slideless pull 01HXYZ...              # ./<title-slug>/, current version
 *   slideless pull 01HXYZ... ./my-deck    # explicit dir
 *   slideless pull 01HXYZ... --at 3       # pin to version 3
 *   slideless pull 01HXYZ... --force      # overwrite non-empty dir (wipes it first)
 */

import { Command } from 'commander';
import { existsSync, readdirSync, rmSync, statSync } from 'fs';
import { resolve } from 'path';

import {
  resolveApiKey,
  API_KEY_MISSING_MESSAGE,
} from '../../utils/config.js';
import {
  getPresentationVersion,
  getSharedPresentationInfo,
} from '../../utils/presentations-client.js';
import {
  downloadDeck,
  defaultDestination,
} from '../../utils/asset-downloader.js';
import {
  hasLocalManifest,
  writeLocalManifest,
  LOCAL_MANIFEST_FILENAME,
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

interface PullOptions {
  at?: string;
  force?: boolean;
  apiKey?: string;
  apiUrl?: string;
  profile?: string;
  json?: boolean;
}

function wipeDirectoryContents(dir: string): void {
  for (const name of readdirSync(dir)) {
    rmSync(resolve(dir, name), { recursive: true, force: true });
  }
}

function isDirEmpty(dir: string): boolean {
  try {
    return readdirSync(dir).length === 0;
  } catch {
    return true;
  }
}

export const pullCommand = new Command('pull')
  .description('Download a presentation to a local folder (as an editable deck)')
  .argument('<presentationId>', 'Presentation ID to pull')
  .argument('[path]', 'Destination directory (default: ./<title-slug>)')
  .option('--at <N>', 'Pin to a specific version (default: current)')
  .option('--force', 'Wipe a non-empty destination directory and write the deck fresh')
  .option('--api-key <key>', 'Override API key')
  .option('--api-url <url>', 'Override base URL')
  .option('--profile <name>', 'Use a specific profile')
  .option('--json', 'Output as JSON')
  .action(async (presentationId: string, pathArg: string | undefined, options: PullOptions) => {
    const jsonMode = options.json ?? false;
    const apiKey = resolveApiKey(options.apiKey, options.profile);
    if (!apiKey) {
      if (jsonMode) {
        emitJsonError({ code: 'unauthenticated', message: API_KEY_MISSING_MESSAGE });
        process.exit(1);
      }
      exitWithError(API_KEY_MISSING_MESSAGE, 1);
    }

    let version: number | undefined;
    if (options.at !== undefined) {
      version = Number(options.at);
      if (!Number.isInteger(version) || version < 1) {
        const msg = '--at must be a positive integer';
        if (jsonMode) emitJsonError({ code: 'invalid-argument', message: msg });
        else exitWithError(msg, 1);
        process.exit(1);
      }
    }

    // 1. Fetch info to get title + role, and the target version.
    const infoResult = await getSharedPresentationInfo({
      apiKey,
      apiUrl: options.apiUrl,
      profileName: options.profile,
      presentationId: presentationId,
    });
    if (!infoResult.success) {
      if (jsonMode) emitJsonError(infoResult.error, infoResult.status);
      else {
        console.log('');
        console.log(`${CROSS} ${red('Failed to fetch presentation info')}`);
        console.log('');
        console.log(`  ${infoResult.error.message}`);
        if (infoResult.status) console.log(`  HTTP ${infoResult.status}`);
        console.log('');
      }
      process.exit(1);
    }
    const info = infoResult.data;
    const effectiveVersion = version ?? info.currentVersion;

    // 2. Fetch manifest for that version.
    const mfResult = await getPresentationVersion({
      apiKey,
      apiUrl: options.apiUrl,
      profileName: options.profile,
      presentationId: presentationId,
      version: effectiveVersion,
    });
    if (!mfResult.success) {
      if (jsonMode) emitJsonError(mfResult.error, mfResult.status);
      else {
        console.log('');
        console.log(`${CROSS} ${red('Failed to fetch manifest')}`);
        console.log('');
        console.log(`  ${mfResult.error.message}`);
        console.log('');
      }
      process.exit(1);
    }
    const manifest = mfResult.data;

    // 3. Resolve destination.
    const cwd = process.cwd();
    const destination = pathArg
      ? resolve(pathArg)
      : defaultDestination(cwd, info.title, presentationId);

    if (existsSync(destination)) {
      const stats = statSync(destination);
      if (!stats.isDirectory()) {
        const msg = `Destination ${destination} exists and is not a directory.`;
        if (jsonMode) emitJsonError({ code: 'invalid-argument', message: msg });
        else exitWithError(msg, 1);
        process.exit(1);
      }
      const isEmpty = isDirEmpty(destination);
      const hasManifest = hasLocalManifest(destination);
      if (!isEmpty && !hasManifest && !options.force) {
        const msg = `Destination ${destination} is non-empty and has no ${LOCAL_MANIFEST_FILENAME}. Pass --force to wipe and overwrite.`;
        if (jsonMode) emitJsonError({ code: 'invalid-argument', message: msg });
        else exitWithError(msg, 1);
        process.exit(1);
      }
      // --force on a non-slideless directory: wipe first so we don't leave
      // orphan files from the previous content mixed in with the new deck.
      if (options.force && !isEmpty && !hasManifest) {
        wipeDirectoryContents(destination);
      }
      // Existing slideless deck: wipe inside too so renamed/removed files
      // don't linger on a pull over a previously-pulled folder.
      if (hasManifest) {
        wipeDirectoryContents(destination);
      }
    }

    if (!jsonMode) {
      console.log('');
      console.log(`📥 Pulling "${info.title}" (v${manifest.version}) → ${cyan(destination)}`);
      console.log(`   ${manifest.files.length} files, role: ${info.role}`);
      console.log('');
    }

    const dl = await downloadDeck({
      apiKey,
      apiUrl: options.apiUrl,
      profileName: options.profile,
      presentationId: presentationId,
      version: effectiveVersion,
      files: manifest.files,
      destination,
      onProgress: (p) => {
        if (jsonMode) return;
        if (p.currentFile) {
          console.log(`  ${cyan('↓')} [${p.completed + 1}/${p.total}] ${p.currentFile.path} (${formatBytes(p.currentFile.size)})`);
        }
      },
    });

    if (!dl.success) {
      const firstFailed = dl.failed?.[0];
      const msg = `Download failed: ${dl.failed?.length ?? 0} file(s).${firstFailed ? ' First error: ' + firstFailed.reason : ''}`;
      if (jsonMode) emitJsonError({ code: 'download-failed', message: msg, details: { failed: dl.failed } });
      else {
        console.log('');
        console.log(`${CROSS} ${red('Download failed')}`);
        for (const f of dl.failed ?? []) {
          console.log(`  - ${f.path}: ${f.reason}`);
        }
        console.log('');
      }
      process.exit(1);
    }

    try {
      writeLocalManifest(destination, {
        presentationId,
        lastPulledVersion: manifest.version,
        lastPulledAt: new Date().toISOString(),
        role: info.role,
      });
    } catch (err) {
      if (!jsonMode) {
        console.log(`${yellow('⚠')} Pulled, but failed to write slideless.json: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (jsonMode) {
      emitJsonSuccess({
        presentationId,
        version: manifest.version,
        role: info.role,
        path: destination,
        filesWritten: dl.filesWritten,
        bytes: dl.bytes,
      });
      return;
    }

    console.log('');
    console.log(`${CHECK} ${green(`Pulled v${manifest.version}`)}`);
    console.log('');
    console.log(`  Presentation:    ${info.title}`);
    console.log(`  Version:         ${manifest.version}`);
    console.log(`  Role:            ${info.role}`);
    console.log(`  Files written:   ${dl.filesWritten}`);
    console.log(`  Total bytes:     ${formatBytes(dl.bytes)}`);
    console.log(`  Destination:     ${destination}`);
    console.log(`  Local manifest:  slideless.json written`);
    console.log('');
    console.log(`Edit then run \`slideless push\` from inside ${destination}.`);
    console.log('');
  });
