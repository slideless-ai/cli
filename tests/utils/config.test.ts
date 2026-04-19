import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  resolveApiKey,
  resolveBaseUrl,
  PRODUCTION_BASE_URL,
  upsertProfile,
  setActiveProfile,
  clearConfig,
  deriveProfileName,
} from '../../src/utils/config.js';

describe('config — resolution chains', () => {
  let tmpHome: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    tmpHome = mkdtempSync(join(tmpdir(), 'slideless-cli-test-'));
    originalEnv = { ...process.env };
    process.env.XDG_CONFIG_HOME = tmpHome;
    delete process.env.SLIDELESS_API_KEY;
    delete process.env.SLIDELESS_API_BASE_URL;
    clearConfig();
  });

  afterEach(() => {
    process.env = originalEnv;
    rmSync(tmpHome, { recursive: true, force: true });
  });

  it('flag overrides env and profile', () => {
    process.env.SLIDELESS_API_KEY = 'cko_env';
    upsertProfile('p1', { apiKey: 'cko_profile', type: 'org-api-key' });
    setActiveProfile('p1');

    expect(resolveApiKey('cko_flag')).toBe('cko_flag');
  });

  it('env overrides profile when flag absent', () => {
    process.env.SLIDELESS_API_KEY = 'cko_env';
    upsertProfile('p1', { apiKey: 'cko_profile', type: 'org-api-key' });
    setActiveProfile('p1');

    expect(resolveApiKey()).toBe('cko_env');
  });

  it('falls back to active profile when no flag/env', () => {
    upsertProfile('p1', { apiKey: 'cko_profile', type: 'org-api-key' });
    setActiveProfile('p1');

    expect(resolveApiKey()).toBe('cko_profile');
  });

  it('returns undefined when nothing configured', () => {
    expect(resolveApiKey()).toBeUndefined();
  });

  it('base URL falls back to production default', () => {
    expect(resolveBaseUrl()).toBe(PRODUCTION_BASE_URL);
  });

  it('base URL uses env when set', () => {
    process.env.SLIDELESS_API_BASE_URL = 'http://localhost:5001';
    expect(resolveBaseUrl()).toBe('http://localhost:5001');
  });

  it('base URL uses profile baseUrl when no env', () => {
    upsertProfile('p1', { apiKey: 'k', type: 'org-api-key', baseUrl: 'https://staging.slideless.ai' });
    setActiveProfile('p1');
    expect(resolveBaseUrl()).toBe('https://staging.slideless.ai');
  });
});

describe('config — profile name derivation', () => {
  it('slugifies organization name', () => {
    const name = deriveProfileName({ type: 'org-api-key', organizationName: "Acme Inc.'s Workspace" }, new Set());
    expect(name).toBe('acme-inc-s-workspace');
  });

  it('appends -2 on collision', () => {
    const name = deriveProfileName({ type: 'org-api-key', organizationName: 'Acme' }, new Set(['acme']));
    expect(name).toBe('acme-2');
  });

  it('uses keyName for admin keys', () => {
    const name = deriveProfileName({ type: 'admin-api-key', keyName: 'CI Bot' }, new Set());
    expect(name).toBe('ci-bot');
  });
});
