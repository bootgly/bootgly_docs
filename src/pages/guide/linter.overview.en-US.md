# Linter

`bootgly lint` reads your PHP files and reports — or fixes — what Bootgly's code style pins
down. It has four submodules, one per rule:

| Submodule | Rule | Fixable |
|---|---|---|
| `imports` | `use` statements: missing, unused, backslash-prefixed, misordered | yes |
| `nullables` | No nullable shorthand — `?T` is written `null\|T` | yes |
| `promotions` | No constructor property promotion | check-only |
| `methods` | Method names are a single word — no camelCase | check-only |

It is a code-style tool, not a static analyser. It never changes a line of your logic: the two
fixable submodules rewrite exactly the construct they report and nothing else, and the two
check-only ones write nothing at all.

Every submodule works on PHP's own tokens, never on the raw text — so a `?` is reported as a
nullable shorthand only when PHP parsed it as one, and `fooBar` is reported only when it is a
method being declared, never when it is one being called.

## Check your code

Run a submodule with no path to lint the framework's own `Bootgly/` tree:

```bash
bootgly lint imports
bootgly lint nullables
bootgly lint promotions
bootgly lint methods
```

Point it anywhere to lint your own code — a directory or a single file:

```bash
bootgly lint nullables app/
bootgly lint methods app/Services/Billing.php
```

Every violation is printed with its file, line and the exact construct it is talking about:

```text
 app/Services/Billing.php
  ✗ Line 17: Unused import: use function array_column;
  ✗ Line 21: Missing import: use function number_format;
```

Nothing is written. `vendor/`, `examples/` and `vs/` directories inside the scanned path are
skipped — tests are code and are linted like the rest, and the path you name is always scanned,
whatever its ancestors are called. The command exits non-zero whenever issues remain, in every mode, so a
check can gate a commit or a CI lane; a path that does not exist fails too, never a silent green:

```bash
for submodule in imports nullables promotions methods; do
   bootgly lint "$submodule" app/ || exit 1
done
```

## Fix it automatically

`imports` and `nullables` rewrite in place with `--fix`:

```bash
bootgly lint imports app/ --fix
bootgly lint nullables app/ --fix
```

To see what it would do first, without touching a byte:

```bash
bootgly lint nullables app/ --dry-run
```

A fix is only written when the rewritten file still parses as PHP, so a run can never leave
you with a broken file.

`promotions` and `methods` are check-only. Passing `--fix` or `--dry-run` to them is not an
error: the command says the submodule is check-only, runs the check, and writes nothing.

## Imports

`bootgly lint imports` reads the `use` statements between the `namespace` declaration and your
first entity.

### What it catches

| | |
|---|---|
| **Missing import** | A global function, class or constant used without a `use` statement |
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

`bootgly lint nullables` reports every nullable shorthand `?T` in a parameter, return or
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

`bootgly lint promotions` reports every constructor parameter that carries a visibility,
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
this submodule is check-only: the declaration a fix would have to write needs a section and a
docblock no rewrite can choose for you.

Only `__construct` is examined; a modifier on any other function's parameter is not promotion
(and not valid PHP either).

## Methods

`bootgly lint methods` reports every method whose name is more than one word — an uppercase
letter after the first character, the camelCase seam. Bootgly names methods with a single verb
and puts the context on the object instead of in the name:

```php
// ✗ reported
public function renderHTML (): string {}
public function buildRoute (): Route {}
protected function getUserData (): array {}

// ✓ single verbs — the object carries the context
public function render (): string {}     // HTML->render()
public function build (): Route {}       // Route->build()
protected function fetch (): array {}
```

Only declarations inside a class, interface, trait or enum count (anonymous classes included).
A plain function, a closure, an arrow function, a call such as `$this->renderHTML()`, a
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
renaming every caller, which is why this submodule is check-only.

## Machine-readable report

When the command detects it is running under an AI agent (the `AI_AGENT` environment variable,
or the marker your agent sets), it prints one JSON document instead of the human report:

```json
{
   "result": "failed",
   "submodule": "nullables",
   "fixable": true,
   "agent": "1",
   "mode": "check",
   "files": { "scanned": 12, "failed": 1, "fixed": 0, "skipped": 0 },
   "issues": { "total": 1, "unresolved": 1 },
   "report": [
      {
         "file": "app/Services/Billing.php",
         "issues": [
            {
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
   "skipped": []
}
```

`result` is `passed` only when nothing is left: no issue found, or — in `fix` mode — every
reported file rewritten and clean when analyzed again (a rewrite counts as fixed only once it
resolved the issues; a formatter that had nothing to change leaves the file untouched, and so
does one that is not writable). Should a rewrite leave issues behind, the file stays rewritten,
`fixed` is `false` and the report lists what remains as the file now stands. A `--dry-run`, a check that found something, or a `--fix` that left a
file untouched (a comment in its import block, a rewrite that would not parse) keep `result` at
`failed`, and `issues.unresolved` says how many remain. `mode` is `check`, `dry-run` or `fix` — a
check-only submodule reports `check` even when `--fix` was passed, and `fixable` says which kind
of submodule you ran. A path with no PHP files answers the same document with `files.scanned`
at `0`; a path that does not exist adds a `message` and fails. A file an analyzer declines —
`imports` declines one that declares more than one namespace, since its imports are per block —
is listed under `skipped` with the reason, counted in `files.skipped`, and never turns the run
green by silence nor red by itself. The same bucket holds a name the command itself would not
read — one that stopped being a regular file (a link planted after the scan started).

## Reference

```bash
bootgly lint imports [path]
```

Lints the `use` statements of every PHP file under `path`. Defaults to `Bootgly/` relative to
the working directory; a relative path is resolved against it, an absolute path is used as
given. A single file is accepted in place of a directory. Fixable.

```bash
bootgly lint nullables [path]
```

Reports every `?T` in a parameter, return or property type under `path`. Same path rules.
Fixable: `--fix` rewrites each one as `null|T`.

```bash
bootgly lint promotions [path]
```

Reports every promoted constructor parameter under `path`. Same path rules. Check-only.

```bash
bootgly lint methods [path]
```

Reports every multi-word method name under `path`, magic and PHP-imposed names excepted. Same
path rules. Check-only.

```bash
--fix
```

Rewrites each reported file in place — the import block for `imports`, each `?T` for
`nullables`. Only written when the result still parses. Ignored, with a notice, by the
check-only submodules.

```bash
--dry-run
```

Reports what `--fix` would change and writes nothing. Ignored, with a notice, by the check-only
submodules.

```bash
--help, -h
```

Shows the command's usage and examples; `bootgly lint <submodule> --help` shows one submodule's.

### Issue types

These are the `type` values in the machine-readable report:

| Type | Submodule | Meaning |
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
| `multiword_method` | `methods` | A camelCase method name; `kind` is `method` |
