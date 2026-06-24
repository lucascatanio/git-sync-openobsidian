/**
 * Railway-oriented error handling. Falible operations return Result<T, E>
 * rather than throwing, so every error path is visible in the type signature.
 *
 * Default E = never: a Result<T> can only be ok (no reachable error case).
 * Callers that can fail use Result<T, GitError> (defined in domain/errors.ts).
 */
export type Result<T, E = never> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });
