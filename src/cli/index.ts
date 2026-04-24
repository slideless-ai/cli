#!/usr/bin/env node
/**
 * Slideless CLI
 *
 * Command-line interface for the Slideless presentation hosting platform.
 *
 * Usage:
 *   slideless <command> [options]
 *
 * Run `slideless --help` for the full command list.
 */

import { program, Command } from 'commander';
import { createRequire } from 'module';

import { configCommand, runConfigSet } from './commands/config/index.js';
import { whoamiCommand } from './commands/whoami.js';
import { useCommand } from './commands/use.js';
import { logoutCommand } from './commands/logout.js';
import { verifyCommand } from './commands/verify.js';
import { pushCommand } from './commands/push.js';
import { pullCommand } from './commands/pull.js';
import { shareCommand } from './commands/share.js';
import { unshareCommand } from './commands/unshare.js';
import { deleteCommand } from './commands/delete.js';
import { inviteCommand } from './commands/invite.js';
import { uninviteCommand } from './commands/uninvite.js';
import { shareEmailCommand } from './commands/share-email.js';
import { listCommand } from './commands/list.js';
import { getCommand } from './commands/get.js';
import { pinCommand } from './commands/pin.js';
import { completionCommand } from './commands/completion.js';
import { authCommand } from './commands/auth/index.js';
import { checkProfileExpiry } from '../utils/config.js';
import { yellow } from './utils/output.js';

const require = createRequire(import.meta.url);
const { version: VERSION } = require('../../package.json');

program
  .name('slideless')
  .description('Slideless CLI — push, pull, share, and collaborate on HTML presentations')
  .version(VERSION);

program.addCommand(configCommand);

const loginCommand = new Command('login')
  .description('Save API key (alias for "config set")')
  .option('--api-key <key>', 'API key (skips interactive prompt)')
  .option('--base-url <url>', 'Base URL override (default: production)')
  .option('--name <name>', 'Custom profile name (auto-derived if omitted)')
  .option('--skip-verify', 'Save without verifying the key')
  .action(async (options) => {
    await runConfigSet(options);
  });
program.addCommand(loginCommand);

program.addCommand(whoamiCommand);
program.addCommand(useCommand);
program.addCommand(logoutCommand);
program.addCommand(verifyCommand);

// Content lifecycle
program.addCommand(pushCommand);
program.addCommand(pullCommand);

// Sharing (viewer access)
program.addCommand(shareCommand);
program.addCommand(unshareCommand);
program.addCommand(shareEmailCommand);

// Collaboration (editor access)
program.addCommand(inviteCommand);
program.addCommand(uninviteCommand);

// Lifecycle (destructive)
program.addCommand(deleteCommand);

// Info
program.addCommand(listCommand);
program.addCommand(getCommand);

// Misc
program.addCommand(pinCommand);
program.addCommand(completionCommand);
program.addCommand(authCommand);

program.hook('preAction', () => {
  const expiry = checkProfileExpiry();
  if (!expiry) return;

  if (expiry.expired) {
    process.stderr.write(
      yellow(`⚠ API key "${expiry.profileName}" expired on ${new Date(expiry.expiresAt).toLocaleDateString()}. Run 'slideless login' to refresh.`) + '\n'
    );
  } else if (expiry.daysLeft <= 7) {
    process.stderr.write(
      yellow(`⚠ API key "${expiry.profileName}" expires in ${expiry.daysLeft} day${expiry.daysLeft !== 1 ? 's' : ''}. Run 'slideless login' to refresh.`) + '\n'
    );
  }
});

program.parse();
