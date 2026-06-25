/**
 * Tests for GitService and classifyGitError.
 *
 * All git interactions go through FakeCommandRunner — no real git, no Electron.
 * Fixtures are real git output strings (captured from actual git invocations).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { FakeCommandRunner } from '../../testing/fakes.ts';
import { createGitService, classifyGitError } from '../git-service.ts';

// ── Fixtures: real git output strings ────────────────────────────────────────

/** git status --porcelain=v2 --branch -z: clean repo on main, tracking origin/main */
const STATUS_CLEAN =
  '# branch.oid abc1234abc1234abc1234abc1234abc1234abc12\x00' +
  '# branch.head main\x00' +
  '# branch.upstream origin/main\x00' +
  '# branch.ab +1 -0\x00';

/** git log --max-count=1 --format=%H%x1f%an%x1f%at%x1f%s */
const LOG_ONE =
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\x1fAlice\x1f1700000000\x1ffeat: first commit';

/** git log with two commits */
const LOG_TWO =
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\x1fAlice\x1f1700000001\x1ffeat: second\n' +
  'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\x1fBob\x1f1700000000\x1ffeat: first';

/** Real diff patch (unstaged) */
const DIFF_PATCH =
  'diff --git a/README.md b/README.md\n' +
  'index aaaaaaa..bbbbbbb 100644\n' +
  '--- a/README.md\n' +
  '+++ b/README.md\n' +
  '@@ -1,2 +1,2 @@\n' +
  '-old line\n' +
  '+new line\n';

// ── Real git stderr patterns (documented per error kind) ──────────────────────

/** git status/commit/push/etc when not in a git repo (exit 128) */
const STDERR_NOT_A_REPO =
  "fatal: not a git repository (or any of the parent directories): .git";

/** git push when current branch has no upstream configured (exit 128) */
const STDERR_NO_UPSTREAM =
  'fatal: The current branch main has no upstream branch.\n' +
  'To push the current branch and set the remote as upstream, use\n\n' +
  '    git push --set-upstream origin main\n\n' +
  "If you wish to set tracking information for this branch you can do so with:\n\n" +
  '    git branch --set-upstream-to=origin/<branch> main\n';

/** git push when no remote is configured (exit 128) */
const STDERR_NO_REMOTE_PUSH =
  'fatal: No configured push destination.\n' +
  'Either specify the URL from the command-line or configure a remote repository using\n\n' +
  '    git remote add <name> <url>\n\n' +
  'and then push using the remote name\n\n' +
  '    git push <name>\n';

/** git fetch when no remote is configured (exit 128) */
const STDERR_NO_REMOTE_FETCH = 'fatal: No remote configured.';

/** git push to remote that does not exist (exit 128) */
const STDERR_NO_REMOTE_INVALID =
  "fatal: 'badremote' does not appear to be a git repository\n" +
  "fatal: Could not read from remote repository.\n\n" +
  "Please make sure you have the correct access rights\n" +
  "and the repository exists.\n";

/** git push/pull/fetch with HTTPS auth failure (exit 128) */
const STDERR_AUTH_HTTPS =
  "remote: Invalid username or password.\n" +
  "fatal: Authentication failed for 'https://github.com/user/repo.git/'";

/** git push/pull/fetch when terminal prompts disabled (exit 128) */
const STDERR_AUTH_NO_TERMINAL =
  "fatal: could not read Username for 'https://github.com': terminal prompts disabled";

/** git pull/fetch with SSH key rejection (exit 128) */
const STDERR_AUTH_SSH =
  'git@github.com: Permission denied (publickey).\n' +
  'fatal: Could not read from remote repository.\n\n' +
  'Please make sure you have the correct access rights\n' +
  'and the repository exists.\n';

/** git pull --no-edit when merge has conflicts (exit 1) */
const STDERR_CONFLICT_ONE_FILE =
  'Auto-merging README.md\n' +
  'CONFLICT (content): Merge conflict in README.md\n' +
  'Automatic merge failed; fix conflicts and then commit the result.';

