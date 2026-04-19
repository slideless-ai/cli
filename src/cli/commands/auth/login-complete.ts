/**
 * `slideless auth login-complete --email <email> --code <code>`
 *
 * Verifies the login OTP and mints a fresh API key. Saves it as a new profile.
 */

import { Command } from 'commander';
import {
  deriveProfileName,
  listProfiles,
  maskApiKey,
  setActiveProfile,
  upsertProfile,
} from '../../../utils/config.js';
import { loginComplete } from '../../../utils/auth-flow-client.js';
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

interface Options {
  email: string;
  code: string;
  profileName?: string;
  keyName?: string;
  keyExpiresIn?: string;
  baseUrl?: string;
  json?: boolean;
}

export const loginCompleteCommand = new Command('login-complete')
  .description('Complete login with an OTP; returns a fresh API key')
  .requiredOption('--email <email>', 'Email address used for login-request')
  .requiredOption('--code <code>', '6-digit code from the OTP email')
  .option('--profile-name <name>', 'Local profile name (auto-derived if omitted)')
  .option('--key-name <name>', 'Human-readable API key name')
  .option('--key-expires-in <days>', 'API key expiration in days (1-365)')
  .option('--base-url <url>', 'Override API base URL')
  .option('--json', 'Output as JSON')
  .action(async (options: Options) => {
    let expiresInDays: number | undefined;
    if (options.keyExpiresIn !== undefined) {
      const parsed = Number(options.keyExpiresIn);
      if (!Number.isFinite(parsed) || parsed < 1 || parsed > 365) {
        const err = {
          code: 'INVALID_EXPIRES_IN_DAYS',
          message: '--key-expires-in must be an integer between 1 and 365.',
          nextAction: 'Omit --key-expires-in or pass a value between 1 and 365.',
        };
        if (options.json) {
          emitJsonError(err);
        } else {
          console.error('');
          console.error(`${CROSS} ${red(err.message)}`);
          console.error(`  ${yellow('next:')} ${err.nextAction}`);
          console.error('');
        }
        process.exit(1);
      }
      expiresInDays = parsed;
    }

    const result = await loginComplete({
      email: options.email,
      code: options.code,
      ...((options.keyName || expiresInDays !== undefined) && {
        apiKey: {
          ...(options.keyName && { name: options.keyName }),
          ...(expiresInDays !== undefined && { expiresInDays }),
        },
      }),
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

    const existingNames = new Set(listProfiles().map((p) => p.name));
    const profileName = options.profileName
      ? options.profileName
      : deriveProfileName(
          {
            type: 'org-api-key',
            organizationName: result.data.organizationName,
            keyName: result.data.apiKey.name,
            keyPrefix: result.data.apiKey.keyPrefix,
          },
          existingNames,
        );

    upsertProfile(profileName, {
      apiKey: result.data.apiKey.raw,
      type: 'org-api-key',
      organizationId: result.data.organizationId,
      organizationName: result.data.organizationName,
      keyName: result.data.apiKey.name,
      keyPrefix: result.data.apiKey.keyPrefix,
      scopes: result.data.apiKey.scopes,
      createdAt: result.data.apiKey.createdAt,
      expiresAt: result.data.apiKey.expiresAt ?? null,
      ...(options.baseUrl && { baseUrl: options.baseUrl }),
    });
    setActiveProfile(profileName);

    if (options.json) {
      emitJsonSuccess({
        profileName,
        organizationId: result.data.organizationId,
        organizationName: result.data.organizationName,
        apiKey: {
          keyId: result.data.apiKey.keyId,
          keyPrefix: result.data.apiKey.keyPrefix,
          name: result.data.apiKey.name,
          scopes: result.data.apiKey.scopes,
          createdAt: result.data.apiKey.createdAt,
          ...(result.data.apiKey.expiresAt && { expiresAt: result.data.apiKey.expiresAt }),
        },
      });
      return;
    }

    console.log('');
    console.log(`${CHECK} ${green('Login complete')}`);
    console.log('');
    console.log(`  Organization:  ${result.data.organizationName}`);
    console.log(`  Org ID:        ${result.data.organizationId}`);
    console.log(`  Profile:       ${profileName} ${cyan('(now active)')}`);
    console.log(`  API key:       ${maskApiKey(result.data.apiKey.raw)}  (scopes: ${result.data.apiKey.scopes.join(', ')})`);
    if (result.data.apiKey.expiresAt) {
      console.log(`  Expires:       ${new Date(result.data.apiKey.expiresAt).toLocaleDateString()}`);
    }
    console.log('');
    console.log(`  Try it:  ${cyan('slideless whoami')}`);
    console.log('');
  });
