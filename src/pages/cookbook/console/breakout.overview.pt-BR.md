# Construa um Console Game de quebrar tijolos

Construa o **Breakout**, o clássico dos fliperamas, no seu terminal: uma raquete que você desliza com as setas, uma bola que quica nas paredes e nos tijolos, cinco fileiras de tijolos coloridos, três bolas e uma pontuação — com um menu, o jogo em si e uma tela de fim de jogo como três cenas. O shell **Game** da plataforma Console traz o loop de passo fixo, o canvas renderizado por diff, as heurísticas de teclado e a barra de status; você escreve o jogo.

Você vai escrever 3 arquivos curtos mais um teste (uns 25 minutos) e aprender como um `Console\Game` é estruturado: `update()` e `draw()`, o `Canvas`, teclas pressionadas e seguradas, `Scenes`, e `Vector`/`Zone` para movimento e colisões.

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
  <d-block-step title="Instale o Bootgly">

Um comando instala tudo no Linux (ou WSL2): ele verifica **git** e **PHP 8.4+**, oferece instalar o que faltar pelo seu gerenciador de pacotes e clona o Bootgly Kit em `./bootgly.kit`. `--no-wizard` pula o wizard interativo de projetos — o próximo passo cria o projeto com um comando explícito.

```bash :toolbar="true";
curl -fsSL https://bootgly.com/install | bash -s -- --no-wizard
cd bootgly.kit
```

> [!TIP]
> O instalador também pergunta se deve instalar o comando `bootgly` globalmente — qualquer resposta serve, todas as páginas aqui usam `php bootgly …`. Já tem um kit? O instalador retoma o que encontrar em `./bootgly.kit` e oferece movê-lo para a release atual — aceite, estas páginas assumem a 1.0.2 ou mais nova — depois entre nele com `cd` e vá para o próximo passo. Todos os comandos abaixo rodam da pasta do kit como `php bootgly …` — se você instalou a CLI globalmente (`php bootgly setup`), `bootgly …` também funciona. O guia [Começando](/guide/getting-started/overview/) explica o instalador e a estrutura do kit.

  </d-block-step>

  <d-block-step title="Crie o projeto">

Crie um projeto **CLI** chamado `Breakout` na plataforma **Console**. Na primeira execução isso também configura a plataforma (o submódulo git e os exemplos embarcados — Snake, Pong e Invaders valem uma olhada depois), então leva um momento:

```bash :toolbar="true";
php bootgly projects create Breakout --platform=console --interfaces=CLI --yes
```

O projeto nasce em `projects/Breakout/` como um repositório git próprio (o scaffold vira o primeiro commit assim que o git souber seu nome e e-mail) — `Breakout.Project.php` (a assinatura), `schedule.php` e uma pasta `tests/` com uma suíte de exemplo. Tudo o que você escrever a seguir vai dentro de `projects/Breakout/`.

  </d-block-step>

  <d-block-step title="Crie as pastas">

Todas as pastas em que os próximos passos escrevem, em um comando — daqui em diante você só cria arquivos e cola o conteúdo deles. Rode da pasta do kit (`mkdir -p` não mexe nas pastas que o scaffold já criou):

```bash :toolbar="true";
mkdir -p projects/Breakout/tests/game
```

  </d-block-step>

  <d-block-step title="Escreva a classe Brick">

Um tijolo é uma `Zone` — um retângulo alinhado aos eixos no tabuleiro — mais uma cor. `Zone::contain()` dirá se a bola está dentro dele:

**Arquivo** `projects/Breakout/Brick.php`

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

`namespace Breakout;` espelha a pasta do projeto — é assim que o Bootgly carrega suas classes (`projects/Breakout/Brick.php` é `Breakout\Brick`).

  </d-block-step>

  <d-block-step title="Escreva o jogo">

Um jogo estende `Console\Game` e implementa dois métodos que o loop chama: `update(float $delta)` avança a simulação a uma taxa fixa (`$this->Loop->tps` ticks por segundo) e `draw()` pinta o frame no `Canvas`, que descarrega só as células que mudaram.

Leia de cima para baixo — o construtor dimensiona o tabuleiro e declara as três cenas; `reset()`, `build()` e `launch()` preparam uma partida; `play()` é um tick de jogo:

**Arquivo** `projects/Breakout/Breakout.php`

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

As peças que valem conhecer:

