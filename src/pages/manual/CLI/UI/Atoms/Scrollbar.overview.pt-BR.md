# Classe Scrollbar

O componente `Scrollbar` renderiza a barra vertical: um thumb deslizando sobre um trilho, derivado dos três números de view que todo host rolável possui — `total` de linhas de conteúdo, `height` de linhas visíveis e o índice `first` visível. O band do `Scrollarea` e a janela do `Listbox` montam sobre este Atom, e qualquer componente com uma view janelada também pode.

É um **UI Atom** — uma primitiva sem dependência de outros componentes. Um demo ao vivo está disponível no [showcase](/manual/CLI/UI/Atoms/Scrollbar/showcase).

## Instância

Para utilizar o componente, crie uma instância passando a instância de `Output`:

```php
use const Bootgly\CLI;
use Bootgly\CLI\UI\Atoms\Scrollbar;

$Scrollbar = new Scrollbar(CLI->Terminal->Output);
```

## Alimente os três números da view

Tudo que a barra sabe deriva de `total`, `height` e `first`. A barra só *desliza* — mostra um thumb — quando o conteúdo transborda a view; `check()` responde isso:

```php
$Scrollbar->total = 100;   // linhas de conteúdo atrás da view
$Scrollbar->height = 12;   // linhas visíveis (a altura da faixa)
$Scrollbar->first = 0;     // primeiro índice visível

$Scrollbar->check();       // true — 100 linhas transbordam 12
```

## Posicione a faixa

Posicionada — `row` e `column` em coordenadas de tela 1-based — `render()` repinta a faixa no lugar, um glyph por linha da view:

```php
$Scrollbar->row = 8;
$Scrollbar->column = 40;

$Scrollbar->render();
```

Conforme a view rola, atualize `first` e renderize de novo — o thumb acompanha:

```php
$Scrollbar->first = 42;
$Scrollbar->render();
```

## Componha as linhas

Hosts que constroem o próprio frame pegam as linhas: `RETURN_OUTPUT` retorna as linhas de glyph unidas por `\n` (sem quebra final) para emendar uma por linha — é exatamente assim que o Listbox anexa sua barra na borda direita:

```php
use Bootgly\API\Component;

$bars = explode("\n", (string) $Scrollbar->render(Component::RETURN_OUTPUT));

foreach ($rows as $index => $row) {
   $output .= $row . ($bars[$index] ?? '') . "\n";
}
```

## Conecte o mouse

O Scrollbar nunca arma o mouse — o host faz isso (`Terminal\Reporting\Mouse`) e roteia os reports SGR. O movimento aciona o hover; um press esquerdo na faixa mira e arrasta:

```php
// dentro do handler de mouse reports do host:
$Scrollbar->hover($Scrollbar->hit($column, $line) === 'thumb');

// em um press esquerdo sobre a faixa:
$hit = $Scrollbar->hit($column, $line);
if ($hit !== null) {
   $first = $Scrollbar->aim($line);   // o host aplica e repinta
}
```

`hit()` resolve `'thumb'`, `'track'` ou `null`; `aim()` mapeia uma linha de tela de volta para o índice `first` pelo centro do thumb — um click no trilho salta, um drag acompanha. O hover repinta só a faixa, e um hover sem mudança não escreve nada. O demo 62 (`bootgly demo 62`) monta o loop completo: wheel, hover, click no trilho e drag.

## Restilize

Os glyphs e as pinturas são Config simples — um host expõe sua barra exatamente para isso:

```php
$Scrollbar->thumb = '┃';
$Scrollbar->track = '·';
$Scrollbar->style = ['38;5;240'];   // repouso: trilho + thumb
$Scrollbar->accent = ['38;5;255'];  // thumb em hover
```

`Scrollarea` e `Listbox` expõem as suas como `$Scrollarea->Scrollbar` e `$Listbox->Scrollbar`.

## Saída não interativa

Em pipes e CI o render mantém os glyphs puros com **zero códigos de escape**, e `hover()` nunca pinta — não existe ponteiro sem um terminal interativo. `decoration` é um tri-state: `null` (padrão) segue o TTY, `false` força plano, `true` força estilizado.

## Reference

### Propriedades

```php
public null|bool $decoration = null;
```

Config. Decoração SGR — `null` segue o TTY, `false` força plano, `true` força estilizado.

```php
public string $thumb = '█';
```

Config. O glyph do thumb (a alça arrastável).

```php
public string $track = '│';
```

Config. O glyph do trilho (o rail atrás do thumb).

```php
public array $style = ['90'];
```

Config. Códigos SGR pintando o trilho e o thumb em repouso.

```php
public array $accent = ['97'];
```

Config. Códigos SGR pintando o thumb durante o hover.

```php
public int $row = 0;
```

Config. Linha de tela do topo da faixa (1-based) — `0` mantém a barra sem posição (composta pelo host).

```php
public int $column = 0;
```

Config. Coluna de tela da faixa (1-based) — `0` mantém a barra sem posição.

```php
public int $width = 1;
```

Config. Colunas que a faixa ocupa — sempre `1` (uma barra vertical tem uma coluna de largura).

```php
public int $height = 0;
```

Config. Linhas que a faixa ocupa — as linhas visíveis da view do host.

```php
public int $total = 0;
```

Data. Total de linhas/opções de conteúdo atrás da view.

```php
public int $first = 0;
```

Data. Primeiro índice de conteúdo visível (0-based).

```php
public private(set) bool $hovered = false;
```

Metadata. Se o ponteiro está sobre o thumb (pintura de accent ativa).

### check()

```php
public function check (): bool
```

Verifica se a barra desliza — o conteúdo transborda a view, então há um thumb para mostrar e arrastar.

### measure()

```php
public function measure (): array
```

Mede a geometria do thumb a partir dos números da view — retorna o `[start, size]` do thumb em linhas da faixa, ou `[0, 0]` quando a barra não desliza.

### hit()

```php
public function hit (int $column, int $line): null|string
```

Testa qual parte da faixa está em uma coordenada de tela — `'thumb'`, `'track'` ou `null` fora da faixa. Um predicado puro: sem render, sem estado. Uma barra sem posição ou sem deslize não acerta nada.

### aim()

```php
public function aim (int $line): int
```

Mira a view para que o thumb centre em uma linha de tela (drag ou click no trilho) — atualiza `first` e o devolve para o host aplicar.

### hover()

```php
public function hover (bool $over): void
```

Aplica (ou remove) o hover do thumb — a pintura de accent repinta a faixa no lugar quando a barra está posicionada; hosts que compõem re-renderizam a si mesmos. Um hover sem mudança não escreve nada; saída plana nunca faz hover.

### reset()

```php
public function reset (): void
```

Reseta o estado da view e o hover, silenciosamente — sem repaint; o reset do próprio host conduz a próxima pintura.

### invalidate()

```php
public function invalidate (): void
```

Invalida a faixa (membro do Boxing) — um no-op: não há estado blitted, todo render repinta a coluna inteira.

### render()

```php
public function render (int $mode = self::WRITE_OUTPUT): null|string
```

Renderiza a faixa: uma linha de glyph por linha da view. `WRITE_OUTPUT` pinta no lugar na coluna da faixa quando posicionada, ou escreve as linhas em fluxo quando não; `RETURN_OUTPUT` retorna as linhas unidas por `\n` (sem quebra final) para o host emendar. Uma barra que não desliza não renderiza nada.
