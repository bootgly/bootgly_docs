# Console Games

`Console\Games` is the game shell of the Console platform: a fixed-timestep loop over Bootgly's Terminal **Client/Server** interface, a diff-rendered **Canvas**, a **Keyboard** with pressed/held heuristics and a **Scenes** state machine.

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

## The Snake and Pong demos

The platform ships two complete games as exportable projects (`Console/projects/`): the classic **Snake** (arrow steering, hold-to-accelerate) and **Pong** vs a simple AI (held-key paddle movement, deflection by hit offset) — both with Menu → Play → Over scenes, square-pixel boards fitted and centered to the terminal, and the score on the Statusbar. Play them in the [live showcase](/manual/Console/Games/showcase), import them with the wizard or run them from the platform repo:

```bash
php bootgly project Snake start
php bootgly project Pong start
```

---

## Reference

### Console\Games

```php
public function __construct (null|Input $Input = null, null|Output $Output = null, int $columns = 80, int $rows = 22, int $aspect = 1)
```

Builds the game shell: Canvas (`$columns`×`$rows` logical pixels, `$aspect` terminal cells per pixel), Keyboard, Loop and Scenes over the inherited App chrome. `$columns`/`$rows` act as caps — the board is fitted to the real terminal (the status bar keeps the last row) and centered on it.

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
