/**
 * HTTP client for presentation operations.
 *
 * All calls authenticate via Authorization: Bearer <key>.
 */

import { readFile } from 'fs/promises';
import { apiCall, type ApiResult } from './api-client.js';
import { resolveEndpointUrl, resolveBaseUrl } from './config.js';
import type {
  CommitPresentationVersionOutput,
  ListMyPresentationsOutput,
  ListPresentationVersionsOutput,
  GetPresentationVersionOutput,
  ManifestFileInput,
  PrecheckAssetsOutput,
  PresentationInfo,
  SetTokenVersionModeOutput,
  SharePresentationViaEmailInput,
  SharePresentationViaEmailOutput,
  RevokeSharedPresentationOutput,
  AddPresentationTokenOutput,
  TokenVersionMode,
  UploadPresentationAssetOutput,
} from '../types/api.js';

export interface SharedClientOptions {
  apiKey: string;
  apiUrl?: string;
  profileName?: string;
}

export async function precheckAssets(
  opts: SharedClientOptions & { shareId?: string; sessionId?: string; hashes: string[] },
): Promise<ApiResult<PrecheckAssetsOutput>> {
  const url = resolveEndpointUrl('precheckAssets', opts.apiUrl, opts.profileName);
  const body: Record<string, unknown> = { hashes: opts.hashes };
  if (opts.shareId) body.shareId = opts.shareId;
  if (opts.sessionId) body.sessionId = opts.sessionId;
  return apiCall<PrecheckAssetsOutput>({ url, method: 'POST', apiKey: opts.apiKey, body });
}

/**
 * Upload one content-addressed blob. Streams the file from disk so memory
 * stays bounded regardless of asset size.
 */
export async function uploadPresentationAsset(
  opts: SharedClientOptions & {
    shareId?: string;
    sessionId?: string;
    sha256: string;
    contentType: string;
    absolutePath: string;
  },
): Promise<ApiResult<UploadPresentationAssetOutput>> {
  const url = resolveEndpointUrl('uploadPresentationAsset', opts.apiUrl, opts.profileName);

  // Use native FormData + Blob (Node 20+). Buffers the file in memory —
  // acceptable up to plan per-asset cap (50 MB free, up to 1 GB enterprise);
  // swap to streaming for larger files if that becomes the bottleneck.
  const bytes = await readFile(opts.absolutePath);
  const blob = new Blob([bytes], { type: opts.contentType });
  const form = new FormData();
  if (opts.shareId) form.append('shareId', opts.shareId);
  if (opts.sessionId) form.append('sessionId', opts.sessionId);
  form.append('sha256', opts.sha256);
  form.append('contentType', opts.contentType);
  form.append('file', blob, 'blob');

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        Accept: 'application/json',
      },
      body: form,
    });
    const text = await response.text();
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      parsed = { raw: text };
    }
    if (!response.ok) {
      const p = parsed as { error?: { code?: string; message?: string; nextAction?: string; details?: unknown } };
      return {
        success: false,
        status: response.status,
        error: {
          code: p.error?.code ?? `http-${response.status}`,
          message: p.error?.message ?? text ?? 'Upload failed',
          nextAction: p.error?.nextAction,
          details: p.error?.details as Record<string, unknown> | undefined,
        },
      };
    }
    const body = parsed as { success?: boolean; data?: UploadPresentationAssetOutput };
    return { success: true, status: response.status, data: (body.data ?? body) as UploadPresentationAssetOutput };
  } catch (err) {
    return {
      success: false,
      status: 0,
      error: { code: 'network-error', message: err instanceof Error ? err.message : String(err) },
    };
  }
}

export async function commitPresentationVersion(
  opts: SharedClientOptions & {
    shareId?: string;
    sessionId?: string;
    title: string;
    entryPath: string;
    files: ManifestFileInput[];
  },
): Promise<ApiResult<CommitPresentationVersionOutput>> {
  const url = resolveEndpointUrl('commitPresentationVersion', opts.apiUrl, opts.profileName);
  const body: Record<string, unknown> = {
    title: opts.title,
    entryPath: opts.entryPath,
    files: opts.files,
  };
  if (opts.shareId) body.shareId = opts.shareId;
  if (opts.sessionId) body.sessionId = opts.sessionId;
  return apiCall<CommitPresentationVersionOutput>({
    url,
    method: 'POST',
    apiKey: opts.apiKey,
    body,
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
  const baseUrl = resolveBaseUrl(opts.apiUrl, opts.profileName);
  const url = `${baseUrl}/getSharedPresentationInfo/${encodeURIComponent(opts.shareId)}`;
  return apiCall<PresentationInfo>({ url, method: 'GET', apiKey: opts.apiKey });
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
  opts: SharedClientOptions & { shareId: string; tokenName: string; versionMode?: TokenVersionMode },
): Promise<ApiResult<AddPresentationTokenOutput>> {
  const url = resolveEndpointUrl('addPresentationToken', opts.apiUrl, opts.profileName);
  const body: Record<string, unknown> = { shareId: opts.shareId, tokenName: opts.tokenName };
  if (opts.versionMode) body.versionMode = opts.versionMode;
  return apiCall<AddPresentationTokenOutput>({
    url,
    method: 'POST',
    apiKey: opts.apiKey,
    body,
  });
}

export async function setTokenVersionMode(
  opts: SharedClientOptions & { shareId: string; tokenId: string; versionMode: TokenVersionMode },
): Promise<ApiResult<SetTokenVersionModeOutput>> {
  const url = resolveEndpointUrl('setTokenVersionMode', opts.apiUrl, opts.profileName);
  return apiCall<SetTokenVersionModeOutput>({
    url,
    method: 'POST',
    apiKey: opts.apiKey,
    body: { shareId: opts.shareId, tokenId: opts.tokenId, versionMode: opts.versionMode },
  });
}

export async function listPresentationVersions(
  opts: SharedClientOptions & { shareId: string },
): Promise<ApiResult<ListPresentationVersionsOutput>> {
  const baseUrl = resolveBaseUrl(opts.apiUrl, opts.profileName);
  const url = `${baseUrl}/listPresentationVersions/${encodeURIComponent(opts.shareId)}`;
  return apiCall<ListPresentationVersionsOutput>({ url, method: 'GET', apiKey: opts.apiKey });
}

export async function getPresentationVersion(
  opts: SharedClientOptions & { shareId: string; version: number },
): Promise<ApiResult<GetPresentationVersionOutput>> {
  const baseUrl = resolveBaseUrl(opts.apiUrl, opts.profileName);
  const url = `${baseUrl}/getPresentationVersion/${encodeURIComponent(opts.shareId)}/${opts.version}`;
  return apiCall<GetPresentationVersionOutput>({ url, method: 'GET', apiKey: opts.apiKey });
}
