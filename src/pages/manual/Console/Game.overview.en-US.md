# Console Game

`Console\Game` is the game shell of the Console platform: a fixed-timestep loop over Bootgly's Terminal **Client/Server** interface, a diff-rendered **Canvas**, a **Keyboard** with pressed/held heuristics, a **Scenes** state machine, a **Sprites** sheet of animated Unicode sprites and small 2D math helpers — **Vector**, **Zone** and **Timer**.

`run()` forks the two roles through `Input->reading()`: the *Client* process pumps keystrokes into a pipe as newline-framed tokens; the *Server* process owns the screen and runs the game loop. Natively, the fork needs the `pcntl` extension — without `pcntl_fork()`, `run()` returns without running the game. Embedded runtimes (e.g. WASM) run one role per process transparently.

## A minimal game

```php
use Console\Game;


class Pong extends Game
{
   protected function update (float $delta): void
   {
      // `q` ends the keyboard input (see below): stop on it
      if ($this->Keyboard->pop('q') === true) {
         $this->Loop->stop();

         return;
      }

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

`run()` returns once the loop stops — here, on `q` — and the screen is restored.

## Input: tokens, pressed and held

The Client normalizes every keystroke to a token. A key with a [Keystrokes](/manual/CLI/Terminal/Input/Keystrokes) case arrives by its name — `SPACE`, `ENTER` (for `\r` and `\n`), `TAB`, `BACKSPACE`, the `CTRL_*` controls and the escape sequences of up to 6 bytes (`UP`, `PAGEUP`, `F5`, `SHIFT_TAB`…); any other byte arrives raw (`q`, `a`, `Q`), so a multibyte character arrives one byte per token. A lone `Esc` becomes `ESCAPE` — and so does the `Esc` of a sequence Keystrokes does not know, whose remaining bytes then arrive raw. Tokens feed the `Keyboard`:

```php
// One event per keystroke (edge-triggered):
if ($this->Keyboard->pop('ENTER') === true) {
   $this->Scenes->switch('Play');
}

// Is the key held right now? (terminal auto-repeat heuristics):
$steps = $this->Keyboard->check('RIGHT') === true ? 2 : 1;
```

Terminals report no key-up: a held key arrives as auto-repeats — one byte, a ~250–500 ms initial delay, then fast repeats. `check()` considers a key held while its repeats keep arriving inside a window: `$grace` (0.6s) right after the first press, then `$window` (0.15s) between repeats.

`q` is reserved: the Client forwards it and then stops reading the keyboard, so it can never be a play key. Stop the loop when it arrives, as the minimal game does — otherwise the game keeps running without input until you interrupt it.

## Canvas: double buffering + diff rendering

The Game paints logical pixels into the back buffer; `flush()` composes terminal cells, diffs against the previous frame and writes **only the dirty cell runs** — an unchanged frame costs zero writes.

```php
$this->Canvas->clear();                       // start the frame
$this->Canvas->plot(5, 3, 'X', "\e[1;32m");   // one cell (with an ANSI style)
$this->Canvas->draw(10, 1, 'SCORE 42');       // a horizontal text run
$this->Canvas->flush();                       // diff + write
```

Three packing modes (`Console\Game\Canvas\Modes`):

- **Block** (default) — 1 pixel = 1 terminal cell; pixels carry their own character.
- **Half** — 1 cell = 1×2 pixels (`▀` / `▄` / `█`): double vertical resolution, one style per cell (the top pixel's).
- **Braille** — 1 cell = 2×4 pixels (U+2800..U+28FF): 8× the density, one style per cell (the first styled dot's).

In Half and Braille a pixel is a dot: `draw()` and `center()` plot one dot per character, so text needs Block.

```php
use Console\Game\Canvas;
use Console\Game\Canvas\Modes;

