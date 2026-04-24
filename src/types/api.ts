/**
 * API response types — mirrors functions/src/features/shared-presentations/types.
 *
 * Keep in sync when the backend types change.
 */

export type TokenVersionMode =
  | { type: 'latest' }
  | { type: 'pinned'; version: number };

export interface ManifestFileInput {
  path: string;
  sha256: string;
  size: number;
  contentType: string;
}

export interface PrecheckAssetsOutput {
  missing: string[];
  sessionId?: string;
  shareId?: string;
}

export interface UploadPresentationAssetOutput {
  sha256: string;
  size: number;
}

export interface CommitPresentationVersionOutput {
  shareId: string;
  version: number;
  tokenId?: string;
  token?: string;
  shareUrl: string;
}

export interface ListMyPresentationsItem {
  id: string;
  title: string;
  currentVersion: number;
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
  versionMode: TokenVersionMode;
}

// ─── Share via email ─────────────────────────────────────

export interface SharePresentationViaEmailInput {
  shareId: string;
  emails: string[];
  message?: string;
  subject?: string;
  tokenId?: string;
}

export interface SharePresentationViaEmailSent {
  email: string;
  tokenId: string;
  resendMessageId: string | null;
  shareUrl: string;
}

export interface SharePresentationViaEmailFailed {
  email: string;
  code: string;
  message: string;
}

export interface SharePresentationViaEmailOutput {
  shareId: string;
  sent: SharePresentationViaEmailSent[];
  failed: SharePresentationViaEmailFailed[];
  summary: {
    total: number;
    sent: number;
    failed: number;
  };
}

export interface PresentationInfo {
  id: string;
  ownerId: string;
  organizationId: string;
  title: string;
  currentVersion: number;
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

// ─── Revoke / add token ──────────────────────────────────

export interface RevokeSharedPresentationOutput {
  success: boolean;
}

export interface AddPresentationTokenOutput {
  tokenId: string;
  token: string;
  shareUrl: string;
}

export interface SetTokenVersionModeOutput {
  success: boolean;
  versionMode: TokenVersionMode;
}

// ─── Version history ─────────────────────────────────────

export interface VersionSummary {
  version: number;
  title: string;
  createdAt: string;
  createdBy: string;
  fileCount: number;
  totalBytes: number;
}

export interface ListPresentationVersionsOutput {
  shareId: string;
  currentVersion: number;
  versions: VersionSummary[];
}

export interface GetPresentationVersionOutput {
  version: number;
  title: string;
  entryPath: string;
  files: ManifestFileInput[];
  createdAt: string;
  createdBy: string;
}
