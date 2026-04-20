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
