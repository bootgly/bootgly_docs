# Linter

`bootgly lint check` reads your PHP files and reports — or fixes — what Bootgly's code style pins
down. Which rules run, over which paths, and where a rule is waived, is written once in a
`bootgly.Lint.php` file, so every run — yours, your CI's, your AI agent's — enforces the same thing.

| Rule | What it enforces | Fixable |
|---|---|---|
| `imports` | `use` statements: missing, unused, backslash-prefixed, misordered | yes |
| `nullables` | No nullable shorthand — `?T` is written `null\|T` | yes |
| `promotions` | No constructor property promotion | check-only |
| `methods` | Method names are one word, a verb in its base form | check-only |
| `spacing` | One space before a declaration's parameter list, none before a call's | yes |
| `casing` | Object and object-collection names start uppercase; acronyms are uppercase | check-only |
| `sections` | Properties grouped under `// * Config`, `// * Data`, `// * Metadata` | check-only |

It is a code-style tool, not a static analyser. It never changes a line of your logic: a fixable
rule rewrites exactly the construct it reports and nothing else, and a check-only rule writes
nothing at all.

Every rule works on PHP's own tokens, never on the raw text — so a `?` is reported as a nullable
shorthand only when PHP parsed it as one, and `fooBar` is reported only when it is a method being
declared, never when it is one being called.

## Check your code

Write a `bootgly.Lint.php` at the root of your code — it returns the configuration:

```php
<?php

use Bootgly\ABI\Syntax\Analyzers\Rules;
use Bootgly\ABI\Syntax\Lint;

return new Lint(
   version: 1,
   paths: ['app/'],
   excludes: ['**/vendor/**'],
   rules: Rules::cases()
);
```

Then run the check from that directory, or from any directory below it:

```bash
bootgly lint check
```

Every violation is printed with its file, line, rule and the exact construct it is talking about:

```text
Lint > Check (imports, nullables, promotions, methods, spacing, casing, sections)
───────────────────────────────────────
Config: bootgly.Lint.php

app/Services/Billing.php
  ✗ Line 13: [imports] Missing import: use function strlen;
  ✗ Line 10: [nullables] Nullable shorthand in parameter type: ?int → use null|int
  ✗ Line 10: [methods] Multi-word method name: chargeCard() → use a single-word verb
  ✗ Line 10: [spacing] Declaration spacing: chargeCard(...) → one space before the parameter list
  ✗ Line 13: [spacing] Call spacing: strlen (...) → no space before the argument list
  ✗ Line 12: [casing] Object variable name starts lowercase: $request → $Request
  ✗ Line 8: [sections] Property outside a section: $count → group it under // * Config, // * Data or // * Metadata

Found 7 issue(s) in 1 file(s).
```

Nothing is written. The command exits non-zero whenever an issue remains, so the same line gates a
commit hook or a CI lane:

```bash
bootgly lint check || exit 1
```

Name a file or a directory to check only part of the configured paths:

```bash
bootgly lint check app/Services/
bootgly lint check app/Services/Billing.php
```

`version`, `paths`, `excludes` and `rules` are all the file needs to start; the
[Lint manual](/manual/ABI/Syntax/Lint/overview/) covers every entry, the patterns and how the file
is found. A broken `bootgly.Lint.php` — a parse error, a malformed entry, a format `version` this
Bootgly does not read — fails the run: it never falls back to the defaults. With no
`bootgly.Lint.php` at all, `check` runs `imports`, `nullables`, `promotions` and `methods` over the
framework's `Bootgly/` tree, or over your project inside a kit.

### Inside a kit

`bootgly kit boot` writes `projects/bootgly.Lint.php` when there is none, with every rule enabled
over `projects/`. It is yours from then on: the kit never overwrites it. Stand in your project and
check it:

```bash
cd projects/App
php ../../bootgly lint check                 # the whole project
php ../../bootgly lint check Models/         # projects/App/Models
php ../../bootgly lint check Models/ --fix
```

`--fix` never rewrites the pinned framework and platform trees (`Bootgly/`, `Console/`, `Web/`):
they are submodules, and a rewritten one would block the next `bootgly kit upgrade`.

## Fix it automatically

`imports`, `nullables` and `spacing` rewrite in place with `--fix`:

```bash
bootgly lint check --fix
```

To see what it would do first, without touching a byte:

```bash
bootgly lint check --dry-run
```

A fix is only written when the rewritten file still parses as PHP, so a run can never leave you
with a broken file. The file is analyzed again after the rewrite: what the check-only rules
report — or what a fix could not settle — is still listed, and still fails the run.

## Waive a rule where it must not apply

There are no inline ignore comments. When a rule must not apply somewhere — a name an external
SDK calls, a property kept public for compatibility — record an `Exemption` in
`bootgly.Lint.php`: the rule, the path, optionally the symbol, and always the reason.

