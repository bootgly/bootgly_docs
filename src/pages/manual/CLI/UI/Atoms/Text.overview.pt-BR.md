# Componente Text

O componente `Text` anima texto no terminal. `Typewriter` e `Fade` são efeitos one-shot tocados sincronamente; `Shimmer` — uma onda de cor passando letra por letra, da esquerda para a direita, como a status line do Claude Code — é contínuo e guiado por tick a partir do seu loop de espera. Em saída não interativa (pipes, CI) todo efeito renderiza apenas o frame final simples, como o ROADMAP exige.

É um **UI Atom** — primitiva tipográfica sem dependência de outros componentes. Os helpers de escape de baixo nível `Terminal/Output/Text` (cores/estilos) são outra classe; importe `Bootgly\CLI\UI\Atoms\Text` explicitamente. Uma demo ao vivo está disponível no [showcase](/manual/CLI/UI/Atoms/Text/showcase).

## Instância

Para usar o componente, é necessário criar uma instância passando como parâmetro a instância do componente `Output`:

```php
use const Bootgly\CLI;
use Bootgly\CLI\UI\Atoms\Text;
use Bootgly\CLI\UI\Atoms\Text\Effects;

$Text = new Text(CLI->Terminal->Output);
```

## Digitando texto

`Typewriter` escreve um caractere por vez, ritmado por `interval` microssegundos:

```php
$Text->Effects = Effects::Typewriter;
$Text->interval = 40_000;
$Text->content = 'Bootgly writes this one character at a time...';

$Text->play();
```

## Surgindo com fade

`Fade` repinta a mesma linha numa rampa dim → normal → bold:

```php
$Text->Effects = Effects::Fade;
$Text->content = 'This line fades in.';

$Text->play();
```

## Shimmer enquanto espera

`Shimmer` é contínuo — inicie, conduza `tick()` no loop de espera e `finish()` ao terminar. Uma janela brilhante desliza sobre o conteúdo esmaecido, letra por letra:

```php
$Text->Effects = Effects::Shimmer;
$Text->content = 'Shimmering while you wait...';

$Text->start();

while ($waiting) {
   poll(); // trabalho real

   $Text->tick();
}

$Text->finish(); // frame final simples
```

## Saída não interativa

Em pipes e CI, `play()` e `start()` renderizam o frame final simples uma vez; `tick()` nunca anima — logs determinísticos, sem ruído de escapes.

## Referência

### Effects

```php
enum Bootgly\CLI\UI\Atoms\Text\Effects
{
   case Typewriter;
   case Fade;
   case Shimmer;
}
```

O efeito de animação.

### Propriedades

```php
public Effects $Effects
```

Config. O efeito de animação. Padrão: `Effects::Typewriter`.

```php
public int $interval
```

Config. Microssegundos por passo de animação. Padrão: `30000`.

```php
public string $content
```

Data. O texto a animar.

```php
public private(set) int $frame
```

Metadata (somente leitura). A contagem de ticks do Shimmer.

```php
public private(set) bool $finished
```

Metadata (somente leitura). `true` após o Shimmer finalizar.

### play()

```php
public function play (): void
```

Toca um efeito one-shot (Typewriter ou Fade) sincronamente. Saída não interativa (ou o efeito Shimmer) renderiza o frame final.

### start()

```php
public function start (): void
```

Inicia o efeito contínuo Shimmer (esconde o cursor e pinta o primeiro frame).

### tick()

```php
public function tick (): void
```

Avança a onda do Shimmer um passo, com throttle de `interval` — chame no loop de espera. No-op em saída não interativa.

### shimmer()

```php
public function shimmer (int $frame): string
```

Compõe um frame do Shimmer — a janela clara deslizando sobre o conteúdo esmaecido — como markup de Template, na fase de onda informada. Consumidores que animam as próprias linhas (ex.: o efeito de descrição do Spinner) pintam um frame por tick próprio.

### finish()

```php
public function finish (): void
```

Finaliza o Shimmer com o frame final simples e mostra o cursor. Idempotente.
