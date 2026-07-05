# Timer Component

The `Timer` component renders a countdown with a completion callback. The remaining time always derives from the wall clock — never from tick counts — so `usleep` drift can never desynchronize it. When the countdown reaches zero, the `Handler` Closure fires exactly once. On non-interactive output (pipes, CI) it renders the initial and the final frames only.

A live demo is available in the [showcase](/manual/CLI/UI/Components/Timer/showcase).

## Instance

To use the component, it is necessary to create an instance passing as parameter the instance of the `Output` component:

```php
use const Bootgly\CLI;
use Bootgly\CLI\UI\Components\Timer;

$Timer = new Timer(CLI->Terminal->Output);
```

## Running a countdown

Set the `seconds` and a `Handler`, then let `run()` drive the whole lifecycle synchronously:

```php
$Timer->seconds = 5.0;
$Timer->Handler = static function (Timer $Timer): void {
   // fires once, at zero
};

$Timer->run('Launching...');
```

## Driving the ticks yourself

For countdowns inside an existing loop, call `start()` once and `tick()` per iteration — the repaint is throttled and reaching zero finishes automatically:

```php
$Timer->seconds = 30.0;
$Timer->start('Waiting for the server...');

while ($working) {
   poll(); // real work

   $Timer->tick();
}

$Timer->finish(); // optional: force zero early
```

## Templating

The frame template accepts the `@description;`, `@remaining;`, `@elapsed;` and `@percent;` tokens:

```php
$Timer->template = '⏳ @remaining;s (@percent;%) @description;';
$Timer->precision = 1;
```

## Non-interactive output

On pipes and CI, `start()` renders the initial frame once, `tick()` stays silent (but still counts and finishes at zero) and `finish()` renders the final frame — deterministic, no repaints.

## Reference

### Properties

```php
public float $seconds
```

Config. The countdown total, in seconds. Default: `0.0`.

```php
public float $throttle
```

Config. Minimum seconds between repaints. Default: `0.1`.

```php
public int $precision
```

Config. Decimal places of `@remaining;` and `@elapsed;`. Default: `2`.

```php
public null|Closure $Handler
```

Config. Invoked exactly once when the countdown finishes, receiving the `Timer` instance. Default: `null`.

```php
public string $template
```

Config. The frame template. Default: `'⏳ @remaining;s @description;'`.

```php
public private(set) float $remaining
```

Metadata (read-only). Seconds remaining, derived from the wall clock.

```php
public private(set) float $elapsed
```

Metadata (read-only). Seconds elapsed since `start()`.

```php
public private(set) float $percent
```

Metadata (read-only). Progress toward zero (0–100).

```php
public private(set) bool $finished
```

Metadata (read-only). `true` after the countdown finished.

### start()

```php
public function start (string $description = ''): void
```

Arms the countdown (`remaining = seconds`), reserves the frame lines, hides the cursor and paints the first frame. Non-interactive output paints once.

### tick()

```php
public function tick (): void
```

Recomputes the remaining time from the wall clock and repaints (throttled). Reaching zero invokes `finish()`.

### run()

```php
public function run (string $description = ''): void
```

Runs the countdown synchronously (start + tick loop) until it finishes.

### describe()

```php
public function describe (string $description): void
```

Updates the countdown description (pad-clears shorter texts).

### finish()

```php
public function finish (): void
```

Forces the final frame (remaining `0`, percent `100`), shows the cursor and invokes the `Handler` once. Idempotent; a never-started Timer is a no-op.
