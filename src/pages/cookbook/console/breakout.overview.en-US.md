# Breakout

Build **Breakout**, the classic arcade game, in your terminal: a paddle you slide with the arrow keys, a ball that bounces off walls and bricks, five rows of colored bricks, three balls and a score — with a menu, the game itself and a game-over screen as three scenes. The Console platform's **Game** shell brings the fixed-timestep loop, the diff-rendered canvas, the keyboard heuristics and the status bar; you write the game.

You will write 3 short files plus a test (about 25 minutes) and learn how a `Console\Game` is structured: `update()` and `draw()`, the `Canvas`, pressed and held keys, `Scenes`, and `Vector`/`Zone` for movement and collisions.

```text
· · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · ·
·                                                                                                  ·
· ██████████  ██████████  ██████████  ██████████  ██████████                          ██████████   ·
· ██████████  ██████████  ██████████  ██████████  ██████████                          ██████████   ·
· ██████████  ██████████  ██████████  ██████████  ██████████                          ██████████   ·
· ██████████  ██████████  ██████████  ██████████  ██████████                          ██████████   ·
· ██████████  ██████████  ██████████              ██████████  ██████████  ██████████  ██████████   ·
·                                                                                                  ·
·                                                                                                  ·
·                                     ●                                                            ·
·                                                                                                  ·
·                                                                                                  ·
·                               ▀▀▀▀▀▀▀▀▀▀▀▀                                                       ·
· · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · ·
 Breakout  ▏ Score 90  ▏ Balls 2                                     31 bricks left  [q] quit
```

<d-block-stepper>
  <d-block-step title="Install Bootgly">

One command installs everything on Linux (or WSL2): it checks for **git** and **PHP 8.4+**, offers to install what is missing through your package manager and clones the Bootgly Kit into `./bootgly.kit`. `--no-wizard` skips the interactive project wizard — the next step creates the project with an explicit command instead.

```bash :toolbar="true";
curl -fsSL https://bootgly.com/install | bash -s -- --no-wizard
cd bootgly.kit
```

> [!TIP]
> The installer also asks whether to install the `bootgly` command globally — either answer is fine, every page here uses `php bootgly …`. Already have a kit? The installer resumes the one it finds at `./bootgly.kit` and offers to move it to the current release — accept it, these pages assume 1.0.2 or newer — then `cd` into it and go to the next step. Every command below runs from the kit directory as `php bootgly …` — if you installed the CLI globally (`php bootgly setup`), `bootgly …` works too. The [Getting started](/guide/getting-started/overview/) guide explains the installer and the kit layout.

  </d-block-step>

  <d-block-step title="Create the project">

Create a **CLI** project named `Breakout` on the **Console** platform. On the first run this also sets the platform up (its git submodule and the shipped examples — Snake, Pong and Invaders are worth a look later), so it takes a moment:

```bash :toolbar="true";
php bootgly projects create Breakout --platform=console --interfaces=CLI --yes
```

The project lands in `projects/Breakout/` as a git repository of its own (the scaffold becomes its first commit once git knows your name and e-mail) — `Breakout.Project.php` (the signature), `schedule.php` and a `tests/` folder with an example suite. Everything you write next goes inside `projects/Breakout/`.

  </d-block-step>

  <d-block-step title="Write the Brick class">

A brick is a `Zone` — an axis-aligned rectangle on the board — plus a color. `Zone::contain()` will tell whether the ball is inside it:

**File** `projects/Breakout/Brick.php`

```php :filename="projects/Breakout/Brick.php";
<?php

namespace Breakout;


use Console\Game\Zone;


/**
 * One brick of the wall: the board zone it occupies and its color.
 */
class Brick
{
   public function __construct (
      // * Config
      public Zone $Zone,
      public string $style = ''
   ) {}
}
```

`namespace Breakout;` mirrors the project folder, which is how Bootgly autoloads your classes (`projects/Breakout/Brick.php` is `Breakout\Brick`).

  </d-block-step>

  <d-block-step title="Write the game">

A game extends `Console\Game` and implements two methods the loop calls: `update(float $delta)` advances the simulation at a fixed rate (`$this->Loop->tps` ticks per second) and `draw()` paints the frame into the `Canvas`, which flushes only the cells that changed.

Read it top to bottom — the constructor sizes the board and declares the three scenes; `reset()`, `build()` and `launch()` set a game up; `play()` is one tick of gameplay:

**File** `projects/Breakout/Breakout.php`

```php :filename="projects/Breakout/Breakout.php";
<?php

namespace Breakout;


use function abs;
use function count;
use function intdiv;
use function max;
use function min;
use function random_int;
use function round;

use Bootgly\CLI\Terminal\Input;
use Bootgly\CLI\Terminal\Output;
use Console\Game;
use Console\Game\Scenes\Scene;
use Console\Game\Vector;
use Console\Game\Zone;


class Breakout extends Game
{
   // ! ANSI styles
   private const string BORDER = "\e[90m";
   private const string PADDLE = "\e[1;32m";
   private const string BALL = "\e[1;33m";
   /** One style per brick row, top to bottom */
   private const array ROWS = ["\e[1;31m", "\e[1;33m", "\e[1;32m", "\e[1;36m", "\e[1;34m"];

   // * Config
   /** Paddle width (cells — scaled to the board at construct) */
   public int $size = 8;
   /** Paddle speed while ← / → is held (cells per second) */
   public float $pace = 30.0;
   /** Ball speed (cells per second) */
   public float $speed = 16.0;
   /** Brick width (cells) */
   public int $width = 5;
   /** Balls per game */
   public int $lives = 3;

   // * Data
   /** Ball position */
   public Vector $Ball;
   /** Ball velocity (cells per second) */
   public Vector $Velocity;
   /** Paddle left column */
   public float $paddle = 0.0;
   /** @var array<int,Brick> Bricks still standing */
   public array $Bricks = [];
   public private(set) int $score = 0;
   public private(set) int $balls = 0;


   public function __construct (null|Input $Input = null, null|Output $Output = null)
   {
      parent::__construct($Input, $Output, columns: 60, rows: 30, aspect: 2);

      // ! Board size (terminal-fitted by the Game shell)
      $columns = $this->Canvas->columns;
      $rows = $this->Canvas->rows;

      // * Config — scale the gameplay to the board
      $this->size = max(6, intdiv($columns, 8));
      $this->pace = $columns * 0.6;
      $this->speed = $rows * 0.6;

      // * Data
      $this->Ball = new Vector;
      $this->Velocity = new Vector;

      // @ Game pacing
      $this->Loop->tps = 30;

      // @ Scenes
      $this->Scenes->add(new Scene(
         'Menu',
         update: function (float $delta): void {
            if ($this->Keyboard->pop('ENTER') === true || $this->Keyboard->pop('SPACE') === true) {
               $this->reset();
               $this->Scenes->switch('Play');
            }
         },
         render: function (): void {
            $middle = intdiv($this->Canvas->rows, 2);

            $this->Canvas->clear();
            $this->outline();
            $this->Canvas->center($middle - 2, 'BREAKOUT', self::BALL);
            $this->Canvas->center($middle, 'Powered by the Bootgly Console platform', self::BORDER);
            $this->Canvas->center($middle + 2, '[Enter] play    [hold ←/→] move    [q] quit');
         }
      ));
      $this->Scenes->add(new Scene(
         'Play',
         update: function (float $delta): void {
            $this->play($delta);
         },
         render: function (): void {
            $this->Canvas->clear();
            $this->outline();

            // @ Bricks
            foreach ($this->Bricks as $Brick) {
               $x = (int) round($Brick->Zone->x);
               $y = (int) round($Brick->Zone->y);
               for ($cell = 0; $cell < $this->width; $cell++) {
                  $this->Canvas->plot($x + $cell, $y, '█', $Brick->style);
               }
            }

            // @ Paddle
            $paddle = (int) round($this->paddle);
            for ($cell = 0; $cell < $this->size; $cell++) {
               $this->Canvas->plot($paddle + $cell, $this->Canvas->rows - 2, '▀', self::PADDLE);
            }

            // @ Ball
            $this->Canvas->plot((int) round($this->Ball->x), (int) round($this->Ball->y), '● ', self::BALL);
         }
      ));
      $this->Scenes->add(new Scene(
         'Over',
         update: function (float $delta): void {
            if ($this->Keyboard->pop('ENTER') === true || $this->Keyboard->pop('SPACE') === true) {
               $this->reset();
               $this->Scenes->switch('Play');
            }
         },
         render: function (): void {
            $middle = intdiv($this->Canvas->rows, 2);
            $cleared = $this->Bricks === [];

            $this->Canvas->center($middle - 1, $cleared ? ' YOU WIN! ' : ' GAME OVER ', $cleared ? self::PADDLE : self::BALL);
            $this->Canvas->center($middle + 1, "Score {$this->score}    [Enter] play again    [q] quit");
         }
      ));
      $this->Scenes->switch('Menu');

      $this->reset();
   }

   /**
    * Reset the game: the wall, the paddle, the score and the balls, then serve.
    */
   public function reset (): void
   {
      // * Data
      $this->build();
      $this->paddle = ($this->Canvas->columns - $this->size) / 2.0;
      $this->score = 0;
      $this->balls = $this->lives;

      // @
      $this->launch();
      $this->Keyboard->reset();
      $this->Canvas->reset();
   }

   protected function update (float $delta): void
   {
      // ? Quit from any scene
      if ($this->Keyboard->pop('q') === true) {
         $this->Loop->stop();
         return;
      }

      // @ Delegate to the current scene
      $Scene = $this->Scenes->Current;
      if ($Scene !== null && $Scene->update !== null) {
         ($Scene->update)($delta, $Scene);
      }
   }

   protected function draw (): void
   {
      // @ Delegate to the current scene
      $Scene = $this->Scenes->Current;
      if ($Scene !== null && $Scene->render !== null) {
         ($Scene->render)($Scene);
      }

      // @ Status bar
      $this->Statusbar->left = ['Breakout', "Score {$this->score}", "Balls {$this->balls}"];
      $this->Statusbar->right = [count($this->Bricks) . ' bricks left', '[q] quit'];
   }

   /**
    * Build the wall: one row of bricks per style, centered inside the border.
    */
   private function build (): void
   {
      $inner = $this->Canvas->columns - 2;
      $count = intdiv($inner + 1, $this->width + 1);
      $offset = 1 + intdiv($inner - ($count * ($this->width + 1) - 1), 2);

      $this->Bricks = [];
      foreach (self::ROWS as $row => $style) {
         for ($index = 0; $index < $count; $index++) {
            $x = $offset + $index * ($this->width + 1);
            $this->Bricks[] = new Brick(new Zone($x, 2 + $row, $this->width, 1.0), $style);
         }
      }
   }

   /**
    * Serve the ball from the paddle, upwards, with a random drift.
    */
   private function launch (): void
   {
      $this->Ball->x = $this->paddle + $this->size / 2.0;
      $this->Ball->y = (float) ($this->Canvas->rows - 4);
      $this->Velocity->x = random_int(-60, 60) / 100.0 * $this->speed;
      $this->Velocity->y = - $this->speed;
   }

   /**
    * Advance one Play tick: paddle, ball, walls, paddle hit, bricks and lost balls.
    */
   private function play (float $delta): void
   {
      $columns = $this->Canvas->columns;
      $rows = $this->Canvas->rows;

      // @ Paddle: slide while ← / → is held (terminal auto-repeat heuristics)
      if ($this->Keyboard->check('LEFT') === true) {
         $this->paddle -= $this->pace * $delta;
      }
      if ($this->Keyboard->check('RIGHT') === true) {
         $this->paddle += $this->pace * $delta;
      }
      $this->paddle = max(1.0, min((float) ($columns - 1 - $this->size), $this->paddle));

      // @ Ball — Euler step
      $Ball = $this->Ball;
      $Ball->add($this->Velocity, $delta);

      // @ Walls (inside the border)
      if ($Ball->x <= 1.0) {
         $Ball->x = 1.0;
         $this->Velocity->x = abs($this->Velocity->x);
      }
      else if ($Ball->x >= (float) ($columns - 2)) {
         $Ball->x = (float) ($columns - 2);
         $this->Velocity->x = - abs($this->Velocity->x);
      }
      if ($Ball->y <= 1.0) {
         $Ball->y = 1.0;
         $this->Velocity->y = abs($this->Velocity->y);
      }

      // @ Paddle hit — bounce up, deflected by where the ball landed
      $row = (float) ($rows - 2);
      if (
         $this->Velocity->y > 0
         && $Ball->y >= $row - 1 && $Ball->y <= $row
         && $Ball->x >= $this->paddle - 0.5 && $Ball->x <= $this->paddle + $this->size + 0.5
      ) {
         $offset = ($Ball->x - ($this->paddle + $this->size / 2.0)) / ($this->size / 2.0);
         $this->Velocity->x = $offset * $this->speed;
         $this->Velocity->y = - abs($this->Velocity->y);
         $Ball->y = $row - 1;
      }

      // @ Bricks — the first one containing the ball breaks
      foreach ($this->Bricks as $index => $Brick) {
         if ($Brick->Zone->contain($Ball) === true) {
            unset($this->Bricks[$index]);
            $this->score += 10;
            $this->Velocity->y = - $this->Velocity->y;
            break;
         }
      }

      // ? Ball lost below the paddle
      if ($Ball->y > (float) ($rows - 1)) {
         $this->balls--;

         if ($this->balls <= 0) {
            $this->Scenes->switch('Over');
            return;
         }

         $this->launch();
      }

      // ? Wall cleared
      if ($this->Bricks === []) {
         $this->Scenes->switch('Over');
      }
   }

   /**
    * Paint the board border.
    */
   private function outline (): void
   {
      $columns = $this->Canvas->columns;
      $rows = $this->Canvas->rows;

      // @@
      for ($x = 0; $x < $columns; $x++) {
         $this->Canvas->plot($x, 0, '· ', self::BORDER);
         $this->Canvas->plot($x, $rows - 1, '· ', self::BORDER);
      }
      for ($y = 1; $y < $rows - 1; $y++) {
         $this->Canvas->plot(0, $y, '· ', self::BORDER);
         $this->Canvas->plot($columns - 1, $y, ' ·', self::BORDER);
      }
   }
}
```

