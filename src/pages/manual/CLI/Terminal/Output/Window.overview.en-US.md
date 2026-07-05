# Window

`Window` is the visible-window calculator behind Bootgly's scrollable lists — pure state, **no stream I/O**. Given a window `size` and a list `total`, it tracks which slice of rows is visible and slides that slice to follow an aimed row. Your code slices and renders; `Window` only does the math. The [Menu](/manual/CLI/UI/Components/Menu/overview) viewport, the [Question](/manual/CLI/UI/Components/Question/overview) suggestions dropdown and the [Textarea](/manual/CLI/UI/Components/Textarea/overview) row window are all built on it.

## Windowing a list

Create it with the visible size and the list total, `slide()` toward whatever row the user aims at, then render only the rows between `first` and `last`:

```php
use const Bootgly\CLI;
use Bootgly\CLI\Terminal\Output\Window;

$Output = CLI->Terminal->Output;

$items = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf'];

$Window = new Window(size: 3, total: count($items));

$aimed = 5; // e.g. moved by ↑/↓ keys

$Window->slide($aimed);

// @ Render only the visible slice
for ($index = $Window->first; $index <= $Window->last; $index++) {
   $marker = $index === $aimed ? '>' : ' ';

   $Output->write("{$marker} {$items[$index]}\n");
}
// >  slice shows: Delta, Echo, > Foxtrot
```

`slide()` only moves the window when the aimed row would leave it — aiming inside the current slice is a no-op, so the list stays visually stable while the user navigates. The window is always clamped to the valid range: it never shows past the end nor before the start.

Two edge cases are handled for free: with `size` set to `0` windowing is disabled, and when the whole list fits (`total <= size`) the window pins to the top — in both cases `first` is `0` and `last` covers everything available.

When the list grows or shrinks (a filter, a live feed), update `total` and `slide()` again to re-clamp.

## Reference

`Bootgly\CLI\Terminal\Output\Window` exposes `size` (`int` — visible rows; `0` disables windowing), `total` (`int` — total rows), and the computed bounds: `first` (`int`, read-only — index of the first visible row) and `last` (`int`, read-only — index of the last visible row, derived from `first`, `size` and `total`).

```php
public function __construct (int $size = 0, int $total = 0)
```

Creates the window with its visible size and the list total. The window starts at the top (`first` is `0`).

```php
public function slide (int $aimed): self
```

Slides the window the minimum amount needed to keep the aimed row inside `[first, last]`, clamped to the valid range. With windowing disabled or when everything fits, resets `first` to `0`.
