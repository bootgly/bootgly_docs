# Templates

Bootgly ships a native, dependency-free template engine at `Bootgly\ABI\Templates\Template`.
Templates are plain text with `@`-directives; the engine compiles them once to raw PHP, caches
the compiled file under `storage/cache/templates/` and recompiles automatically when the source
changes. Inheritance (`@extends`/`@section`/`@yield`), includes and components with slots,
HTML-escaped output and template-accurate error reporting come built in.

> [!NOTE]
> On the Web side, views rendered with `$Response->View->render()` are files of this same
> engine — everything below applies to `views/*.template.php` files too.

## Render your first template

A `Template` accepts an inline string or a `File`, and `render()` returns the output:

```php
use Bootgly\ABI\Templates\Template;

$Template = new Template('Hello, @> $name;!');

echo $Template->render(['name' => 'Bootgly']); // Hello, Bootgly!
```

To render a template file, pass a `File` (the conventional extension is `.template.php`):

```php
use Bootgly\ABI\IO\FS\File;
use Bootgly\ABI\Templates\Template;

$Template = new Template(new File(__DIR__ . '/welcome.template.php'));

echo $Template->render(['name' => 'Bootgly']);
```

The first render compiles and caches; later renders just `include` the compiled cache. Editing
the source file invalidates the cache automatically (mtime comparison) — long-running servers
pick up template edits without restarts.

## Output

Four raw output directives and one escaped output directive:

```text
@> $value;      output the expression
@>. $value;     output + line break after
@.> $value;     line break before + output
@.>. $value;    line break before and after
@>> $value;     output escaped with htmlspecialchars (HTML-safe)
```

Anything user-controlled that lands in HTML should go through `@>>`:

```php
$Template = new Template('<p>@>> $comment;</p>');

echo $Template->render(['comment' => '<script>alert(1)</script>']);
// <p>&lt;script&gt;alert(1)&lt;/script&gt;</p>
```

`@>` stays raw — reserve it for trusted markup.

## Control flow

Conditionals, switches and loops mirror PHP with `:` openers and `;` closers:

```text
@if $logged:
   Welcome back!
@else:
   Please sign in.
@if;

@foreach $users as $user:
   @> $user->name; (@> $@->iteration; of @> $@->count;)
@foreach;
```

Inside loops, the metavariable `$@` exposes `key`, `value`, `count`, `iteration`, `remaining`,
`isFirst`, `isLast`, `isOdd`, `isEven` — and `Parent`/`depth` in nested loops. Raw PHP blocks
open with `@:` and close with `@;`.

## Layouts and inheritance

Named templates (`@extends`, `@include`, `@component`) are resolved against a base directory,
`Template::$path`, appending the `.template.php` extension. Inside WPI views this is set for
you (the project `views/` directory); standalone, set it once:

```php
use Bootgly\ABI\Templates\Template;

Template::$path = __DIR__ . '/templates/';
```

A layout declares replaceable sections with `@yield` — `layouts/main.template.php`:

```text
<html>
<head><title>@yield title;</title></head>
<body>@yield content:No content provided.@yield;</body>
</html>
```

A child extends it and fills the sections — `home.template.php`:

```text
@extends layouts/main;

@section title:Home@section;

@section content:
<h1>Welcome!</h1>
@section;
```

```php
$Template = new Template(Template::resolve('home'));

echo $Template->render();
```

Rules of composition:

- The child renders first; output outside `@section` blocks is discarded when extending.
- Sections are **child-wins**: if a parent declares the same section, it acts as a default.
- `@yield name;` prints a section; the block form `@yield name: ... @yield;` provides default
  content used only when the section was not filled.
- Chains nest (`A extends B extends C`); cycles throw a `TemplateException`.

## Includes and components

`@include` renders another template inline, sharing the current variable scope:

```text
@include partials/alert;
@include partials/alert with ['level' => 'warning'];
```

Explicit `with` data wins over the shared scope.

`@component` renders a template against captured **slots** — content you write between the
opener and the closer:

```text
@component components/card:
   This body becomes the default slot.
   @slot header:Card title@slot;
@component;
```

The component template reads its slots with `@yield` (`slot` is the default slot's name) —
`components/card.template.php`:

```text
<div class="card">
   <header>@yield header;</header>
   <main>@yield slot;</main>
</div>
```

## Verbatim and directive escaping

To output a literal directive, double the `@` (`@@if`, `@@>`, `@@extends`, ...). To protect a
whole region from compilation, wrap it in a verbatim block:

```text
@!:
@if this is not compiled:
@> neither is this;
@if;
@!;
```

Everything between `@!:` and `@!;` passes through byte-for-byte.

## Compilation cache

Compiled templates live in `storage/cache/templates/`:

- **File templates** are keyed by source path — editing the file overwrites the same cache
  entry, and a newer source mtime triggers recompilation.
- **Inline templates** are keyed by content — changing the string is itself the invalidation.
- Keys are salted with the Bootgly version, so framework upgrades never reuse caches compiled
  by an older directive set.
- Writes are atomic (temp file + rename) — a crashed compile never leaves a partial cache.

## Error handling

`render()` throws `Bootgly\ABI\Templates\Template\Exceptions\TemplateException` on failure —
and its `getFile()`/`getLine()` point at the **template source line**, not at the compiled
PHP. Runtime errors, syntax errors (`ParseError`) and errors raised inside includes, components
or parent layouts are all mapped back; the original error stays available via `getPrevious()`.

```php
use Bootgly\ABI\Templates\Template;
use Bootgly\ABI\Templates\Template\Exceptions\TemplateException;

try {
   echo new Template(Template::resolve('home'))->render($data);
}
catch (TemplateException $Exception) {
   // $Exception->getFile()  → /project/templates/home.template.php
   // $Exception->getLine()  → the line in the .template.php source
   // $Exception->template   → same file (null for inline templates)
   // $Exception->getPrevious() → the original Throwable
}
```

## Directives summary

| Directive | Purpose |
|---|---|
| `@: ... @;` | Raw PHP block |
| `@if cond:` / `@elseif:` / `@else:` / `@if;` | Conditionals (also `$x?` → `!empty`, `$x??` → `isSet`) |
| `@switch:` / `@case:` / `@default:` / `@switch;` | Switch |
| `@for:` / `@foreach:` / `@while:` + `;` closers | Loops (`$@` metavariable inside) |
| `@break n in cond;` / `@continue n in cond;` | Loop control |
| `@> expr;` (+ `@>.`, `@.>`, `@.>.`) | Raw output (+ line-break variants) |
| `@>> expr;` | HTML-escaped output |
| `@extends name;` | Inherit a parent layout |
| `@section name: ... @section;` | Fill a section |
| `@yield name;` / `@yield name: ... @yield;` | Print a section (with optional default) |
| `@include name [with [...]];` | Inline include (shared scope) |
| `@component name [with [...]]: ... @component;` | Component with slots |
| `@slot name: ... @slot;` | Named slot of a component |
| `@!: ... @!;` | Verbatim region |
| `@@directive` | Literal directive escape |

## Reference

```php
public function __construct (string|File $raw)
```

Creates a template from an inline string or a `Bootgly\ABI\IO\FS\File`. Construction is cheap —
no compilation happens until the first `render()`.

```php
public function render (array $parameters = []): string
```

Renders the template with `$parameters` extracted as local variables, composing the inheritance
chain recorded by `@extends`. Throws `TemplateException` on failure, with file/line mapped to
the template source. The last output also stays readable at the `$output` property.

```php
public static function resolve (string $name): File
```

Resolves a template name (e.g. `layouts/main`) to its `File` inside `Template::$path`, using
the `.template.php` extension. Names are validated (`[A-Za-z0-9_/-]` only, no traversal) and
jailed to the base directory. Throws `TemplateException` for unset path, invalid names or
missing files.

```php
public static string $path = '';
```

Base directory used to resolve named templates. WPI views set it automatically to the project
`views/` directory.

```php
public const string EXTENSION = '.template.php';
```

The canonical template file extension appended by `resolve()`.

```php
public protected(set) string $output;
```

The last rendered output (read-only from the outside).

```php
final class TemplateException extends Exception implements Exceptioning
```

Thrown by `render()`/`resolve()`. `getFile()`/`getLine()` point at the template source; the
`$template` property carries the source path (`null` for inline templates); `getPrevious()`
returns the original error.

> [!NOTE]
> `Template::include()` and `Template::compose()` are public because compiled templates call
> them — treat them as internal to the `@include`/`@component` directives.
