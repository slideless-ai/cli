/**
 * Save an API key to the config and verify it against the platform.
 *
 * Usage:
 *   slideless config set
 *   slideless config set --api-key <key>
 *   slideless config set --api-key <key> --base-url <url>
 *   slideless config set --name my-profile
 */

import { Command } from 'commander';
import {
  maskApiKey,
  upsertProfile,
  setActiveProfile,
  readConfig,
  deriveProfileName,
  findProfileByOrgId,
  PRODUCTION_BASE_URL,
  type ProfileData,
} from '../../../utils/config.js';
import { verifyApiKey, profileDataFromVerify } from '../../../utils/auth-client.js';
import { promptMasked } from '../../utils/prompts.js';
import { red, green, CHECK, CROSS } from '../../utils/output.js';

export interface ConfigSetOptions {
  apiKey?: string;
  baseUrl?: string;
  name?: string;
  skipVerify?: boolean;
}

export async function runConfigSet(options: ConfigSetOptions): Promise<void> {
  let apiKey = options.apiKey;
  const baseUrl = options.baseUrl || PRODUCTION_BASE_URL;

  if (options.apiKey === '') {
    console.error(`${red('Error:')} API key cannot be empty.`);
    process.exit(2);
  }

  if (!apiKey) {
    apiKey = await promptMasked('API key: ');
    if (!apiKey) {
      console.error(`${red('Error:')} API key cannot be empty.`);
      process.exit(1);
    }
  }

  if (options.skipVerify) {
    const config = readConfig();
    const profileName = options.name || deriveProfileName({}, new Set(Object.keys(config.profiles)));
    const profileData: ProfileData = {
      apiKey,
      type: apiKey.startsWith('cka_') ? 'admin-api-key' : 'org-api-key',
      ...(baseUrl !== PRODUCTION_BASE_URL && { baseUrl }),
    };
    upsertProfile(profileName, profileData);
    setActiveProfile(profileName);

    console.log('');
    console.log(`${CHECK} ${green('Configuration saved')}`);
    console.log('');
    console.log(`  Profile:  ${profileName} (active)`);
    console.log(`  API key:  ${maskApiKey(apiKey)}`);
    if (baseUrl !== PRODUCTION_BASE_URL) {
      console.log(`  Base URL: ${baseUrl}`);
    }
    console.log('');
    return;
  }

  console.log('');
  console.log('Verifying API key...');
  const result = await verifyApiKey(apiKey, baseUrl);

  if (!result.success) {
    console.log('');
    console.log(`${CROSS} ${red('API key verification failed')}`);
    console.log('');
    console.log(`  ${result.error.message}`);
    console.log('');
    process.exit(1);
  }

  const profileData = profileDataFromVerify(
    apiKey,
    result.data,
    baseUrl !== PRODUCTION_BASE_URL ? baseUrl : undefined,
  );

  const config = readConfig();
  let profileName: string;
  if (options.name) {
    profileName = options.name;
  } else if (result.data.organizationId) {
    const existing = findProfileByOrgId(result.data.organizationId);
    profileName = existing
      ? existing.name
      : deriveProfileName(result.data, new Set(Object.keys(config.profiles)));
  } else {
    profileName = deriveProfileName(result.data, new Set(Object.keys(config.profiles)));
  }

  upsertProfile(profileName, profileData);
  setActiveProfile(profileName);

  console.log('');
  console.log(`${CHECK} ${green('Logged in successfully')}`);
  console.log('');
  console.log(`  Profile:      ${profileName} (active)`);
  if (result.data.organizationName) {
    console.log(`  Organization: ${result.data.organizationName}`);
  }
  if (result.data.keyName) {
    console.log(`  Key name:     ${result.data.keyName}`);
  }
  console.log(`  Key:          ${maskApiKey(apiKey)}`);
  if (result.data.scopes.length > 0) {
    console.log(`  Scopes:       ${result.data.scopes.join(', ')}`);
  }
  if (result.data.expiresAt) {
    console.log(`  Expires:      ${new Date(result.data.expiresAt).toLocaleDateString()}`);
  }
  if (baseUrl !== PRODUCTION_BASE_URL) {
    console.log(`  Base URL:     ${baseUrl}`);
  }
  console.log('');
}

export const configSetCommand = new Command('set')
  .description('Save API key and base URL to config file')
  .option('--api-key <key>', 'API key (skips interactive prompt)')
  .option('--base-url <url>', 'Base URL override (default: production)')
  .option('--name <name>', 'Custom profile name (auto-derived if omitted)')
  .option('--skip-verify', 'Save without verifying the key')
  .action(async (options: ConfigSetOptions) => {
    await runConfigSet(options);
  });