/** git pull --no-edit with two conflicting files (exit 1) */
const STDERR_CONFLICT_TWO_FILES =
  'Auto-merging README.md\n' +
  'CONFLICT (content): Merge conflict in README.md\n' +
  'Auto-merging notes/daily.md\n' +
  'CONFLICT (content): Merge conflict in notes/daily.md\n' +
  'Automatic merge failed; fix conflicts and then commit the result.';

/**
 * git status --porcelain=v2 --branch -z after a conflicted pull.
 * The 'u' entry (unmerged) is locale-independent — appears regardless of git message language.
 * Format: u XY sub m1 m2 m3 mW h1 h2 h3 <path>  (10 space-separated fields before path)
 */
const STATUS_CONFLICT_ONE_FILE =
  '# branch.oid abc1234abc1234abc1234abc1234abc1234abc12\x00' +
  '# branch.head main\x00' +
  '# branch.upstream origin/main\x00' +
  '# branch.ab +0 -1\x00' +
  'u UU N... 100644 100644 100644 100644 ' +
  '0000000000000000000000000000000000000000 ' +
  '0000000000000000000000000000000000000000 ' +
  '0000000000000000000000000000000000000000 README.md\x00';

const STATUS_CONFLICT_TWO_FILES =
  '# branch.oid abc1234abc1234abc1234abc1234abc1234abc12\x00' +
  '# branch.head main\x00' +
  '# branch.upstream origin/main\x00' +
  '# branch.ab +0 -1\x00' +
  'u UU N... 100644 100644 100644 100644 ' +
  '0000000000000000000000000000000000000000 ' +
  '0000000000000000000000000000000000000000 ' +
  '0000000000000000000000000000000000000000 README.md\x00' +
  'u UU N... 100644 100644 100644 100644 ' +
  '0000000000000000000000000000000000000000 ' +
  '0000000000000000000000000000000000000000 ' +
  '0000000000000000000000000000000000000000 notes/daily.md\x00';

/** git commit when nothing is staged (exit 1, message goes to stdout) */
const STDOUT_NOTHING_TO_COMMIT = 'On branch main\nnothing to commit, working tree clean\n';

// ── classifyGitError — isolated unit tests ────────────────────────────────────

describe('classifyGitError', () => {
  it('not-a-repo: detects "not a git repository" in stderr', () => {
    expect(classifyGitError(128, STDERR_NOT_A_REPO)).toEqual({ kind: 'not-a-repo' });
  });

  it('not-a-repo: case-insensitive match', () => {
    expect(classifyGitError(128, 'fatal: Not a git repository')).toEqual({ kind: 'not-a-repo' });
  });

  it('no-upstream: extracts branch name', () => {
    expect(classifyGitError(128, STDERR_NO_UPSTREAM)).toEqual({
      kind: 'no-upstream',
      branch: 'main',
    });
  });

  it('no-upstream: works for feature branch names', () => {
    const stderr = 'fatal: The current branch feat/login has no upstream branch.';
    const e = classifyGitError(128, stderr);
    expect(e.kind).toBe('no-upstream');
    if (e.kind === 'no-upstream') expect(e.branch).toBe('feat/login');
  });

  it('auth-failed: HTTPS authentication failure', () => {
    const e = classifyGitError(128, STDERR_AUTH_HTTPS);
    expect(e.kind).toBe('auth-failed');
    if (e.kind === 'auth-failed') expect(e.detail).toBe(STDERR_AUTH_HTTPS);
  });

  it('auth-failed: terminal prompts disabled', () => {
    const e = classifyGitError(128, STDERR_AUTH_NO_TERMINAL);
    expect(e.kind).toBe('auth-failed');
  });

  it('auth-failed: SSH permission denied', () => {
    const e = classifyGitError(128, STDERR_AUTH_SSH);
    expect(e.kind).toBe('auth-failed');
  });

  it('conflict: extracts single conflicted file', () => {
    expect(classifyGitError(1, STDERR_CONFLICT_ONE_FILE)).toEqual({
      kind: 'conflict',
      files: ['README.md'],
    });
  });

  it('conflict: extracts multiple conflicted files', () => {
    const e = classifyGitError(1, STDERR_CONFLICT_TWO_FILES);
    expect(e.kind).toBe('conflict');
    if (e.kind === 'conflict') {
      expect(e.files).toEqual(['README.md', 'notes/daily.md']);
    }
  });

  it('no-remote: push with no remote configured', () => {
    expect(classifyGitError(128, STDERR_NO_REMOTE_PUSH)).toEqual({ kind: 'no-remote' });
  });

  it('no-remote: fetch with no remote configured', () => {
    expect(classifyGitError(128, STDERR_NO_REMOTE_FETCH)).toEqual({ kind: 'no-remote' });
  });

  it('no-remote: invalid remote name', () => {
    expect(classifyGitError(128, STDERR_NO_REMOTE_INVALID)).toEqual({ kind: 'no-remote' });
  });

  it('nothing-to-commit: detected from stdout (git commit, code 1)', () => {
    expect(classifyGitError(1, '', STDOUT_NOTHING_TO_COMMIT)).toEqual({
      kind: 'nothing-to-commit',
    });
  });

  it('nothing-to-commit: detected from stderr as fallback', () => {
    expect(classifyGitError(1, 'nothing to commit, working tree clean')).toEqual({
      kind: 'nothing-to-commit',
    });
  });

  it('command-failed: unknown error falls through as fallback', () => {
    expect(classifyGitError(1, 'some unexpected git message')).toEqual({
      kind: 'command-failed',
      code: 1,
      stderr: 'some unexpected git message',
    });
  });

  it('command-failed: includes the original code', () => {
    const e = classifyGitError(2, 'some other error');
    expect(e.kind).toBe('command-failed');
    if (e.kind === 'command-failed') expect(e.code).toBe(2);
  });
});