The pieces worth knowing:

- **Board.** `parent::__construct(…, columns: 60, rows: 30, aspect: 2)` asks for a 60×30 board of square pixels — each pixel is two terminal cells wide — and the shell fits it to the real terminal. Everything is scaled from `$this->Canvas->columns` / `rows`, so the game plays the same in a small window.
- **Scenes.** `Menu`, `Play` and `Over` each declare an `update` and a `render` closure; `update()` and `draw()` just delegate to `$this->Scenes->Current`. `q` is handled before the delegation, so it quits from any scene.
- **Keys.** `pop('ENTER')` is one event per keystroke; `check('LEFT')` is *held right now* — terminals report no key-up, so the shell infers it from auto-repeats.
- **Physics.** The ball is a position `Vector` plus a velocity `Vector`; `add($Velocity, $delta)` is the Euler step. Walls flip a component, the paddle deflects by where the ball landed, and the first `Brick` whose `Zone` contains the ball breaks.
- **Status bar.** `draw()` sets `$this->Statusbar->left/right` every frame; the shell renders it on the last terminal row.

  </d-block-step>

  <d-block-step title="Write the project signature">

Replace the scaffolded `Breakout.Project.php`. Its `boot` function is what `php bootgly project Breakout start` runs — it builds the game and hands the terminal to it:

