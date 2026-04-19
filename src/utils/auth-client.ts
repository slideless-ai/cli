/**
 * Auth client — calls /verifyApiKey to validate a key and fetch its metadata.
 */

import { apiCall, type ApiResult } from './api-client.js';
import { resolveEndpointUrl, type ProfileData } from './config.js';

export interface VerifyApiKeyData {
  type: 'org-api-key' | 'admin-api-key';
  keyName: string | null;
  keyPrefix: string | null;
  scopes: string[];
  organizationId: string | null;
  organizationName: string | null;
  createdAt: string | null;
  expiresAt: string | null;
  lastUsedAt: string | null;
}

export async function verifyApiKey(apiKey: string, baseUrl?: string): Promise<ApiResult<VerifyApiKeyData>> {
  const url = baseUrl
    ? baseUrl.replace(/\/$/, '') + '/verifyApiKey'
    : resolveEndpointUrl('verifyApiKey');
  return apiCall<VerifyApiKeyData>({
    url,
    method: 'POST',
    apiKey,
  });
}

export function profileDataFromVerify(apiKey: string, data: VerifyApiKeyData, baseUrl?: string): ProfileData {
  return {
    apiKey,
    type: data.type,
    organizationId: data.organizationId,
    organizationName: data.organizationName,
    keyName: data.keyName,
    keyPrefix: data.keyPrefix,
    scopes: data.scopes,
    createdAt: data.createdAt,
    expiresAt: data.expiresAt,
    ...(baseUrl ? { baseUrl } : {}),
  };
}
