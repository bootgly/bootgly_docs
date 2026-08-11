# Keystrokes

When the terminal input is switched to raw (non-canonical) mode, every key press arrives as raw bytes — printable characters as themselves, and special keys as escape sequences (`↑` is `\e[A`, `F5` is `\e[15~`, `Ctrl+C` is `\x03`...).

The `Keystrokes` enum names every one of those sequences, so your reading loop matches on `Keystrokes::UP` instead of magic strings. It is the vocabulary used by the interactive components — the [Select](/manual/CLI/UI/Components/Select/overview) navigation and the [Logs viewer](/manual/CLI/UI/Components/Logs/overview) keybindings are both driven by it.

## Reading keys

Put the [Input](/manual/CLI/Terminal/Input/overview) in raw mode and match what `read()` returns against the enum values:

```php
use const Bootgly\CLI;
use Bootgly\CLI\Terminal\Input\Keystrokes;

$Input = CLI->Terminal->Input;
$Output = CLI->Terminal->Output;

// ! Raw mode: blocking reads, no line buffering, no echo
$Input->configure(blocking: true, canonical: false, echo: false);

while (true) {
   $key = $Input->read(16);

   match ($key) {
      Keystrokes::UP->value     => $Output->write("up\n"),
      Keystrokes::DOWN->value   => $Output->write("down\n"),
      Keystrokes::ENTER->value  => $Output->write("enter\n"),
      Keystrokes::ESCAPE->value => exit(0),
      default                   => $Output->write("key: $key\n"),
   };
}
```

Read at least a few bytes per call (`read(16)` above): special keys are multi-byte sequences and must arrive in one read to match.

To display which key was pressed, resolve the bytes back to a case:

```php
$Keystroke = Keystrokes::tryFrom($key);

echo $Keystroke?->name ?? 'unmapped'; // e.g. "CTRL_LEFT"
```

## Reading keys a plain terminal cannot report

A plain terminal sends CR for `Enter`, `Shift+Enter` and `Ctrl+Enter` alike — the modifier is simply not encoded, so those combinations are unreachable. Turning on the extended keyboard protocol (kitty `CSI u` plus xterm modifyOtherKeys) makes them reportable as keys of their own. Set `extended` **before** entering raw mode — the negotiation is sent when `configure()` disables the canonical mode:

```php
use const Bootgly\CLI;
use Bootgly\CLI\Terminal\Input\Keystrokes;

$Input = CLI->Terminal->Input;
$Output = CLI->Terminal->Output;

// ! Negotiated on entering raw mode — terminals without support ignore it
$Input->extended = true;
$Input->configure(blocking: false, canonical: false, echo: false);

while (true) {
   $key = $Input->listen();

   // ? Channel closed
   if ($key === false) {
      break;
   }
   // ? Drained
   if ($key === '') {
      continue;
   }

   match ($key) {
      Keystrokes::SHIFT_ENTER->value => $Output->write("break the line\n"),
      // ? A plain Enter arrives as CR on raw terminals (no icrnl)
      Keystrokes::ENTER->value,
      Keystrokes::CTRL_M->value      => $Output->write("submit\n"),
      default                        => null
   };
}
```

The negotiation is opt-in because it changes how the terminal encodes keys for the whole session and support varies — terminals that do not speak it ignore the sequences, and `Shift+Enter` simply keeps behaving like `Enter`.

Everything else is unaffected: `listen()` runs each assembled sequence through `Keystrokes::normalize()`, which rewrites the protocol reports back to the legacy bytes consumers already compare against — `\e[99;5u` becomes `Ctrl+C`, `\e[9;2u` becomes `Shift+Tab`. Only the combinations with no legacy encoding keep the protocol form, and those are exactly the two the enum names.

## Reference

`Bootgly\CLI\Terminal\Input\Keystrokes` is a string-backed enum — each case value is the exact byte sequence the terminal emits.

### Basic keys

