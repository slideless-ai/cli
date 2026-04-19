/**
 * Remove a profile from the config. Without argument, removes the active profile.
 */

import { Command, Option } from 'commander';
import { getActiveProfile, removeProfile, listProfiles } from '../../utils/config.js';
import { red, green, CHECK } from '../utils/output.js';

export const logoutCommand = new Command('logout')
  .description('Remove a profile')
  .argument('[name]', 'Profile name to remove (default: active profile)')
  .addOption(new Option('--list-names').hideHelp())
  .action((name: string | undefined, options: { listNames?: boolean }) => {
    if (options.listNames) {
      const profiles = listProfiles();
      for (const p of profiles) {
        console.log(p.name);
      }
      return;
    }

    const profiles = listProfiles();

    if (profiles.length === 0) {
      console.log('');
      console.log('No profiles configured.');
      console.log('');
      return;
    }

    const targetName = name || getActiveProfile()?.name;

    if (!targetName) {
      console.log('');
      console.log('No active profile to remove.');
      console.log('');
      process.exit(1);
    }

    const exists = profiles.find(p => p.name === targetName);
    if (!exists) {
      const available = profiles.map(p => p.name).join(', ');
      console.error(`${red('Error:')} Profile "${targetName}" not found. Available: ${available}`);
      process.exit(1);
    }

    removeProfile(targetName);

    const remaining = listProfiles();
    const newActive = remaining.find(p => p.active);

    console.log('');
    console.log(`${CHECK} ${green(`Removed profile "${targetName}"`)}`);
    if (newActive) {
      console.log(`  Active profile is now "${newActive.name}"`);
    } else {
      console.log("  No profiles remaining. Run 'slideless login' to add one.");
    }
    console.log('');
  });
