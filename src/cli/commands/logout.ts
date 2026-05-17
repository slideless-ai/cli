/**
 * Remove a profile from the config. Without argument, removes the active profile.
 */

import { Command, Option } from 'commander';
import { getActiveProfile, removeProfile, listProfiles } from '../../utils/config.js';
import { red, green, CHECK } from '../utils/output.js';

export const logoutCommand = new Command('logout')
  .description('Remove a profile')
  .argument('[name]', 'Profile name to remove (default: active profile)')
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

    const jsonMode = options.json ?? false;
    const profiles = listProfiles();

    if (profiles.length === 0) {
      if (jsonMode) {
        console.log(JSON.stringify({
          success: false,
          error: { code: 'not-found', message: 'No profiles configured.' },
        }, null, 2));
      } else {
        console.log('');
        console.log('No profiles configured.');
        console.log('');
      }
      process.exit(1);
    }

    const targetName = name || getActiveProfile()?.name;

    if (!targetName) {
      if (jsonMode) {
        console.log(JSON.stringify({
          success: false,
          error: { code: 'not-found', message: 'No active profile to remove.' },
        }, null, 2));
      } else {
        console.log('');
        console.log('No active profile to remove.');
        console.log('');
      }
      process.exit(1);
    }

    const exists = profiles.find(p => p.name === targetName);
    if (!exists) {
      const available = profiles.map(p => p.name).join(', ');
      if (jsonMode) {
        console.log(JSON.stringify({
          success: false,
          error: {
            code: 'not-found',
            message: `Profile "${targetName}" not found. Available: ${available}`,
          },
        }, null, 2));
      } else {
        console.error(`${red('Error:')} Profile "${targetName}" not found. Available: ${available}`);
      }
      process.exit(1);
    }

    removeProfile(targetName);

    const remaining = listProfiles();
    const newActive = remaining.find(p => p.active);

    if (jsonMode) {
      console.log(JSON.stringify({
        success: true,
        data: {
          removed: targetName,
          activeProfile: newActive?.name ?? null,
        },
      }, null, 2));
      return;
    }

    console.log('');
    console.log(`${CHECK} ${green(`Removed profile "${targetName}"`)}`);
    if (newActive) {
      console.log(`  Active profile is now "${newActive.name}"`);
    } else {
      console.log("  No profiles remaining. Run 'slideless login' to add one.");
    }
    console.log('');
  });
