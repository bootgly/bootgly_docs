# Console Games

`Console\Games` is the game shell of the Console platform: a fixed-timestep loop over Bootgly's Terminal **Client/Server** interface, a diff-rendered **Canvas**, a **Keyboard** with pressed/held heuristics, a **Scenes** state machine, a **Sprites** sheet of animated Unicode sprites and small 2D math helpers — **Vector**, **Zone** and **Timer**.

`run()` forks the two roles through `Input->reading()`: the *Client* process pumps keystrokes into a pipe as newline-framed tokens; the *Server* process owns the screen and runs the game loop. Embedded runtimes (e.g. WASM) run one role per process transparently.

## A minimal game

```php
use Console\Games;


class Pong extends Games
{
   protected function update (float $delta): void
   {
      // simulation: runs at a fixed rate ($Loop->tps), independent of rendering
      if ($this->Keyboard->check('UP') === true) {
         // move the paddle while ↑ is held...
      }
   }

   protected function draw (): void
   {
      $this->Canvas->clear();
      $this->Canvas->plot(10, 5, '●');
      // the shell diff-flushes the Canvas and renders the Statusbar after
   }
}
```

```php
$Pong = new Pong;
$Pong->Loop->tps = 30;
$Pong->run();
```

## Input: tokens, pressed and held

The Client normalizes every keystroke to a token — a [Keystrokes](/manual/CLI/Terminal/Input/Keystrokes) case name (`UP`, `ENTER`, `CTRL_P`…) or the raw character (`q`, ` `). Tokens feed the `Keyboard`:

```php
// One event per keystroke (edge-triggered):
if ($this->Keyboard->pop('ENTER') === true) {
   $this->Scenes->switch('Play');
}

// Is the key held right now? (terminal auto-repeat heuristics):
$steps = $this->Keyboard->check('RIGHT') === true ? 2 : 1;
```

Terminals report no key-up: a held key arrives as auto-repeats — one byte, a ~250–500 ms initial delay, then fast repeats. `check()` considers a key held while its repeats keep arriving inside a window: `$grace` (0.6s) right after the first press, then `$window` (0.15s) between repeats.

## Canvas: double buffering + diff rendering

Games paint logical pixels into the back buffer; `flush()` composes terminal cells, diffs against the previous frame and writes **only the dirty cell runs** — an unchanged frame costs zero writes.

```php
$this->Canvas->clear();                       // start the frame
$this->Canvas->plot(5, 3, 'X', "\e[1;32m");   // one cell (with an ANSI style)
$this->Canvas->draw(10, 1, 'SCORE 42');       // a horizontal text run
$this->Canvas->flush();                       // diff + write
```

Three packing modes (`Console\Games\Canvas\Modes`):

- **Block** (default) — 1 pixel = 1 terminal cell; pixels carry their own character.
- **Half** — 1 cell = 1×2 pixels (`▀` / `▄` / `█`): double vertical resolution.
- **Braille** — 1 cell = 2×4 pixels (U+2800..U+28FF): 8× the density, mono per cell.

```php
use Console\Games\Canvas;
use Console\Games\Canvas\Modes;

$Canvas = new Canvas($Output, 120, 80, Modes::Braille); // 120×80 pixels in 60×20 cells
```

Terminal cells are roughly twice as tall as they are wide. In Block mode, pass `aspect: 2` so each logical pixel spans two side-by-side cells and renders **square** — text (`draw()` / `center()`) still runs one character per terminal cell:

```php
$Canvas = new Canvas($Output, 40, 22, Modes::Block, aspect: 2); // 40×22 square pixels in 80×22 cells
$Canvas->plot(5, 3, '█');           // one pixel → '██'
$Canvas->center(10, 'PRESS ENTER'); // text centered, 1 character per cell
```

## Scenes

A scene is a named set of `enter` / `update` / `render` hooks — switch between them to structure the game flow (menu, playing, game over):

```php
use Console\Games\Scenes\Scene;

$this->Scenes->add(new Scene(
   'Menu',
   update: function (float $delta): void {
      if ($this->Keyboard->pop('ENTER') === true) {
         $this->Scenes->switch('Play');
      }
   },
   render: function (): void {
      $this->Canvas->draw(20, 8, 'PRESS ENTER TO PLAY');
   }
));
```

## Sprites and 2D math

A game's art lives in a sprite sheet — a `.sprites.php` file returning `Sprite` instances. Frames are WYSIWYG multiline strings where 1 character = 1 logical pixel: spaces are transparent and the Canvas `aspect` doubles every pixel on screen:

