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

## Custom frames

The animation frames are plain strings — swap them for any charset:

```php
$Spinner->frames = ['-', '\\', '|', '/'];
$Spinner->throttle = 0.12;
```

## Non-interactive output

On pipes and CI, `start()` prints the description once, `spin()` is a no-op and `finish()` prints the resolution line — one line each, no repaints, deterministic.

## Reference

### Properties

```php
public array $frames
```

Config. The animation frames (one string per tick). Default: braille dots (`⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏`).

```php
public float $throttle
```

Config. Minimum seconds between repaints. Default: `0.08`.

```php
public string $template
```

Config. The frame template with the `@spinner;` and `@description;` tokens. Default: `'@spinner; @description;'`.

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

Starts the spinner: records the description, reserves the line and hides the cursor. Non-interactive output renders the description once instead.

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
