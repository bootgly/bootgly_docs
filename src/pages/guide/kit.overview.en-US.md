# Kit CLI

The kit you installed is a delivery vehicle: you never commit to it, everything of yours at its
root (`projects/`, `storage/`, `scripts/`, `tests/`, `public/`) is ignored by git, and every kit
**release** is a tag pinning one coherent set of Bootgly Platform versions — framework, Console,
Web. `bootgly kit` is the kit's own command: `boot` lays down the directories a kit runs on, and
`upgrade`, `downgrade` and `list` move it between releases — forward, back, and a look at them. No
`git pull`: the same verbs work on a cloned kit and on a kit generated from the GitHub template,
whose squashed history has no upstream to pull from.

## Boot the resource directories

```bash :toolbar="true";
bootgly kit boot
```

A kit runs on three directories of yours: `scripts/` (copied from the framework's template),
`storage/` (created with its layout — `cache/`, `logs/`, `pids/`, `temp/`, … — the framework
ships no template for it; `sessions/` and `security/` are created by their owners, locked down) and `projects/` (seeded with an empty registry — the
framework's own Demos are never listed in a kit). `kit boot` lays down whichever is missing and
never touches one that exists; a copy that fails leaves nothing half-laid, and the registry comes
last, so a boot that fails leaves the kit unprepared for the next run to complete. You rarely run it by hand: the first `projects create` or `projects import` on a fresh
kit boots it for you.

## See what you can move to

```bash :toolbar="true";
bootgly kit list
```

The releases the kit can move to, newest first, with where the kit stands:

```text
╔═══════════════╤═════════╤═════════╗
║ Release       │ Commit  │ Status  ║
╟───────────────┼─────────┼─────────╢
║ v1.0.0-beta.8 │ f8bf626 │ newer   ║
║ v1.0.0-beta.7 │ c623e11 │ current ║
║ v1.0.0-beta.6 │ c994f0a │ older   ║
╚═══════════════╧═════════╧═════════╝
```

"Newest" is Semantic Versioning precedence, not text order: `v1.0.0` ranks above its own
`v1.0.0-rc.1`, `beta.10` above `beta.9`, and a `v1.1.0-beta.1` kit is never dragged back to a
`v1.0.0` stable. A kit a few commits past a release shows `current (+2 commits)`; a kit whose own
commit no tag reaches (generated from the template) shows `current (by the Bootgly pin)` — the
release its framework submodule delivers.

## Upgrade

```bash :toolbar="true";
bootgly kit upgrade
```

Without an argument the kit moves to the **newest** release. The command fetches the release tags,
checks the kit out at the tag and lets the submodules (`Bootgly/`, `Console/`, `Web/`) follow the
pins that tag records — a platform you never set up stays that way. Your `projects/`, `storage/`
and every other ignored directory are yours: a move never writes into them — and the one case
where a release carries a file at such a path is refused by name before anything moves.

Name a release to go exactly there, with or without the `v`:

```bash :toolbar="true";
bootgly kit upgrade v1.0.0-beta.8
bootgly kit upgrade 1.0.0-beta.8
```

Running it again is an explicit no-op — "The kit is already on the newest release" — and exits 0.
A kit a few commits past the newest release is *returned* onto it (the command says so).

## Downgrade

Something broke after moving up? Go back in one command:

```bash :toolbar="true";
bootgly kit downgrade
```

Without an argument the kit moves to the release **just below** the current one; with one, to that
release. The verbs are honest about direction: `upgrade` to an older release is refused with the
`downgrade` line to run instead, and vice versa.

## When it stops

The command refuses, naming what is in the way, whenever a move could lose something that is not
the kit's to lose:

- **Uncommitted changes to the kit's own files** — every path is listed; commit or stash them.
  A dirty `projects/App` is never one of them: it is ignored by the kit and cannot block.
- **A file the release would overwrite** — untracked or ignored alike (git overwrites an ignored
  file in silence, and everything of yours is ignored): only the very paths the release carries;
  an unrelated file, even inside a directory the release brings, survives the move.
- **A submodule moved, edited or with its pin staged by hand** — the release cannot follow a
  checkout someone chose on purpose.

Two situations ask before going on, and `--yes` answers for you (scripts, agents, CI):

- **Running instances.** They keep the files they loaded until restarted, so the command names
  them and asks. Stop them first (`bootgly project <Name> stop`) or reload them after
  (`bootgly project <Name> reload`).
- **Crossing a major version** (`1.x` → `2.x`, or back).
- **A release that predates this command.** Moving below the first release that shipped
  `bootgly kit upgrade` leaves a kit with no `upgrade` verb to come back with — the command says so
  and prints the way back: `git checkout <release>` then `git submodule update`, in the kit.

```bash :toolbar="true";
bootgly kit upgrade --yes
```

## Scripts and agents

`--json` turns every run — list, move, no-op or refusal — into one JSON document and asks nothing:
a confirmation that would be needed becomes a refusal until `--yes` is passed.

```bash :toolbar="true";
bootgly kit list --json
bootgly kit upgrade --json --yes
```

```json
{
  "command": "kit",
  "verb": "upgrade",
  "kit": "/srv/app",
  "status": "moved",
  "reason": null,
  "remote": "origin",
  "fetched": true,
  "current": { "tag": "v1.0.0-beta.7", "version": "1.0.0-beta.7", "commit": "c623e11…", "distance": 0, "source": "tag" },
  "target":  { "tag": "v1.0.0-beta.8", "version": "1.0.0-beta.8", "commit": "f8bf626…", "distance": 0, "source": "tag" },
  "releases": [ { "tag": "v1.0.0-beta.8", "version": "1.0.0-beta.8", "commit": "f8bf626…", "current": false }, "…" ]
}
```

`status` is `listed`, `moved`, `noop`, `refused` — or `partial`: the checkout did not fully land (git
reports success with part of a tree unwritten — a read-only directory, a full disk) or the
submodules could not follow (the document then carries the `git submodule update` to run, or the
`git checkout` that goes back). A refusal carries `reason` (and `detail`), the guards add `blockers`
(what, paths, fix), a live instance adds `running`, a release below the command's first one adds
`predates: true`, `added: true` says the `bootgly` remote was created by this run, `verified`
says the releases were checked against what the canonical remote advertises (a tag from a fork or
a mirror is never a release), and `mixed: true` on a `list` says a submodule sits off the kit's pin
— a move that did not complete, reported as `partial` again on every retry until it is repaired.

## Kits generated from the GitHub template

A kit created with "Use this template" has one squashed commit and no remote pointing at
`bootgly/bootgly.kit`. The first `upgrade` adds that remote as `bootgly`, fetches its releases,
locates the kit by the framework release its `Bootgly/` submodule pins, and moves it like any
other kit. From then on it is a kit on a release.

## Coming from a kit installed before this command

A kit whose framework predates `bootgly kit upgrade` has no such verb yet. Move it once by hand onto
the first release that ships it — every move after that is the command:

```bash :toolbar="true";
git fetch --tags
git checkout refs/tags/v1.0.0-beta.7
git submodule update
```

> [!NOTE]
> The command runs out of the very files it replaces, so the checkout is the last thing it does:
> nothing is loaded from the kit after it. Do not interrupt the two steps that follow "Upgrading
> the kit" — if the submodules fail to follow, the command prints the `git submodule update` to
> run, and the `git checkout` that goes back.

## Reference

```php
bootgly kit upgrade [<release>] [--json] [--yes]
```

Move the kit to the newest release — or to `<release>`, a tag name with or without its `v`
(`v1.0.0-beta.8`, `1.0.0-beta.8`). A release older than the current one is refused with the
`downgrade` command to run instead.

```php
bootgly kit downgrade [<release>] [--json] [--yes]
```

Move the kit to the release just below the current one — or to `<release>`. A release newer than
the current one is refused with the `upgrade` command to run instead. A kit that is on no release
(and has no framework pin to be located by) must name the release.

```php
bootgly kit boot [--resources]
```

Lay down the kit's resource directories — the framework's `scripts/` template, the `storage/`
layout, and `projects/` with the empty registry — each only where it does not exist yet. `--resources` names the
default (and, today, the only) set. Refused in the framework checkout, whose directories are the
templates. No `--json` form.

```php
bootgly kit list [--json]
```

Print the releases the kit can move to, newest first, marking the current one — nothing moves.
Like the other verbs it fetches the release tags first, adding the `bootgly` remote to a kit that
has none pointing at the canonical repository.

Options — `--json` on every verb but `boot`, `--yes` on `upgrade` and `downgrade` only:

| Option | Meaning |
|---|---|
| `--json` | machine output: one JSON document, no confirmation asked (`--yes` or a refusal) |
| `--yes` | answer every confirmation of a move: running instances, a major crossing, a release that predates the command |

The releases come from the repository every kit descends from, `https://github.com/bootgly/bootgly.kit`,
through the remote that points at it — added as `bootgly` when none does — and only the tags that
repository advertises count: a tag from a fork or a mirror is never a release. A remote that
cannot be reached lets `list` show the releases already known locally, marked unverified; a move
waits until the repository is reachable again.

```php
Bootgly\ABI\Data\SemVer::parse (string $version): null|SemVer
```

The value behind the ordering: a Semantic Versioning 2.0.0 primitive (optional leading `v`),
`null` when the string is not a version. `compare (SemVer $Other): int` orders two versions by
§11 precedence — build metadata never counts.

```php
Bootgly\ACI\VCS->__construct (string $path, null|string $binary = null)
```

The git module the command is built on — with `SemVer`, the only dependency created for it:
`$VCS->Git` runs one git command per child process without a shell (`execute()`, `query()`,
`resolve()`, `describe()`, `inspect()`, `fetch()`, `checkout()`), `$VCS->Tags->list()` reads the
version-shaped tags newest first with their commits and `read()` an annotated tag's notes,
`$VCS->Remotes` lists, finds and adds remotes, `$VCS->Submodules` inspects and updates the
submodules the tree declares.

## Next references

- **[Logs CLI](/guide/logs/overview/)** — follow the instances you reload after a move.
- **[Console Platform](/guide/console-platform/overview/)** — console projects and their lifecycle.
