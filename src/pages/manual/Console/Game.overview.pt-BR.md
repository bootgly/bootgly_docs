# Console Game

`Console\Game` é o shell de jogos da plataforma Console: um loop de timestep fixo sobre a interface **Client/Server** do Terminal do Bootgly, um **Canvas** com renderização por diff, um **Keyboard** com heurísticas de pressed/held, uma máquina de estados de **Scenes**, um sheet de **Sprites** Unicode animados e pequenos helpers de matemática 2D — **Vector**, **Zone** e **Timer**.

`run()` forka os dois papéis através de `Input->reading()`: o processo *Client* bombeia teclas para um pipe como tokens delimitados por newline; o processo *Server* é dono da tela e roda o loop do jogo. Nativamente, o fork precisa da extensão `pcntl` — sem `pcntl_fork()`, o `run()` retorna sem rodar o jogo. Runtimes embarcados (ex.: WASM) rodam um papel por processo de forma transparente.

## Um jogo mínimo

```php
use Console\Game;


class Pong extends Game
{
   protected function update (float $delta): void
   {
      // `q` encerra o input do teclado (veja abaixo): pare nele
      if ($this->Keyboard->pop('q') === true) {
         $this->Loop->stop();

         return;
      }

      // simulação: roda em taxa fixa ($Loop->tps), independente da renderização
      if ($this->Keyboard->check('UP') === true) {
         // move a raquete enquanto ↑ estiver pressionado...
      }
   }

   protected function draw (): void
   {
      $this->Canvas->clear();
      $this->Canvas->plot(10, 5, '●');
      // o shell faz o diff-flush do Canvas e renderiza a Statusbar depois
   }
}
```

```php
$Pong = new Pong;
$Pong->Loop->tps = 30;
$Pong->run();
```

O `run()` retorna quando o loop para — aqui, no `q` — e a tela é restaurada.

## Input: tokens, pressed e held

O Client normaliza cada tecla para um token. Uma tecla com case em [Keystrokes](/manual/CLI/Terminal/Input/Keystrokes) chega pelo nome dele — `SPACE`, `ENTER` (para `\r` e `\n`), `TAB`, `BACKSPACE`, os controles `CTRL_*` e as sequências de escape de até 6 bytes (`UP`, `PAGEUP`, `F5`, `SHIFT_TAB`…); qualquer outro byte chega cru (`q`, `a`, `Q`), então um caractere multibyte chega um byte por token. Um `Esc` sozinho vira `ESCAPE` — e o mesmo acontece com o `Esc` de uma sequência que o Keystrokes não conhece, cujos bytes restantes chegam crus em seguida. Tokens alimentam o `Keyboard`:

```php
// Um evento por tecla (edge-triggered):
if ($this->Keyboard->pop('ENTER') === true) {
   $this->Scenes->switch('Play');
}

// A tecla está pressionada agora? (heurísticas de auto-repeat do terminal):
$steps = $this->Keyboard->check('RIGHT') === true ? 2 : 1;
```

Terminais não reportam key-up: uma tecla segurada chega como auto-repeats — um byte, um atraso inicial de ~250–500 ms, depois repeats rápidos. `check()` considera a tecla pressionada enquanto os repeats continuam chegando dentro de uma janela: `$grace` (0.6s) logo após o primeiro press, depois `$window` (0.15s) entre repeats.

O `q` é reservado: o Client o repassa e então para de ler o teclado, então ele nunca pode ser uma tecla de jogo. Pare o loop quando ele chegar, como o jogo mínimo faz — senão o jogo continua rodando sem input até você interrompê-lo.

## Canvas: double buffering + renderização por diff

O Game pinta pixels lógicos no back buffer; `flush()` compõe células de terminal, faz o diff contra o frame anterior e escreve **apenas os runs de células sujas** — um frame inalterado custa zero escritas.

```php
$this->Canvas->clear();                       // inicia o frame
$this->Canvas->plot(5, 3, 'X', "\e[1;32m");   // uma célula (com estilo ANSI)
$this->Canvas->draw(10, 1, 'SCORE 42');       // um run horizontal de texto
$this->Canvas->flush();                       // diff + escrita
```

