/**
 * Application layer: GitService.
 *
 * Orchestrates domain/args → CommandRunner.exec → domain/parse → Result<T, GitError>.
 * This is the boundary between the pure functional core and the imperative shell.
 * No I/O lives here; all I/O is delegated to the injected ports.
 */

import type { CommandRunner, Environment, ExecResult } from '../ports.ts';
import type { Commit, FileDiff, RepoStatus } from '../domain/types.ts';
import type { GitError } from '../domain/errors.ts';
import { gitArgs } from '../domain/args.ts';
import { parseLog, parseStatus } from '../domain/parse.ts';
import { err, ok, type Result } from '../result.ts';

// ── GitService interface ──────────────────────────────────────────────────────

export interface GitService {
  getStatus(): Promise<Result<RepoStatus>>;
  stage(paths: string[]): Promise<Result<void>>;
  unstage(paths: string[]): Promise<Result<void>>;
  commit(message: string): Promise<Result<Commit>>;
  /** Push current branch. Returns 'no-upstream' when the branch has no upstream so the UI can offer pushSetUpstream. */
  push(): Promise<Result<void>>;
  pushSetUpstream(branch: string): Promise<Result<void>>;
  /** Pull and return the refreshed status, or 'conflict' if the merge failed. */
  pull(): Promise<Result<RepoStatus>>;
  fetch(): Promise<Result<void>>;
  init(): Promise<Result<void>>;
  diff(path: string, staged: boolean): Promise<Result<FileDiff>>;
  log(limit: number): Promise<Result<Commit[]>>;
}

// ── Error classification ──────────────────────────────────────────────────────

/**
 * Maps an ExecResult's exit code and output to a typed GitError.
 *
 * Checks are ordered from most-specific to least-specific so that narrow
 * patterns take priority before the broad command-failed fallback.
 *
 * Real stderr patterns documented inline; each covers multiple git versions.
 *
 * git-not-found is NOT classified here: it arrives as a thrown exception from
 * runner.exec (because the binary was never invoked), handled in runGit().
 */
