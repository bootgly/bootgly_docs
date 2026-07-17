# Spinner Component

The `Spinner` component renders an indeterminate activity indicator — animated frames beside a description — while your code works. It is tick-driven: the working loop calls `spin()` and the component throttles the repaints; no process forking, no signals. On non-interactive output (pipes, CI) it renders the description once and the resolution line at the end — logs stay clean.

For determinate work (a known total), use [Progress](/manual/CLI/UI/Components/Progress/overview) instead. A live demo is available in the [showcase](/manual/CLI/UI/Components/Spinner/showcase).

## Instance

To use the component, it is necessary to create an instance passing as parameter the instance of the `Output` component:

```php
use const Bootgly\CLI;
use Bootgly\CLI\UI\Components\Spinner;

$Spinner = new Spinner(CLI->Terminal->Output);
```

## Spinning while working

Call `start()` with a description, drive `spin()` from the working loop and `finish()` with a resolution line:

```php
$Spinner->start('Resolving dependencies...');

foreach ($packages as $package) {
   fetch($package); // real work

   $Spinner->spin();
}

$Spinner->finish('@#Green:✔@; Dependencies ready.');
```

`spin()` is throttled (80ms by default) — call it as often as you like; it only repaints when due.

## Updating the description

`describe()` swaps the activity text mid-flight (shorter texts pad-clear the previous one):

```php
$Spinner->describe('Downloading packages...');
```

## Named animation sets

Visuals are **named sets** resolved from the `Spinner::$Sets` registry — `braille` (default), `star` (assistant style), `line`, `arc` and `dots` builtins. Register your own set and select it by name; `$frames` stays available as the raw escape hatch:

```php
$Spinner->set = 'star';                         // ✢ ✳ ✶ ✻ ✽ …

Spinner::$Sets['clock'] = ['🕐', '🕑', '🕒'];    // register…
$Spinner->set = 'clock';                        // …and select

$Spinner->frames = ['-', '\\', '|', '/'];        // or raw frames directly
```

Unknown names throw a `ValueError`.

## Live status

`status` renders a dim parenthetical after the description — reassign it anytime, the next repaint carries it. The `@elapsed;` token formats the running time automatically (`47s`, `2m 07s`):

```php
$Spinner->status = '@elapsed; · ↓ 2.1k tokens';

// later, from the working loop — updates in real time:
$Spinner->status = '@elapsed; · ↓ 4.7k tokens';
```

```text
✶ Processing… (47s · ↓ 2.1k tokens)
```

## Tips

`tips` renders a dim guide row below the spinner and rotates through the pool while the work runs (`rotation` seconds each):

```php
$Spinner->tips = [
   'Tip: you can control how big a workflow gets in /config.',
   'Tip: press Esc to interrupt the run at any time.'
];
$Spinner->rotation = 10.0;
```

```text
✶ Processing… (47s · ↓ 2.1k tokens)
  └ Tip: you can control how big a workflow gets in /config.
```

## Text effects

`effect` animates the description with a [Text](/manual/CLI/UI/Atoms/Text) effect: `Effects::Shimmer` slides a bright wave over the dimmed text (assistant style) and `Effects::Fade` breathes dim → plain → bold:

```php
use Bootgly\CLI\UI\Atoms\Text\Effects;

$Spinner->effect = Effects::Shimmer;
```

The effect animates on the plain description text (embedded markup is stripped for the wave).

## Non-interactive output

On pipes and CI, `start()` prints the description once, `spin()` is a no-op and `finish()` prints the resolution line — one line each, no repaints, no status/tips/effects, deterministic.

## Reference

### Properties

```php
public static array $Sets
```

Config. The named animation sets registry — `braille`, `star`, `line`, `arc` and `dots` builtins; register your own (`name` → frames array).

```php
public string $set
```

Config. The named animation set — resolved from `Spinner::$Sets`, writes `$frames`. Unknown names throw a `ValueError`. Default: `'braille'`.

```php
public array $frames
```

Config. The animation frames (one string per tick) — the raw escape hatch under `$set`. Default: braille dots (`⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏`).

```php
public float $throttle
```

Config. Minimum seconds between repaints. Default: `0.08`.

```php
public string $status
```

Config. The live status — rendered dim between parentheses after the description; the `@elapsed;` token resolves to the formatted running time on every repaint. Default: `''` (no segment).

```php
public array $tips
```

Config. The rotating tip lines — rendered as a dim `└` guide row below the spinner. Default: `[]` (no row).

```php
public float $rotation
```

Config. Seconds each tip stays before rotating to the next. Default: `10.0`.

```php
public null|Effects $effect
```

Config. The description text effect — `Effects::Shimmer` (sliding bright wave) or `Effects::Fade` (dim → plain → bold pulse). Default: `null` (plain).

```php
public string $template
```

Config. The frame template with the `@spinner;`, `@description;` and `@status;` tokens. Default: `'@spinner; @description;@status;'`.

```php
public private(set) int $frame
```

Metadata (read-only). The animation tick count.

```php
public private(set) string $description
```

Metadata (read-only). The current activity description.

```php
public private(set) bool $finished
```

Metadata (read-only). `true` after `finish()`.

### start()

```php
public function start (string $description = ''): void
```

Starts the spinner: records the description, reserves the rows (spinner + tip) and hides the cursor. Non-interactive output renders the description once instead.

### spin()

```php
public function spin (): void
```

Advances the animation and repaints, throttled — call it from the working loop. No-op on non-interactive output.

### describe()

```php
public function describe (string $description): void
```

Updates the activity description (pad-clears shorter texts).

### finish()

```php
public function finish (string $resolution = ''): void
```

Finishes the spinner: replaces its line with the resolution (e.g. `✔ done`) and shows the cursor. Idempotent — also invoked by the destructor.