Três modos de empacotamento (`Console\Game\Canvas\Modes`):

- **Block** (padrão) — 1 pixel = 1 célula de terminal; pixels carregam o próprio caractere.
- **Half** — 1 célula = 1×2 pixels (`▀` / `▄` / `█`): dobro de resolução vertical, um estilo por célula (o do pixel de cima).
- **Braille** — 1 célula = 2×4 pixels (U+2800..U+28FF): 8× a densidade, um estilo por célula (o do primeiro ponto com estilo).

Em Half e Braille um pixel é um ponto: `draw()` e `center()` plotam um ponto por caractere, então texto precisa do Block.

```php
use Console\Game\Canvas;
use Console\Game\Canvas\Modes;

$Canvas = new Canvas($Output, 120, 80, Modes::Braille); // 120×80 pixels em 60×20 células
```

Células de terminal são cerca de duas vezes mais altas que largas. No modo Block, passe `aspect: 2` para cada pixel lógico ocupar duas células lado a lado e renderizar **quadrado** — texto (`draw()` / `center()`) continua com um caractere por célula de terminal:

```php
$Canvas = new Canvas($Output, 40, 22, Modes::Block, aspect: 2); // 40×22 pixels quadrados em 80×22 células
$Canvas->plot(5, 3, '█');           // um pixel → '██'
$Canvas->center(10, 'PRESS ENTER'); // texto centrado, 1 caractere por célula
```

O `$Canvas` do próprio Game é um canvas Block com o `aspect` do construtor. Você pode trocar o `$Mode` dele, mas o shell dimensiona e centraliza o tabuleiro em células Block — uma linha de terminal por linha de pixels, `aspect` colunas por pixel —, então um tabuleiro Half ou Braille fica menor e fora do centro; o `run()` define a âncora (`$row`/`$column`) quando começa, então posicione um tabuleiro assim a partir do `draw()`.

## Tamanho do tabuleiro

O `$columns`×`$rows` do construtor é o tabuleiro para o qual você projeta, em pixels lógicos — e um teto. Quando o tamanho do terminal é conhecido, o Game encolhe o tabuleiro para caber nele — no máximo `Terminal::$columns / $aspect` colunas e `Terminal::$lines - 1` linhas, guardando a última linha para a status bar — e depois o aumenta para no mínimo **24×12**: num terminal menor, o mínimo vence e o tabuleiro transborda. Leia o tamanho final em `$this->Canvas->columns` e `$this->Canvas->rows` para escalar a jogabilidade, como os demos fazem; o `run()` centraliza o tabuleiro acima da status bar.

## Scenes

Uma scene é um conjunto nomeado de hooks `enter` / `update` / `render` mais um array `$state` — alterne entre elas para estruturar o fluxo do jogo (menu, jogando, game over). As `Scenes` só acompanham a scene atual: o `switch()` executa o hook `enter` da nova scene, mas o shell nunca chama o `update` nem o `render` — repasse-os a partir do seu `update()` e do seu `draw()`:

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
            $Scene->state['score'] = 0; // uma rodada nova a cada switch
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
      // ? Sai de qualquer scene
      if ($this->Keyboard->pop('q') === true) {
         $this->Loop->stop();

         return;
      }

      // @ Repassa para a scene atual
      $Scene = $this->Scenes->Current;
      if ($Scene !== null && $Scene->update !== null) {
         ($Scene->update)($delta, $Scene);
      }
   }

   protected function draw (): void
   {
      // @ Repassa para a scene atual
      $Scene = $this->Scenes->Current;
      if ($Scene !== null && $Scene->render !== null) {
         ($Scene->render)($Scene);
      }
   }
}
```

Uma scene mantém o `$state` entre switches — o `enter` é o lugar para resetá-lo.

## Sprites e matemática 2D

A arte de um jogo vive em um sprite sheet — um arquivo `.sprites.php` que retorna instâncias de `Sprite`. Frames são strings multilinha WYSIWYG onde 1 caractere = 1 pixel lógico: espaços são transparentes e o `aspect` do Canvas dobra cada pixel na tela:

```php
// Invaders.sprites.php
use Console\Game\Sprite;