```php
use Bootgly\ABI\Syntax\Lint\Exemption;

return new Lint(
   version: 1,
   paths: ['app/'],
   rules: Rules::cases(),
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

`symbol` is `name`, `Class::name` or `Class::$name`; without it, every issue of that rule in the
matched files is waived. An exemption that no longer waives anything is **stale** and fails the
run until you remove it — so the waivers never outlive the code they were written for.

## Imports

The `imports` rule reads the `use` statements between the `namespace` declaration and your first
entity. Global classes are not checked: import them yourself (`use DateTime;`).

### What it catches

| | |
|---|---|
| **Missing import** | A global function or constant used without a `use` statement |
| **Unused import** | A `use` statement nothing in the file names any more |
| **Backslash prefix** | `\fclose($handle)` instead of an explicit import |
| **Wrong order** | `use function` before `use const`, or a class before a function |
| **Global not first** | A global import placed after a namespaced one of the same kind |
| **Not alphabetical** | Two imports of the same kind out of alphabetical order |

The order Bootgly expects, top to bottom: constants, then functions, then classes — globals
first as one block, then a blank line, then the namespaced ones in the same three-part order.

### What it will never remove

Deciding an import is unused is the one judgement in this tool that can delete working code,
so it is made the safe way round: an import is reported unused only when its name appears
**nowhere else in the file**, in any form.

That means all of these keep their import, even though none of them is a call or a `new`:

```php
use Bootgly\ACI\Logs\Logger;

class Billing
{
   public Logger $Logger;                            // a property type

   public function charge (Logger $Logger): Logger   // a parameter and a return type
   {
      try {
         // ...
      }
      catch (Logger $Failure) { }                    // a catch clause

      return $Logger;
   }
}
```

Type declarations, `catch` clauses, attributes, trait `use` inside a class body, and the first
segment of a qualified name such as `extends Logger\Channel` all count as usage.

**So do docblocks.** An import named only in a `@param`, `@return`, `@var` or `@throws` line is
kept, because your static analyser reads those lines even though PHP does not:

```php
use Bootgly\ACI\Logs\Logger;

/**
 * @param Logger $Logger        ← this alone keeps the import
 */
public function attach ($Logger): void {}
```

The deliberate consequence is that the linter under-reports rather than over-reports: a name
that happens to collide with a word in a comment keeps its import alive. Missing a cleanup
costs you one dead line; removing a live import costs you a broken build — so it errs toward
the first.

### When it leaves a file alone

If your import block contains a comment, the whole block is reported and left untouched:

```text
  ✗ Line 16: Comment inside the import block: reordering would drop it, so the block
             is left untouched — move the comment above or below it
```

Reordering the block means regenerating it, and a comment has no defined place in the
regenerated output — nor any safe guess, since the import it describes may move to a different
section. Move the comment above or below the block and the file becomes fixable again.

## Nullables

The `nullables` rule reports every nullable shorthand `?T` in a parameter, return or
property type. Bootgly writes the union, `null|T`, so a nullable type reads like every other
union and `null` is never hidden in one character:

```php
// ✗ reported
public function find (?int $id): ?User
{
   // ...
}

private ?Logger $Logger = null;

// ✓ what --fix writes
public function find (null|int $id): null|User
{
   // ...
}

private null|Logger $Logger = null;
```

Promoted constructor parameters, `readonly`, `static`, asymmetric-visibility properties,
by-reference and variadic parameters, closures, arrow functions and `?static` returns are all
covered, and a space after the `?` (`? int`) is handled.

Only type declarations are reported. A `?` that PHP parsed as something else is never touched:

```php
$label = $count ? 'many' : 'one';   // a ternary
$name  = $given ?: 'anonymous';     // a short ternary
$port  = $config['port'] ?? 8080;   // null coalescing
$size  = $file?->size;              // a nullsafe access
```

`--fix` rewrites `?T` as `null|T`, consuming the `?` and any whitespace after it. Nothing else
in the line moves.

## Promotions

The `promotions` rule reports every constructor parameter that carries a visibility,
`readonly` or asymmetric-set modifier — constructor property promotion:

```php
// ✗ reported, once per promoted parameter
public function __construct (
   private readonly Logger $Logger,
   protected(set) int $retries = 3,
   int $timeout = 30                  // a plain parameter — not reported
) {}

// ✓ what Bootgly writes instead
// * Data
private readonly Logger $Logger;
protected(set) int $retries;

