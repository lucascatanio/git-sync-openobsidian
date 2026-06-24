import { describe, it, expect, beforeEach } from 'vitest';
import { createBridge, BridgeError } from '../bridge.ts';
import { FakeCommandRunner, FakeFileStore, FakeNotifier } from '../testing/fakes.ts';

// ── helpers ───────────────────────────────────────────────────────────────────

/** Build a full PluginApiHost mock, merging defaults with per-test overrides. */
function mockApi(overrides: Partial<PluginApiHost> = {}): PluginApiHost {
  return {
    exec: async () => ({ stdout: '', stderr: '', code: 0 }),
    readFile: async () => ({ content: '' }),
    writeFile: async () => ({}),
    notify: async () => {},
    ...overrides,
  } as PluginApiHost;
}

function setup(overrides: Partial<PluginApiHost> = {}): void {
  globalThis.VAULT_PATH = '/test/vault';
  globalThis.pluginApi = mockApi(overrides);
}

// ── bridge.env ────────────────────────────────────────────────────────────────

describe('bridge env', () => {
  it('exposes vaultPath from VAULT_PATH global', () => {
    setup();
    expect(createBridge().env.vaultPath).toBe('/test/vault');
  });
});

// ── bridge runner.exec ────────────────────────────────────────────────────────

describe('bridge runner.exec', () => {
  beforeEach(() => setup());

  it('forwards cmd, args, cwd to pluginApi.exec and returns ExecResult', async () => {
    const captured: { cmd: string; args: string[]; cwd: string }[] = [];
    setup({
      exec: async (cmd, args, cwd) => {
        captured.push({ cmd, args, cwd });
        return { stdout: 'git version 2.43.0', stderr: '', code: 0 };
      },
    });

    const { runner } = createBridge();
    const result = await runner.exec('git', ['--version'], '/test/vault');

    expect(captured).toHaveLength(1);
    expect(captured[0]).toEqual({ cmd: 'git', args: ['--version'], cwd: '/test/vault' });
    expect(result.stdout).toBe('git version 2.43.0');
    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
  });

  it('throws BridgeError when host returns { error }', async () => {
    setup({ exec: async () => ({ error: 'ENOENT: git not found' }) });

    const { runner } = createBridge();
    const thrown = runner.exec('git', ['--version'], '/test/vault');
    await expect(thrown).rejects.toBeInstanceOf(BridgeError);
    await expect(thrown).rejects.toThrow('ENOENT: git not found');
  });

  it('returns ExecResult with non-zero code without throwing (git errors are data)', async () => {
    setup({ exec: async () => ({ stdout: '', stderr: 'fatal: not a repo', code: 128 }) });

    const { runner } = createBridge();
    const result = await runner.exec('git', ['status'], '/test/vault');
    expect(result.code).toBe(128);
    expect(result.stderr).toBe('fatal: not a repo');
  });
});

// ── bridge store.read ─────────────────────────────────────────────────────────

describe('bridge store.read', () => {
  it('returns file content on success', async () => {
    setup({ readFile: async () => ({ content: 'hello vault' }) });

    const { store } = createBridge();
    expect(await store.read('/test/vault/.gitignore')).toBe('hello vault');
  });

  it('throws BridgeError when host readFile returns { error }', async () => {
    setup({ readFile: async () => ({ error: 'ENOENT: file not found' }) });

    const { store } = createBridge();
    await expect(store.read('/missing')).rejects.toBeInstanceOf(BridgeError);
  });
});

// ── bridge store.write ────────────────────────────────────────────────────────

describe('bridge store.write', () => {
  it('resolves when host writeFile succeeds', async () => {
    setup({ writeFile: async () => ({}) });

    const { store } = createBridge();
    await expect(store.write('/test/vault/file.md', 'content')).resolves.toBeUndefined();
  });

  it('throws BridgeError when host writeFile returns { error }', async () => {
    setup({ writeFile: async () => ({ error: 'EPERM: permission denied' }) });

    const { store } = createBridge();
    await expect(store.write('/test/vault/file.md', 'content')).rejects.toBeInstanceOf(BridgeError);
  });
});

// ── bridge notifier ───────────────────────────────────────────────────────────

describe('bridge notifier', () => {
  it('calls pluginApi.notify with the message', async () => {
    const notified: string[] = [];
    setup({ notify: async (msg) => void notified.push(msg) });

    const { notifier } = createBridge();
    notifier.notify('sync complete');

    // notify is fire-and-forget; flush microtasks before asserting
    await Promise.resolve();
    expect(notified).toEqual(['sync complete']);
  });
});

// ── FakeCommandRunner smoke ───────────────────────────────────────────────────

describe('FakeCommandRunner', () => {
  it('returns queued ExecResult and records the call', async () => {
    const runner = new FakeCommandRunner();
    runner.enqueue({ stdout: 'git version 2.43.0', stderr: '', code: 0 });

    const result = await runner.exec('git', ['--version'], '/vault');

    expect(result.stdout).toBe('git version 2.43.0');
    expect(result.code).toBe(0);
    expect(runner.callCount).toBe(1);
    expect(runner.lastCall).toEqual({ cmd: 'git', args: ['--version'], cwd: '/vault' });
  });

  it('re-throws a queued Error', async () => {
    const runner = new FakeCommandRunner();
    runner.enqueue(new Error('host execution failed'));

    await expect(runner.exec('git', ['status'], '/vault')).rejects.toThrow('host execution failed');
  });

  it('throws when queue is empty', async () => {
    const runner = new FakeCommandRunner();
    await expect(runner.exec('git', ['log'], '/vault')).rejects.toThrow('FakeCommandRunner');
  });
});

// ── FakeFileStore smoke ───────────────────────────────────────────────────────

describe('FakeFileStore', () => {
  it('returns queued content and records the read call', async () => {
    const store = new FakeFileStore();
    store.enqueueRead('file body');

    const content = await store.read('/vault/.gitignore');

    expect(content).toBe('file body');
    expect(store.readCalls).toEqual(['/vault/.gitignore']);
  });

  it('re-throws a queued read Error', async () => {
    const store = new FakeFileStore();
    store.enqueueRead(new Error('ENOENT'));

    await expect(store.read('/missing')).rejects.toThrow('ENOENT');
  });

  it('resolves write and records the call', async () => {
    const store = new FakeFileStore();
    store.enqueueWrite();

    await expect(store.write('/vault/notes.md', 'body')).resolves.toBeUndefined();
    expect(store.writeCalls).toEqual([{ path: '/vault/notes.md', content: 'body' }]);
  });

  it('re-throws a queued write Error', async () => {
    const store = new FakeFileStore();
    store.enqueueWrite(new Error('EPERM'));

    await expect(store.write('/vault/notes.md', 'body')).rejects.toThrow('EPERM');
  });
});

// ── FakeNotifier smoke ────────────────────────────────────────────────────────

describe('FakeNotifier', () => {
  it('records all notified messages', () => {
    const notifier = new FakeNotifier();

    notifier.notify('first');
    notifier.notify('second');

    expect(notifier.messages).toEqual(['first', 'second']);
    expect(notifier.lastMessage).toBe('second');
  });
});
