/**
 * Remove the entire config file or a single profile.
 */

import { Command } from 'commander';
import { clearConfig, removeProfile, listProfiles } from '../../../utils/config.js';
import { red, green, CHECK } from '../../utils/output.js';

export const configClearCommand = new Command('clear')
  .description('Remove saved configuration')
  .option('--profile <name>', 'Remove only this profile')
  .action((options: { profile?: string }) => {
    if (options.profile) {
      const profiles = listProfiles();
      const exists = profiles.find(p => p.name === options.profile);
      if (!exists) {
        console.error(`${red('Error:')} Profile "${options.profile}" not found.`);
        process.exit(1);
      }
      removeProfile(options.profile);
      console.log('');
      console.log(`${CHECK} ${green(`Profile "${options.profile}" removed`)}`);
      console.log('');
    } else {
      clearConfig();
      console.log('');
      console.log(`${CHECK} ${green('Configuration cleared')}`);
      console.log('');
    }
  });