public function __construct (Logger $Logger, int $retries = 3, int $timeout = 30)
{
   $this->Logger = $Logger;
   $this->retries = $retries;
}
```

Bootgly declares every property explicitly, in its section (`Config`, `Data`, `Metadata`),
with its own docblock — so the class reads as a class, not as a signature. That is also why
this rule is check-only: the declaration a fix would have to write needs a section and a
docblock no rewrite can choose for you.

Only `__construct` is examined; a modifier on any other function's parameter is not promotion
(and not valid PHP either).

## Methods

The `methods` rule reports every method whose name is more than one word — an uppercase letter
after the first character, or an underscore inside it — and every one-word name that is not a
verb in its base form. Bootgly names methods with a single verb and puts the context on the object
instead of in the name:

```php
// ✗ reported
public function renderHTML (): string {}   // more than one word
protected function getUserData (): array {}
public function loaded (): bool {}         // a past form

// ✓ single verbs — the object carries the context
public function render (): string {}       // HTML->render()
protected function fetch (): array {}
public function load (): bool {}
```

A method that IS a loop or a continuous process may take the `-ing` form (`reading()`,
`routing()`). Only declarations inside a class, interface, trait or enum count (anonymous classes
included). A plain function, a closure, an arrow function, a call such as `$this->renderHTML()`, a
variable, a property or a trait alias is never reported.

### Names that are exempt

Two families of names are not the author's choice, so they are never reported:

- **Magic methods** — every `__*` name: `__construct`, `__toString`, `__get`, `__invoke`, ...
- **Names PHP imposes** — implementing one of PHP's own interfaces or extending one of its
  classes leaves no choice of name. They are exempt only in a class that `extends` or
  `implements` something — and in a trait, which is mixed into classes that may; in a class
  that inherits nothing, `getSize()` is the author's choice and is reported. The complete list,
  kept in one place in the analyzer:

| Interface / class | Exempt names |
|---|---|
| `IteratorAggregate` | `getIterator` |
| `ArrayAccess` | `offsetExists`, `offsetGet`, `offsetSet`, `offsetUnset` |
| `JsonSerializable` | `jsonSerialize` |
| `Throwable` | `getMessage`, `getCode`, `getFile`, `getLine`, `getTrace`, `getTraceAsString`, `getPrevious` |
| `Generator` | `getReturn` |
| `DateTimeInterface` | `getTimestamp`, `getTimezone`, `getOffset`, `setTimezone`, `setTimestamp`, `setDate`, `setTime` |
| `RecursiveIterator`, `OuterIterator`, `CachingIterator` | `getChildren`, `hasChildren`, `getFlags`, `setFlags`, `getSubIterator`, `getInnerIterator`, `hasNext` |
| `ArrayObject`, `ArrayIterator` | `getArrayCopy` |
| `SplFileInfo`, `SplFileObject` | `getRealPath`, `getPathname`, `getFilename`, `getExtension`, `isDir`, `isFile`, `isLink`, `getSize`, `getMTime`, `getCTime`, `getATime`, `getPerms`, `getInode`, `getOwner`, `getGroup`, `getType`, `isReadable`, `isWritable`, `isExecutable`, `getBasename`, `getPath`, `getPathInfo`, `getFileInfo`, `openFile`, `setFileClass`, `setInfoClass` |

The comparison is case-insensitive, as PHP resolves method names. Renaming a method means
renaming every caller, which is why this rule is check-only.

## Spacing

The `spacing` rule tells a declaration from a call by the space before the parenthesis:

```php
// ✓
public function charge (int $amount): int     // a declaration: one space
{
   $Closure = function ($value) {};           // closures and arrow functions too
   return $this->round($amount);              // a call: no space
}

