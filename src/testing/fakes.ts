/**
 * In-process fakes for unit testing layers above the bridge.
 *
 * Usage (Bloco 3+):
 *   const runner = new FakeCommandRunner();
 *   runner.enqueue({ stdout: '...', stderr: '', code: 0 });
 *   // or runner.enqueue(new Error('host failure'));
 *   const result = await runner.exec('git', ['status'], '/vault');
 *   expect(runner.calls[0]).toEqual({ cmd: 'git', args: ['status'], cwd: '/vault' });
 *
 * No mocking library — just queued responses and recorded calls.
 */

import type { CommandRunner, ExecResult, FileStore, Notifier } from '../ports.ts';

// ── CommandRunner fake ────────────────────────────────────────────────────────

export class FakeCommandRunner implements CommandRunner {
  readonly calls: { cmd: string; args: string[]; cwd: string }[] = [];
  private readonly queue: Array<ExecResult | Error> = [];

  /** Queue a successful ExecResult or an Error to be thrown. */
  enqueue(response: ExecResult | Error): void {
    this.queue.push(response);
  }

  async exec(cmd: string, args: string[], cwd: string): Promise<ExecResult> {
    this.calls.push({ cmd, args, cwd });
    const next = this.queue.shift();
    if (next === undefined) {
      throw new Error('FakeCommandRunner: no response queued — call enqueue() first');
    }
    if (next instanceof Error) throw next;
    return next;
  }

  get lastCall(): { cmd: string; args: string[]; cwd: string } | undefined {
    return this.calls[this.calls.length - 1];
  }

  get callCount(): number {
    return this.calls.length;
  }
}

// ── FileStore fake ────────────────────────────────────────────────────────────

export class FakeFileStore implements FileStore {
  readonly readCalls: string[] = [];
  readonly writeCalls: { path: string; content: string }[] = [];
  private readonly readQueue: Array<string | Error> = [];
  private readonly writeQueue: Array<Error | null> = [];

  /** Queue a file content string or an Error to be thrown on the next read(). */
  enqueueRead(contentOrError: string | Error): void {
    this.readQueue.push(contentOrError);
  }

  /**
   * Queue a write outcome. Call with no argument (or null) for success,
   * with an Error for failure.
   */
  enqueueWrite(error: Error | null = null): void {
    this.writeQueue.push(error);
  }

  async read(path: string): Promise<string> {
    this.readCalls.push(path);
    const next = this.readQueue.shift();
    if (next === undefined) {
      throw new Error('FakeFileStore: no read response queued — call enqueueRead() first');
    }
    if (next instanceof Error) throw next;
    return next;
  }

  async write(path: string, content: string): Promise<void> {
    this.writeCalls.push({ path, content });
    const next = this.writeQueue.shift();
    if (next === undefined) {
      throw new Error('FakeFileStore: no write response queued — call enqueueWrite() first');
    }
    if (next instanceof Error) throw next;
  }
}

// ── Notifier fake ─────────────────────────────────────────────────────────────

export class FakeNotifier implements Notifier {
  readonly messages: string[] = [];

  notify(message: string): void {
    this.messages.push(message);
  }

  get lastMessage(): string | undefined {
    return this.messages[this.messages.length - 1];
  }
}
