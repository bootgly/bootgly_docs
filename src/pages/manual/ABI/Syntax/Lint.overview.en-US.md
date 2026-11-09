# Lint

`Lint` is the configuration of `bootgly lint check`: which trees are linted, which paths are
skipped, which rules are enforced and which waivers are recorded. You write it once, in a
`bootgly.Lint.php` file at the root of your tree, and every run — yours, your CI's, your AI
agent's — enforces the same thing.

Without a `bootgly.Lint.php`, `bootgly lint check` keeps the defaults: the four original rules
(`imports`, `nullables`, `promotions`, `methods`) over the framework's `Bootgly/` tree, or over
your project inside a kit, skipping every `vendor/`, `examples/` and `vs/` directory. With a
`bootgly.Lint.php`, nothing under its directory is skipped behind your back: what is not checked
there is what `excludes` lists (a path outside that directory keeps the built-in skips).

## Run the check

```bash
bootgly lint check
```

`check` runs every enabled rule over every configured path and prints each violation with its
file, line and rule:

```text
Lint > Check (imports, nullables, spacing, methods)
───────────────────────────────────────
Config: bootgly.Lint.php

app/Services/Billing.php
  ✗ Line 8: [spacing] Declaration spacing: charge(...) → one space before the parameter list
  ✗ Line 17: [methods] Method name is not a base-form verb: loaded() is a past form → name the action in the infinitive

Found 2 issue(s) in 1 file(s).
1 issue(s) waived by exemptions.
```

The command exits with status `1` when any issue remains or any exemption is stale, so it can
gate a CI job as it is.

Two options rewrite what the fixable rules report — and nothing else:

```bash
bootgly lint check --dry-run   # report what --fix would rewrite, write nothing
bootgly lint check --fix       # rewrite the fixable issues in place
```

A rewritten file is checked with `php -l` before it replaces the original, and is analyzed
again afterwards: what a fix could not settle is still reported. Check-only rules are never
rewritten. Inside a kit, `--fix` never rewrites the pinned framework and platform trees
(`Bootgly/`, `Console/`, `Web/`): a run whose paths hold one is refused up front unless an
exclude covers that whole tree (`Bootgly/`, not `Bootgly/*`), and any file of a pinned tree that
still reaches the fix is left untouched — its issues stay, and the run fails.

## Write a bootgly.Lint.php

The file returns a `Lint`. Every path and pattern in it is relative to the directory of the
file:

```php
<?php

use Bootgly\ABI\Syntax\Analyzers\Rules;
use Bootgly\ABI\Syntax\Lint;
use Bootgly\ABI\Syntax\Lint\Exemption;

return new Lint(
   version: 1,
   paths: ['app/'],
   excludes: ['**/tests/fixtures/**'],
   rules: [Rules::Imports, Rules::Nullables, Rules::Spacing, Rules::Methods],
   Exemptions: [
      new Exemption(
         rule: Rules::Methods,
         path: 'app/Services/Billing.php',
         reason: 'Called by the payment gateway SDK by this name',
         symbol: 'Billing::onPaid'
      ),
   ]
);
```

- `version` — the format the file is written in. Required: this Bootgly reads version `1`, and
  any other value fails the run, so a file written for a later format is never misread.
- `paths` — the trees checked: directories or files, plain relative paths (no wildcards, no
  `..`, `.` or empty segments inside); `.` alone is the file's own directory. At least one.
- `excludes` — patterns of the paths never checked (see *Patterns* below).
- `rules` — the rules enforced, in order, each once. When omitted: `imports`, `nullables`,
  `promotions` and `methods`.
- `Exemptions` — the recorded waivers (see *Waive a rule where it must not apply*).

## Choose the rules

| Rule | What it enforces | Fixable |
|---|---|---|
| `Rules::Imports` | `use` statements: missing, unused, backslash-prefixed, misordered | yes |
| `Rules::Nullables` | No nullable shorthand — `?T` is written `null\|T` | yes |
| `Rules::Promotions` | No constructor property promotion | check-only |
| `Rules::Methods` | Method names are a single word, and that word is a verb in its base form (`load()`, not `loaded()`, `status()` or `isReady()`); the `-ing` form is kept for loops (`reading()`) | check-only |
| `Rules::Spacing` | One space before a declaration's parameter list (`function charge (`), none before a call's arguments (`charge(`); language constructs (`array (`, `isset (`, `if (`, …) keep the spacing they are written with | yes |
| `Rules::Casing` | An object or object collection the tokens type starts uppercase — a property or parameter typed with a class or documented as a collection of one, a variable assigned `new X` (`$Request`, `$Requests`); an acronym is uppercase (`$URL`, `$SQL`) | check-only |
| `Rules::Sections` | Properties are grouped under `// * Config`, `// * Data` and `// * Metadata`, in that order; Config is publicly readable, Metadata is never publicly writable | check-only |