return [
   new Sprite('alien', frames: ["▄█▄\n▀ ▀", "▄█▄\n▝ ▘"], style: "\e[1;32m"),
   new Sprite('boom', frames: [" ✦ \n✦ ✦", "✧ ✧\n ✧ "], style: "\e[1;33m", FPS: 8.0)
];
```

Carregue o sheet no shell e estampe sprites no Canvas. `get()` retorna a instância **compartilhada** — atribua `$frame` uma vez e todos os consumidores viram em lockstep (animação step-driven); use `clone` quando uma entidade precisar de estado independente, e dê a ela um `FPS` para animação por tempo:

```php
$this->Sprites->load(__DIR__ . '/Invaders.sprites.php');

// Step-driven: a formação inteira vira a cada passo da marcha
$Alien = $this->Sprites->get('alien');
$Alien->frame = ($Alien->frame + 1) % 2;
$Alien->stamp($this->Canvas, $x, $y);

// Por tempo: uma explosão pisca no próprio relógio
$Boom = clone $this->Sprites->get('boom');
$Boom->tick($delta);
```

O trio de matemática 2D cobre o resto da contabilidade de um jogo — `Timer` para cadências, `Vector` para integração sem alocação, `Zone` para colisão AABB:

```php
use Console\Game\Timer;
use Console\Game\Vector;
use Console\Game\Zone;

$March = new Timer(0.75);                    // cadência repetitiva
if ($March->tick($delta) === true) { /* um passo da marcha */ }
$March->interval = 0.3;                      // mutável — acelere no meio do jogo

$Position->add($Velocity, $delta);           // passo de Euler — sem alocação

