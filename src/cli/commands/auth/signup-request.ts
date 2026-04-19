/**
 * `slideless auth signup-request --email <email>`
 *
 * Triggers a signup OTP email. The backend refuses (USER_ALREADY_HAS_ORGANIZATION)
 * if the email already owns an organization — the emitted `nextAction` tells
 * an agent to switch to `login-request` instead.
 */

import { Command } from 'commander';
import { signupRequest } from '../../../utils/auth-flow-client.js';
import {
  CHECK,
  CROSS,
  cyan,
  emitJsonError,
  emitJsonSuccess,
  green,
  red,
  yellow,
} from '../../utils/output.js';

export const signupRequestCommand = new Command('signup-request')
  .description('Email a signup OTP to a new user')
  .requiredOption('--email <email>', 'Email address to sign up')
  .option('--base-url <url>', 'Override API base URL')
  .option('--json', 'Output as JSON')
  .action(
    async (options: { email: string; baseUrl?: string; json?: boolean }) => {
      const result = await signupRequest({
        email: options.email,
        baseUrl: options.baseUrl,
      });

      if (!result.success) {
        if (options.json) {
          emitJsonError(result.error, result.status);
        } else {
          console.error('');
          console.error(`${CROSS} ${red(result.error.message)}`);
          if (result.error.nextAction) {
            console.error(`  ${yellow('next:')} ${result.error.nextAction}`);
          }
          console.error('');
        }
        process.exit(1);
      }

      if (options.json) {
        emitJsonSuccess(result.data);
        return;
      }

      console.log('');
      console.log(`${CHECK} ${green(`OTP sent to ${options.email}`)}`);
      console.log('');
      console.log('  Run:');
      console.log(
        `    ${cyan(`slideless auth signup-complete --email ${options.email} --code <6-digit-code>`)}`,
      );
      console.log('');
      console.log('  Optional flags for signup-complete:');
      console.log('    --company "Your Co"    (default "My Organization")');
      console.log('    --description "..."    --tone "..."');
      console.log('    --brand-primary "#hex" --brand-secondary "#hex" --brand-accent "#hex"');
      console.log('    --logo ./logo.png      (PNG/JPEG/WebP/SVG, max 2 MB)');
      console.log('');
    },
  );
