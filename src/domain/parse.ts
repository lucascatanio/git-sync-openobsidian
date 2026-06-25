/**
 * Pure parsers for machine-readable git output (ADR-0006).
 * No I/O — all functions take a raw stdout string and return typed values.
 */

import type { Commit, FileChange, FileStatusKind, RepoStatus } from './types.ts';

// ── parseStatus ──────────────────────────────────────────────────────────────

/**
 * Parses `git status --porcelain=v2 --branch -z` stdout into a RepoStatus.
 *
 * With -z, every record is NUL-terminated. Rename/copy entries (type "2") are
 * followed immediately by a second NUL-terminated token containing the original
 * path. The iteration below consumes that extra token by advancing i.
 *
 * Non-obvious cases handled:
 * - "# branch.oid (initial)": first commit not yet made; oid token is ignored.
 * - "# branch.head (detached)": branch=null, detached=true; no upstream/ab lines follow.
 * - Missing "# branch.upstream" / "# branch.ab": upstream=null, ahead=0, behind=0.
 * - Unmerged ("u") entries: 4 mode fields + 3 SHA fields before the path (10 space-parts).
 * - Paths with spaces: joined from the last variable-length slice of split-by-space parts.
 */
export function parseStatus(stdout: string): RepoStatus {
  const tokens = stdout.split('\x00');

  let branch: string | null = null;
  let detached = false;
  let upstream: string | null = null;
  let ahead = 0;
  let behind = 0;
  const changes: FileChange[] = [];
  let hasConflicts = false;

  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    // token is always defined here — noUncheckedIndexedAccess requires the check
    if (token === undefined || token === '') {
      i++;
      continue;
    }

    if (token.startsWith('# branch.head ')) {
      const head = token.slice('# branch.head '.length);
      if (head === '(detached)') {
        detached = true;
        branch = null;
      } else {
        branch = head;
        detached = false;
      }
    } else if (token.startsWith('# branch.upstream ')) {
      upstream = token.slice('# branch.upstream '.length);
    } else if (token.startsWith('# branch.ab ')) {
      const rest = token.slice('# branch.ab '.length);
      // Format: "+<ahead> -<behind>"
      const m = /^\+(\d+) -(\d+)$/.exec(rest);
      if (m !== null) {
        ahead = parseInt(m[1] ?? '0', 10);
        behind = parseInt(m[2] ?? '0', 10);
      }
    } else if (token.startsWith('1 ')) {
      // Ordinary changed entry:
      // 1 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <path>
      // indexes: 0    1     2    3    4    5    6    7   8+
      const parts = token.split(' ');
      const xy = parts[1] ?? '..';
      const path = parts.slice(8).join(' ');
      changes.push(makeOrdinaryChange(xy[0] ?? '.', xy[1] ?? '.', path));
    } else if (token.startsWith('2 ')) {
      // Rename/copy entry:
      // 2 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <X><score> <newPath>
      // indexes: 0    1     2    3    4    5    6    7        8         9+
      // The next NUL-delimited token is the original path.
      const parts = token.split(' ');
      const xy = parts[1] ?? '..';
      const newPath = parts.slice(9).join(' ');
      const origPath = tokens[i + 1] ?? '';
      changes.push({
        path: newPath,
        origPath,
        kind: 'renamed',
        staged: (xy[0] ?? '.') !== '.',
        unstaged: (xy[1] ?? '.') !== '.',
      });
      i++; // consume the origPath token
    } else if (token.startsWith('u ')) {
      // Unmerged (conflict) entry:
      // u <xy> <sub> <m1> <m2> <m3> <mW> <h1> <h2> <h3> <path>
      // indexes: 0    1     2    3    4    5    6    7    8    9   10+
      const parts = token.split(' ');
      const path = parts.slice(10).join(' ');
      changes.push({
        path,
        kind: 'conflicted',
        staged: false,
        unstaged: false,
      });
      hasConflicts = true;
    } else if (token.startsWith('? ')) {
      // Untracked entry: "? <path>"
      changes.push({
        path: token.slice(2),
        kind: 'untracked',
        staged: false,
        unstaged: true,
      });
    }
    // Other lines starting with "# branch.oid", "# branch.head" (oid) are ignored.

    i++;
  }

  return {
    initialized: true,
    branch,
    detached,
    upstream,
    ahead,
    behind,
    changes,
    hasConflicts,
  };
}

// ── parseLog ─────────────────────────────────────────────────────────────────

/**
 * Parses `git log --format=%H%x1f%an%x1f%at%x1f%s` stdout into Commit[].
 * Fields are separated by U+001F (unit separator); records by newline.
 */
export function parseLog(stdout: string): Commit[] {
  if (stdout.trim() === '') return [];

  return stdout
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => {
      const parts = line.split('\x1f');
      return {
        hash: parts[0] ?? '',
        author: parts[1] ?? '',
        timestamp: parseInt(parts[2] ?? '0', 10),
        subject: parts[3] ?? '',
      };
    });
}

// ── helpers ───────────────────────────────────────────────────────────────────

function makeOrdinaryChange(x: string, y: string, path: string): FileChange {
  return {
    path,
    kind: kindFromXY(x, y),
    staged: x !== '.',
    unstaged: y !== '.',
  };
}

function kindFromXY(x: string, y: string): FileStatusKind {
  if (x === 'A') return 'added';
  if (x === 'D' || y === 'D') return 'deleted';
  return 'modified';
}
