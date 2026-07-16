# Text Component

The `Text` component animates text in the terminal. `Typewriter` and `Fade` are one-shot effects played synchronously; `Shimmer` — a color wave passing letter by letter, left to right, like Claude Code's status line — is continuous and tick-driven from your waiting loop. On non-interactive output (pipes, CI) every effect renders the final plain frame only, as the ROADMAP requires.

It is a **UI Atom** — a typographic primitive with no dependency on other components. The low-level `Terminal/Output/Text` escape helpers (colors/styles) are a different class; import `Bootgly\CLI\UI\Atoms\Text` explicitly. A live demo is available in the [showcase](/manual/CLI/UI/Atoms/Text/showcase).

## Instance

To use the component, it is necessary to create an instance passing as parameter the instance of the `Output` component:

```php
use const Bootgly\CLI;
use Bootgly\CLI\UI\Atoms\Text;
use Bootgly\CLI\UI\Atoms\Text\Effects;

$Text = new Text(CLI->Terminal->Output);
```

## Typing text

`Typewriter` writes one character at a time, paced by `interval` microseconds:

```php
$Text->Effects = Effects::Typewriter;
$Text->interval = 40_000;
$Text->content = 'Bootgly writes this one character at a time...';

$Text->play();
```

## Fading text in

`Fade` repaints the same line through a dim → normal → bold ramp:

```php
$Text->Effects = Effects::Fade;
$Text->content = 'This line fades in.';

$Text->play();
```

## Shimmering while waiting

`Shimmer` is continuous — start it, drive `tick()` from the waiting loop and `finish()` when done. A bright window slides over the dimmed content, letter by letter:

```php
$Text->Effects = Effects::Shimmer;
$Text->content = 'Shimmering while you wait...';

$Text->start();

while ($waiting) {
   poll(); // real work

   $Text->tick();
}

$Text->finish(); // final plain frame
```

## Non-interactive output

On pipes and CI, `play()` and `start()` render the final plain frame once; `tick()` never animates — deterministic logs, no escape noise.

## Reference

### Effects

```php
enum Bootgly\CLI\UI\Atoms\Text\Effects
{
   case Typewriter;
   case Fade;
   case Shimmer;
}
```

The animation effect.

### Properties

```php
public Effects $Effects
```

Config. The animation effect. Default: `Effects::Typewriter`.

```php
public int $interval
```

Config. Microseconds per animation step. Default: `30000`.

```php
public string $content
```

Data. The text to animate.

```php
public private(set) int $frame
```

Metadata (read-only). The Shimmer tick count.

```php
public private(set) bool $finished
```

Metadata (read-only). `true` after the Shimmer finished.

### play()

```php
public function play (): void
```

Plays a one-shot effect (Typewriter or Fade) synchronously. Non-interactive output (or the Shimmer effect) renders the final frame instead.

### start()

```php
public function start (): void
```

Starts the continuous Shimmer effect (hides the cursor and paints the first frame).

### tick()

```php
public function tick (): void
```

Advances the Shimmer wave one step, throttled by `interval` — call it from the waiting loop. No-op on non-interactive output.

### finish()

```php
public function finish (): void
```

Finishes the Shimmer with the final plain frame and shows the cursor. Idempotent.
