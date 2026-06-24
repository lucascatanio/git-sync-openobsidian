/**
 * Ports (interfaces) for the I/O boundary.
 *
 * The adapter (bridge.ts) implements these over window.pluginApi.
 * Fakes (src/testing/fakes.ts) implement these for unit tests.
 * No other file imports from bridge.ts or touches window.pluginApi.
 */

/** Successful result of running a system binary. */
export interface ExecResult {
  stdout: string;
  stderr: string;
  code: number;
}

/** Runs a binary (e.g. git) via the host bridge. */
export interface CommandRunner {
  exec(cmd: string, args: string[], cwd: string): Promise<ExecResult>;
}

/** UTF-8 text file I/O via the host bridge. */
export interface FileStore {
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<void>;
}

/** Native app toast notification. Fire-and-forget; never awaited by callers. */
export interface Notifier {
  notify(message: string): void;
}

/** Host-supplied runtime environment. Injected at the composition root. */
export interface Environment {
  readonly vaultPath: string;
}