Names whose form is imposed by PHP or by a contract — magic methods, `getIterator()`,
`offsetGet()`, `jsonSerialize()`, the stream wrapper methods (`stream_open()`, `url_stat()`, …)
— are never reported by `methods`.

## Patterns

`excludes` and the `path` of an exemption are patterns matched against the path of each file,
relative to the `bootgly.Lint.php` directory. A pattern is anchored at that directory: `vendor/`
is the `vendor/` beside the file, not one deeper in the tree — write `**/vendor/` for every one:

| Pattern | Matches |
|---|---|
| `vendor/` | the directory and everything below it |
| `**/vendor/` | every `vendor/` directory, at any depth |
| `app/Legacy.php` | exactly that file |
| `app/*/Legacy.php` | `*` is any run of characters inside one segment |
| `app/Model?.php` | `?` is one character inside one segment |
| `**/tests/fixtures/**` | `**` is zero or more whole segments |

A pattern always stays inside the tree: an absolute path, a `..` segment, a backslash or a
control character is refused when the configuration is built — and so is a `.` or empty segment
(`src/./gen/`, `src//gen/`), which would never match.

## Waive a rule where it must not apply

There are no inline ignore comments. A waiver is an `Exemption` in `bootgly.Lint.php` — the
rule, where, optionally what, and always why:

```php
new Exemption(
   rule: Rules::Casing,
   path: 'app/Bridges/**',
   reason: 'Mirrors the vendor SDK field names'
);
```

Without a `symbol`, every issue of the rule in the matched files is waived. A `symbol` narrows
the waiver inside those files:

| Symbol | Waives |
|---|---|
| `onPaid` | any reported symbol of that name |
| `Billing::onPaid` | that method (or other symbol) inside the class `Billing` |
| `Billing::$url` | that property or variable inside the class `Billing` |

Class and method names compare case-insensitively, as PHP resolves them; `$` names compare
exactly. An exemption must name a rule listed in `rules`, and a blank `reason` is refused.

An exemption that waives nothing is **stale**, and it fails the run until you remove it:

```text
✗ Stale exemption: methods app/Services/Billing.php Billing::onRefund — waives nothing in the files it matches
```

A full `check` (no path given) also reports an exemption whose pattern matches no checked file.

## Where the file is found

`bootgly lint check` looks for `bootgly.Lint.php` in the working directory and then in each
parent, up to the workspace root — never above it. The nearest one wins.

A `bootgly.Lint.php` that does not load fails the run: a parse error, a value that is not a
`Lint`, a malformed entry. The command never falls back to the defaults on a broken file:

```text
Malformed bootgly.Lint.php: Lint exemption for 'methods' at 'app/Services/Billing.php' needs a reason.
```

A file written for another format version fails the same way:

```text
Malformed bootgly.Lint.php: Lint version 2 is not supported: this Bootgly reads version 1.
```

Inside a kit, `bootgly kit boot` writes `projects/bootgly.Lint.php` when there is none — every rule
enabled over `projects/`. It never overwrites the file: from then on it is yours.

## Check a part of the tree

Pass a path to check only part of the configured trees:

```bash
bootgly lint check app/Services/
bootgly lint check app/Services/Billing.php
```

A relative path is read from the working directory. It must be inside a configured tree, or
hold some of them; anything else fails with
`Path outside the configured paths`, and a path that is not there fails with `Path not found`.
Excludes still apply.

## The per-rule subcommands

`bootgly lint imports`, `nullables`, `promotions` and `methods` still work, with the same
arguments as before, and print a deprecation notice: they are kept until 2.0 as wrappers over
`check` restricted to their rule. Their JSON report keeps its `submodule` and `fixable` keys and
gains `deprecated`, a `rule` in each issue, `issues.exempted` and `exemptions` — additions
only. Under a `bootgly.Lint.php` they honour its
excludes and the exemptions of their rule. Use `bootgly lint check` in new scripts.

## For AI agents

