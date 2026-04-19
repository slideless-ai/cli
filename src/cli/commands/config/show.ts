/**
 * Display current configuration with all profiles.
 */

import { Command } from 'commander';
import {
  listProfiles,
  resolveBaseUrl,
  describeBaseUrlSource,
  maskApiKey,
  PRODUCTION_BASE_URL,
} from '../../../utils/config.js';

export const configShowCommand = new Command('show')
  .description('Display current configuration')
  .option('--json', 'Output as JSON')
  .action((options: { json?: boolean }) => {
    const profiles = listProfiles();
    const baseUrl = resolveBaseUrl();
    const urlSource = describeBaseUrlSource();

    if (options.json) {
      console.log(JSON.stringify({
        success: true,
        data: {
          profiles: profiles.map(({ name, profile, active }) => ({
            name,
            active,
            type: profile.type,
            organizationId: profile.organizationId || null,
            organizationName: profile.organizationName || null,
            keyPrefix: profile.keyPrefix || maskApiKey(profile.apiKey),
            scopes: profile.scopes || [],
            expiresAt: profile.expiresAt || null,
          })),
          baseUrl,
          baseUrlSource: urlSource,
        },
      }, null, 2));
      return;
    }

    console.log('');
    console.log('Slideless Configuration');
    console.log('');

    if (profiles.length === 0) {
      console.log('  No profiles configured.');
      console.log('');
      console.log("Run 'slideless login' to configure your API key.");
      console.log('');
      process.exit(1);
    }

    console.log('  Profiles:');
    console.log('');
    for (const { name, profile, active } of profiles) {
      const marker = active ? '\u25cf' : ' ';
      const orgLabel = profile.type === 'admin-api-key'
        ? '(admin)'
        : (profile.organizationName || '');
      const keyDisplay = maskApiKey(profile.apiKey);
      console.log(`    ${marker} ${name.padEnd(20)} ${orgLabel.padEnd(20)} ${keyDisplay}`);
    }
    console.log('');

    if (baseUrl !== PRODUCTION_BASE_URL) {
      console.log(`  Base URL: ${baseUrl}  (${urlSource})`);
      console.log('');
    }
  });
