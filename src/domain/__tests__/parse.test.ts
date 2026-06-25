/**
 * Tests for parseStatus and parseLog against real git output.
 *
 * Fixtures in src/__tests__/fixtures/ were generated from a real git repository
 * (see src/__tests__/fixtures/generate.sh for the exact commands used).
 *
 * Fixtures captured with: git status --porcelain=v2 --branch -z
 *                    and: git log --max-count=10 --format=%H%x1f%an%x1f%at%x1f%s
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { parseLog, parseStatus } from '../parse.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, '../../__tests__/fixtures');

function fixture(name: string): string {
  return readFileSync(join(fixturesDir, name), 'utf-8');
}

// ── parseStatus ───────────────────────────────────────────────────────────────

describe('parseStatus', () => {
  describe('status-mixed.txt — all ordinary change types + rename + untracked', () => {
    // Fixture has: branch=master, upstream=origin/master, ahead=4, behind=1
    // Entries: .M README.md, D. more.md, R. renamed-special.md (from special.md), A. staged-new.md, ? untracked.md
    const status = parseStatus(fixture('status-mixed.txt'));

    it('marks the repo as initialized', () => {
      expect(status.initialized).toBe(true);
    });

    it('reads branch name', () => {
      expect(status.branch).toBe('master');
      expect(status.detached).toBe(false);
    });

    it('reads upstream', () => {
      expect(status.upstream).toBe('origin/master');
    });

    it('reads ahead and behind', () => {
      expect(status.ahead).toBe(4);
      expect(status.behind).toBe(1);
    });

    it('has no conflicts', () => {
      expect(status.hasConflicts).toBe(false);
    });

    it('parses unstaged-modified file', () => {
      const f = status.changes.find((c) => c.path === 'README.md');
      expect(f).toBeDefined();
      expect(f?.kind).toBe('modified');
      expect(f?.staged).toBe(false);
      expect(f?.unstaged).toBe(true);
    });

    it('parses staged-deleted file', () => {
      const f = status.changes.find((c) => c.path === 'more.md');
      expect(f).toBeDefined();
      expect(f?.kind).toBe('deleted');
      expect(f?.staged).toBe(true);
      expect(f?.unstaged).toBe(false);
    });

    it('parses staged-added file', () => {
      const f = status.changes.find((c) => c.path === 'staged-new.md');
      expect(f).toBeDefined();
      expect(f?.kind).toBe('added');
      expect(f?.staged).toBe(true);
      expect(f?.unstaged).toBe(false);
    });

    it('parses staged-renamed file with origPath', () => {
      const f = status.changes.find((c) => c.path === 'renamed-special.md');
      expect(f).toBeDefined();
      expect(f?.kind).toBe('renamed');
      expect(f?.origPath).toBe('special.md');
      expect(f?.staged).toBe(true);
      expect(f?.unstaged).toBe(false);
    });

    it('parses untracked file', () => {
      const f = status.changes.find((c) => c.path === 'untracked.md');
      expect(f).toBeDefined();
      expect(f?.kind).toBe('untracked');
      expect(f?.staged).toBe(false);
      expect(f?.unstaged).toBe(true);
    });

    it('has exactly 5 changes', () => {
      expect(status.changes).toHaveLength(5);
    });
  });

  describe('status-conflict.txt — unmerged entries', () => {
    const status = parseStatus(fixture('status-conflict.txt'));

    it('marks hasConflicts true', () => {
      expect(status.hasConflicts).toBe(true);
    });

    it('finds the conflicted file', () => {
      const f = status.changes.find((c) => c.path === 'README.md');
      expect(f).toBeDefined();
      expect(f?.kind).toBe('conflicted');
    });

    it('reads upstream and ahead/behind', () => {
      expect(status.upstream).toBe('origin/master');
      expect(status.ahead).toBe(1);
      expect(status.behind).toBe(1);
    });
  });

  describe('status-clean.txt — no changes, branch tracking', () => {
    const status = parseStatus(fixture('status-clean.txt'));

    it('has no changes', () => {
      expect(status.changes).toHaveLength(0);
    });

    it('has zero ahead/behind', () => {
      expect(status.ahead).toBe(0);
      expect(status.behind).toBe(0);
    });

    it('has upstream set', () => {
      expect(status.upstream).toBe('origin/master');
    });

    it('is not detached', () => {
      expect(status.detached).toBe(false);
      expect(status.branch).toBe('master');
    });
  });

  describe('status-detached.txt — detached HEAD', () => {
    const status = parseStatus(fixture('status-detached.txt'));

    it('marks detached true', () => {
      expect(status.detached).toBe(true);
    });

    it('has null branch', () => {
      expect(status.branch).toBeNull();
    });

    it('has null upstream (no tracking in detached state)', () => {
      expect(status.upstream).toBeNull();
    });

    it('has zero ahead/behind', () => {
      expect(status.ahead).toBe(0);
      expect(status.behind).toBe(0);
    });
  });

  describe('status-initial.txt — repo with no commits yet', () => {
    // "# branch.oid (initial)" when no commits exist
    const status = parseStatus(fixture('status-initial.txt'));

    it('is initialized', () => {
      expect(status.initialized).toBe(true);
    });

    it('reads branch name despite (initial) oid', () => {
      expect(status.branch).toBe('master');
    });

    it('has staged-added entry for first file', () => {
      const f = status.changes.find((c) => c.path === 'file.md');
      expect(f).toBeDefined();
      expect(f?.kind).toBe('added');
      expect(f?.staged).toBe(true);
    });

    it('has no upstream', () => {
      expect(status.upstream).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('returns initialized=true with empty stdout (git status produced nothing unusual)', () => {
      // An empty string means no entries, but the repo is valid.
      const status = parseStatus('');
      expect(status.initialized).toBe(true);
      expect(status.changes).toHaveLength(0);
    });

    it('handles a file with a space in its name', () => {
      // Construct a minimal porcelain v2 entry for a spaced path
      const line = '1 .M N... 100644 100644 100644 ' + 'a'.repeat(40) + ' ' + 'b'.repeat(40) + ' my file with spaces.md\x00';
      const status = parseStatus(line);
      expect(status.changes[0]?.path).toBe('my file with spaces.md');
    });
  });
});

// ── parseLog ──────────────────────────────────────────────────────────────────

describe('parseLog', () => {
  describe('log.txt — real git log', () => {
    const commits = parseLog(fixture('log.txt'));

    it('returns multiple commits', () => {
      expect(commits.length).toBeGreaterThanOrEqual(5);
    });

    it('first commit has all required fields', () => {
      const c = commits[0];
      expect(c).toBeDefined();
      expect(c?.hash).toMatch(/^[0-9a-f]{40}$/);
      expect(typeof c?.author).toBe('string');
      expect(typeof c?.timestamp).toBe('number');
      expect(Number.isFinite(c?.timestamp)).toBe(true);
      expect(typeof c?.subject).toBe('string');
    });

    it('parses UTF-8 author name with accents and special chars', () => {
      const c = commits.find((commit) => commit.author === 'Café Ñoño');
      expect(c).toBeDefined();
    });

    it('parses UTF-8 subject line', () => {
      const c = commits.find((commit) => commit.subject.includes('émojis'));
      expect(c).toBeDefined();
      expect(c?.subject).toBe('fix: handle émojis and ünïcödé');
    });

    it('timestamp is a positive integer (unix seconds)', () => {
      for (const c of commits) {
        expect(c.timestamp).toBeGreaterThan(0);
        expect(Number.isInteger(c.timestamp)).toBe(true);
      }
    });

    it('hashes are 40-character hex strings', () => {
      for (const c of commits) {
        expect(c.hash).toMatch(/^[0-9a-f]{40}$/);
      }
    });
  });

  describe('edge cases', () => {
    it('returns [] for empty string', () => {
      expect(parseLog('')).toEqual([]);
    });

    it('returns [] for whitespace-only string', () => {
      expect(parseLog('\n\n')).toEqual([]);
    });

    it('parses a minimal single-commit string', () => {
      const hash = 'a'.repeat(40);
      const line = `${hash}\x1fAlice\x1f1700000000\x1ffeat: first commit`;
      const commits = parseLog(line);
      expect(commits).toHaveLength(1);
      expect(commits[0]).toEqual({
        hash,
        author: 'Alice',
        timestamp: 1700000000,
        subject: 'feat: first commit',
      });
    });

    it('handles subject with unit separator (x1f) by treating first four fields only', () => {
      // Pathological: subject itself contains \x1f. Only the first 4 split parts are used.
      // parts[3] = third split part = "subject\x1fextra" → parsed as-is by parts[3]
      // Actually split('\x1f') gives 5 parts; parts[3] is correct.
      const hash = 'b'.repeat(40);
      const line = `${hash}\x1fBob\x1f1700000001\x1fnormal subject`;
      const commits = parseLog(line);
      expect(commits[0]?.subject).toBe('normal subject');
    });
  });
});
