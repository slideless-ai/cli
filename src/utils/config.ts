/**
 * Configuration Module
 *
 * Manages persistent CLI configuration stored in ~/.config/slideless/config.json.
 * Supports multiple profiles (API keys with metadata) and active profile switching.
 *
 * Resolution chains for API key and base URL:
 *   --flag > environment variable > active profile > default
 */

import { readFileSync, writeFileSync, mkdirSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// ── Types ────────────────────────────────────────────────

export interface ProfileData {
  apiKey: string;
  type: 'org-api-key' | 'admin-api-key';
  organizationId?: string | null;
  organizationName?: string | null;
  keyName?: string | null;
  keyPrefix?: string | null;
  scopes?: string[];
  createdAt?: string | null;
  expiresAt?: string | null;
  baseUrl?: string | null;
}

export interface SlidelessConfig {
  activeProfile: string | null;
  profiles: Record<string, ProfileData>;
}

export type EndpointName = keyof typeof ENDPOINTS;

// ── Constants ────────────────────────────────────────────

export const PRODUCTION_BASE_URL = 'https://europe-west1-slideless-ai.cloudfunctions.net';

/**
 * Endpoint paths. The HTTP-exported Cloud Functions live at the root of the
 * functions URL. Update here if the backend renames an endpoint.
 *
 * Note: the backend rename to drop the `Public` suffix on `listMyPresentations`
 * and `getSharedPresentationInfo` ships in the same release as this CLI.
 */
export const ENDPOINTS = {
  verifyApiKey: '/verifyApiKey',
  uploadSharedPresentation: '/uploadSharedPresentation',
  updateSharedPresentation: '/updateSharedPresentation',
  listMyPresentations: '/listMyPresentations',
  getSharedPresentationInfo: '/getSharedPresentationInfo',
  cliRequestSignupOtp: '/cliRequestSignupOtp',
  cliCompleteSignup: '/cliCompleteSignup',
  cliRequestLoginOtp: '/cliRequestLoginOtp',
  cliCompleteLogin: '/cliCompleteLogin',
} as const;

// ── Config file path ─────────────────────────────────────

function getConfigDir(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  const base = xdg || join(homedir(), '.config');
  return join(base, 'slideless');
}

function getConfigPath(): string {
  return join(getConfigDir(), 'config.json');
}

// ── Read / Write / Clear ─────────────────────────────────

const EMPTY_CONFIG: SlidelessConfig = { activeProfile: null, profiles: {} };

export function readConfig(): SlidelessConfig {
  const path = getConfigPath();
  if (!existsSync(path)) {
    return { ...EMPTY_CONFIG, profiles: {} };
  }
  try {
    const raw = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.profiles === 'object') {
      return parsed as SlidelessConfig;
    }
    return { ...EMPTY_CONFIG, profiles: {} };
  } catch {
    return { ...EMPTY_CONFIG, profiles: {} };
  }
}