| Case | Bytes |
|---|---|
| `BACKSPACE` | `\177` |
| `ESCAPE` | `\e` |
| `ENTER` | `\n` |
| `TAB` | `\t` |
| `SPACE` | ` ` |

### Navigation keys

| Case | Bytes |
|---|---|
| `UP` / `DOWN` / `RIGHT` / `LEFT` | `\e[A` / `\e[B` / `\e[C` / `\e[D` |
| `HOME` / `END` | `\e[H` / `\e[F` |
| `INSERT` / `DELETE` | `\e[2~` / `\e[3~` |
| `PAGEUP` / `PAGEDOWN` | `\e[5~` / `\e[6~` |

### Function keys

| Case | Bytes |
|---|---|
| `F1` – `F4` | `\eOP`, `\eOQ`, `\eOR`, `\eOS` |
| `F5` – `F8` | `\e[15~`, `\e[17~`, `\e[18~`, `\e[19~` |
| `F9` – `F12` | `\e[20~`, `\e[21~`, `\e[23~`, `\e[24~` |

### Combined keys

| Group | Cases |
|---|---|
| `CTRL_A` – `CTRL_Z` | the control bytes `\x01` – `\x1A` (`CTRL_I`/`CTRL_J` are omitted — they duplicate `TAB`/`ENTER`) |
| `CTRL_UP` / `CTRL_DOWN` / `CTRL_RIGHT` / `CTRL_LEFT` | `\e[1;5A` – `\e[1;5D` |
| `CTRL_BACKSLASH`, `CTRL_RIGHT_BRACKET`, `CTRL_UNDERSCORE`, `CTRL_AT`, `CTRL_CIRCUMFLEX` | `\x1C`, `\x1D`, `\x1F`, `\x00`, `\x1E` |
| `SHIFT_TAB` | `\e[Z` |
| `SHIFT_UP` / `SHIFT_DOWN` / `SHIFT_RIGHT` / `SHIFT_LEFT` | `\e[1;2A` – `\e[1;2D` |
| `ALT_UP` / `ALT_DOWN` / `ALT_RIGHT` / `ALT_LEFT` | `\e[1;3A` – `\e[1;3D` |
| `ALT_INSERT`, `ALT_DELETE`, `ALT_HOME`, `ALT_END`, `ALT_PAGEUP`, `ALT_PAGEDOWN` | `\e[2;3~`, `\e[3;3~`, `\e[1;3H`, `\e[1;3F`, `\e[5;3~`, `\e[6;3~` |

### Extended keys (require the extended keyboard protocol)

| Case | Bytes |
|---|---|
| `SHIFT_ENTER` | `\e[13;2u` |
| `CTRL_ENTER` | `\e[13;5u` |

These two have no legacy encoding — a plain terminal sends CR for `Enter`, `Shift+Enter` and `Ctrl+Enter` alike — so they only arrive when the extended keyboard protocol has been negotiated (`Input->extended = true` before raw mode). The kitty `CSI code ; modifiers u` form is the canonical value.

```php
public static function normalize (string $sequence): string
```

Rewrites an extended keyboard protocol report back into the canonical key. Both forms are accepted — kitty `CSI code ; modifiers u` and xterm modifyOtherKeys `CSI 27 ; modifiers ; code ~` — with the usual 1-based modifier bitmask (`1` none, `+1` shift, `+2` alt, `+4` ctrl). Combinations that already have a legacy encoding rewrite to it — unmodified keys to their byte (`\e[13u` → `\n`), `Ctrl`+letter to its C0 control byte (`\e[97;5u` → `\x01`), `Alt` pairs to the ESC-prefixed form (`\e[98;3u` → `\eb`) and `Shift+Tab` to `\e[Z` — so enabling the protocol never changes what consumers compare against. Combinations without one keep the kitty form, and anything else (including non-ASCII key codes, which never reconstruct a legacy byte) passes through untouched. `Input->listen()` already applies it to every assembled sequence, so consumers normally never call it directly.