```php
// Invaders.sprites.php
use Console\Games\Sprite;

return [
   new Sprite('alien', frames: ["▄█▄\n▀ ▀", "▄█▄\n▝ ▘"], style: "\e[1;32m"),
   new Sprite('boom', frames: [" ✦ \n✦ ✦", "✧ ✧\n ✧ "], style: "\e[1;33m", FPS: 8.0)
];
```

Load the sheet into the shell and stamp sprites onto the Canvas. `get()` returns the **shared** instance — assign `$frame` once and every consumer flips in lockstep (step-driven animation); `clone` when an entity needs independent state, and give it an `FPS` for wall-time animation:

```php
$this->Sprites->load(__DIR__ . '/Invaders.sprites.php');

// Step-driven: the whole formation flips on each march step
$Alien = $this->Sprites->get('alien');
$Alien->frame = ($Alien->frame + 1) % 2;
$Alien->stamp($this->Canvas, $x, $y);

// Wall-time: an explosion flickers on its own clock
$Boom = clone $this->Sprites->get('boom');
$Boom->tick($delta);
```

The 2D math trio covers the rest of a game's bookkeeping — `Timer` for cadences, `Vector` for allocation-free integration, `Zone` for AABB collision:

```php
use Console\Games\Timer;
use Console\Games\Vector;
use Console\Games\Zone;

$March = new Timer(0.75);                    // repeating cadence
if ($March->tick($delta) === true) { /* one march step */ }
$March->interval = 0.3;                      // mutable — accelerate mid-game

$Position->add($Velocity, $delta);           // Euler step — no allocation

$Hitbox = new Zone($x, $y, 3.0, 2.0);
$Hitbox->contain($Shot->Position);           // point hit (inclusive edges)
$Hitbox->check($Hull);                       // AABB overlap (strict edges)
$Field->clamp($Ship);                        // pin a point into a zone
```

## The Snake, Pong and Invaders demos

The platform ships three complete games as exportable projects (`Console/projects/`): the classic **Snake** (arrow steering, hold-to-accelerate), **Pong** vs a simple AI (keystroke-impulse paddle — tap to nudge, hold to stream — and deflection by hit offset) and **Invaders** (a sprite-sheet formation that marches faster as it shrinks — a mutable Timer interval — with a one-shot fire cooldown, Vector-integrated projectiles and Zone collisions) — all with Menu → Play → Over scenes, square-pixel boards fitted and centered to the terminal, and the score on the Statusbar. Play them in the [live showcase](/manual/Console/Games/showcase), import them with the wizard or run them from the platform repo:

```bash
php bootgly project Snake start
php bootgly project Pong start
php bootgly project Invaders start
```

---

## Reference

### Console\Games

```php
public function __construct (null|Input $Input = null, null|Output $Output = null, int $columns = 80, int $rows = 22, int $aspect = 1)
```

Builds the game shell: Canvas (`$columns`×`$rows` logical pixels, `$aspect` terminal cells per pixel), Keyboard, Loop, Scenes and an empty Sprites sheet over the inherited App chrome. `$columns`/`$rows` act as caps — the board is fitted to the real terminal (the status bar keeps the last row) and centered on it.

```php
public function run (null|string $screen = null): void
```

Forks the Terminal Client/Server pair and drives the loop. On a non-interactive run, simulates one tick and renders one frame.

```php
abstract protected function update (float $delta): void
```

Simulation tick (fixed timestep) — `$delta` is `1 / tps` seconds.

```php
abstract protected function draw (): void
```

Paints the frame into the Canvas (the shell flushes it and renders the Statusbar after).

### Console\Games\Loop

```php
public function run (callable $reading, Closure $update, Closure $render): void
```

Runs the fixed-timestep loop over the channel generator: tokens feed the Keyboard, the channel timeout paces the frames (no busy wait), simulation ticks catch up to real time in fixed steps. Stops on `stop()`, the `$limit` tick count or a closed channel.

```php
public function stop (): void
```

Stops the loop.

### Console\Games\Canvas

```php
public function clear (): self
```

Wipes the back buffer (starts a new frame).

```php
public function reset (): self
```

Wipes both buffers — the next `flush()` redraws every cell.

```php
public function plot (int $x, int $y, string $cell = '█', string $style = ''): self
```

Paints one pixel (out-of-bounds plots are ignored). With `aspect` > 1 a single-character cell is repeated per terminal cell (`'█'` → `'██'`), while a multi-character cell distributes its characters (`'· '` keeps a dot airy). In Half/Braille modes the character is ignored — the pixel is a dot.

```php
public function draw (int $x, int $y, string $text, string $style = ''): self
```

Paints a horizontal run of characters starting at pixel `$x` — with `aspect` > 1 the run is one character per terminal cell (chrome text, not pixels).

