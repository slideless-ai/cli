/**
 * Email an existing shared presentation to one or more recipients.
 *
 * Each recipient receives a unique named token by default (enabling per-recipient
 * open tracking); pass `--token-id` to reuse a single token for everyone.
 *
 * Usage:
 *   slideless share-email <shareId> --to alice@x.com
 *   slideless share-email <shareId> --to a@x.com --to b@x.com --message "Hi"
 *   slideless share-email <shareId> --to a@x.com --subject "Q2 Review deck" --token-id <id>
 */

import { Command } from 'commander';

import {
  resolveApiKey,
  API_KEY_MISSING_MESSAGE,
} from '../../utils/config.js';
import { sharePresentationViaEmail } from '../../utils/presentations-client.js';
import {
  CHECK,
  CROSS,
  cyan,
  emitJsonError,
  emitJsonSuccess,
  exitWithError,
  green,
  red,
  yellow,
} from '../utils/output.js';

const MAX_RECIPIENTS = 20;
const MAX_MESSAGE_LENGTH = 2000;
const MAX_SUBJECT_LENGTH = 200;

function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

export const shareEmailCommand = new Command('share-email')
  .description('Send a shared presentation to one or more recipients by email')
  .argument('<shareId>', 'Share ID of the presentation to email')
  .requiredOption('--to <email>', 'Recipient email (repeat for multiple; max 20)', collect, [] as string[])
  .option('--message <text>', `Optional personal note (max ${MAX_MESSAGE_LENGTH} chars)`)
  .option('--subject <text>', `Custom subject line (max ${MAX_SUBJECT_LENGTH} chars)`)
  .option('--token-id <id>', 'Reuse an existing token for all recipients instead of minting one per recipient')
  .option('--api-key <key>', 'Override API key')
  .option('--api-url <url>', 'Override base URL')
  .option('--profile <name>', 'Use a specific profile')
  .option('--json', 'Output as JSON')
  .action(async (shareId: string, options: {
    to: string[];
    message?: string;
    subject?: string;
    tokenId?: string;
    apiKey?: string;
    apiUrl?: string;
    profile?: string;
    json?: boolean;
  }) => {
    const jsonMode = options.json ?? false;

    const apiKey = resolveApiKey(options.apiKey, options.profile);
    if (!apiKey) {
      if (jsonMode) {
        emitJsonError({
          code: 'unauthenticated',
          message: API_KEY_MISSING_MESSAGE,
          nextAction: 'Run `slideless login` or pass --api-key, then retry.',
        });
        process.exit(1);
      }
      exitWithError(API_KEY_MISSING_MESSAGE, 1);
    }

    const emails = (options.to ?? []).map(e => e.trim()).filter(Boolean);
    if (emails.length === 0) {
      if (jsonMode) {
        emitJsonError({
          code: 'missing-recipients',
          message: 'At least one --to <email> is required.',
          nextAction: 'Add one or more --to flags and retry.',
        });
        process.exit(1);
      }
      exitWithError('At least one --to <email> is required.', 1);
    }
    if (emails.length > MAX_RECIPIENTS) {
      if (jsonMode) {
        emitJsonError({
          code: 'too-many-recipients',
          message: `Too many recipients (${emails.length}). Max ${MAX_RECIPIENTS} per call.`,
          nextAction: `Split the list into batches of ≤${MAX_RECIPIENTS} and call share-email multiple times.`,
        });
        process.exit(1);
      }
      exitWithError(`Too many recipients (${emails.length}). Max ${MAX_RECIPIENTS} per call.`, 1);
    }

    if (options.message && options.message.length > MAX_MESSAGE_LENGTH) {
      if (jsonMode) {
        emitJsonError({
          code: 'message-too-long',
          message: `Message exceeds ${MAX_MESSAGE_LENGTH} characters.`,
          nextAction: 'Shorten the message or omit it.',
        });
        process.exit(1);
      }
      exitWithError(`Message exceeds ${MAX_MESSAGE_LENGTH} characters.`, 1);
    }

    const result = await sharePresentationViaEmail({
      apiKey,
      apiUrl: options.apiUrl,
      profileName: options.profile,
      shareId,
      emails,
      message: options.message,
      subject: options.subject,
      tokenId: options.tokenId,
    });

    if (!result.success) {
      if (jsonMode) {
        emitJsonError(result.error, result.status);
      } else {
        console.log('');
        console.log(`${CROSS} ${red('Share via email failed')}`);
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

    const { sent, failed, summary } = result.data;

    console.log('');
    if (summary.failed === 0) {
      console.log(`${CHECK} ${green(`Sent to ${summary.sent} of ${summary.total} recipient${summary.total === 1 ? '' : 's'}`)}`);
    } else {
      console.log(`${yellow('!')} Sent to ${green(String(summary.sent))} of ${summary.total}, ${red(`${summary.failed} failed`)}`);
    }
    console.log('');

    for (const s of sent) {
      console.log(`  ${CHECK} ${s.email.padEnd(32)} ${cyan(s.shareUrl)}`);
    }
    for (const f of failed) {
      console.log(`  ${CROSS} ${f.email.padEnd(32)} ${red(f.code)} — ${f.message}`);
    }

    console.log('');
    if (summary.failed > 0 && summary.sent === 0) {
      process.exit(1);
    }
  });