When an AI agent runs the command (`AI_AGENT=1`, or a known agent's environment), it prints one
JSON document. `check` opens it with the command, the rules run and the configuration loaded:

```json
{
  "command": "check",
  "rules": ["imports", "nullables", "spacing", "methods"],
  "config": "bootgly.Lint.php",
  "result": "failed",
  "agent": "claude",
  "mode": "check",
  "files": { "scanned": 1, "failed": 1, "fixed": 0, "skipped": 0 },
  "issues": { "total": 2, "unresolved": 2, "exempted": 1 },
  "report": [
    {
      "file": "app/Services/Billing.php",
      "issues": [
        {
          "rule": "methods",
          "type": "verb_form",
          "symbol": "loaded",
          "kind": "method",
          "line": 17,
          "message": "Method name is not a base-form verb: loaded() is a past form → name the action in the infinitive"
        }
      ],
      "fixed": false
    }
  ],
  "skipped": [],
  "exemptions": { "applied": 1, "stale": [] }
}
```

`skipped` lists the files an analyzer declined, with the reason. Each stale exemption is listed with its `rule`, `path`, `symbol`, `reason` and `why`.

## Reference

### Lint

```php
new Lint (int $version, array $paths, array $excludes = [], array $rules = [Rules::Imports, Rules::Nullables, Rules::Promotions, Rules::Methods], array $Exemptions = [])
```

Builds the configuration and checks every entry: `version` must be one of `Lint::VERSIONS`; each
other argument must be a list; `paths` holds at
least one plain relative path; `excludes` holds valid patterns; `rules` holds `Rules` cases, at
least one, none repeated; `Exemptions` holds `Exemption`s for enabled rules with valid patterns.
Anything else throws an `InvalidArgumentException` naming the entry.

```php
Lint::discover (string $directory, string $root): null|string
```

Returns the absolute path of the nearest `bootgly.Lint.php`, walking up from `$directory` to
`$root` inclusive, or `null` when there is none. A `$directory` outside `$root` searches only
`$root`.

```php
Lint::load (string $file): Lint
```

Requires the file in an isolated scope and returns the `Lint` it returns, with `file` set.
Throws an `UnexpectedValueException` when the file is missing or returns anything else; any
other error the file raises is thrown as it is.

```php
$Lint->exclude (string $path): bool
```

Tells whether a path, relative to the configuration's directory and `/`-separated, matches one
of the `excludes`.

```php
$Lint->select (Rules $rule, string $path): array
```

Returns the exemptions of `$rule` whose pattern matches the relative `$path`, keyed by their
index in `Exemptions`.

```php
Lint::VERSIONS    // [1] — the format versions this Bootgly reads
```

The format versions a `bootgly.Lint.php` may declare in `version`.

```php
$Lint->version    // int
$Lint->paths      // array<int,string>
$Lint->excludes   // array<int,string>
$Lint->rules      // array<int,Rules>
$Lint->Exemptions // array<int,Exemption>
$Lint->file       // null|string — the file it was loaded from
```

The configuration as built (read-only), and the file it was loaded from (`null` when it was
built in code).

### Exemption

```php
new Exemption (Rules $rule, string $path, string $reason, null|string $symbol = null)
```

One waiver. Throws an `InvalidArgumentException` when `$reason` is blank or `$symbol` is not
`name`, `Class::name` or `Class::$name`. Its arguments are readable as the properties `rule`,
`path`, `reason` and `symbol`.

```php
$Exemption->cover (Issue $Issue, string $class): bool
```

Tells whether the exemption covers an issue by its symbol, given the short name of the class
that encloses it (`''` when none). The rule and the path are matched by `Lint::select()`.

### Glob

```php
new Glob (string $pattern)
```

A pattern of `excludes` or of an exemption `path`. Throws an `InvalidArgumentException` when the
pattern is empty, absolute, climbs out of the tree with `..`, or carries a backslash, a
control character or a `.` or empty segment. `pattern` holds it as written, `regex` the expression it compiles to.

```php
$Glob->match (string $path): bool
```

Tells whether a relative, `/`-separated path matches the pattern.

### Rules

```php
enum Rules: string
```

`Bootgly\ABI\Syntax\Analyzers\Rules` — one case per rule: `Imports` (`'imports'`),
`Nullables` (`'nullables'`), `Promotions` (`'promotions'`), `Methods` (`'methods'`), `Spacing`
(`'spacing'`), `Casing` (`'casing'`) and `Sections` (`'sections'`).
