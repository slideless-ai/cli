/**
 * Switch the active profile or list all profiles.
 */

import { Command, Option } from 'commander';
import { listProfiles, setActiveProfile, maskApiKey } from '../../utils/config.js';
import { red, green, CHECK } from '../utils/output.js';

export const useCommand = new Command('use')
  .alias('profiles')
  .description('Switch active profile or list profiles')
  .argument('[name]', 'Profile name to switch to')
  .option('--json', 'Output as JSON')
  .addOption(new Option('--list-names').hideHelp())
  .action((name: string | undefined, options: { listNames?: boolean; json?: boolean }) => {
    if (options.listNames) {
      const profiles = listProfiles();
      for (const p of profiles) {
        console.log(p.name);
      }
      return;
    }

    const profiles = listProfiles();

    if (profiles.length === 0) {
      if (options.json) {
        console.log(JSON.stringify({ success: true, data: { activeProfile: null, profiles: [] } }, null, 2));
      } else {
        console.log('');
        console.log("No profiles configured. Run 'slideless login' to add one.");
        console.log('');
      }
      process.exit(profiles.length === 0 && !options.json ? 1 : 0);
    }

    if (!name) {
      if (options.json) {
        const activeProfile = profiles.find(p => p.active)?.name || null;
        console.log(JSON.stringify({
          success: true,
          data: {
            activeProfile,
            profiles: profiles.map(({ name: pName, profile, active }) => ({
              name: pName,
              active,
              type: profile.type,
              organizationId: profile.organizationId || null,
              organizationName: profile.organizationName || null,
              keyPrefix: profile.keyPrefix || maskApiKey(profile.apiKey),
              scopes: profile.scopes || [],
              expiresAt: profile.expiresAt || null,
            })),
          },
        }, null, 2));
        return;
      }

      console.log('');
      console.log('Profiles:');
      console.log('');
      for (const { name: pName, profile, active } of profiles) {
        const marker = active ? '\u25cf' : ' ';
        const orgLabel = profile.type === 'admin-api-key'
          ? '(admin)'
          : (profile.organizationName || '');
        const orgId = profile.organizationId || '';
        const keyDisplay = maskApiKey(profile.apiKey);
        console.log(`  ${marker} ${pName.padEnd(20)} ${orgLabel.padEnd(20)} ${orgId.padEnd(24)} ${keyDisplay}`);
      }
      console.log('');
      console.log('Use: slideless use <name>');
      console.log('');
      return;
    }

    const exists = profiles.find(p => p.name === name);
    if (!exists) {
      const available = profiles.map(p => p.name).join(', ');
      console.error(`${red('Error:')} Profile "${name}" not found. Available: ${available}`);
      process.exit(1);
    }

    setActiveProfile(name);

    console.log('');
    console.log(`${CHECK} ${green(`Switched to "${name}"`)}`);
    console.log('');
    if (exists.profile.type === 'org-api-key' && exists.profile.organizationName) {
      console.log(`  Organization: ${exists.profile.organizationName}`);
    }
    console.log(`  Key:          ${maskApiKey(exists.profile.apiKey)}`);
    console.log('');
  });
