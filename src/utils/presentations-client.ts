/**
 * HTTP client for presentation operations.
 *
 * All calls authenticate via Authorization: Bearer <key>.
 */

import { apiCall, type ApiResult } from './api-client.js';
import { resolveEndpointUrl, resolveBaseUrl } from './config.js';
import type {
  UploadSharedPresentationOutput,
  UpdateSharedPresentationOutput,
  ListMyPresentationsOutput,
  PresentationInfo,
  SharePresentationViaEmailInput,
  SharePresentationViaEmailOutput,
  RevokeSharedPresentationOutput,
  AddPresentationTokenOutput,
} from '../types/api.js';

export interface SharedClientOptions {
  apiKey: string;
  apiUrl?: string;
  profileName?: string;
}

export async function uploadSharedPresentation(
  opts: SharedClientOptions & { html: string; title: string },
): Promise<ApiResult<UploadSharedPresentationOutput>> {
  const url = resolveEndpointUrl('uploadSharedPresentation', opts.apiUrl, opts.profileName);
  return apiCall<UploadSharedPresentationOutput>({
    url,
    method: 'POST',
    apiKey: opts.apiKey,
    body: { html: opts.html, title: opts.title },
  });
}

export async function updateSharedPresentation(
  opts: SharedClientOptions & { shareId: string; html: string; title?: string },
): Promise<ApiResult<UpdateSharedPresentationOutput>> {
  const url = resolveEndpointUrl('updateSharedPresentation', opts.apiUrl, opts.profileName);
  return apiCall<UpdateSharedPresentationOutput>({
    url,
    method: 'POST',
    apiKey: opts.apiKey,
    body: { shareId: opts.shareId, html: opts.html, ...(opts.title ? { title: opts.title } : {}) },
  });
}

export async function listMyPresentations(
  opts: SharedClientOptions,
): Promise<ApiResult<ListMyPresentationsOutput>> {
  const url = resolveEndpointUrl('listMyPresentations', opts.apiUrl, opts.profileName);
  return apiCall<ListMyPresentationsOutput>({
    url,
    method: 'GET',
    apiKey: opts.apiKey,
  });
}

export async function sharePresentationViaEmail(
  opts: SharedClientOptions & SharePresentationViaEmailInput,
): Promise<ApiResult<SharePresentationViaEmailOutput>> {
  const url = resolveEndpointUrl('sharePresentationViaEmail', opts.apiUrl, opts.profileName);
  const body: Record<string, unknown> = {
    shareId: opts.shareId,
    emails: opts.emails,
  };
  if (opts.message !== undefined) body.message = opts.message;
  if (opts.subject !== undefined) body.subject = opts.subject;
  if (opts.tokenId !== undefined) body.tokenId = opts.tokenId;
  return apiCall<SharePresentationViaEmailOutput>({
    url,
    method: 'POST',
    apiKey: opts.apiKey,
    body,
  });
}

export async function getSharedPresentationInfo(
  opts: SharedClientOptions & { shareId: string },
): Promise<ApiResult<PresentationInfo>> {
  // Path-param endpoint: GET /getSharedPresentationInfo/<shareId>
  const baseUrl = resolveBaseUrl(opts.apiUrl, opts.profileName);
  const url = `${baseUrl}/getSharedPresentationInfo/${encodeURIComponent(opts.shareId)}`;
  return apiCall<PresentationInfo>({
    url,
    method: 'GET',
    apiKey: opts.apiKey,
  });
}

export async function revokeSharedPresentation(
  opts: SharedClientOptions & { shareId: string; tokenId?: string },
): Promise<ApiResult<RevokeSharedPresentationOutput>> {
  const url = resolveEndpointUrl('revokeSharedPresentation', opts.apiUrl, opts.profileName);
  const body: Record<string, unknown> = { shareId: opts.shareId };
  if (opts.tokenId !== undefined) body.tokenId = opts.tokenId;
  return apiCall<RevokeSharedPresentationOutput>({
    url,
    method: 'POST',
    apiKey: opts.apiKey,
    body,
  });
}

export async function addPresentationToken(
  opts: SharedClientOptions & { shareId: string; tokenName: string },
): Promise<ApiResult<AddPresentationTokenOutput>> {
  const url = resolveEndpointUrl('addPresentationToken', opts.apiUrl, opts.profileName);
  return apiCall<AddPresentationTokenOutput>({
    url,
    method: 'POST',
    apiKey: opts.apiKey,
    body: { shareId: opts.shareId, tokenName: opts.tokenName },
  });
}