export function writeConfig(config: SlidelessConfig): void {
  const dir = getConfigDir();
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const path = getConfigPath();
  writeFileSync(path, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
}

export function clearConfig(): void {
  const path = getConfigPath();
  if (existsSync(path)) {
    unlinkSync(path);
  }
}

// ── Profile management ───────────────────────────────────

export function getActiveProfile(): { name: string; profile: ProfileData } | null {
  const config = readConfig();
  if (!config.activeProfile || !config.profiles[config.activeProfile]) {
    return null;
  }
  return { name: config.activeProfile, profile: config.profiles[config.activeProfile] };
}

export function listProfiles(): Array<{ name: string; profile: ProfileData; active: boolean }> {
  const config = readConfig();
  return Object.entries(config.profiles).map(([name, profile]) => ({
    name,
    profile,
    active: name === config.activeProfile,
  }));
}

export function setActiveProfile(name: string): void {
  const config = readConfig();
  if (!config.profiles[name]) {
    throw new Error(`Profile "${name}" does not exist.`);
  }
  config.activeProfile = name;
  writeConfig(config);
}

export function upsertProfile(name: string, data: ProfileData): void {
  const config = readConfig();
  config.profiles[name] = data;
  if (!config.activeProfile || !config.profiles[config.activeProfile]) {
    config.activeProfile = name;
  }
  writeConfig(config);
}

export function removeProfile(name: string): void {
  const config = readConfig();
  if (!config.profiles[name]) {
    throw new Error(`Profile "${name}" does not exist.`);
  }
  delete config.profiles[name];
  if (config.activeProfile === name) {
    const remaining = Object.keys(config.profiles);
    config.activeProfile = remaining.length > 0 ? remaining[0] : null;
  }
  writeConfig(config);
}

export function findProfileByOrgId(orgId: string): { name: string; profile: ProfileData } | null {
  const config = readConfig();
  for (const [name, profile] of Object.entries(config.profiles)) {
    if (profile.organizationId === orgId) {
      return { name, profile };
    }
  }
  return null;
}

export function getProfileByName(name: string): ProfileData | null {
  const config = readConfig();
  return config.profiles[name] || null;
}

// ── Profile name derivation ──────────────────────────────

export function deriveProfileName(
  data: { type?: string; organizationName?: string | null; keyName?: string | null; keyPrefix?: string | null },
  existingNames: Set<string>,
): string {
  let base: string;
  if (data.type === 'admin-api-key') {
    base = data.keyName ? slugify(data.keyName) : (data.keyPrefix || 'admin');
  } else if (data.organizationName) {
    base = slugify(data.organizationName);
  } else if (data.keyName) {
    base = slugify(data.keyName);
  } else if (data.keyPrefix) {
    base = data.keyPrefix;
  } else {
    base = 'default';
  }

  if (!base) base = 'default';

  let name = base;
  let i = 2;
  while (existingNames.has(name)) {
    name = `${base}-${i}`;
    i++;
  }
  return name;
}

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// ── Resolution chains ────────────────────────────────────

export function resolveApiKey(flagValue?: string, profileName?: string): string | undefined {
  if (flagValue) return flagValue;
  if (process.env.SLIDELESS_API_KEY) return process.env.SLIDELESS_API_KEY;
  if (profileName) {
    const profile = getProfileByName(profileName);
    return profile?.apiKey;
  }
  const active = getActiveProfile();
  return active?.profile.apiKey;
}

export function resolveBaseUrl(flagValue?: string, profileName?: string): string {
  if (flagValue) return flagValue;
  if (process.env.SLIDELESS_API_BASE_URL) return process.env.SLIDELESS_API_BASE_URL;
  if (profileName) {
    const profile = getProfileByName(profileName);
    if (profile?.baseUrl) return profile.baseUrl;
  }
  const active = getActiveProfile();
  if (active?.profile.baseUrl) return active.profile.baseUrl;
  return PRODUCTION_BASE_URL;
}

export function resolveEndpointUrl(endpoint: EndpointName, flagOverride?: string, profileName?: string): string {
  if (flagOverride) return flagOverride;
  return resolveBaseUrl(undefined, profileName) + ENDPOINTS[endpoint];
}

// ── Source descriptions ──────────────────────────────────

export function describeApiKeySource(flagValue?: string): string {
  if (flagValue) return 'flag';
  if (process.env.SLIDELESS_API_KEY) return 'env (SLIDELESS_API_KEY)';
  const active = getActiveProfile();
  if (active) return `profile "${active.name}"`;
  return 'not set';
}

export function describeBaseUrlSource(flagValue?: string): string {
  if (flagValue) return 'flag';
  if (process.env.SLIDELESS_API_BASE_URL) return 'env (SLIDELESS_API_BASE_URL)';
  const active = getActiveProfile();
  if (active?.profile.baseUrl) return `profile "${active.name}"`;
  return 'default (production)';
}

export function maskApiKey(key: string): string {
  if (key.length <= 8) return key;
  return key.slice(0, 8) + '...';
}

export const API_KEY_MISSING_MESSAGE = `API key is required. Either:
  1. Run 'slideless login' to save your key
  2. Set SLIDELESS_API_KEY environment variable
  3. Pass --api-key flag`;

// ── Profile expiry check ─────────────────────────────────

export interface ExpiryCheck {
  daysLeft: number;
  expiresAt: string;
  expired: boolean;
  profileName: string;
}

export function checkProfileExpiry(): ExpiryCheck | null {
  const active = getActiveProfile();
  if (!active) return null;

  const { expiresAt } = active.profile;
  if (!expiresAt) return null;

  const expDate = new Date(expiresAt);
  const now = new Date();
  const diffMs = expDate.getTime() - now.getTime();
  const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  return {
    daysLeft,
    expiresAt,
    expired: daysLeft <= 0,
    profileName: active.name,
  };
}
