import { describe, it, expect } from 'vitest';
import { gitArgs } from '../args.ts';

describe('gitArgs', () => {
  describe('isRepo', () => {
    it('returns rev-parse --is-inside-work-tree', () => {
      expect(gitArgs.isRepo()).toEqual(['rev-parse', '--is-inside-work-tree']);
    });
  });

  describe('status', () => {
    it('uses porcelain=v2 with branch and NUL terminator', () => {
      expect(gitArgs.status()).toEqual(['status', '--porcelain=v2', '--branch', '-z']);
    });
  });

  describe('stage', () => {
    it('uses add with -- separator', () => {
      expect(gitArgs.stage(['a.md', 'b.md'])).toEqual(['add', '--', 'a.md', 'b.md']);
    });

    it('handles a single path', () => {
      expect(gitArgs.stage(['file.md'])).toEqual(['add', '--', 'file.md']);
    });

    it('handles paths with spaces', () => {
      expect(gitArgs.stage(['my notes.md'])).toEqual(['add', '--', 'my notes.md']);
    });
  });

  describe('unstage', () => {
    it('uses restore --staged with -- separator', () => {
      expect(gitArgs.unstage(['a.md'])).toEqual(['restore', '--staged', '--', 'a.md']);
    });

    it('handles multiple paths', () => {
      expect(gitArgs.unstage(['a.md', 'b.md'])).toEqual([
        'restore',
        '--staged',
        '--',
        'a.md',
        'b.md',
      ]);
    });
  });

  describe('commit', () => {
    it('uses commit -m', () => {
      expect(gitArgs.commit('feat: add X')).toEqual(['commit', '-m', 'feat: add X']);
    });

    it('passes the message verbatim (no escaping)', () => {
      const msg = 'fix: handle "quotes" and \nnewlines';
      expect(gitArgs.commit(msg)).toEqual(['commit', '-m', msg]);
    });
  });

  describe('push', () => {
    it('is a plain push', () => {
      expect(gitArgs.push()).toEqual(['push']);
    });
  });

  describe('pushSetUpstream', () => {
    it('sets upstream to origin/<branch>', () => {
      expect(gitArgs.pushSetUpstream('main')).toEqual(['push', '-u', 'origin', 'main']);
    });

    it('works for non-main branches', () => {
      expect(gitArgs.pushSetUpstream('feat/my-feature')).toEqual([
        'push',
        '-u',
        'origin',
        'feat/my-feature',
      ]);
    });
  });

  describe('pull', () => {
    it('uses --no-edit to avoid interactive editor on merge commits', () => {
      expect(gitArgs.pull()).toEqual(['pull', '--no-edit']);
    });
  });

  describe('fetch', () => {
    it('is a plain fetch', () => {
      expect(gitArgs.fetch()).toEqual(['fetch']);
    });
  });

  describe('init', () => {
    it('is a plain init', () => {
      expect(gitArgs.init()).toEqual(['init']);
    });
  });

  describe('diff', () => {
    it('uses --cached for staged diff', () => {
      expect(gitArgs.diff('notes.md', true)).toEqual([
        'diff',
        '--no-color',
        '--cached',
        '--',
        'notes.md',
      ]);
    });

    it('omits --cached for unstaged diff', () => {
      expect(gitArgs.diff('notes.md', false)).toEqual([
        'diff',
        '--no-color',
        '--',
        'notes.md',
      ]);
    });

    it('handles paths with spaces', () => {
      expect(gitArgs.diff('my notes/file.md', false)).toEqual([
        'diff',
        '--no-color',
        '--',
        'my notes/file.md',
      ]);
    });
  });

  describe('log', () => {
    it('uses unit-separator (x1f) fields and max-count', () => {
      expect(gitArgs.log(20)).toEqual([
        'log',
        '--max-count=20',
        '--format=%H%x1f%an%x1f%at%x1f%s',
      ]);
    });

    it('respects any limit value', () => {
      const args = gitArgs.log(5);
      expect(args[1]).toBe('--max-count=5');
    });
  });
});