// ✗ reported, and fixed by --fix
public function charge(int $amount): int
return $this->round ($amount);
```

Calls are functions and methods — names, qualified names, a variable called, `new X (`. Language
constructs are neither: control structures and `array (`, `list (`, `isset (`, `empty (`,
`unset (`, `eval (` keep whatever spacing they are written with.

## Casing

The `casing` rule reports names whose casing contradicts what they hold, where the tokens make it
knowable:

```php
// ✗ reported
public Request $request;             // typed with a class → $Request
$logger = new Logger();              // assigned `new` → $Logger
public string $url;                  // an acronym → $URL

// ✓
public Request $Request;
/** @var array<int,Request> */
public array $Requests = [];         // a collection of objects
$count = 0;                          // scalars stay lowercase
```

An object or object collection is a property or parameter typed with a class, an `array`
documented as a collection of one, or a variable assigned `new X`. A type that does not name one
class for certain — `object`, a union with a scalar, a plural type name such as an enum — is not
judged. The rule is check-only: a parameter or property name is part of a public API, so renaming
one is your call, or an exemption.

## Sections

The `sections` rule checks how a class lays out its properties: each one under a `// * Config`,
`// * Data` or `// * Metadata` header, the headers in that order and each at most once.

```php
class Server
{
   // * Config
   public string $host;              // a constructor input, publicly readable

   // * Data
   protected array $routes = [];     // other inputs and defaults

   // * Metadata
   public private(set) int $started = 0;   // derived — never written from outside
}
```

It also reports a Config property that is not publicly readable (it belongs in Data) and a
Metadata property that is publicly writable (restrict it with `private(set)`, `protected(set)` or
`readonly`). Which section a property belongs to is your judgement — the rule checks only that
the layout keeps it.

## The per-rule subcommands

`bootgly lint imports`, `nullables`, `promotions` and `methods` still work, with the same
arguments as before, and print a deprecation notice: they are kept until 2.0 as wrappers over
`check` restricted to their rule. Use `bootgly lint check` in new scripts.

## Machine-readable report

When the command detects it is running under an AI agent (the `AI_AGENT` environment variable,
or the marker your agent sets), it prints one JSON document instead of the human report:

```json
{
   "command": "check",
   "rules": ["imports", "nullables", "promotions", "methods", "spacing", "casing", "sections"],
   "config": "bootgly.Lint.php",
   "result": "failed",
   "agent": "1",
   "mode": "check",
   "files": { "scanned": 12, "failed": 1, "fixed": 0, "skipped": 0 },
   "issues": { "total": 1, "unresolved": 1, "exempted": 0 },
   "report": [
      {
         "file": "app/Services/Billing.php",
         "issues": [
            {
               "rule": "nullables",
               "type": "nullable_shorthand",
               "symbol": "int",
               "kind": "parameter",
               "line": 17,
               "message": "Nullable shorthand in parameter type: ?int → use null|int"
            }
         ],
         "fixed": false
      }
   ],
   "skipped": [],
   "exemptions": { "applied": 0, "stale": [] }
}
```

`result` is `passed` only when nothing is left: no unresolved issue and no stale exemption. A
`--dry-run`, a check that found something, or a `--fix` that left something behind keep it at
`failed`, and `issues.unresolved` says how many remain; `issues.exempted` counts the issues the
exemptions waived. `mode` is `check`, `dry-run` or `fix`. A file an analyzer declines — `imports`
declines one that declares more than one namespace, since its imports are per block — is listed
under `skipped` with the reason, and never turns the run green by silence nor red by itself.

## Reference

```bash
bootgly lint check [path]
```

Runs every rule the nearest `bootgly.Lint.php` enables over every path it configures, or over
`path` — a file or directory inside them, relative to the working directory. Exits non-zero when
an issue remains or an exemption is stale. Without a `bootgly.Lint.php`, runs `imports`,
`nullables`, `promotions` and `methods` over `Bootgly/`, or inside a kit over the directory under
`projects/` it runs from.

```bash
--fix
```

Rewrites each reported file in place for the fixable rules (`imports`, `nullables`, `spacing`).
Only written when the result still parses. In a kit, never rewrites `Bootgly/`, `Console/` or
`Web/`.

```bash
--dry-run
```

Reports what `--fix` would change and writes nothing.

```bash
--help, -h
```

Shows the command's usage and examples.

```bash
bootgly lint imports|nullables|promotions|methods [path]
```

Deprecated — kept until 2.0. Runs `check` restricted to that one rule.

### Issue types

These are the `type` values in the machine-readable report:

| Type | Rule | Meaning |
|---|---|---|
| `missing_import` | `imports` | A symbol is used with no `use` statement for it |
| `unused_import` | `imports` | A `use` statement whose name appears nowhere in the file |
| `backslash_prefix` | `imports` | A symbol reached through `\` instead of an import |
| `wrong_order` | `imports` | The const → function → class order is broken |
| `global_not_first` | `imports` | A global import sits after a namespaced one |
| `not_alphabetical` | `imports` | Two imports of the same kind are out of order |
| `comment_in_imports` | `imports` | The block carries a comment, so it was not rewritten |
| `nullable_shorthand` | `nullables` | A `?T` type; `kind` is `parameter`, `return` or `property` |
| `promoted_property` | `promotions` | A promoted constructor parameter; `kind` is its modifiers |
| `multiword_method` | `methods` | A method name of more than one word |
| `verb_form` | `methods` | A one-word method name that is not a base-form verb |
| `declaration_spacing` | `spacing` | A declaration with no space before its parameter list |
| `call_spacing` | `spacing` | A call with a space before its argument list |
| `object_case` | `casing` | An object or object collection named in lowercase |
| `acronym_case` | `casing` | An acronym not written in uppercase |
| `unsectioned_property` | `sections` | A property under no section header |
| `section_order` | `sections` | A section header out of order, or repeated |
| `config_hidden` | `sections` | A Config property that is not publicly readable |
| `metadata_writable` | `sections` | A Metadata property that is publicly writable |
