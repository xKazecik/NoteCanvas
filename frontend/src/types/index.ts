export interface DrawingSummary {
  id: string;
  name: string;
  collectionId: string | null;
  updatedAt: number;
  createdAt: number;
  version: number;
  preview?: string | null;
  accessLevel?: "none" | "view" | "edit" | "owner";
  creatorName?: string | null;
  /** Set while the owner has the drawing in offline mode (others: read-only). */
  offlineAt?: string | null;
}
export interface Drawing extends DrawingSummary {
  elements: any[];
  appState: any;
  files: Record<string, any> | null;
}
export interface Collection {
  id: string;
  name: string;
  createdAt: number;
  /** Collections nest; null or absent means the collection sits at the root. */
  parentId?: string | null;
  /** One of COLLECTION_COLORS, or null/absent for the default card styling. */
  color?: string | null;
  /** Drawings plus subcollections directly inside, as counted by the API. */
  itemCount?: number;
  sharedRole?: "view" | "edit" | null;
  isOwner?: boolean;
  isShared?: boolean;
}

/** The subset of a user the comment endpoints return. */
export interface UserSummary {
  id: string;
  name: string;
  email: string;
}

export interface Comment {
  id: string;
  threadId: string;
  content: string;
  /** Ids of mentioned users; the server drops any who cannot see the drawing. */
  mentions: string[];
  /** The same users with their names, so an @mention can be highlighted. */
  mentionedUsers?: UserSummary[];
  createdBy: UserSummary;
  editedAt?: string | null;
  createdAt: string;
}

/** A comment thread pinned to a point in the drawing's scene coordinates. */
export interface CommentThread {
  id: string;
  drawingId: string;
  x: number;
  y: number;
  resolved: boolean;
  resolvedAt?: string | null;
  resolvedBy?: UserSummary | null;
  createdBy: UserSummary;
  comments: Comment[];
  commentCount: number;
  createdAt: string;
  updatedAt: string;
}

export type CollectionShareRole = "view" | "edit";

export interface CollectionShareUser {
  id: string;
  name: string;
  email: string;
}

export interface CollectionShareRow {
  id: string;
  collectionId: string;
  granteeUserId: string;
  granteeUser: CollectionShareUser;
  role: CollectionShareRole;
  createdAt: string;
  updatedAt: string;
}
