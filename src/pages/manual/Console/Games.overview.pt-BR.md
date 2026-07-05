# Console Games

`Console\Games` é o shell de jogos da plataforma Console: um loop de timestep fixo sobre a interface **Client/Server** do Terminal do Bootgly, um **Canvas** com renderização por diff, um **Keyboard** com heurísticas de pressed/held e uma máquina de estados de **Scenes**.

`run()` forka os dois papéis através de `Input->reading()`: o processo *Client* bombeia teclas para um pipe como tokens delimitados por newline; o processo *Server* é dono da tela e roda o loop do jogo. Runtimes embarcados (ex.: WASM) rodam um papel por processo de forma transparente.

## Um jogo mínimo

```php
use Console\Games;


class Pong extends Games
{
   protected function update (float $delta): void
   {
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

## Input: tokens, pressed e held

O Client normaliza cada tecla para um token — um nome de case de [Keystrokes](/manual/CLI/Terminal/Input/Keystrokes) (`UP`, `ENTER`, `CTRL_P`…) ou o caractere cru (`q`, ` `). Tokens alimentam o `Keyboard`:

```php
// Um evento por tecla (edge-triggered):
if ($this->Keyboard->pop('ENTER') === true) {
   $this->Scenes->switch('Play');
}

// A tecla está pressionada agora? (heurísticas de auto-repeat do terminal):
$steps = $this->Keyboard->check('RIGHT') === true ? 2 : 1;
```

Terminais não reportam key-up: uma tecla segurada chega como auto-repeats — um byte, um atraso inicial de ~250–500 ms, depois repeats rápidos. `check()` considera a tecla pressionada enquanto os repeats continuam chegando dentro de uma janela: `$grace` (0.6s) logo após o primeiro press, depois `$window` (0.15s) entre repeats.

## Canvas: double buffering + renderização por diff

Jogos pintam pixels lógicos no back buffer; `flush()` compõe células de terminal, faz o diff contra o frame anterior e escreve **apenas os runs de células sujas** — um frame inalterado custa zero escritas.

```php
$this->Canvas->clear();                       // inicia o frame
$this->Canvas->plot(5, 3, 'X', "\e[1;32m");   // uma célula (com estilo ANSI)
$this->Canvas->draw(10, 1, 'SCORE 42');       // um run horizontal de texto
$this->Canvas->flush();                       // diff + escrita
```

Três modos de empacotamento (`Console\Games\Canvas\Modes`):

- **Block** (padrão) — 1 pixel = 1 célula de terminal; pixels carregam o próprio caractere.
- **Half** — 1 célula = 1×2 pixels (`▀` / `▄` / `█`): dobro de resolução vertical.
- **Braille** — 1 célula = 2×4 pixels (U+2800..U+28FF): 8× a densidade, mono por célula.

```php
use Console\Games\Canvas;
use Console\Games\Canvas\Modes;

$Canvas = new Canvas($Output, 120, 80, Modes::Braille); // 120×80 pixels em 60×20 células
```

Células de terminal são cerca de duas vezes mais altas que largas. No modo Block, passe `aspect: 2` para cada pixel lógico ocupar duas células lado a lado e renderizar **quadrado** — texto (`draw()` / `center()`) continua com um caractere por célula de terminal:

```php
$Canvas = new Canvas($Output, 40, 22, Modes::Block, aspect: 2); // 40×22 pixels quadrados em 80×22 células
$Canvas->plot(5, 3, '█');           // um pixel → '██'
$Canvas->center(10, 'PRESS ENTER'); // texto centrado, 1 caractere por célula
```

## Scenes

Uma scene é um conjunto nomeado de hooks `enter` / `update` / `render` — alterne entre elas para estruturar o fluxo do jogo (menu, jogando, game over):

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

## Os demos Snake e Pong

A plataforma traz dois jogos completos como projetos exportáveis (`Console/projects/`): o clássico **Snake** (direção pelas setas, aceleração ao segurar) e o **Pong** contra uma IA simples (raquete por tecla segurada, deflexão pelo ponto de impacto) — ambos com scenes Menu → Play → Over, tabuleiros de pixels quadrados ajustados e centrados no terminal, e o placar na Statusbar. Jogue-os no [showcase ao vivo](/manual/Console/Games/showcase), importe-os pelo wizard ou rode-os do repo da plataforma:

```bash
php bootgly project Snake start
php bootgly project Pong start
```

---

## Referência

### Console\Games

```php
public function __construct (null|Input $Input = null, null|Output $Output = null, int $columns = 80, int $rows = 22, int $aspect = 1)
```

Constrói o shell de jogo: Canvas (`$columns`×`$rows` pixels lógicos, `$aspect` células de terminal por pixel), Keyboard, Loop e Scenes sobre o chrome herdado do App. `$columns`/`$rows` funcionam como tetos — o tabuleiro é ajustado ao terminal real (a status bar fica com a última linha) e centrado nele.

```php
public function run (null|string $screen = null): void
```

Forka o par Client/Server do Terminal e dirige o loop. Em execução não interativa, simula um tick e renderiza um frame.

```php
abstract protected function update (float $delta): void
```

Tick de simulação (timestep fixo) — `$delta` é `1 / tps` segundos.

```php
abstract protected function draw (): void
```

Pinta o frame no Canvas (o shell faz o flush e renderiza a Statusbar depois).

### Console\Games\Loop

```php
public function run (callable $reading, Closure $update, Closure $render): void
```

Roda o loop de timestep fixo sobre o generator do canal: tokens alimentam o Keyboard, o timeout do canal dá o ritmo dos frames (sem busy wait), os ticks de simulação alcançam o tempo real em passos fixos. Para em `stop()`, no limite de ticks (`$limit`) ou com o canal fechado.

```php
public function stop (): void
```

Para o loop.

### Console\Games\Canvas

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

Pinta um run horizontal de caracteres a partir do pixel `$x` — com `aspect` > 1 o run é um caractere por célula de terminal (texto de chrome, não pixels).

```php
public function center (int $y, string $text, string $style = ''): self
```

Pinta um run de texto centrado em uma linha — um caractere por célula de terminal, independente do aspect dos pixels.

```php
public function flush (): self
```

Compõe o back buffer em células de terminal (empacotamento do modo), faz o diff contra o front buffer e escreve apenas os runs de células sujas, endereçados a partir da âncora `$row`/`$column`.

```php
public function resize (int $columns, int $rows): self
```

Redimensiona a grade lógica de pixels e força um redraw completo (alvo do hook de SIGWINCH).

### Console\Games\Keyboard

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

### Console\Games\Scenes

```php
public function add (Scene $Scene): self
```

Registra uma scene.

```php
public function switch (string $scene): Scene
```

Muda para uma scene, executando seu hook `enter` — lança `InvalidArgumentException` para nomes desconhecidos.

### Console\Games\Scenes\Scene

```php
public function __construct (string $name, null|Closure $enter = null, null|Closure $update = null, null|Closure $render = null)
```

Uma scene de jogo: hooks nomeados `enter` / `update` / `render` mais um array `$state`.
