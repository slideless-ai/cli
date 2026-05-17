/**
 * HTTP client for the Slideless marketplace.
 *
 * Read endpoints (list / get / files) are PUBLIC — they work with no API key.
 * Write endpoints (publish / update / delete / star) authenticate via
 * `Authorization: Bearer <key>`.
 */

import { apiCall, type ApiResult } from './api-client.js';
import { ENDPOINTS, resolveBaseUrl, resolveEndpointUrl } from './config.js';
import type {
  GetListingOutput,
  ListListingsOutput,
  ListMarketplaceRemixesOutput,
  ListMyStarredListingsOutput,
  MarketplaceKind,
  MarketplaceListingFilesOutput,
  MarketplaceStatus,
  PublishListingOutput,
  RecordRemixOutput,
  StarListingOutput,
} from '../types/api.js';

export interface MarketplaceClientOptions {
  apiUrl?: string;
  profileName?: string;
}

export interface AuthedMarketplaceOptions extends MarketplaceClientOptions {
  apiKey: string;
}

// ─── Public reads ─────────────────────────────────────────

export interface ListListingsParams {
  kind?: MarketplaceKind;
  category?: string;
  tag?: string;
  sort?: 'recent' | 'popular' | 'stars';
  limit?: number;
  cursor?: string;
}

export async function listMarketplaceListings(
  opts: MarketplaceClientOptions & ListListingsParams,
): Promise<ApiResult<ListListingsOutput>> {
  const base = resolveBaseUrl(opts.apiUrl, opts.profileName) + ENDPOINTS.listMarketplaceListings;
  const qs = new URLSearchParams();
  if (opts.kind) qs.set('kind', opts.kind);
  if (opts.category) qs.set('category', opts.category);
  if (opts.tag) qs.set('tag', opts.tag);
  if (opts.sort) qs.set('sort', opts.sort);
  if (typeof opts.limit === 'number') qs.set('limit', String(opts.limit));
  if (opts.cursor) qs.set('cursor', opts.cursor);
  const url = qs.toString() ? `${base}?${qs.toString()}` : base;
  return apiCall<ListListingsOutput>({ url, method: 'GET' });
}

export async function getMarketplaceListing(
  opts: MarketplaceClientOptions & { slug: string },
): Promise<ApiResult<GetListingOutput>> {
  const base = resolveBaseUrl(opts.apiUrl, opts.profileName) + ENDPOINTS.getMarketplaceListing;
  const url = `${base}?slug=${encodeURIComponent(opts.slug)}`;
  return apiCall<GetListingOutput>({ url, method: 'GET' });
}

export async function getMarketplaceListingFiles(
  opts: MarketplaceClientOptions & { slug: string },
): Promise<ApiResult<MarketplaceListingFilesOutput>> {
  const base = resolveBaseUrl(opts.apiUrl, opts.profileName) + ENDPOINTS.getMarketplaceListingFiles;
  const url = `${base}?slug=${encodeURIComponent(opts.slug)}`;
  return apiCall<MarketplaceListingFilesOutput>({ url, method: 'GET' });
}

export async function listMarketplaceRemixes(
  opts: MarketplaceClientOptions & { slug: string },
): Promise<ApiResult<ListMarketplaceRemixesOutput>> {
  const base = resolveBaseUrl(opts.apiUrl, opts.profileName) + ENDPOINTS.listMarketplaceRemixes;
  const url = `${base}?slug=${encodeURIComponent(opts.slug)}`;
  return apiCall<ListMarketplaceRemixesOutput>({ url, method: 'GET' });
}

/** Build the public per-asset download URL for the remix downloader. */
export function buildMarketplaceDownloadUrl(
  opts: MarketplaceClientOptions & { slug: string; sha256: string },
): string {
  const base = resolveBaseUrl(opts.apiUrl, opts.profileName) + ENDPOINTS.downloadMarketplaceAsset;
  const qs = new URLSearchParams({ slug: opts.slug, sha256: opts.sha256 });
  return `${base}?${qs.toString()}`;
}