$Hitbox = new Zone($x, $y, 3.0, 2.0);
$Hitbox->contain($Shot->Position);           // acerto de ponto (arestas inclusivas)
$Hitbox->check($Hull);                       // sobreposição AABB (arestas estritas)
$Field->clamp($Ship);                        // prende um ponto dentro de uma zona
```

## Os demos Snake, Pong e Invaders

A plataforma traz três jogos completos como projetos exportáveis (`Console/projects/`): o clássico **Snake** (direção pelas setas, aceleração ao segurar), o **Pong** contra uma IA simples (raquete por impulso de tecla — toque ajusta, segurar acelera — e deflexão pelo ponto de impacto) e o **Invaders** (uma formação de sprite sheet que marcha mais rápido conforme encolhe — um interval mutável de Timer — com cooldown de tiro one-shot, projéteis integrados por Vector e colisões por Zone) — todos com scenes Menu → Play → Over, tabuleiros de pixels quadrados ajustados e centrados no terminal, e o placar na Statusbar. Jogue-os no [showcase ao vivo](/manual/Console/Game/showcase). Um kit novo já os traz em `projects/Demo/`: inicie um, ou copie-o para um novo caminho para construir em cima (veja [Plataforma Console](/manual/Console)):

```bash
php bootgly project Demo/Snake start
php bootgly project Demo/Pong start
php bootgly project Demo/Invaders start
```

## Notas de comportamento

- **Não é um loop de App**: o `Game` estende o `App` só pelo chrome. O `run()` substitui o loop do App — não chame o `boot()`. As teclas chegam como tokens do Keyboard, então os `$Keymaps`, o overlay de ajuda (`?`) e a `$Palette` nunca disparam; `$Toasts` e `$Screens` nunca são desenhados; o `$FPS` não é usado — o `$Loop->tps` dá o ritmo do jogo, com um frame por rajada de ticks. A `$Statusbar` é o único widget do App que um jogo mostra: na última linha do terminal, reescrita só quando o texto dela muda.
- **Execuções headless** (`BOOTGLY_TTY=0`, ou STDIN que não é terminal): o `run()` chama o `update()` uma vez (com `1 / tps` segundos) e o `draw()`, e depois faz o flush do Canvas — sem tela alternativa, sem status bar, e com o tabuleiro na linha 1, coluna 1.
- **Resizes**: o shell só acompanha o `SIGWINCH` em `Terminal::$columns`/`$lines`/`$width`/`$height`. O tabuleiro mantém o tamanho e a posição que ganhou quando o jogo começou — o `Canvas->resize()` existe, mas nada o chama — e a status bar vai para a nova última linha na próxima vez que o texto dela mudar.

---

## Referência

### Console\Game

```php
public function __construct (null|Input $Input = null, null|Output $Output = null, int $columns = 80, int $rows = 22, int $aspect = 1)
```

Constrói o shell de jogo sobre o chrome herdado do App: o `$Canvas` público (`$columns`×`$rows` pixels lógicos, `$aspect` células de terminal por pixel, modo Block), `$Keyboard`, `$Loop`, `$Scenes` e um sheet `$Sprites` vazio. `$columns`/`$rows` funcionam como tetos — quando o tamanho do terminal é conhecido, o tabuleiro é encolhido para caber nele (a status bar fica com a última linha) e depois aumentado para no mínimo 24×12.

```php
public function run (null|string $screen = null): void
```

Forka o par Client/Server do Terminal e dirige o Loop até ele parar, e então restaura a tela; o Server centraliza o tabuleiro quando começa. Nativamente, precisa de `pcntl_fork()` — sem ele, retorna na hora. `$screen` não é usado (assinatura do App). Em execução não interativa, chama o `update()` uma vez e o `draw()`, e depois faz o flush do Canvas — sem status bar.

```php
abstract protected function update (float $delta): void
```

Tick de simulação (timestep fixo) — `$delta` é `1 / tps` segundos.

```php
abstract protected function draw (): void
```

Pinta o frame no Canvas (o shell faz o flush e renderiza a Statusbar depois, quando o texto dela mudou).

### Console\Game\Loop

```php
public function __construct (Keyboard &$Keyboard)
```

Constrói o loop sobre um Keyboard — o parâmetro é por referência, então passe uma variável. O Game constrói o dele sobre o `$Keyboard`.

```php
public function run (callable $reading, Closure $update, Closure $render): void
```

Roda o loop de timestep fixo sobre o generator do canal: tokens alimentam o Keyboard, o timeout do canal dá o ritmo dos frames (sem busy wait), os ticks de simulação alcançam o tempo real em passos fixos, e o `$render` roda uma vez por rajada, depois dos ticks de recuperação. Para em `stop()`, no limite de ticks (`$limit`) ou com o canal fechado.

```php
public function stop (): void
```

Para o loop — ele termina depois da passada atual.

```php
public int $tps = 20;
```

Ticks de simulação por segundo — o `update()` recebe `1 / $tps` segundos. O `run()` o lê quando começa, então defina-o antes.

```php
public null|int $limit = null;
```

Para o loop depois de tantos ticks (testes determinísticos); `null` roda até ser parado.

```php
public Keyboard $Keyboard;
```

O Keyboard que os tokens alimentam — o Loop chama o `expire()` dele antes de cada tick.

```php
public private(set) int $ticks = 0;
```

Ticks rodados desde que o `run()` começou.

```php
public private(set) bool $running = false;
```

Se o loop está rodando.

### Console\Game\Canvas

```php
public function __construct (Output $Output, int $columns, int $rows, Modes $Mode = Modes::Block, int $aspect = 1)
```

Uma grade de `$columns`×`$rows` pixels lógicos escrita no `$Output`, empacotada pelo `$Mode`. `$aspect` (só no Block, no mínimo 1) é quantas células de terminal cada pixel ocupa.

```php
public function clear (): self
```

Limpa o back buffer (inicia um novo frame).

```php
public function reset (): self
```

Limpa os dois buffers — o próximo `flush()` redesenha todas as células.

```php
public function plot (int $x, int $y, string $cell = '█', string $style = ''): self
```

Pinta um pixel (plots fora dos limites são ignorados). Com `aspect` > 1, um cell de um caractere é repetido por célula de terminal (`'█'` → `'██'`), enquanto um cell multi-caractere distribui seus caracteres (`'· '` mantém um ponto arejado). Nos modos Half/Braille o caractere é ignorado — o pixel é um ponto.

```php
public function draw (int $x, int $y, string $text, string $style = ''): self
```

Pinta um run horizontal de caracteres a partir do pixel `$x` — com `aspect` > 1 o run é um caractere por célula de terminal (texto de chrome, não pixels). Nos modos Half/Braille cada caractere vira um ponto.

```php
public function center (int $y, string $text, string $style = ''): self
```

Pinta um run de texto centrado em uma linha — um caractere por célula de terminal, independente do aspect dos pixels. Nos modos Half/Braille cada caractere vira um ponto.

```php
public function flush (): self
```

Compõe o back buffer em células de terminal (empacotamento do modo), faz o diff contra o front buffer e escreve apenas os runs de células sujas, endereçados a partir da âncora `$row`/`$column`.

```php
public function resize (int $columns, int $rows): self
```

Redimensiona a grade lógica de pixels e limpa os dois buffers — o próximo `flush()` redesenha todas as células da nova grade; as células fora dela continuam na tela. Nada o chama quando o terminal muda de tamanho.

```php
public Modes $Mode;
```

O modo de empacotamento — Block, Half ou Braille.

```php
public int $aspect = 1;
```

Células de terminal por pixel lógico, só no modo Block (2 ≈ pixels quadrados).

```php
public int $row = 1;
```

A linha do terminal (1-based) da borda de cima do tabuleiro — a âncora a partir da qual o `flush()` endereça. Numa execução interativa, o `run()` do Game a define para centralizar o tabuleiro.

```php
public int $column = 1;
```

A coluna do terminal (1-based) da borda esquerda do tabuleiro — também definida pelo `run()` do Game.

```php
public private(set) int $columns;
```

A largura do tabuleiro em pixels lógicos.

```php
public private(set) int $rows;
```

A altura do tabuleiro em pixels lógicos.

### Console\Game\Keyboard

```php
public function press (string $key, null|float $at = null): void
```

Alimenta um token de tecla (um press cru ou um auto-repeat).

```php
public function check (string $key, null|float $at = null): bool
```

Se a tecla está pressionada agora (heurísticas de janela de repeat).

```php
public function pop (string $key): bool
```

Consome um press enfileirado da tecla (edge-triggered).

```php
public function expire (null|float $at = null): void
```

Descarta estados de hold obsoletos (o Loop chama uma vez por tick).

```php
public function reset (): void
```

Reseta todo o estado do teclado.

### Console\Game\Scenes

```php
public function add (Scene $Scene): self
```

Registra uma scene.

```php
public function switch (string $scene): Scene
```

Torna a scene a atual e executa o hook `enter` dela — lança `InvalidArgumentException` para nomes desconhecidos.

```php
public private(set) null|Scene $Current = null;
```

A scene atual — definida pelo `switch()`, `null` até o primeiro. Repasse os hooks dela a partir do `update()` e do `draw()` do jogo.

### Console\Game\Scenes\Scene

```php
public function __construct (string $name, null|Closure $enter = null, null|Closure $update = null, null|Closure $render = null)
```

Uma scene de jogo: um nome e três hooks opcionais — `enter` (`function (Scene $Scene): void`), executado pelo `Scenes::switch()`; `update` (`function (float $delta, Scene $Scene): void`) e `render` (`function (Scene $Scene): void`), executados só quando o jogo os repassa. O nome e os hooks continuam públicos (`$name`, `$enter`, `$update`, `$render`).

```php
public array $state = [];
```

O estado próprio da scene (`array<string,mixed>`) — mantido entre switches, então uma scene para a qual você volta o encontra do jeito que foi deixado.

### Console\Game\Sprite

```php
public function __construct (string $name, array $frames, string $style = '', float $FPS = 0.0, string $alpha = ' ')
```

Um sprite de bitmap Unicode: `$frames` são strings multilinha WYSIWYG — 1 caractere = 1 pixel lógico. `$style` é um prefixo ANSI aplicado a cada pixel, `$alpha` é o caractere transparente (padrão espaço) e `$FPS` dirige o `tick()` (0.0 = só step-driven). `$name`, `$style`, `$FPS` e `$alpha` continuam públicos e graváveis (renomear um sprite que já está num sheet não muda a chave dele); `$width`/`$height` expõem o tamanho medido em pixels, somente leitura; `$frame` é público — atribua diretamente para animação step-driven.

```php
public function tick (float $delta): self
```

Avança o relógio da animação, movendo frames inteiros e carregando o resto — no-op quando `$FPS` é 0.0 ou o sprite tem um único frame.

```php
public function stamp (Canvas $Canvas, int $x, int $y): self
```

Plota o frame atual no ponto lógico (`$x`, `$y`): pixels transparentes são pulados e pixels fora do canvas clipam silenciosamente.

### Console\Game\Sprites

```php
public function add (Sprite $Sprite): self
```

Registra um sprite, indexado pelo nome.

```php
public function get (string $name): Sprite
```

A instância **compartilhada** do sprite — todos os consumidores veem o mesmo `$frame` (animação em lockstep); use `clone` no resultado para estado de animação por entidade. Lança `InvalidArgumentException` para nomes desconhecidos.

```php
public function load (string $file): self
```

Carrega um sheet `.sprites.php` — um arquivo que retorna um array de instâncias de `Sprite` — e registra cada sprite. Lança `InvalidArgumentException` quando o arquivo não existe; qualquer outra entrada, ou um arquivo que não retorna um array, é pulado em silêncio.

### Console\Game\Timer

```php
public function __construct (float $interval, bool $repeat = true)
```

Uma contagem por intervalo para cadências de jogo. `$interval` e `$repeat` são públicos e mutáveis — cadências podem acelerar no meio do jogo. Com `repeat: false` o timer é one-shot: `$expired` fica `true` após disparar (o estado "pronto" de um cooldown). `$elapsed` e `$expired` são somente leitura.

```php
public function tick (float $delta): bool
```

Avança o timer; retorna se ele disparou neste tick. Timers repetitivos carregam o resto para o próximo ciclo; one-shot disparam uma vez e ficam expirados até o `reset()`.

```php
public function reset (): self
```

Rearma o timer (`elapsed` volta a 0, `expired` volta a false).

### Console\Game\Vector

```php
public function __construct (float $x = 0.0, float $y = 0.0)
```

Um vetor 2D mutável para hot paths de jogo. `$x`/`$y` são públicos; `$length` é uma propriedade computada somente leitura (comprimento Euclidiano).

```php
public function add (Vector $Vector, float $factor = 1.0): self
```

Soma um vetor, opcionalmente escalado — `add($Velocity, $delta)` é o passo de integração de Euler sem alocação; um fator negativo subtrai.

```php
public function scale (float $factor): self
```

Multiplica os dois componentes — rampas de velocidade, inversões de direção (`scale(-1.0)`) e normalização (`scale(1.0 / $Vector->length)`).

### Console\Game\Zone

```php
public function __construct (float $x, float $y, float $width, float $height)
```

Uma bounding box alinhada aos eixos (AABB) em pixels lógicos — hitboxes, campos de jogo e extensões de formação. `$x`, `$y`, `$width` e `$height` são públicos e mutáveis — mova uma hitbox junto com a entidade dela.

```php
public function check (Zone $Zone): bool
```

Se as zonas se sobrepõem — arestas **estritas**: caixas que se tocam não colidem.

```php
public function contain (Vector $Vector): bool
```

Se o ponto está dentro da zona — arestas **inclusivas**: projéteis de raspão ainda acertam.

```php
public function clamp (Vector $Vector): Vector
```

Prende um ponto dentro da zona — muta e retorna o mesmo Vector.
