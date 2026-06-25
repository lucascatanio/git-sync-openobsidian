export type GitError =
  | { kind: 'git-not-found' }
  | { kind: 'not-a-repo' }
  | { kind: 'no-remote' }
  | { kind: 'no-upstream'; branch: string }
  | { kind: 'auth-failed'; detail: string }
  | { kind: 'conflict'; files: string[] }
  | { kind: 'nothing-to-commit' }
  | { kind: 'command-failed'; code: number; stderr: string };