- **Tabuleiro.** `parent::__construct(…, columns: 60, rows: 30, aspect: 2)` pede um tabuleiro de 60×30 pixels quadrados — cada pixel tem duas células de terminal de largura — e o shell o ajusta ao terminal real. Tudo é escalado a partir de `$this->Canvas->columns` / `rows`, então o jogo funciona igual em uma janela pequena.
- **Cenas.** `Menu`, `Play` e `Over` declaram cada uma uma closure `update` e uma `render`; `update()` e `draw()` só delegam para `$this->Scenes->Current`. O `q` é tratado antes da delegação, então sai de qualquer cena.
- **Teclas.** `pop('ENTER')` é um evento por tecla pressionada; `check('LEFT')` é *segurada agora* — terminais não reportam o soltar da tecla, então o shell infere pelo auto-repeat.
- **Física.** A bola é um `Vector` de posição mais um `Vector` de velocidade; `add($Velocity, $delta)` é o passo de Euler. As paredes invertem uma componente, a raquete desvia conforme onde a bola bateu, e o primeiro `Brick` cuja `Zone` contém a bola quebra.
- **Barra de status.** `draw()` define `$this->Statusbar->left/right` a cada frame; o shell a renderiza na última fileira do terminal.

  </d-block-step>

  <d-block-step title="Escreva a assinatura do projeto">

Substitua o `Breakout.Project.php` gerado. A função `boot` é o que `php bootgly project Breakout start` executa — ela constrói o jogo e entrega o terminal a ele:

**Arquivo** `projects/Breakout/Breakout.Project.php`

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

`run()` bifurca o par Cliente/Servidor do terminal — um processo bombeia as teclas, o outro é dono da tela e roda o loop.

  </d-block-step>

  <d-block-step title="Rode">

```bash :toolbar="true";
php bootgly project Breakout start
```

`Enter` começa, segure `←`/`→` para deslizar a raquete, `q` sai e o seu terminal é restaurado — scrollback incluído. Perca as três bolas e você vê a cena de fim de jogo; limpe a parede e você vence.

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
> Sem um terminal (um pipe, CI, um agente de IA) o jogo simula um tick, renderiza um frame e sai — `php bootgly project Breakout start | cat` é um smoke test seguro.

O jogo é dono deste terminal — em um segundo, acompanhe o log do projeto; ele fica quieto até algo dar errado, e é lá que os relatórios de exceção caem:

```bash :toolbar="true";
php bootgly project Breakout logs -f
```

  </d-block-step>

  <d-block-step title="Teste">

Um projeto carrega as próprias suítes. Substitua o registro gerado para que ele liste uma suíte `Game`, depois escreva a suíte e um teste que constrói o jogo sem terminal e confere a parede, as bolas e o saque:

**Arquivo** `projects/Breakout/tests/autoboot.php`

```php :filename="projects/Breakout/tests/autoboot.php";
<?php

use Bootgly\ACI\Tests\Suites;


return new Suites(
   directories: [
      'tests/game/',
   ]
);
```

**Arquivo** `projects/Breakout/tests/game/autoboot.php`

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

**Arquivo** `projects/Breakout/tests/game/1.1-wall.Test.php`

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

Rode as suítes do projeto de dentro da pasta dele — o launcher está dois níveis acima, na raiz do kit:

```bash :toolbar="true";
cd projects/Breakout && php ../../bootgly test
```

```text
[test] PASSED — 1 suites: 0 failed, 0 skipped, 1 passed
```

  </d-block-step>
</d-block-stepper>

## Próximos passos

- Acelere a bola um pouco a cada rebatida (`$this->Velocity->scale(1.03)`) e adicione um contador de fases quando a parede for limpa.
- Dê arte aos tijolos: uma folha `.sprites.php` carregada com `$this->Sprites->load()` e carimbada na cena Play — o `Demo/Invaders` embarcado mostra uma formação de sprites.
- Adicione uma cena `Pause` associada ao `p`, e uma contagem regressiva com `Timer` antes de cada saque.
- Experimente os modos de canvas `Half` ou `Braille` para um tabuleiro de maior resolução.

## Referência

- [Console Game](/manual/Console/Game/overview/) — `Game`, `Loop`, `Canvas`, `Keyboard`, `Scenes`, `Sprites`, `Timer`, `Vector`, `Zone`.
- [Keystrokes](/manual/CLI/Terminal/Input/Keystrokes/overview/) — os nomes dos tokens de tecla (`UP`, `ENTER`, `SPACE`, …).
- [Projects](/manual/Bootgly/essential/projects/overview/) — flags de `projects create`, a assinatura do projeto e os namespaces do autoloader.
- [Testes](/testing/about/testing/overview/) — suítes, as APIs de asserção Básica e Avançada e `bootgly test`.
