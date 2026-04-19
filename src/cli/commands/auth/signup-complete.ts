/**
 * `slideless auth signup-complete --email <email> --code <code> [options]`
 *
 * Verifies the signup OTP and creates user + org + API key in one call.
 * On success the returned `cko_` key is saved to ~/.config/slideless/config.json
 * as a new profile and set as active.
 */

import { Command } from 'commander';
import {
  deriveProfileName,
  listProfiles,
  maskApiKey,
  setActiveProfile,
  upsertProfile,
} from '../../../utils/config.js';
import { signupComplete } from '../../../utils/auth-flow-client.js';
import { loadLogoFile } from '../../../utils/logo-reader.js';
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
  company?: string;
  description?: string;
  brandPrimary?: string;
  brandSecondary?: string;
  brandAccent?: string;
  tone?: string;
  logo?: string;
  profileName?: string;
  keyName?: string;
  keyExpiresIn?: string;
  baseUrl?: string;
  json?: boolean;
}

export const signupCompleteCommand = new Command('signup-complete')
  .description('Complete signup with an OTP; creates org and returns an API key')
  .requiredOption('--email <email>', 'Email address used for signup-request')
  .requiredOption('--code <code>', '6-digit code from the OTP email')
  .option('--company <name>', 'Organization name (default "My Organization")')
  .option('--description <text>', 'Organization description')
  .option('--brand-primary <hex>', 'Brand primary color, e.g. "#0a0a0a"')
  .option('--brand-secondary <hex>', 'Brand secondary color')
  .option('--brand-accent <hex>', 'Brand accent color')
  .option('--tone <text>', 'Brand tone / voice description')
  .option('--logo <path>', 'Path to a PNG/JPEG/WebP/SVG logo file (max 2 MB)')
  .option('--profile-name <name>', 'Local profile name (auto-derived if omitted)')
  .option('--key-name <name>', 'Human-readable API key name')
  .option('--key-expires-in <days>', 'API key expiration in days (1-365)')
  .option('--base-url <url>', 'Override API base URL')
  .option('--json', 'Output as JSON')
  .action(async (options: Options) => {
    // Pre-load the logo if requested so we can fail fast client-side.
    let logo: { data: string; contentType: string } | undefined;
    if (options.logo) {
      const loaded = await loadLogoFile(options.logo);
      if (!loaded.success) {
        if (options.json) {
          emitJsonError(loaded.error);
        } else {
          console.error('');
          console.error(`${CROSS} ${red(loaded.error.message)}`);
          console.error(`  ${yellow('next:')} ${loaded.error.nextAction}`);
          console.error('');
        }
        process.exit(1);
      }
      logo = loaded.data;
    }

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

    const company = {
      ...(options.company !== undefined && { name: options.company }),
      ...(options.description !== undefined && { description: options.description }),
      ...(options.brandPrimary !== undefined && { brandPrimary: options.brandPrimary }),
      ...(options.brandSecondary !== undefined && { brandSecondary: options.brandSecondary }),
      ...(options.brandAccent !== undefined && { brandAccent: options.brandAccent }),
      ...(options.tone !== undefined && { tone: options.tone }),
    };

    const result = await signupComplete({
      email: options.email,
      code: options.code,
      ...(Object.keys(company).length > 0 && { company }),
      ...(logo && { logo }),
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

    // Save the key as a local profile.
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
        isNewUser: result.data.isNewUser,
      });
      return;
    }

    console.log('');
    console.log(`${CHECK} ${green('Signup complete')}`);
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
