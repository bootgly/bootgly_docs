# Linter

`bootgly lint imports` reads the `use` statements of your PHP files and reports — or fixes —
everything about them that Bootgly's code style pins down: imports that are missing, imports
nothing uses any more, and imports in the wrong order.

It is a code-style tool, not a static analyser. It never changes a line of your logic; it only
rewrites the import block between the `namespace` declaration and your first entity.

## Check your code

Run it with no arguments to lint the framework's own `Bootgly/` tree:

```bash
bootgly lint imports
```

Point it anywhere to lint your own code — a directory or a single file:

```bash
bootgly lint imports app/
bootgly lint imports app/Services/Billing.php
```

Every violation is printed with its file, line and the exact statement it is talking about:

```text
 app/Services/Billing.php
  ✗ Line 17: Unused import: use function array_column;
  ✗ Line 21: Missing import: use function number_format;
```

Nothing is written. `vendor/`, `tests/` and `examples/` directories are skipped.

## Fix it automatically

Add `--fix` to rewrite the import blocks in place:

```bash
bootgly lint imports app/ --fix
```

To see what it would do first, without touching a byte:

```bash
bootgly lint imports app/ --dry-run
```

A fix is only written when the rewritten file still parses as PHP, so a run can never leave
you with a broken file.

## What it catches

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

## What it will never remove

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

## When it leaves a file alone

If your import block contains a comment, the whole block is reported and left untouched:

```text
  ✗ Line 16: Comment inside the import block: reordering would drop it, so the block
             is left untouched — move the comment above or below it
```

Reordering the block means regenerating it, and a comment has no defined place in the
regenerated output — nor any safe guess, since the import it describes may move to a different
section. Move the comment above or below the block and the file becomes fixable again.

## Reference

```bash
bootgly lint imports [path]
```

Lints the `use` statements of every PHP file under `path`. Defaults to `Bootgly/` relative to
the working directory; a relative path is resolved against it, an absolute path is used as
given. A single file is accepted in place of a directory.

```bash
--fix
```

Rewrites each file's import block in place: removes unused imports, adds missing ones, strips
backslash prefixes, and reorders what is left. Only written when the result still parses.

```bash
--dry-run
```

Reports what `--fix` would change and writes nothing.

```bash
--help, -h
```

Shows the command's usage and examples.

### Issue types

These are the `type` values in the machine-readable report, which is what you get when the
command detects it is running under an AI agent:

| Type | Meaning |
|---|---|
| `missing_import` | A symbol is used with no `use` statement for it |
| `unused_import` | A `use` statement whose name appears nowhere in the file |
| `backslash_prefix` | A symbol reached through `\` instead of an import |
| `wrong_order` | The const → function → class order is broken |
| `global_not_first` | A global import sits after a namespaced one of the same kind |
| `not_alphabetical` | Two imports of the same kind are out of order |
| `comment_in_imports` | The block carries a comment, so it was not rewritten |