$Canvas = new Canvas($Output, 120, 80, Modes::Braille); // 120×80 pixels in 60×20 cells
```

Terminal cells are roughly twice as tall as they are wide. In Block mode, pass `aspect: 2` so each logical pixel spans two side-by-side cells and renders **square** — text (`draw()` / `center()`) still runs one character per terminal cell:

```php
$Canvas = new Canvas($Output, 40, 22, Modes::Block, aspect: 2); // 40×22 square pixels in 80×22 cells
$Canvas->plot(5, 3, '█');           // one pixel → '██'
$Canvas->center(10, 'PRESS ENTER'); // text centered, 1 character per cell
```

The Game's own `$Canvas` is a Block canvas with the constructor's `aspect`. You may switch its `$Mode`, but the shell sizes and centers the board in Block cells — one terminal row per pixel row, `aspect` columns per pixel — so a Half or Braille board ends up smaller and off-center; `run()` sets the anchor (`$row`/`$column`) when it starts, so place such a board from `draw()`.

## Board size

The constructor's `$columns`×`$rows` is the board you design for, in logical pixels — and a cap. When the terminal size is known, the Game shrinks the board to fit it — at most `Terminal::$columns / $aspect` columns and `Terminal::$lines - 1` rows, keeping the last row for the status bar — and then raises it to at least **24×12**: on a smaller terminal the minimum wins and the board overflows. Read the final size from `$this->Canvas->columns` and `$this->Canvas->rows` to scale the gameplay, as the demos do; `run()` centers the board above the status bar.

## Scenes

A scene is a named set of `enter` / `update` / `render` hooks plus a `$state` array — switch between them to structure the game flow (menu, playing, game over). `Scenes` only tracks the current scene: `switch()` runs the new scene's `enter` hook, but the shell never calls `update` or `render` — forward them from your `update()` and `draw()`:

```php
use Console\Game;
use Console\Game\Scenes\Scene;


class Arcade extends Game
{
   public function __construct ()
   {
      parent::__construct(columns: 40, rows: 22, aspect: 2);

      $this->Scenes->add(new Scene(
         'Menu',
         update: function (float $delta, Scene $Scene): void {
            if ($this->Keyboard->pop('ENTER') === true) {
               $this->Scenes->switch('Play');
            }
         },
         render: function (Scene $Scene): void {
            $this->Canvas->clear();
            $this->Canvas->center(8, 'PRESS ENTER TO PLAY');
         }
      ));
      $this->Scenes->add(new Scene(
         'Play',
         enter: function (Scene $Scene): void {
            $Scene->state['score'] = 0; // a new round on every switch
         },
         render: function (Scene $Scene): void {
            $this->Canvas->clear();
            $this->Canvas->draw(1, 1, "SCORE {$Scene->state['score']}");
         }
      ));

      $this->Scenes->switch('Menu');
   }

   protected function update (float $delta): void
   {
      // ? Quit from any scene
      if ($this->Keyboard->pop('q') === true) {
         $this->Loop->stop();

         return;
      }

      // @ Forward to the current scene
      $Scene = $this->Scenes->Current;
      if ($Scene !== null && $Scene->update !== null) {
         ($Scene->update)($delta, $Scene);
      }
   }

   protected function draw (): void
   {
      // @ Forward to the current scene
      $Scene = $this->Scenes->Current;
      if ($Scene !== null && $Scene->render !== null) {
         ($Scene->render)($Scene);
      }
   }
}
```

A scene keeps its `$state` across switches — `enter` is the place to reset it.

## Sprites and 2D math

A game's art lives in a sprite sheet — a `.sprites.php` file returning `Sprite` instances. Frames are WYSIWYG multiline strings where 1 character = 1 logical pixel: spaces are transparent and the Canvas `aspect` doubles every pixel on screen:

```php
// Invaders.sprites.php
use Console\Game\Sprite;

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
use Console\Game\Timer;
use Console\Game\Vector;
use Console\Game\Zone;

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

The platform ships three complete games as exportable projects (`Console/projects/`): the classic **Snake** (arrow steering, hold-to-accelerate), **Pong** vs a simple AI (keystroke-impulse paddle — tap to nudge, hold to stream — and deflection by hit offset) and **Invaders** (a sprite-sheet formation that marches faster as it shrinks — a mutable Timer interval — with a one-shot fire cooldown, Vector-integrated projectiles and Zone collisions) — all with Menu → Play → Over scenes, square-pixel boards fitted and centered to the terminal, and the score on the Statusbar. Play them in the [live showcase](/manual/Console/Game/showcase). A fresh kit already holds them in `projects/Demo/`: start one, or copy it to a new path to build on (see [Console platform](/manual/Console)):

```bash
php bootgly project Demo/Snake start
php bootgly project Demo/Pong start
php bootgly project Demo/Invaders start
```

