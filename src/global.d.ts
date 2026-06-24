/**
 * Host-injected globals: window.pluginApi and window.VAULT_PATH.
 * Only bridge.ts reads these. No other module may reference pluginApi or VAULT_PATH directly.
 */

interface PluginApiExecOk {
  stdout: string;
  stderr: string;
  code: number;
}

interface PluginApiError {
  error: string;
}

/** Raw interface of the object the host injects as window.pluginApi. */
interface PluginApiHost {
  exec(cmd: string, args: string[], cwd: string): Promise<PluginApiExecOk | PluginApiError>;
  readFile(path: string): Promise<{ content: string } | PluginApiError>;
  /** Returns {} on success, { error } on failure. */
  writeFile(path: string, content: string): Promise<{ error?: string }>;
  notify(msg: string): Promise<void>;
}

// Declared as let (not const) so tests can assign to globalThis.pluginApi / globalThis.VAULT_PATH.
declare let pluginApi: PluginApiHost;
declare let VAULT_PATH: string;
