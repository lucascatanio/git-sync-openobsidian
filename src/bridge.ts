/**
 * Thin typed adapter over window.pluginApi (injected by the host).
 *
 * This is the ONLY file that reads pluginApi or VAULT_PATH.
 * Everything else depends on the ports (interfaces), not this concrete adapter.
 *
 * What this does:
 *   - Wraps pluginApi's untyped responses in the typed port contracts.
 *   - Translates { error } host responses into thrown BridgeErrors.
 *   - Captures VAULT_PATH into Environment.
 *
 * What this does NOT do:
 *   - Re-implement the postMessage RPC (__pt/__pi/__pr) — the host handles that.
 *   - Classify git errors into GitError kinds — that's GitService's job (Bloco 3).
 */

import type { CommandRunner, Environment, ExecResult, FileStore, Notifier } from './ports.ts';

/** Thrown when the host bridge itself fails (not when git returns a non-zero exit). */
export class BridgeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BridgeError';
  }
}

export interface Bridge {
  runner: CommandRunner;
  store: FileStore;
  notifier: Notifier;
  env: Environment;
}

/**
 * Reads pluginApi and VAULT_PATH from the global scope at call time.
 * Call this from the composition root (main.tsx) after DOMContentLoaded.
 */
export function createBridge(): Bridge {
  return {
    runner: {
      async exec(cmd: string, args: string[], cwd: string): Promise<ExecResult> {
        const resp = await pluginApi.exec(cmd, args, cwd);
        if ('error' in resp) throw new BridgeError(resp.error);
        return resp;
      },
    },

    store: {
      async read(path: string): Promise<string> {
        const resp = await pluginApi.readFile(path);
        if ('error' in resp) throw new BridgeError(resp.error);
        return resp.content;
      },

      async write(path: string, content: string): Promise<void> {
        const resp = await pluginApi.writeFile(path, content);
        if (resp.error !== undefined) throw new BridgeError(resp.error);
      },
    },

    notifier: {
      // notify is fire-and-forget: the port returns void, so we don't await.
      notify(message: string): void {
        void pluginApi.notify(message);
      },
    },

    env: {
      vaultPath: VAULT_PATH,
    },
  };
}
