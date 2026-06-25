/**
 * Pure functions that build git argument arrays. No I/O, no magic strings.
 * Every subcommand and flag is expressed as a named constant or parameter.
 */

export const gitArgs = {
  isRepo: (): string[] => ['rev-parse', '--is-inside-work-tree'],

  status: (): string[] => ['status', '--porcelain=v2', '--branch', '-z'],

  stage: (paths: string[]): string[] => ['add', '--', ...paths],

  unstage: (paths: string[]): string[] => ['restore', '--staged', '--', ...paths],

  commit: (message: string): string[] => ['commit', '-m', message],

  push: (): string[] => ['push'],

  pushSetUpstream: (branch: string): string[] => ['push', '-u', 'origin', branch],

  pull: (): string[] => ['pull', '--no-edit'],

  fetch: (): string[] => ['fetch'],

  init: (): string[] => ['init'],

  diff: (path: string, staged: boolean): string[] =>
    staged
      ? ['diff', '--no-color', '--cached', '--', path]
      : ['diff', '--no-color', '--', path],

  log: (limit: number): string[] => [
    'log',
    `--max-count=${limit}`,
    '--format=%H%x1f%an%x1f%at%x1f%s',
  ],
} as const;
