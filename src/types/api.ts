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
