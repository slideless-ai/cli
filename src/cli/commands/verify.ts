/**
 * Verify the active API key against the backend. Same wire call as `whoami`,
 * but a focused command users (and CI) can run to confirm credentials work.
 */

import { Command } from 'commander';
import {
  resolveApiKey,
  resolveBaseUrl,
  describeApiKeySource,
  describeBaseUrlSource,
  maskApiKey,
  API_KEY_MISSING_MESSAGE,
} from '../../utils/config.js';
import { verifyApiKey } from '../../utils/auth-client.js';
import { red, green, CHECK, CROSS, exitWithError, emitJsonSuccess, emitJsonError } from '../utils/output.js';

export const verifyCommand = new Command('verify')
  .description('Validate the active API key against the backend')
  .option('--json', 'Output as JSON')
  .option('--api-key <key>', 'Override API key')
  .option('--api-url <url>', 'Override base URL')
  .option('--profile <name>', 'Use a specific profile')
  .action(async (options: { json?: boolean; apiKey?: string; apiUrl?: string; profile?: string }) => {
    const apiKey = resolveApiKey(options.apiKey, options.profile);
    if (!apiKey) {
      if (options.json) {
        emitJsonError({ code: 'unauthenticated', message: API_KEY_MISSING_MESSAGE });
        process.exit(1);
      }
      exitWithError(API_KEY_MISSING_MESSAGE, 1);
    }

    const baseUrl = resolveBaseUrl(options.apiUrl, options.profile);
    const result = await verifyApiKey(apiKey, baseUrl);

    if (!result.success) {
      if (options.json) {
        emitJsonError(result.error, result.status);
      } else {
        console.log('');
        console.log(`${CROSS} ${red('Verification failed')}`);
        console.log('');
        console.log(`  Key:    ${maskApiKey(apiKey)} (${describeApiKeySource(options.apiKey)})`);
        console.log(`  URL:    ${baseUrl} (${describeBaseUrlSource(options.apiUrl)})`);
        console.log(`  Status: ${result.status || 'network error'}`);
        console.log(`  Error:  ${result.error.message}`);
        console.log('');
      }
      process.exit(1);
    }

    if (options.json) {
      emitJsonSuccess({
        key: maskApiKey(apiKey),
        keySource: describeApiKeySource(options.apiKey),
        baseUrl,
        baseUrlSource: describeBaseUrlSource(options.apiUrl),
        ...result.data,
      });
      return;
    }

    console.log('');
    console.log(`${CHECK} ${green('API key valid')}`);
    console.log('');
    if (result.data.organizationName) {
      console.log(`  Organization:  ${result.data.organizationName}`);
    }
    if (result.data.keyName) {
      console.log(`  Key name:      ${result.data.keyName}`);
    }
    console.log(`  Key:           ${maskApiKey(apiKey)} (${describeApiKeySource(options.apiKey)})`);
    if (result.data.scopes && result.data.scopes.length > 0) {
      console.log(`  Scopes:        ${result.data.scopes.join(', ')}`);
    }
    if (result.data.expiresAt) {
      console.log(`  Expires:       ${new Date(result.data.expiresAt).toLocaleDateString()}`);
    }
    console.log(`  Base URL:      ${baseUrl} (${describeBaseUrlSource(options.apiUrl)})`);
    console.log('');
  });
