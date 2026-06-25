import type { GitError } from './domain/errors.ts';

/**
 * Railway-oriented error handling. Falible operations return Result<T, E>
 * rather than throwing, so every error path is visible in the type signature.
 *
 * Default E = GitError (the common failure type for all git operations).
 * Use Result<T, never> when a codepath has no reachable error case.
 */
export type Result<T, E = GitError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });
