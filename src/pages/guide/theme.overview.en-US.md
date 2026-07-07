# Theme

Bootgly ships a native, dependency-free theme system at `Bootgly\ABI\Data\__String\Theme`.
A theme maps **semantic keys** (`success`, `info`, `notice`, `warning`, `error`, `debug`) to
terminal decorations, so the same output re-colors when you switch themes. Three themes are
built in — `dark`, `light` and `mono` (colorless) — and the CLI markup renderer resolves its
`@:…:` color tokens through the **active** theme, so every UI component follows the theme at
once.

> [!NOTE]
> The active UI theme lives in `Theme::$Current`. It defaults to `dark`, or to `mono` when the
> [`NO_COLOR`](https://no-color.org) environment variable is present.

## Switch the active theme

Everything the CLI prints through the markup renderer — Menu, Question, Prompt, Form, Timeline,
Alerts, Text — colors its `@:success:`/`@:error:`/… tokens through `Theme::$Current`. Switch it
once and the whole UI follows:

```php
use Bootgly\ABI\Data\__String\Theme;

Theme::$Current->select(Theme::LIGHT); // non-bright colors, for light terminals
Theme::$Current->select(Theme::DARK);  // bright colors (default)
```

## Go colorless

`mono` emits no ANSI at all — the right choice for pipes, CI logs or plain files:

```php
use Bootgly\ABI\Data\__String\Theme;

Theme::$Current->select(Theme::MONO);
```

You rarely need to do this by hand: setting `NO_COLOR=1` in the environment already makes `mono`
the default active theme at boot.

## Apply a theme directly

Any theme instance decorates a string by semantic key. `apply()` wraps content with the key's
opening decoration and the closing reset:

```php
use Bootgly\ABI\Data\__String\Theme;

$Theme = new Theme(Theme::DARK);

echo $Theme->apply('error', 'Disk full');   // bright-red "Disk full", then reset
echo $Theme->open('warning');                // just the opening escape
echo $Theme->close();                        // the reset
```

Under `mono`, `open()` returns an empty string and `apply()` returns the content untouched — no
branching needed at the call site.

## Register your own theme

A theme is a `name => specifications` entry. `options` says how to **open** (`prepending`) and
**close** (`appending`) a decoration; `values` are the per-key arguments passed to the opening
callback. `add()` accepts one or many at once:

```php
use Bootgly\ABI\Data\__String\Escapeable\Text\Formattable;
use Bootgly\ABI\Data\__String\Theme;

$Theme = new Theme;
$Theme->add(['ocean' => [
   'options' => [
      'prepending' => ['type' => 'callback', 'value' => Formattable::wrap(...)],
      'appending'  => ['type' => 'string',   'value' => Formattable::_RESET_FORMAT]
   ],
   'values' => [
      'success' => Formattable::_CYAN_BRIGHT_FOREGROUND,
      'error'   => Formattable::_RED_BRIGHT_FOREGROUND
   ]
]]);

$Theme->select('ocean');
echo $Theme->apply('success', 'Connected');
```

A `prepending`/`appending` `value` is either a `string` (emitted verbatim) or a `callback`
(invoked with the key's `values` as arguments). An invalid structure throws a
`ThemeException`.

## Reference

### `Bootgly\ABI\Data\__String\Theme`

```php
public function __construct (null|string $name = null)
```

Creates a theme handle. When `$name` is given and registered, it is selected immediately.

```php
public static self $Current
```

The active UI theme, read by the CLI markup renderer. Swap it wholesale
(`Theme::$Current = new Theme(Theme::LIGHT)`) or in place (`Theme::$Current->select('light')`).

```php
public private(set) null|string $active
```

The name of the theme currently selected on this instance (`null` before any selection).

```php
public function open (string $key): string
```

Returns the opening decoration for a semantic key (no content, no reset). Empty string under
`mono` or for an unknown key.

```php
public function close (string $key = ''): string
```

Returns the closing decoration (the reset, for the builtins). `$key` matters only for themes
whose `appending` is a callback.

```php
public function apply (string $key, string $content = ''): string
```

Returns `open($key) . $content . close($key)` — the content wrapped in the key's decoration.

```php
public function add (array $themes): self
```

Registers one or more `name => specifications` themes into the shared registry. Throws
`ThemeException` on an invalid structure.

```php
public function select (null|string $name = null): bool
```

Activates a registered theme on this instance (defaults to the instance's current `active`
name). Returns `false` when the name is not registered.

```php
public static function check (string $name): bool
```

Whether a theme name is registered.

```php
public static function list (): array
```

The names of every registered theme.

### Builtin themes

| Constant       | Name     | Colors                                    |
| -------------- | -------- | ----------------------------------------- |
| `Theme::DARK`  | `dark`   | bright foregrounds (default)              |
| `Theme::LIGHT` | `light`  | normal (non-bright) foregrounds           |
| `Theme::MONO`  | `mono`   | none — colorless (also the `NO_COLOR` default) |

### Semantic keys

`dark` and `light` define: `success`, `debug`, `info`, `notice`, `warning`, `error`. In CLI
markup these are the `@:success:`, `@:info:`, `@:notice:`, `@:warning:`, `@:error:`, `@:debug:`
tokens (short forms `@:s:`, `@:i:`, `@:n:`, `@:w:`, `@:e:`, `@:d:`), closed with `@;`.