## Behavior notes

- **Not an App loop**: `Game` extends `App` only for its chrome. `run()` replaces the App loop — do not call `boot()`. Keys arrive as Keyboard tokens, so `$Keymaps`, the `?` help overlay and the `$Palette` never fire; `$Toasts` and `$Screens` are never drawn; `$FPS` is unused — `$Loop->tps` paces the game, with one frame per burst of ticks. The `$Statusbar` is the one App widget a game shows: on the last terminal row, rewritten only when its text changes.
- **Headless runs** (`BOOTGLY_TTY=0`, or STDIN not a terminal): `run()` calls `update()` once (with `1 / tps` seconds) and `draw()`, then flushes the Canvas — no alternate screen, no status bar, and the board at row 1, column 1.
- **Resizes**: the shell only follows `SIGWINCH` into `Terminal::$columns`/`$lines`/`$width`/`$height`. The board keeps the size and position it got when the game started — `Canvas->resize()` exists, but nothing calls it — and the status bar moves to the new last row the next time its text changes.

---

## Reference

### Console\Game

```php
public function __construct (null|Input $Input = null, null|Output $Output = null, int $columns = 80, int $rows = 22, int $aspect = 1)
```

Builds the game shell over the inherited App chrome: the public `$Canvas` (`$columns`×`$rows` logical pixels, `$aspect` terminal cells per pixel, Block mode), `$Keyboard`, `$Loop`, `$Scenes` and an empty `$Sprites` sheet. `$columns`/`$rows` act as caps — when the terminal size is known, the board is shrunk to fit it (the status bar keeps the last row), then raised to at least 24×12.

```php
public function run (null|string $screen = null): void
```

Forks the Terminal Client/Server pair and drives the Loop until it stops, then restores the screen; the Server centers the board when it starts. Natively it needs `pcntl_fork()` — without it, it returns at once. `$screen` is unused (App signature). On a non-interactive run, calls `update()` once and `draw()`, then flushes the Canvas — no status bar.

```php
abstract protected function update (float $delta): void
```

Simulation tick (fixed timestep) — `$delta` is `1 / tps` seconds.

```php
abstract protected function draw (): void
```

Paints the frame into the Canvas (the shell flushes it and renders the Statusbar after, when its text changed).

### Console\Game\Loop

```php
public function __construct (Keyboard &$Keyboard)
```

Builds the loop over a Keyboard — the parameter is by reference, so pass a variable. The Game builds its own over `$Keyboard`.

```php
public function run (callable $reading, Closure $update, Closure $render): void
```

Runs the fixed-timestep loop over the channel generator: tokens feed the Keyboard, the channel timeout paces the frames (no busy wait), simulation ticks catch up to real time in fixed steps, and `$render` runs once per burst, after the catch-up ticks. Stops on `stop()`, the `$limit` tick count or a closed channel.

```php
public function stop (): void
```

Stops the loop — it ends after the current pass.

```php
public int $tps = 20;
```

Simulation ticks per second — `update()` gets `1 / $tps` seconds. `run()` reads it when it starts, so set it before.

```php
public null|int $limit = null;
```

Stops the loop after that many ticks (deterministic tests); `null` runs until stopped.

```php
public Keyboard $Keyboard;
```

The Keyboard the tokens feed — the Loop calls its `expire()` before every tick.

```php
public private(set) int $ticks = 0;
```

Ticks run since `run()` started.

```php
public private(set) bool $running = false;
```

Whether the loop is running.

### Console\Game\Canvas

```php
public function __construct (Output $Output, int $columns, int $rows, Modes $Mode = Modes::Block, int $aspect = 1)
```

A `$columns`×`$rows` grid of logical pixels written to `$Output`, packed by `$Mode`. `$aspect` (Block only, at least 1) is how many terminal cells each pixel spans.

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

Paints a horizontal run of characters starting at pixel `$x` — with `aspect` > 1 the run is one character per terminal cell (chrome text, not pixels). In Half/Braille modes each character becomes a dot.

```php
public function center (int $y, string $text, string $style = ''): self
```

Paints a text run centered on a row — one character per terminal cell, independent of the pixel aspect. In Half/Braille modes each character becomes a dot.

```php
public function flush (): self
```