// ── GitService — happy paths and error paths ──────────────────────────────────

describe('GitService', () => {
  let runner: FakeCommandRunner;
  const env = { vaultPath: '/vault' };

  beforeEach(() => {
    runner = new FakeCommandRunner();
  });

  function svc() {
    return createGitService(runner, env);
  }

  // ── git-not-found ────────────────────────────────────────────────────────

  it('git-not-found: returns err when runner throws ENOENT', async () => {
    runner.enqueue(new Error("ENOENT: no such file or directory, execFile 'git'"));
    const r = await svc().getStatus();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toEqual({ kind: 'git-not-found' });
  });

  it('git-not-found: re-throws non-ENOENT bridge errors', async () => {
    runner.enqueue(new Error('bridge timed out'));
    await expect(svc().getStatus()).rejects.toThrow('bridge timed out');
  });

  // ── getStatus ────────────────────────────────────────────────────────────

  describe('getStatus', () => {
    it('happy path: returns parsed RepoStatus', async () => {
      runner.enqueue({ stdout: STATUS_CLEAN, stderr: '', code: 0 });
      const r = await svc().getStatus();
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value.branch).toBe('main');
        expect(r.value.upstream).toBe('origin/main');
        expect(r.value.ahead).toBe(1);
        expect(r.value.initialized).toBe(true);
      }
    });

    it('passes vaultPath as cwd', async () => {
      runner.enqueue({ stdout: STATUS_CLEAN, stderr: '', code: 0 });
      await svc().getStatus();
      expect(runner.lastCall?.cwd).toBe('/vault');
    });

    it('calls git with status --porcelain=v2 --branch -z', async () => {
      runner.enqueue({ stdout: STATUS_CLEAN, stderr: '', code: 0 });
      await svc().getStatus();
      expect(runner.lastCall?.args).toEqual(['status', '--porcelain=v2', '--branch', '-z']);
    });

    it('not-a-repo: returns err when outside a git repo', async () => {
      runner.enqueue({ stdout: '', stderr: STDERR_NOT_A_REPO, code: 128 });
      const r = await svc().getStatus();
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toEqual({ kind: 'not-a-repo' });
    });
  });

  // ── stage ────────────────────────────────────────────────────────────────

  describe('stage', () => {
    it('happy path: resolves ok(undefined)', async () => {
      runner.enqueue({ stdout: '', stderr: '', code: 0 });
      const r = await svc().stage(['README.md', 'notes.md']);
      expect(r).toEqual({ ok: true, value: undefined });
    });

    it('passes paths after --', async () => {
      runner.enqueue({ stdout: '', stderr: '', code: 0 });
      await svc().stage(['a.md', 'b.md']);
      expect(runner.lastCall?.args).toEqual(['add', '--', 'a.md', 'b.md']);
    });

    it('propagates command-failed on non-zero exit', async () => {
      runner.enqueue({ stdout: '', stderr: 'pathspec error', code: 1 });
      const r = await svc().stage(['missing.md']);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.kind).toBe('command-failed');
    });
  });

  // ── unstage ──────────────────────────────────────────────────────────────

  describe('unstage', () => {
    it('happy path: resolves ok(undefined)', async () => {
      runner.enqueue({ stdout: '', stderr: '', code: 0 });
      const r = await svc().unstage(['README.md']);
      expect(r).toEqual({ ok: true, value: undefined });
    });

    it('passes paths with restore --staged --', async () => {
      runner.enqueue({ stdout: '', stderr: '', code: 0 });
      await svc().unstage(['a.md']);
      expect(runner.lastCall?.args).toEqual(['restore', '--staged', '--', 'a.md']);
    });

    it('not-a-repo propagates correctly', async () => {
      runner.enqueue({ stdout: '', stderr: STDERR_NOT_A_REPO, code: 128 });
      const r = await svc().unstage(['x.md']);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.kind).toBe('not-a-repo');
    });
  });

  // ── commit ───────────────────────────────────────────────────────────────

  describe('commit', () => {
    it('happy path: returns the new Commit from log -1', async () => {
      runner.enqueue({ stdout: '', stderr: '[main abc1234] feat: first commit\n 1 file changed', code: 0 });
      runner.enqueue({ stdout: LOG_ONE, stderr: '', code: 0 });

      const r = await svc().commit('feat: first commit');
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value.hash).toBe('a'.repeat(40));
        expect(r.value.author).toBe('Alice');
        expect(r.value.subject).toBe('feat: first commit');
        expect(r.value.timestamp).toBe(1700000000);
      }
    });

    it('passes message via -m flag', async () => {
      runner.enqueue({ stdout: '', stderr: '', code: 0 });
      runner.enqueue({ stdout: LOG_ONE, stderr: '', code: 0 });
      await svc().commit('my message');
      expect(runner.calls[0]?.args).toEqual(['commit', '-m', 'my message']);
    });

    it('fetches log with max-count=1 after commit', async () => {
      runner.enqueue({ stdout: '', stderr: '', code: 0 });
      runner.enqueue({ stdout: LOG_ONE, stderr: '', code: 0 });
      await svc().commit('msg');
      expect(runner.calls[1]?.args).toEqual(['log', '--max-count=1', '--format=%H%x1f%an%x1f%at%x1f%s']);
    });

    it('nothing-to-commit: returns err when stdout says nothing to commit', async () => {
      runner.enqueue({ stdout: STDOUT_NOTHING_TO_COMMIT, stderr: '', code: 1 });
      const r = await svc().commit('empty');
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toEqual({ kind: 'nothing-to-commit' });
    });

    it('does NOT call log when commit fails', async () => {
      runner.enqueue({ stdout: STDOUT_NOTHING_TO_COMMIT, stderr: '', code: 1 });
      await svc().commit('empty');
      expect(runner.callCount).toBe(1);
    });
  });

  // ── push ─────────────────────────────────────────────────────────────────

  describe('push', () => {
    it('happy path: resolves ok(undefined)', async () => {
      runner.enqueue({ stdout: '', stderr: '', code: 0 });
      const r = await svc().push();
      expect(r).toEqual({ ok: true, value: undefined });
    });

    it('no-upstream: returns err with branch name', async () => {
      runner.enqueue({ stdout: '', stderr: STDERR_NO_UPSTREAM, code: 128 });
      const r = await svc().push();
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.error.kind).toBe('no-upstream');
        if (r.error.kind === 'no-upstream') expect(r.error.branch).toBe('main');
      }
    });

    it('no-remote: returns err when no remote is configured', async () => {
      runner.enqueue({ stdout: '', stderr: STDERR_NO_REMOTE_PUSH, code: 128 });
      const r = await svc().push();
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toEqual({ kind: 'no-remote' });
    });

    it('auth-failed: returns err with stderr detail', async () => {
      runner.enqueue({ stdout: '', stderr: STDERR_AUTH_HTTPS, code: 128 });
      const r = await svc().push();
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.kind).toBe('auth-failed');
    });
  });

  // ── pushSetUpstream ───────────────────────────────────────────────────────

  describe('pushSetUpstream', () => {
    it('happy path: resolves ok(undefined)', async () => {
      runner.enqueue({ stdout: '', stderr: '', code: 0 });
      const r = await svc().pushSetUpstream('main');
      expect(r).toEqual({ ok: true, value: undefined });
    });

    it('passes branch name correctly', async () => {
      runner.enqueue({ stdout: '', stderr: '', code: 0 });
      await svc().pushSetUpstream('feat/login');
      expect(runner.lastCall?.args).toEqual(['push', '-u', 'origin', 'feat/login']);
    });
  });

  // ── pull ─────────────────────────────────────────────────────────────────

  describe('pull', () => {
    it('happy path: returns refreshed RepoStatus after pull', async () => {
      // First call: pull --no-edit succeeds
      runner.enqueue({ stdout: "Updating abc..def\nFast-forward\n README.md | 2 +-\n1 file changed", stderr: '', code: 0 });
      // Second call: git status for updated state
      runner.enqueue({ stdout: STATUS_CLEAN, stderr: '', code: 0 });

      const r = await svc().pull();
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value.branch).toBe('main');
        expect(r.value.initialized).toBe(true);
      }
    });

    it('calls git status after successful pull', async () => {
      runner.enqueue({ stdout: '', stderr: '', code: 0 });
      runner.enqueue({ stdout: STATUS_CLEAN, stderr: '', code: 0 });
      await svc().pull();
      expect(runner.callCount).toBe(2);
      expect(runner.calls[0]?.args).toEqual(['pull', '--no-edit']);
      expect(runner.calls[1]?.args).toEqual(['status', '--porcelain=v2', '--branch', '-z']);
    });

    it('conflict: returns err with conflict files list from porcelain status', async () => {
      runner.enqueue({ stdout: '', stderr: STDERR_CONFLICT_ONE_FILE, code: 1 });
      runner.enqueue({ stdout: STATUS_CONFLICT_ONE_FILE, stderr: '', code: 0 });
      const r = await svc().pull();
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.error.kind).toBe('conflict');
        if (r.error.kind === 'conflict') expect(r.error.files).toEqual(['README.md']);
      }
    });

    it('conflict: calls status after failed pull to detect conflicts via porcelain', async () => {
      runner.enqueue({ stdout: '', stderr: STDERR_CONFLICT_ONE_FILE, code: 1 });
      runner.enqueue({ stdout: STATUS_CONFLICT_ONE_FILE, stderr: '', code: 0 });
      await svc().pull();
      expect(runner.callCount).toBe(2);
      expect(runner.calls[0]?.args).toEqual(['pull', '--no-edit']);
      expect(runner.calls[1]?.args).toEqual(['status', '--porcelain=v2', '--branch', '-z']);
    });

    it('conflict: detected via porcelain even with non-English stderr', async () => {
      // Simulates git in a non-English locale where "CONFLICT" may not appear in English
      runner.enqueue({ stdout: '', stderr: 'Fusionamento automático falhou; corrija os conflitos.', code: 1 });
      runner.enqueue({ stdout: STATUS_CONFLICT_ONE_FILE, stderr: '', code: 0 });
      const r = await svc().pull();
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.error.kind).toBe('conflict');
        if (r.error.kind === 'conflict') expect(r.error.files).toEqual(['README.md']);
      }
    });

    it('conflict: extracts multiple files from porcelain status', async () => {
      runner.enqueue({ stdout: '', stderr: STDERR_CONFLICT_TWO_FILES, code: 1 });
      runner.enqueue({ stdout: STATUS_CONFLICT_TWO_FILES, stderr: '', code: 0 });
      const r = await svc().pull();
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.error.kind).toBe('conflict');
        if (r.error.kind === 'conflict') {
          expect(r.error.files).toEqual(['README.md', 'notes/daily.md']);
        }
      }
    });

    it('auth-failed on pull', async () => {
      runner.enqueue({ stdout: '', stderr: STDERR_AUTH_SSH, code: 128 });
      runner.enqueue({ stdout: STATUS_CLEAN, stderr: '', code: 0 }); // status check: no conflicts
      const r = await svc().pull();
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.kind).toBe('auth-failed');
    });
  });

  // ── fetch ─────────────────────────────────────────────────────────────────

  describe('fetch', () => {
    it('happy path: resolves ok(undefined)', async () => {
      runner.enqueue({ stdout: '', stderr: '', code: 0 });
      const r = await svc().fetch();
      expect(r).toEqual({ ok: true, value: undefined });
    });

    it('no-remote: returns err when no remote configured', async () => {
      runner.enqueue({ stdout: '', stderr: STDERR_NO_REMOTE_FETCH, code: 128 });
      const r = await svc().fetch();
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toEqual({ kind: 'no-remote' });
    });
  });

  // ── init ─────────────────────────────────────────────────────────────────

  describe('init', () => {
    it('happy path: resolves ok(undefined)', async () => {
      runner.enqueue({ stdout: 'Initialized empty Git repository in /vault/.git/', stderr: '', code: 0 });
      const r = await svc().init();
      expect(r).toEqual({ ok: true, value: undefined });
    });

    it('calls git init', async () => {
      runner.enqueue({ stdout: '', stderr: '', code: 0 });
      await svc().init();
      expect(runner.lastCall?.args).toEqual(['init']);
    });
  });

  // ── diff ─────────────────────────────────────────────────────────────────

  describe('diff', () => {
    it('happy path (unstaged): returns FileDiff with patch', async () => {
      runner.enqueue({ stdout: DIFF_PATCH, stderr: '', code: 0 });
      const r = await svc().diff('README.md', false);
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value.path).toBe('README.md');
        expect(r.value.staged).toBe(false);
        expect(r.value.patch).toBe(DIFF_PATCH);
      }
    });

    it('happy path (staged): passes --cached flag', async () => {
      runner.enqueue({ stdout: DIFF_PATCH, stderr: '', code: 0 });
      await svc().diff('README.md', true);
      expect(runner.lastCall?.args).toEqual(['diff', '--no-color', '--cached', '--', 'README.md']);
    });

    it('unstaged: does not pass --cached', async () => {
      runner.enqueue({ stdout: DIFF_PATCH, stderr: '', code: 0 });
      await svc().diff('README.md', false);
      expect(runner.lastCall?.args).toEqual(['diff', '--no-color', '--', 'README.md']);
    });
  });

  // ── log ──────────────────────────────────────────────────────────────────

  describe('log', () => {
    it('happy path: returns parsed Commit[]', async () => {
      runner.enqueue({ stdout: LOG_TWO, stderr: '', code: 0 });
      const r = await svc().log(10);
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value).toHaveLength(2);
        expect(r.value[0]?.hash).toBe('a'.repeat(40));
        expect(r.value[0]?.author).toBe('Alice');
        expect(r.value[1]?.hash).toBe('b'.repeat(40));
      }
    });

    it('passes limit via --max-count', async () => {
      runner.enqueue({ stdout: LOG_ONE, stderr: '', code: 0 });
      await svc().log(5);
      expect(runner.lastCall?.args).toContain('--max-count=5');
    });

    it('returns empty array for empty log', async () => {
      runner.enqueue({ stdout: '', stderr: '', code: 0 });
      const r = await svc().log(10);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value).toEqual([]);
    });

    it('not-a-repo: returns err', async () => {
      runner.enqueue({ stdout: '', stderr: STDERR_NOT_A_REPO, code: 128 });
      const r = await svc().log(10);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.kind).toBe('not-a-repo');
    });
  });
});
