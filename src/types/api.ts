/**
 * API response types — mirrors functions/src/features/shared-presentations/types
 * and functions/src/features/presentation-collaborators/types.
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
  presentationId?: string;
}

export interface UploadPresentationAssetOutput {
  sha256: string;
  size: number;
}

export interface CommitPresentationVersionOutput {
  presentationId: string;
  version: number;
  role: 'owner' | 'dev';
}

export interface ListMyPresentationsItem {
  id: string;
  title: string;
  currentVersion: number;
  createdAt: string;
  updatedAt: string;
  totalViews: number;
  lastViewedAt: string | null;
  shareUrl: string | null;
  role: 'owner' | 'dev';
  hasActiveCollaborators: boolean;
  ownerDisplayName: string | null;
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

export interface CollaboratorInfo {
  collaboratorId: string;
  email: string;
  userId: string | null;
  role: 'dev';
  status: 'pending' | 'active' | 'revoked';
  invitedAt: string;
  invitedBy: string;
  acceptedAt: string | null;
  revokedAt: string | null;
}

// ─── Share via email ─────────────────────────────────────

export interface SharePresentationViaEmailInput {
  presentationId: string;
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
  presentationId: string;
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
  expiresAt: string | null;
  totalViews: number;
  lastViewedAt: string | null;
  primaryShareUrl: string | null;
  role: 'owner' | 'dev';
  tokens: PresentationTokenInfo[];
  collaborators: CollaboratorInfo[];
}

// ─── Unshare / delete / add token ─────────────────────────

export interface UnsharePresentationOutput {
  presentationId: string;
  tokensRevoked: number;
}

export interface DeletePresentationOutput {
  presentationId: string;
  blobsDeleted: number;
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

// ─── Collaborators ────────────────────────────────────────

export interface InviteCollaboratorOutput {
  collaboratorId: string;
  email: string;
  status: 'pending' | 'active';
  userId: string | null;
  inviteAlreadyExisted: boolean;
}

export interface UninviteCollaboratorOutput {
  collaboratorId: string;
}

export interface ListCollaboratorsOutput {
  presentationId: string;
  collaborators: CollaboratorInfo[];
}

// ─── Version history ─────────────────────────────────────

export interface VersionSummary {
  version: number;
  title: string;
  createdAt: string;
  createdBy: string;
  createdByRole: 'owner' | 'dev';
  fileCount: number;
  totalBytes: number;
}

export interface ListPresentationVersionsOutput {
  presentationId: string;
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
  createdByRole: 'owner' | 'dev';
}

// ─── Annotations (owner pull) ─────────────────────────────
// Mirrors functions/src/features/shared-presentations/types for annotations.

export interface PresentationAnnotationInfo {
  id: string;
  presentationId: string;
  deckVersion: number;
  author: string;
  note: string;
  selectedText: string;
  context: { before: string; after: string };
  anchor: {
    container: {
      kind: 'slide' | 'panel' | null;
      index: number | null;
      heading: string | null;
    };
    selector: string | null;
  };
  entryFile: string;
  processed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ListAnnotationsForOwnerOutput {
  annotations: PresentationAnnotationInfo[];
}

// ─── Marketplace ──────────────────────────────────────────
// Mirrors functions/src/features/marketplace/types/marketplaceTypes.ts

export type MarketplaceKind = 'presentation' | 'app' | 'plan';
export type MarketplaceStatus = 'public' | 'unlisted';

export interface MarketplacePublicListing {
  slug: string;
  kind: MarketplaceKind;
  status: MarketplaceStatus;
  interactive: boolean;
  title: string;
  description: string;
  tags: string[];
  category: string | null;
  techStack: string[];
  authorDisplayName: string;
  authorHandle: string;
  thumbnailUrl: string | null;
  previewUrl: string;
  publishedVersion: number;
  remixedFromSlug: string | null;
  remixedFromTitle: string | null;
  remixCount: number;
  starCount: number;
  viewCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface GetListingOutput extends MarketplacePublicListing {
  readme: string | null;
  entryPath: string;
  fileCount: number;
  totalBytes: number;
}

export interface ListListingsOutput {
  listings: MarketplacePublicListing[];
  nextCursor: string | null;
}

export interface PublishListingOutput {
  slug: string;
  kind: MarketplaceKind;
  status: MarketplaceStatus;
  publishedVersion: number;
  marketplaceUrl: string;
}

export interface MarketplaceListingFilesOutput {
  slug: string;
  publishedVersion: number;
  entryPath: string;
  files: ManifestFileInput[];
}

export interface RecordRemixOutput {
  slug: string;
  remixCount: number;
}

export interface StarListingOutput {
  slug: string;
  starred: boolean;
  starCount: number;
}

export interface ListMyStarredListingsOutput {
  listings: MarketplacePublicListing[];
}

export interface ListMarketplaceRemixesOutput {
  slug: string;
  remixes: MarketplacePublicListing[];
}