**File** `projects/Breakout/Breakout.Project.php`

```php :filename="projects/Breakout/Breakout.Project.php";
<?php

use Bootgly\API\Projects\Project;

use Breakout\Breakout;


return new Project(
   // # Project Metadata
   name: 'Breakout',
   description: 'Breakout — paddle, ball and bricks on the Console platform Game shell',
   version: '1.0.0',
   author: 'Cookbook',
   exportable: true,

   // # Project Boot Function
   boot: function (array $arguments = [], array $options = []): void
   {
      $Breakout = new Breakout;
      $Breakout->run();
   }
);
```

`run()` forks the terminal Client/Server pair — one process pumps keystrokes, the other owns the screen and runs the loop.

  </d-block-step>

  <d-block-step title="Run it">

```bash :toolbar="true";
php bootgly project Breakout start
```

`Enter` starts, hold `←`/`→` to slide the paddle, `q` quits and your terminal is restored — scrollback included. Lose the three balls and you get the game-over scene; clear the wall and you win.

```text
· · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · ·
·                                                                                                  ·
·                                                                                                  ·
·                                            BREAKOUT                                              ·
·                                                                                                  ·
·                            Powered by the Bootgly Console platform                               ·
·                                                                                                  ·
·                          [Enter] play    [hold ←/→] move    [q] quit                             ·
·                                                                                                  ·
· · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · ·
 Breakout  ▏ Score 0  ▏ Balls 3                                      40 bricks left  [q] quit
```

