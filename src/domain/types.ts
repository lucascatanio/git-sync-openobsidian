export type FileStatusKind =
  | 'modified'
  | 'added'
  | 'deleted'
  | 'renamed'
  | 'untracked'
  | 'conflicted';

export interface FileChange {
  path: string;
  origPath?: string; // present on renames
  kind: FileStatusKind;
  staged: boolean;   // index has a change relative to HEAD
  unstaged: boolean; // working tree has a change relative to index
}

export interface RepoStatus {
  initialized: boolean; // false = vault is not a git repository
  branch: string | null; // null when HEAD is detached
  detached: boolean;
  upstream: string | null; // e.g. "origin/main"; null when no upstream set
  ahead: number;
  behind: number;
  changes: FileChange[];
  hasConflicts: boolean;
}

export interface Commit {
  hash: string;
  author: string;
  timestamp: number; // unix seconds
  subject: string;
}

export interface FileDiff {
  path: string;
  staged: boolean;
  patch: string; // raw unified diff (no colour)
}
