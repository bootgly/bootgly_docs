# Mousestrokes

When [Mouse Reporting](/manual/CLI/Terminal/Reporting/Mouse/overview) is enabled, the terminal encodes every mouse event as an SGR escape sequence on the input stream:

```text
\e[<{action};{column};{row}{state}
```

- `{action}` — a numeric code identifying what happened (which button, movement, scroll, modifier keys);
- `{column}` / `{row}` — the 1-based cell coordinates;
- `{state}` — `M` when the button is pressed, `m` when it is released.

The `Mousestrokes` enum names both parts: the **action codes** and the two **state letters**. You rarely parse the sequence yourself — `Mouse->reporting()` does it and hands your callback a resolved `Mousestrokes` case.

## Reacting to mouse events

```php
use const Bootgly\CLI;
use Bootgly\CLI\Terminal\Input\Mousestrokes;
use Bootgly\CLI\Terminal\Reporting\Mouse;

$Mouse = CLI->Terminal->Mouse;

$Mouse->reporting(function (Mousestrokes $Action, array $coordinate, bool $clicking) {
   [$column, $row] = $coordinate;

   match ($Action) {
      Mousestrokes::LEFT_CLICK  => print("left click at [$column, $row]\n"),
      Mousestrokes::SCROLL_UP   => print("scroll up\n"),
      Mousestrokes::SCROLL_DOWN => print("scroll down\n"),
      default                   => null,
   };

   // ? Right-click stops the reporting loop
   return $Action !== Mousestrokes::RIGHT_CLICK;
});
```

To resolve a raw action code manually, use the backing value:

```php
$Action = Mousestrokes::tryFrom('35'); // Mousestrokes::NONE_CLICK_WITH_MOVEMENT
```

## See it live

The [Mouse Reporting showcase](/manual/CLI/Terminal/Reporting/Mouse/showcase) decodes these sequences in real time on PHP 8.4 WebAssembly — every case name below appears on screen as you move, click and scroll.

## Reference

`Bootgly\CLI\Terminal\Input\Mousestrokes` is a string-backed enum. Action cases carry the numeric code from the SGR payload; state cases carry the terminating letter.

### Clicks

| Case | Code |
|---|---|
| `LEFT_CLICK` / `MIDDLE_CLICK` / `RIGHT_CLICK` | `0` / `1` / `2` |
| `..._WITH_SHIFT` | `4` / `5` / `6` |
| `..._WITH_ALT` | `8` / `9` / `10` |
| `..._WITH_SHIFT_ALT` | `12` / `13` / `14` |
| `..._WITH_CTRL` | `16` / `17` / `18` |
| `..._WITH_SHIFT_CTRL` | `20` / `21` / `22` |
| `..._WITH_ALT_CTRL` | `24` / `25` / `26` |

### Movements

Movement codes follow the same layout, shifted by 32 — with a fourth variant for movement without any pressed button:

| Case | Code |
|---|---|
| `LEFT_CLICK_WITH_MOVEMENT` / `MIDDLE_...` / `RIGHT_...` / `NONE_CLICK_WITH_MOVEMENT` | `32` / `33` / `34` / `35` |
| `..._WITH_MOVEMENT_WITH_SHIFT` | `36` – `39` |
| `..._WITH_MOVEMENT_WITH_ALT` | `40` – `43` |
| `..._WITH_MOVEMENT_WITH_SHIFT_ALT` | `44` – `47` |
| `..._WITH_MOVEMENT_WITH_CTRL` | `48` – `51` |
| `..._WITH_MOVEMENT_WITH_SHIFT_CTRL` | `52` – `55` |
| `..._WITH_MOVEMENT_WITH_ALT_CTRL` | `56` – `59` |

### Scroll

| Case | Code |
|---|---|
| `SCROLL_UP` / `SCROLL_DOWN` | `64` / `65` |
| `SCROLL_UP_WITH_ALT` / `SCROLL_DOWN_WITH_ALT` | `72` / `73` |
| `SCROLL_UP_WITH_CTRL` / `SCROLL_DOWN_WITH_CTRL` | `80` / `81` |

### States

| Case | Letter |
|---|---|
| `CLICKED` | `M` (button pressed) |
| `UNCLICKED` | `m` (button released) |
