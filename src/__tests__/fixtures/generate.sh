#!/usr/bin/env bash
# Documents how every fixture in this directory was generated.
# Run from /tmp — do NOT run in the project repo.
# These are raw binary files; NUL bytes (0x00) are the field terminators
# used by git status --porcelain=v2 -z.
#
# status-*.txt  : git status --porcelain=v2 --branch -z
# log.txt       : git log --max-count=10 --format=%H%x1f%an%x1f%at%x1f%s

set -euo pipefail
cd /tmp

# ── Base repo ─────────────────────────────────────────────────────────────────
rm -rf goo-fix-gen goo-fix-remote.git goo-fix-other
mkdir goo-fix-gen && cd goo-fix-gen
git init && git config user.email "t@t.com" && git config user.name "Test"
echo "# Notes" > README.md && git add README.md && git commit -m "init: add README"
echo "second" >> README.md && git add README.md && git commit -m "feat: second commit"
echo "file to delete" > added.md && git add added.md && git commit -m "chore: add file"
echo "file to rename" > to-rename.md && git add to-rename.md && git commit -m "chore: to-rename"

# ── status-clean.txt (cloned from remote, no changes) ─────────────────────────
cd /tmp
git clone --bare /tmp/goo-fix-gen /tmp/goo-fix-remote.git
git clone /tmp/goo-fix-remote.git /tmp/goo-fix-other 2>/dev/null
cd /tmp/goo-fix-other && git config user.email "t@t.com" && git config user.name "Test"
git status --porcelain=v2 --branch -z > /tmp/status-clean.txt

# ── status-mixed.txt (all ordinary change types) ─────────────────────────────
cd /tmp/goo-fix-gen
git remote add origin /tmp/goo-fix-remote.git
git push -u origin master
# Local commits (to be ahead)
echo "special" > special.md && git add special.md && git commit -m "chore: special"
echo "will be more" > more.md && git add more.md && git commit -m "chore: more"
# Remote commit (to be behind)
cd /tmp/goo-fix-other && echo "remote" >> README.md && git add README.md && \
  git commit -m "remote: commit" && git push
# Back to local — fetch
cd /tmp/goo-fix-gen && git fetch
# Build mixed working tree state:
echo "modified" >> README.md               # 1 .M  (unstaged modify)
echo "staged new" > staged-new.md && git add staged-new.md   # 1 A.  (staged add)
git rm added.md                            # 1 D.  (staged delete)
git mv special.md renamed-special.md       # 2 R.  (staged rename)
echo "untracked" > untracked.md            # ?     (untracked)
git status --porcelain=v2 --branch -z > /tmp/status-mixed.txt

# ── log.txt ───────────────────────────────────────────────────────────────────
git config user.name "Café Ñoño"
echo "x" > x.md && git add x.md && git commit -m "fix: handle émojis and ünïcödé"
git config user.name "Test"
git log --max-count=10 --format="%H%x1f%an%x1f%at%x1f%s" > /tmp/log.txt

# ── status-detached.txt ───────────────────────────────────────────────────────
git stash
git checkout --detach HEAD
git status --porcelain=v2 --branch -z > /tmp/status-detached.txt
git checkout master && git stash pop

# ── status-conflict.txt ───────────────────────────────────────────────────────
cd /tmp && git clone /tmp/goo-fix-remote.git /tmp/goo-fix-conflict 2>/dev/null
cd /tmp/goo-fix-conflict && git config user.email "t@t.com" && git config user.name "Test"
# Remote gets a conflicting commit
cd /tmp/goo-fix-other && echo "conflict from remote" >> README.md && git add README.md && \
  git commit -m "remote: conflict" && git push
# Local conflicting commit
cd /tmp/goo-fix-conflict && echo "conflict local" >> README.md && git add README.md && \
  git commit -m "local: conflict"
git fetch && git merge origin/master 2>&1 || true   # conflict expected
git status --porcelain=v2 --branch -z > /tmp/status-conflict.txt

# ── status-initial.txt (brand-new repo, no commits) ──────────────────────────
cd /tmp && mkdir goo-fix-initial && cd goo-fix-initial
git init && git config user.email "t@t.com" && git config user.name "Test"
echo "new" > file.md && git add file.md
git status --porcelain=v2 --branch -z > /tmp/status-initial.txt

echo "Done. Copy /tmp/status-*.txt and /tmp/log.txt to src/__tests__/fixtures/"