Composes the back buffer into terminal cells (mode packing), diffs against the front buffer and writes only the dirty cell runs, addressed from the `$row`/`$column` anchor.

```php
public function resize (int $columns, int $rows): self
```

Resizes the logical pixel grid and wipes both buffers — the next `flush()` redraws every cell of the new grid; cells outside it stay on screen. Nothing calls it when the terminal resizes.

```php
public Modes $Mode;
```

The packing mode — Block, Half or Braille.

```php
public int $aspect = 1;
```

Terminal cells per logical pixel, in Block mode only (2 ≈ square pixels).

```php
public int $row = 1;
```

The terminal row (1-based) of the board's top edge — the anchor `flush()` addresses from. On an interactive run, the Game's `run()` sets it to center the board.

```php
public int $column = 1;
```

The terminal column (1-based) of the board's left edge — set by the Game's `run()` too.

```php
public private(set) int $columns;
```

The board width in logical pixels.

```php
public private(set) int $rows;
```

The board height in logical pixels.

### Console\Game\Keyboard

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

### Console\Game\Scenes

```php
public function add (Scene $Scene): self
```

Registers a scene.

```php
public function switch (string $scene): Scene
```

Makes the scene current and runs its `enter` hook — throws `InvalidArgumentException` on unknown names.

```php
public private(set) null|Scene $Current = null;
```

The current scene — set by `switch()`, `null` until the first one. Forward its hooks from the game's `update()` and `draw()`.

### Console\Game\Scenes\Scene

```php
public function __construct (string $name, null|Closure $enter = null, null|Closure $update = null, null|Closure $render = null)
```

One game scene: a name and three optional hooks — `enter` (`function (Scene $Scene): void`), run by `Scenes::switch()`; `update` (`function (float $delta, Scene $Scene): void`) and `render` (`function (Scene $Scene): void`), run only when the game forwards to them. The name and the hooks stay public (`$name`, `$enter`, `$update`, `$render`).

```php
public array $state = [];
```

The scene's own state (`array<string,mixed>`) — kept across switches, so a scene you switch back to finds it as it was left.

### Console\Game\Sprite

```php
public function __construct (string $name, array $frames, string $style = '', float $FPS = 0.0, string $alpha = ' ')
```

A Unicode bitmap sprite: `$frames` are WYSIWYG multiline strings — 1 character = 1 logical pixel. `$style` is an ANSI prefix applied to every pixel, `$alpha` is the transparent character (default space) and `$FPS` drives `tick()` (0.0 = step-driven only). `$name`, `$style`, `$FPS` and `$alpha` stay public and writable (renaming a sprite already in a sheet does not re-key it); `$width`/`$height` expose the measured pixel size, read-only; `$frame` is public — assign it directly for step-driven animation.

```php
public function tick (float $delta): self
```

Advances the animation clock, moving whole frames and carrying the remainder — a no-op when `$FPS` is 0.0 or the sprite has a single frame.

```php
public function stamp (Canvas $Canvas, int $x, int $y): self
```

Plots the current frame at logical (`$x`, `$y`): transparent pixels are skipped and off-canvas pixels clip silently.

### Console\Game\Sprites

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

Loads a `.sprites.php` sheet — a file returning an array of `Sprite` instances — and registers every sprite. Throws `InvalidArgumentException` when the file is missing; any other entry, or a file that does not return an array, is skipped silently.

### Console\Game\Timer

```php
public function __construct (float $interval, bool $repeat = true)
```

An interval countdown for game cadences. `$interval` and `$repeat` are public and mutable — cadences may accelerate mid-game. With `repeat: false` the timer is one-shot: `$expired` stays `true` after firing (a cooldown's "ready" state). `$elapsed` and `$expired` are read-only.

```php
public function tick (float $delta): bool
```

Advances the timer; returns whether it fired this tick. Repeating timers carry the remainder into the next cycle; one-shot timers fire once and stay expired until `reset()`.

```php
public function reset (): self
```

Rearms the timer (`elapsed` back to 0, `expired` back to false).

### Console\Game\Vector

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

### Console\Game\Zone

```php
public function __construct (float $x, float $y, float $width, float $height)
```

An axis-aligned bounding box (AABB) in logical pixels — hitboxes, play fields and formation extents. `$x`, `$y`, `$width` and `$height` are public and mutable — move a hitbox along with its entity.

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