export async function recordMarketplaceRemix(
  opts: MarketplaceClientOptions & { slug: string },
): Promise<ApiResult<RecordRemixOutput>> {
  const url = resolveEndpointUrl('recordMarketplaceRemix', opts.apiUrl, opts.profileName);
  return apiCall<RecordRemixOutput>({ url, method: 'POST', body: { slug: opts.slug } });
}

// ─── Authenticated writes ─────────────────────────────────

export interface PublishListingParams {
  presentationId: string;
  kind: MarketplaceKind;
  interactive?: boolean;
  description: string;
  slug?: string;
  title?: string;
  readme?: string;
  tags?: string[];
  category?: string;
  version?: number;
  thumbnailPath?: string;
}

export async function publishMarketplaceListing(
  opts: AuthedMarketplaceOptions & PublishListingParams,
): Promise<ApiResult<PublishListingOutput>> {
  const url = resolveEndpointUrl('publishMarketplaceListing', opts.apiUrl, opts.profileName);
  const body: Record<string, unknown> = {
    presentationId: opts.presentationId,
    kind: opts.kind,
    description: opts.description,
  };
  if (opts.interactive !== undefined) body.interactive = opts.interactive;
  if (opts.slug !== undefined) body.slug = opts.slug;
  if (opts.title !== undefined) body.title = opts.title;
  if (opts.readme !== undefined) body.readme = opts.readme;
  if (opts.tags !== undefined) body.tags = opts.tags;
  if (opts.category !== undefined) body.category = opts.category;
  if (opts.version !== undefined) body.version = opts.version;
  if (opts.thumbnailPath !== undefined) body.thumbnailPath = opts.thumbnailPath;
  return apiCall<PublishListingOutput>({ url, method: 'POST', apiKey: opts.apiKey, body });
}

export interface UpdateListingParams {
  slug: string;
  title?: string;
  description?: string;
  readme?: string | null;
  tags?: string[];
  category?: string | null;
  status?: MarketplaceStatus;
  interactive?: boolean;
  thumbnailPath?: string | null;
  republishVersion?: number;
}

export async function updateMarketplaceListing(
  opts: AuthedMarketplaceOptions & UpdateListingParams,
): Promise<ApiResult<GetListingOutput>> {
  const url = resolveEndpointUrl('updateMarketplaceListing', opts.apiUrl, opts.profileName);
  const body: Record<string, unknown> = { slug: opts.slug };
  for (const k of ['title', 'description', 'readme', 'tags', 'category', 'status', 'interactive', 'thumbnailPath', 'republishVersion'] as const) {
    if (opts[k] !== undefined) body[k] = opts[k];
  }
  return apiCall<GetListingOutput>({ url, method: 'POST', apiKey: opts.apiKey, body });
}

export async function deleteMarketplaceListing(
  opts: AuthedMarketplaceOptions & { slug: string },
): Promise<ApiResult<{ slug: string; deleted: boolean }>> {
  const url = resolveEndpointUrl('deleteMarketplaceListing', opts.apiUrl, opts.profileName);
  return apiCall<{ slug: string; deleted: boolean }>({
    url, method: 'POST', apiKey: opts.apiKey, body: { slug: opts.slug },
  });
}

export async function starMarketplaceListing(
  opts: AuthedMarketplaceOptions & { slug: string },
): Promise<ApiResult<StarListingOutput>> {
  const url = resolveEndpointUrl('starMarketplaceListing', opts.apiUrl, opts.profileName);
  return apiCall<StarListingOutput>({ url, method: 'POST', apiKey: opts.apiKey, body: { slug: opts.slug } });
}

export async function unstarMarketplaceListing(
  opts: AuthedMarketplaceOptions & { slug: string },
): Promise<ApiResult<StarListingOutput>> {
  const url = resolveEndpointUrl('unstarMarketplaceListing', opts.apiUrl, opts.profileName);
  return apiCall<StarListingOutput>({ url, method: 'POST', apiKey: opts.apiKey, body: { slug: opts.slug } });
}

export async function listMyStarredListings(
  opts: AuthedMarketplaceOptions,
): Promise<ApiResult<ListMyStarredListingsOutput>> {
  const url = resolveEndpointUrl('listMyStarredListings', opts.apiUrl, opts.profileName);
  return apiCall<ListMyStarredListingsOutput>({ url, method: 'GET', apiKey: opts.apiKey });
}
