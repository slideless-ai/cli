/**
 * API response types — mirrors functions/src/features/shared-presentations/types/sharedPresentationTypes.ts.
 *
 * Keep in sync when the backend types change.
 */

export interface UploadSharedPresentationOutput {
  shareId: string;
  tokenId: string;
  token: string;
  shareUrl: string;
}

export interface UpdateSharedPresentationOutput {
  shareId: string;
  version: number;
  shareUrl: string;
}

export interface ListMyPresentationsItem {
  id: string;
  title: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
  totalViews: number;
  lastViewedAt: string | null;
  shareUrl: string | null;
}

export interface ListMyPresentationsOutput {
  presentations: ListMyPresentationsItem[];
}

export interface PresentationTokenInfo {
  tokenId: string;
  name: string;
  createdAt: string;
  revoked: boolean;
  revokedAt: string | null;
  lastAccessedAt: string | null;
  accessCount: number;
  shareUrl: string;
}

export interface PresentationInfo {
  id: string;
  ownerId: string;
  organizationId: string;
  title: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
  archivedAt: string | null;
  expiresAt: string | null;
  totalViews: number;
  lastViewedAt: string | null;
  primaryShareUrl: string | null;
  tokens: PresentationTokenInfo[];
}
