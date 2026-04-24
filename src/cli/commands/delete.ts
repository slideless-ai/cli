/**
 * `slideless delete` — hard-delete a presentation.
 *
 * Removes the Firestore doc, every collaborator row, and every object in
 * the GCS prefix. Irreversible. Prompts for confirmation unless `--yes`.
 */

import { Command } from 'commander';
import { createInterface } from 'readline/promises';

import {
  resolveApiKey,
  API_KEY_MISSING_MESSAGE,
} from '../../utils/config.js';
import { deletePresentation } from '../../utils/presentations-client.js';
import {
  exitWithError,
  emitJsonSuccess,
  emitJsonError,
  green,
  CHECK,
  CROSS,
  red,
  yellow,
} from '../utils/output.js';

interface DeleteOptions {
  yes?: boolean;
  apiKey?: string;
  apiUrl?: string;
  profile?: string;
  json?: boolean;
}

async function promptYes(presentationId: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(
      `${yellow('⚠')}  This will HARD DELETE presentation ${presentationId}. All versions, assets, and collaborators will be removed. There is NO undo.\nType "delete" to confirm: `,
    );
    return answer.trim().toLowerCase() === 'delete';
  } finally {
    rl.close();
  }
}

export const deleteCommand = new Command('delete')
  .description('Hard-delete a presentation (irreversible)')
  .argument('<presentationId>', 'Presentation ID to delete')
  .option('--yes', 'Skip interactive confirmation')
  .option('--api-key <key>', 'Override API key')
  .option('--api-url <url>', 'Override base URL')
  .option('--profile <name>', 'Use a specific profile')
  .option('--json', 'Output as JSON')
  .action(async (presentationId: string, options: DeleteOptions) => {
    const jsonMode = options.json ?? false;
    const apiKey = resolveApiKey(options.apiKey, options.profile);
    if (!apiKey) {
      if (jsonMode) {
        emitJsonError({ code: 'unauthenticated', message: API_KEY_MISSING_MESSAGE });
        process.exit(1);
      }
      exitWithError(API_KEY_MISSING_MESSAGE, 1);
    }

    if (!options.yes && !jsonMode) {
      const ok = await promptYes(presentationId);
      if (!ok) {
        console.log('Aborted.');
        process.exit(1);
      }
    } else if (!options.yes && jsonMode) {
      emitJsonError({ code: 'invalid-argument', message: 'Pass --yes in non-interactive mode.' });
      process.exit(1);
    }

    const result = await deletePresentation({
      apiKey,
      apiUrl: options.apiUrl,
      profileName: options.profile,
      presentationId: presentationId,
    });

    if (!result.success) {
      if (jsonMode) emitJsonError(result.error, result.status);
      else {
        console.log('');
        console.log(`${CROSS} ${red('Delete failed')}`);
        console.log('');
        console.log(`  ${result.error.message}`);
        if (result.status) console.log(`  HTTP ${result.status} · ${result.error.code}`);
        console.log('');
      }
      process.exit(1);
    }

    if (jsonMode) {
      emitJsonSuccess(result.data);
      return;
    }

    console.log('');
    console.log(`${CHECK} ${green('Presentation deleted')}`);
    console.log('');
    console.log(`  Presentation:   ${presentationId}`);
    console.log(`  Blobs removed:  ${result.data.blobsDeleted}`);
    console.log('');
  });