```php
public function center (int $y, string $text, string $style = ''): self
```

Paints a text run centered on a row — one character per terminal cell, independent of the pixel aspect.

```php
public function flush (): self
```

Composes the back buffer into terminal cells (mode packing), diffs against the front buffer and writes only the dirty cell runs, addressed from the `$row`/`$column` anchor.

```php
public function resize (int $columns, int $rows): self
```

Resizes the logical pixel grid and forces a full redraw (SIGWINCH hook target).

### Console\Games\Keyboard

```php
public function press (string $key, null|float $at = null): void
```

Feeds a keystroke token (a raw press or an auto-repeat).

```php
public function check (string $key, null|float $at = null): bool
```

Whether the key is currently held (repeat-window heuristics).

```php
public function pop (string $key): bool
```

Consumes one queued press of the key (edge-triggered).

```php
public function expire (null|float $at = null): void
```

Drops stale hold states (the Loop calls it once per tick).

```php
public function reset (): void
```

Resets all keyboard state.

### Console\Games\Scenes

```php
public function add (Scene $Scene): self
```

Registers a scene.

```php
public function switch (string $scene): Scene
```

Switches to a scene, running its `enter` hook — throws `InvalidArgumentException` on unknown names.

### Console\Games\Scenes\Scene

```php
public function __construct (string $name, null|Closure $enter = null, null|Closure $update = null, null|Closure $render = null)
```

One game scene: named `enter` / `update` / `render` hooks plus a `$state` array.

### Console\Games\Sprite

```php
public function __construct (string $name, array $frames, string $style = '', float $FPS = 0.0, string $alpha = ' ')
```

A Unicode bitmap sprite: `$frames` are WYSIWYG multiline strings — 1 character = 1 logical pixel. `$style` is an ANSI prefix applied to every pixel, `$alpha` is the transparent character (default space) and `$FPS` drives `tick()` (0.0 = step-driven only). `$width`/`$height` expose the measured pixel size; `$frame` is public — assign it directly for step-driven animation.

```php
public function tick (float $delta): self
```

Advances the animation clock, moving whole frames and carrying the remainder — a no-op when `$FPS` is 0.0 or the sprite has a single frame.

```php
public function stamp (Canvas $Canvas, int $x, int $y): self
```

Plots the current frame at logical (`$x`, `$y`): transparent pixels are skipped and off-canvas pixels clip silently.

### Console\Games\Sprites

```php
public function add (Sprite $Sprite): self
```

Registers a sprite, keyed by its name.

```php
public function get (string $name): Sprite
```

The **shared** sprite instance — every consumer sees the same `$frame` (lockstep animation); `clone` the result for per-entity animation state. Throws `InvalidArgumentException` on unknown names.

```php
public function load (string $file): self
```

Loads a `.sprites.php` sheet — a file returning an array of `Sprite` instances — and registers every sprite. Throws `InvalidArgumentException` when the file is missing.

### Console\Games\Timer

```php
public function __construct (float $interval, bool $repeat = true)
```

An interval countdown for game cadences. `$interval` is public and mutable — cadences may accelerate mid-game. With `repeat: false` the timer is one-shot: `$expired` stays `true` after firing (a cooldown's "ready" state).

```php
public function tick (float $delta): bool
```

Advances the timer; returns whether it fired this tick. Repeating timers carry the remainder into the next cycle; one-shot timers fire once and stay expired until `reset()`.

```php
public function reset (): self
```

Rearms the timer (`elapsed` back to 0, `expired` back to false).

### Console\Games\Vector

```php
public function __construct (float $x = 0.0, float $y = 0.0)
```

A mutable 2D vector for game hot paths. `$x`/`$y` are public; `$length` is a computed read-only property (Euclidean length).

```php
public function add (Vector $Vector, float $factor = 1.0): self
```

Adds a vector, optionally scaled — `add($Velocity, $delta)` is the allocation-free Euler integration step; a negative factor subtracts.

```php
public function scale (float $factor): self
```

Multiplies both components — speed ramps, direction flips (`scale(-1.0)`) and normalization (`scale(1.0 / $Vector->length)`).

### Console\Games\Zone

```php
public function __construct (float $x, float $y, float $width, float $height)
```

An axis-aligned bounding box (AABB) in logical pixels — hitboxes, play fields and formation extents.

```php
public function check (Zone $Zone): bool
```

Whether the zones overlap — **strict** edges: touching boxes do not collide.

```php
public function contain (Vector $Vector): bool
```

Whether the point is inside the zone — **inclusive** edges: grazing projectiles still hit.

```php
public function clamp (Vector $Vector): Vector
```

Clamps a point into the zone — mutates and returns the same Vector.