> [!NOTE]
> Without a terminal (a pipe, CI, an AI agent) the game simulates one tick, renders one frame and exits — `php bootgly project Breakout start | cat` is a safe smoke test.

  </d-block-step>

  <d-block-step title="Test it">

A project carries its own suites. Replace the scaffolded registry so it lists a `Game` suite, then write the suite and one test that builds the game headless and checks the wall, the balls and the serve:

**File** `projects/Breakout/tests/autoboot.php`

```php :filename="projects/Breakout/tests/autoboot.php";
<?php

use Bootgly\ACI\Tests\Suites;


return new Suites(
   directories: [
      'tests/game/',
   ]
);
```

**File** `projects/Breakout/tests/game/autoboot.php`

```php :filename="projects/Breakout/tests/game/autoboot.php";
<?php

use Bootgly\ACI\Tests\Suite;


return new Suite(
   // * Config
   autoBoot: __DIR__,
   autoInstance: true,
   autoReport: true,
   autoSummarize: true,
   exitOnFailure: true,
   // * Data
   suiteName: 'Game',
   tests: [
      '1.1-wall',
   ]
);
```

**File** `projects/Breakout/tests/game/1.1-wall.Test.php`

```php :filename="projects/Breakout/tests/game/1.1-wall.Test.php";
<?php

use Bootgly\ACI\Tests\Suite\Test;

use Breakout\Breakout;


return new Test(
   description: 'The wall, the paddle and the balls after a reset',
   test: function () {
      $Breakout = new Breakout;

      $bricks = count($Breakout->Bricks);
      $columns = intdiv($Breakout->Canvas->columns - 2 + 1, $Breakout->width + 1);
      yield assert(
         assertion: $bricks === 5 * $columns,
         description: 'five rows of bricks across the board'
      );
      yield assert(
         assertion: $Breakout->balls === $Breakout->lives,
         description: 'every ball is available'
      );
      yield assert(
         assertion: $Breakout->Velocity->y < 0,
         description: 'the ball is served upwards'
      );

      $Breakout->Bricks = [];
      $Breakout->reset();
      yield assert(
         assertion: count($Breakout->Bricks) === $bricks,
         description: 'reset rebuilds the whole wall'
      );
   }
);
```

Run the project's suites from inside the project directory — the launcher is two levels up, in the kit root:

```bash :toolbar="true";
cd projects/Breakout && php ../../bootgly test
```

```text
[test] PASSED — 1 suites: 0 failed, 0 skipped, 1 passed
```

  </d-block-step>
</d-block-stepper>

## Next steps

- Speed the ball up a little on every paddle hit (`$this->Velocity->scale(1.03)`) and add a level counter when the wall is cleared.
- Give the bricks art: a `.sprites.php` sheet loaded with `$this->Sprites->load()` and stamped in the Play scene — the shipped `Demo/Invaders` shows a sprite formation.
- Add a `Pause` scene bound to `p`, and a `Timer` countdown before each serve.
- Try the `Half` or `Braille` canvas modes for a higher-resolution board.

## Reference

- [Console Game](/manual/Console/Game/overview/) — `Game`, `Loop`, `Canvas`, `Keyboard`, `Scenes`, `Sprites`, `Timer`, `Vector`, `Zone`.
- [Keystrokes](/manual/CLI/Terminal/Input/Keystrokes/overview/) — the key token names (`UP`, `ENTER`, `SPACE`, …).
- [Projects](/manual/Bootgly/essential/projects/overview/) — `projects create` flags, the project signature and the autoloader namespaces.
- [Testing](/testing/about/testing/overview/) — suites, the Basic and Advanced assertion APIs and `bootgly test`.
