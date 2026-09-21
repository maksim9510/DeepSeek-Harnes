# Agent Note: The installer updates a checkout by remote identity

Status: implemented

English | [中文](2026-09-21-installer-update-by-remote-identity.zh.md)

## Problem

`DeepSeek-install.py install --dir <checkout>` updated an existing checkout with `git pull --ff-only`. In the fork's synchronized layout that command always fails: `origin` is upstream (`deepseek-ai/deepseek-harness`, branch `master`) while the local branch `master` tracks `origin/main`, so git reports that it cannot find the ref its configuration names. The installer therefore refused to build a checkout that was already present, and the fork's own update path (`DeepSeek-sync.py`) was the only way to advance it.

## Decision

The update identifies the remote to advance from by repository URL rather than by name or by the local branch's tracking configuration. It selects the remote on `github.com` whose `owner/repo` matches the requested repository, preferring `origin`, fetches it, and fast-forwards onto the fork's published branch, falling back to the remote's own `HEAD` and then to the currently checked-out branch.

The fork's layout names that remote `personal`; a fresh clone of the fork names it `origin`; both resolve without special cases. A remote whose URL has no GitHub identity, or a checkout with no matching remote, keeps the previous plain `pull` behavior.

A checkout carrying commits the remote does not have is left untouched. The installer prints the fast-forward failure and the commands that resolve it instead of forcing a merge over local work.

This refines the update step of the [universal Python installer](../feature/2026-09-01-universal-python-installer-with-doctor.md), which owns the installer's overall scope; the remote layout itself remains owned by the [sync adaptation loop](2026-09-07-sync-locale-adaptation-loop.md).

## Alternatives considered

**Configure the tracking ref.** Setting `branch.master.merge` to the fork's `main` would make `pull` work, but it rewrites the synchronization layout that `DeepSeek-sync.py` owns, and it has to be redone on every clone.

**Pull from `personal` by name.** Correct only in the synchronized layout; a fresh clone of the fork has no `personal` remote.

**Refuse the update and tell the user to run `DeepSeek-sync.py`.** Leaves `install` unable to complete on the layout the fork ships, which is the defect being fixed.

**`git merge` without `--ff-only`.** Silently merges over local commits, turning an update into an unreviewed change.

## Consequences

`install --dir` advances either layout. Deployment notes that describe the update in terms of `git pull` no longer match the installer's behavior and are corrected alongside this change.