export function classifyGitError(
  code: number,
  stderr: string,
  stdout: string = '',
): GitError {
  // "fatal: not a git repository (or any of the parent directories): .git"
  // "fatal: Not a git repository"
  if (/not a git repository/i.test(stderr)) {
    return { kind: 'not-a-repo' };
  }

  // "On branch main\nnothing to commit, working tree clean"  (stdout, code 1)
  // "nothing added to commit but untracked files present"    (stdout, code 1)
  if (/nothing to commit/i.test(stdout) || /nothing to commit/i.test(stderr)) {
    return { kind: 'nothing-to-commit' };
  }

  // "fatal: The current branch main has no upstream branch."  (push, code 128)
  const noUpstreamMatch = /The current branch (\S+) has no upstream branch/.exec(stderr);
  if (noUpstreamMatch !== null) {
    return { kind: 'no-upstream', branch: noUpstreamMatch[1] ?? '' };
  }

  // "fatal: Authentication failed for 'https://...'"          (push/pull/fetch, code 128)
  // "fatal: could not read Username for '...': terminal prompts disabled"
  // "remote: Invalid username or password."
  // "git@github.com: Permission denied (publickey)."
  if (
    /Authentication failed/i.test(stderr) ||
    /could not read Username/i.test(stderr) ||
    /Permission denied \(publickey\)/i.test(stderr) ||
    /Invalid username or password/i.test(stderr)
  ) {
    return { kind: 'auth-failed', detail: stderr };
  }

  // "CONFLICT (content): Merge conflict in README.md"         (pull, code 1)
  // "Automatic merge failed; fix conflicts and then commit the result."
  if (/CONFLICT|Automatic merge failed/i.test(stderr)) {
    const files: string[] = [];
    const re = /CONFLICT \(.*?\): Merge conflict in (.+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(stderr)) !== null) {
      const file = m[1];
      if (file !== undefined) files.push(file.trim());
    }
    return { kind: 'conflict', files };
  }

  // "fatal: No configured push destination."                  (push, no remote, code 128)
  // "fatal: No remote configured."                            (fetch, no remote, code 128)
  // "fatal: 'origin' does not appear to be a git repository" (push/fetch, bad remote name)
  if (
    /No configured push destination/i.test(stderr) ||
    /No remote configured/i.test(stderr) ||
    /does not appear to be a git repository/i.test(stderr)
  ) {
    return { kind: 'no-remote' };
  }

  return { kind: 'command-failed', code, stderr };
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createGitService(runner: CommandRunner, env: Environment): GitService {
  const vault = env.vaultPath;

  /**
   * Runs `git <args>` against the vault.
   *
   * Returns ok(ExecResult) on any exit (including non-zero — git errors are data).
   * Returns err('git-not-found') when the host bridge throws because the git
   * binary could not be invoked (ENOENT from execFile).
   * Re-throws for any other unexpected thrown error from the bridge.
   */
  async function runGit(args: string[]): Promise<Result<ExecResult, GitError>> {
    try {
      return ok(await runner.exec('git', args, vault));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      // ENOENT means the OS couldn't find the git binary at all.
      if (/ENOENT/i.test(msg) || /git.*not found|not found.*git/i.test(msg)) {
        return err({ kind: 'git-not-found' });
      }
      throw e;
    }
  }

  /** Classify a non-zero ExecResult and return err(GitError). */
  function fail(result: ExecResult): Result<never, GitError> {
    return err(classifyGitError(result.code, result.stderr, result.stdout));
  }

  return {
    async getStatus() {
      const r = await runGit(gitArgs.status());
      if (!r.ok) return r;
      if (r.value.code !== 0) return fail(r.value);
      return ok(parseStatus(r.value.stdout));
    },

    async stage(paths) {
      const r = await runGit(gitArgs.stage(paths));
      if (!r.ok) return r;
      if (r.value.code !== 0) return fail(r.value);
      return ok(undefined);
    },

    async unstage(paths) {
      const r = await runGit(gitArgs.unstage(paths));
      if (!r.ok) return r;
      if (r.value.code !== 0) return fail(r.value);
      return ok(undefined);
    },

    async commit(message) {
      const commitR = await runGit(gitArgs.commit(message));
      if (!commitR.ok) return commitR;
      if (commitR.value.code !== 0) return fail(commitR.value);

      // commit output is human-readable; fetch the new commit via machine-readable log.
      const logR = await runGit(gitArgs.log(1));
      if (!logR.ok) return logR;
      if (logR.value.code !== 0) return fail(logR.value);

      const commits = parseLog(logR.value.stdout);
      const head = commits[0];
      if (head === undefined) {
        return err({ kind: 'command-failed', code: 0, stderr: 'commit succeeded but log returned no entry' });
      }
      return ok(head);
    },

    async push() {
      const r = await runGit(gitArgs.push());
      if (!r.ok) return r;
      if (r.value.code !== 0) return fail(r.value);
      return ok(undefined);
    },

    async pushSetUpstream(branch) {
      const r = await runGit(gitArgs.pushSetUpstream(branch));
      if (!r.ok) return r;
      if (r.value.code !== 0) return fail(r.value);
      return ok(undefined);
    },

    async pull() {
      const pullR = await runGit(gitArgs.pull());
      if (!pullR.ok) return pullR;
      if (pullR.value.code !== 0) {
        // Conflict detection: prioritize porcelain status ('u' entries) over locale-dependent
        // stderr strings — git status --porcelain=v2 is machine-readable and locale-independent.
        // classifyGitError remains a best-effort fallback for non-conflict errors.
        const statusR = await runGit(gitArgs.status());
        if (statusR.ok && statusR.value.code === 0) {
          const status = parseStatus(statusR.value.stdout);
          if (status.hasConflicts) {
            const files = status.changes
              .filter((c) => c.kind === 'conflicted')
              .map((c) => c.path);
            return err({ kind: 'conflict', files });
          }
        }
        return fail(pullR.value);
      }

      // pull succeeded — return the refreshed status so the caller doesn't need a second round-trip.
      const statusR = await runGit(gitArgs.status());
      if (!statusR.ok) return statusR;
      if (statusR.value.code !== 0) return fail(statusR.value);
      return ok(parseStatus(statusR.value.stdout));
    },

    async fetch() {
      const r = await runGit(gitArgs.fetch());
      if (!r.ok) return r;
      if (r.value.code !== 0) return fail(r.value);
      return ok(undefined);
    },

    async init() {
      const r = await runGit(gitArgs.init());
      if (!r.ok) return r;
      if (r.value.code !== 0) return fail(r.value);
      return ok(undefined);
    },

    async diff(path, staged) {
      const r = await runGit(gitArgs.diff(path, staged));
      if (!r.ok) return r;
      if (r.value.code !== 0) return fail(r.value);
      return ok({ path, staged, patch: r.value.stdout });
    },

    async log(limit) {
      const r = await runGit(gitArgs.log(limit));
      if (!r.ok) return r;
      if (r.value.code !== 0) return fail(r.value);
      return ok(parseLog(r.value.stdout));
    },
  };
}
