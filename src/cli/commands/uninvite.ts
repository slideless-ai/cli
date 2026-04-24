/**
 * `slideless uninvite` — revoke a dev collaborator.
 *
 * Symmetric with `slideless invite`. Flips the row to status='revoked'
 * and recomputes `hasActiveCollaborators` on the presentation.
 */

import { Command } from 'commander';

import {
  resolveApiKey,
  API_KEY_MISSING_MESSAGE,
} from '../../utils/config.js';
import { uninviteCollaborator } from '../../utils/presentations-client.js';
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

interface UninviteOptions {
  apiKey?: string;
  apiUrl?: string;
  profile?: string;
  json?: boolean;
}

export const uninviteCommand = new Command('uninvite')
  .description('Revoke a dev collaborator (owner-only)')
  .argument('<presentationId>', 'Presentation ID')
  .argument('<collaboratorId>', 'Collaborator ID to revoke')
  .option('--api-key <key>', 'Override API key')
  .option('--api-url <url>', 'Override base URL')
  .option('--profile <name>', 'Use a specific profile')
  .option('--json', 'Output as JSON')
  .action(async (presentationId: string, collaboratorId: string, options: UninviteOptions) => {
    const jsonMode = options.json ?? false;
    const apiKey = resolveApiKey(options.apiKey, options.profile);
    if (!apiKey) {
      if (jsonMode) {
        emitJsonError({ code: 'unauthenticated', message: API_KEY_MISSING_MESSAGE });
        process.exit(1);
      }
      exitWithError(API_KEY_MISSING_MESSAGE, 1);
    }

    const result = await uninviteCollaborator({
      apiKey,
      apiUrl: options.apiUrl,
      profileName: options.profile,
      presentationId,
      collaboratorId,
    });

    if (!result.success) {
      if (jsonMode) emitJsonError(result.error, result.status);
      else {
        console.log('');
        console.log(`${CROSS} ${red('Uninvite failed')}`);
        console.log('');
        console.log(`  ${result.error.message}`);
        if (result.status) console.log(`  HTTP ${result.status} · ${result.error.code}`);
        if (result.error.nextAction) {
          console.log('');
          console.log(`  ${yellow('Next:')} ${result.error.nextAction}`);
        }
        console.log('');
      }
      process.exit(1);
    }

    if (jsonMode) {
      emitJsonSuccess(result.data);
      return;
    }

    console.log('');
    console.log(`${CHECK} ${green('Collaborator revoked')}`);
    console.log('');
    console.log(`  Presentation:  ${presentationId}`);
    console.log(`  Collaborator:  ${collaboratorId}`);
    console.log('');
  });
