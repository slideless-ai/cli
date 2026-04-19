/**
 * Show the currently authenticated identity.
 *
 * Calls /verifyApiKey for fresh data; falls back to cached profile data on network error.
 */

import { Command } from 'commander';
import {
  resolveApiKey,
  resolveBaseUrl,
  getActiveProfile,
  getProfileByName,
  maskApiKey,
  describeApiKeySource,
} from '../../utils/config.js';
import { verifyApiKey } from '../../utils/auth-client.js';
import { yellow } from '../utils/output.js';

export const whoamiCommand = new Command('whoami')
  .description('Show current authentication identity')
  .option('--json', 'Output as JSON')
  .option('--profile <name>', 'Use a specific profile')
  .action(async (options: { json?: boolean; profile?: string }) => {
    const apiKey = resolveApiKey(undefined, options.profile);
    const activeProfile = getActiveProfile();
    const effectiveProfileName = options.profile ?? activeProfile?.name ?? null;

    if (!apiKey) {
      if (options.json) {
        console.log(JSON.stringify({ success: false, data: { loggedIn: false } }, null, 2));
      } else {
        console.log('');
        console.log("Not logged in. Run 'slideless login' to authenticate.");
        console.log('');
      }
      process.exit(1);
    }

    const baseUrl = resolveBaseUrl(undefined, options.profile);
    const result = await verifyApiKey(apiKey, baseUrl);

    if (result.success) {
      const data = result.data;
      if (options.json) {
        console.log(JSON.stringify({
          success: true,
          data: {
            loggedIn: true,
            ...data,
            source: describeApiKeySource(),
            profileName: effectiveProfileName,
          },
        }, null, 2));
        return;
      }

      const isAdmin = data.type === 'admin-api-key';

      console.log('');
      console.log(`Logged in to Slideless${isAdmin ? ' (admin)' : ''}`);
      console.log('');

      if (!isAdmin && data.organizationName) {
        const orgDisplay = data.organizationId
          ? `${data.organizationName} (${data.organizationId})`
          : data.organizationName;
        console.log(`  Organization:  ${orgDisplay}`);
      }
      if (data.keyName) {
        console.log(`  Key name:      ${data.keyName}`);
      }
      console.log(`  Key:           ${maskApiKey(apiKey)}`);
      if (data.scopes && data.scopes.length > 0) {
        console.log(`  Scopes:        ${data.scopes.join(', ')}`);
      }
      if (data.expiresAt) {
        const expDate = new Date(data.expiresAt);
        const isExpired = expDate < new Date();
        console.log(`  Expires:       ${expDate.toLocaleDateString()}${isExpired ? ' ' + yellow('[EXPIRED]') : ''}`);
      }
      if (effectiveProfileName) {
        console.log(`  Profile:       ${effectiveProfileName}`);
      }
      console.log('');
      return;
    }

    // Network/auth error — fall back to cached profile data
    const fallbackProfile = options.profile
      ? (() => { const p = getProfileByName(options.profile!); return p ? { name: options.profile!, profile: p } : null; })()
      : activeProfile;

    if (fallbackProfile) {
      if (options.json) {
        console.log(JSON.stringify({
          success: true,
          data: {
            loggedIn: true,
            cached: true,
            ...fallbackProfile.profile,
            profileName: fallbackProfile.name,
          },
        }, null, 2));
        return;
      }

      const isAdmin = fallbackProfile.profile.type === 'admin-api-key';
      console.log('');
      console.log(`Logged in to Slideless${isAdmin ? ' (admin)' : ''}  ${yellow("(cached — run 'slideless login' to refresh)")}`);
      console.log('');
      if (!isAdmin && fallbackProfile.profile.organizationName) {
        console.log(`  Organization:  ${fallbackProfile.profile.organizationName}`);
      }
      if (fallbackProfile.profile.keyName) {
        console.log(`  Key name:      ${fallbackProfile.profile.keyName}`);
      }
      console.log(`  Key:           ${maskApiKey(apiKey)}`);
      if (fallbackProfile.profile.scopes && fallbackProfile.profile.scopes.length > 0) {
        console.log(`  Scopes:        ${fallbackProfile.profile.scopes.join(', ')}`);
      }
      console.log(`  Profile:       ${fallbackProfile.name}`);
      console.log('');
      return;
    }

    if (options.json) {
      console.log(JSON.stringify({
        success: false,
        error: result.error,
        data: { key: maskApiKey(apiKey), source: describeApiKeySource() },
      }, null, 2));
    } else {
      console.log('');
      console.log(yellow('Could not verify API key'));
      console.log('');
      console.log(`  Key:     ${maskApiKey(apiKey)}`);
      console.log(`  Source:  ${describeApiKeySource()}`);
      console.log(`  Error:   ${result.error.message}`);
      console.log('');
    }
    process.exit(1);
  });
