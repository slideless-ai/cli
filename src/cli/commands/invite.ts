/**
 * `slideless invite` — invite a dev collaborator by email.
 *
 * Owner-only. If the invitee already has a Slideless account, the
 * collaborator row is linked immediately (`status=active`). Otherwise the
 * row is stored `status=pending` and claimed on signup via the
 * `onUserDocumentCreated` trigger.
 */

import { Command } from 'commander';

import {
  resolveApiKey,
  API_KEY_MISSING_MESSAGE,
} from '../../utils/config.js';
import { inviteCollaborator } from '../../utils/presentations-client.js';
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

interface InviteOptions {
  email: string;
  message?: string;
  apiKey?: string;
  apiUrl?: string;
  profile?: string;
  json?: boolean;
}

export const inviteCommand = new Command('invite')
  .description('Invite a dev collaborator by email (owner-only)')
  .argument('<presentationId>', 'Presentation ID to invite into')
  .requiredOption('--email <addr>', "Invitee's email address")
  .option('--message <msg>', 'Optional personal message for the invite email')
  .option('--api-key <key>', 'Override API key')
  .option('--api-url <url>', 'Override base URL')
  .option('--profile <name>', 'Use a specific profile')
  .option('--json', 'Output as JSON')
  .action(async (presentationId: string, options: InviteOptions) => {
    const jsonMode = options.json ?? false;
    const apiKey = resolveApiKey(options.apiKey, options.profile);
    if (!apiKey) {
      if (jsonMode) {
        emitJsonError({ code: 'unauthenticated', message: API_KEY_MISSING_MESSAGE });
        process.exit(1);
      }
      exitWithError(API_KEY_MISSING_MESSAGE, 1);
    }

    const email = options.email.trim();
    if (!email || !email.includes('@')) {
      const msg = '--email must be a valid address';
      if (jsonMode) emitJsonError({ code: 'invalid-argument', message: msg });
      else exitWithError(msg, 1);
      process.exit(1);
    }

    const result = await inviteCollaborator({
      apiKey,
      apiUrl: options.apiUrl,
      profileName: options.profile,
      presentationId,
      email,
      message: options.message,
    });

    if (!result.success) {
      if (jsonMode) emitJsonError(result.error, result.status);
      else {
        console.log('');
        console.log(`${CROSS} ${red('Invite failed')}`);
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

    const { collaboratorId, status, userId, inviteAlreadyExisted } = result.data;
    console.log('');
    if (inviteAlreadyExisted) {
      console.log(`${CHECK} ${yellow('Invite already exists')}`);
    } else if (status === 'active') {
      console.log(`${CHECK} ${green('Collaborator added (existing user linked immediately)')}`);
    } else {
      console.log(`${CHECK} ${green('Invite email sent — claim on signup')}`);
    }
    console.log('');
    console.log(`  Presentation:   ${presentationId}`);
    console.log(`  Email:          ${email}`);
    console.log(`  Collaborator:   ${collaboratorId}`);
    console.log(`  Status:         ${status}${userId ? ` (uid ${userId})` : ''}`);
    console.log('');
    console.log(`Revoke later with: slideless uninvite ${presentationId} ${collaboratorId}`);
    console.log('');
  });
