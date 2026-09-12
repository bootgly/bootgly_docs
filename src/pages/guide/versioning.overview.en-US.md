# Versioning

Bootgly follows [Semantic Versioning 2.0.0](https://semver.org/). This page is the compatibility
promise behind a version number: what an upgrade may change, what it may not, how long a
release is supported, and how a deprecated API leaves the framework.

## What a version number promises

| Bump | Example | What may change |
| --- | --- | --- |
| **Patch** | `1.2.3` → `1.2.4` | Repairs to existing behavior. Nothing documented changes its meaning. |
| **Minor** | `1.2.4` → `1.3.0` | New capabilities. Everything that worked and was documented keeps working the same way. |
| **Major** | `1.3.0` → `2.0.0` | Removals, renames, changed semantics — anything that can break an application. |

Concretely, the following are **major** changes and never ship in a `1.x` release:

- Removing or renaming a public class, method, property, config key, CLI command or option.
- Changing the established semantics of a public API — a different return, a different default,
  a different side effect for the same documented call.
- Adding a required method to an interface that applications implement (a handler, a driver,
  a middleware contract).
- Breaking wire or storage compatibility: a cache record, a session, a queue job or a PID/state
  file written by `1.x` is readable by every later `1.x`.

And these are **not** breaking changes — a minor or a patch may do them:

- Adding methods, properties, config keys, commands or optional parameters.
- Tightening validation of input the documentation already declared invalid.
- Fixing a behavior that contradicted its documentation (the documentation is the contract).
- Changing anything undocumented or marked `@internal`.

## Upgrading

Between `1.x` minors, an upgrade is a version bump, not a migration:

```bash
composer require bootgly/bootgly:^1.3
bootgly test <suite>      # your own suites
```

Read the release notes on the [GitHub release](https://github.com/bootgly/bootgly/releases) —
they are the changelog — and act on any deprecation notice they carry. A kit-based platform
upgrades its pinned framework with `bootgly kit upgrade`.

## What is public API

The public API is **what the documentation describes**: the guides and the manual on this site,
the PHPDoc of public members, the CLI `--help` output, and the documented configuration keys.
A class or method being `public` in PHP does not make it public API on its own — if it is not
documented, or is marked `@internal`, it may change in any release.

## Deprecation policy

- A replaced API is **deprecated in the minor that ships its replacement**: the docs say so,
  the release notes list it, and using it emits an `E_USER_DEPRECATED` notice where a runtime
  hook exists.
- **A deprecation never authorizes a removal in the next minor.** The deprecated way keeps
  working, unchanged, until the next major.
- The next major (`2.0.0`) removes what was deprecated during `1.x` — nothing that was not
  deprecated first is removed.

## Support policy

| Version | Bug fixes | Security fixes |
| --- | --- | --- |
| Latest `1.x` minor | ✅ | ✅ |
| Older `1.x` minors | ❌ | ❌ — upgrade to the latest minor |
| `-beta` / `-rc` pre-releases | until the release they precede ships | until the release they precede ships |
| `0.x` | ❌ | ❌ |

Fixes ship as **patch releases of the latest minor**; there are no backports. Because a minor
upgrade is designed to be a version bump, staying current is the supported path. `1.0` is
**not** a long-term-support line: an LTS line may be declared for a later minor, and would be
announced in the release notes and listed here; it is not promised.

Each `1.x` minor tracks the **two newest PHP minors** (`8.4+` at `1.0`). Dropping a PHP version
the framework still supports is a major change; adopting a new one is a minor.

## Pre-releases

`-beta.N` and `-rc.N` tags precede a release and carry no compatibility promise between one
another. They are supported only until the release they precede ships. On Docker Hub a
pre-release never moves `latest` or the `1`/`1.x` aliases — only the exact tag and the
`beta`/`rc` channel alias.

The platform repositories (`bootgly-console`, `bootgly-web`) and the starter kit
(`bootgly.kit`) are tagged in lockstep with the framework and follow the same rules.

## Reference

### Version string

```text
{MAJOR}.{MINOR}.{PATCH}[-{beta|rc}.{N}]
```

The git tag carries a `v` prefix (`v1.2.3`); `BOOTGLY_VERSION` and Docker tags do not. Between
releases `main` reports the next target with a `-dev` suffix (`1.3.0-dev`); that string is never
tagged or published.

### Commit convention

```text
<type>(<scope>): <description>
```

[Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/). `feat` lands in a
minor, `fix` in a patch, `!` or a `BREAKING CHANGE:` footer in a major.

### Security policy

```text
https://github.com/bootgly/bootgly/blob/main/.github/SECURITY.md
```

Supported versions for security fixes, the private reporting channels and the audit history.
See also the [Security guide](/guide/security/overview/).
