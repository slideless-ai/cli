/**
 * `slideless auth login-request --email <email>`
 *
 * Triggers a login OTP for an existing user. Rejects cleanly if the email
 * has no account (USER_NOT_FOUND) or no org yet (USER_HAS_NO_ORGANIZATION).
 */

import { Command } from 'commander';
import { loginRequest } from '../../../utils/auth-flow-client.js';
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

export const loginRequestCommand = new Command('login-request')
  .description('Email a login OTP to an existing user')
  .requiredOption('--email <email>', 'Email address of the existing account')
  .option('--base-url <url>', 'Override API base URL')
  .option('--json', 'Output as JSON')
  .action(
    async (options: { email: string; baseUrl?: string; json?: boolean }) => {
      const result = await loginRequest({
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
        `    ${cyan(`slideless auth login-complete --email ${options.email} --code <6-digit-code>`)}`,
      );
      console.log('');
    },
  );
