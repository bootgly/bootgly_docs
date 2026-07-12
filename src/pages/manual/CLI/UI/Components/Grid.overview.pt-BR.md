# Componente Grid

O componente `Grid` é um layout de trilhas com pesos que posiciona [Frames](/manual/CLI/UI/Components/Frame/overview) na tela — um dashboard estilo btop em poucas linhas. Linhas e colunas são arrays de pesos de trilha, cada Frame posicionado ancora em uma trilha e pode ocupar várias delas, e os tamanhos das trilhas sempre somam exatamente o retângulo do grid, qualquer que seja o tamanho do terminal.

Uma demo ao vivo está disponível no [showcase](/manual/CLI/UI/Components/Grid/showcase).

## Um dashboard estilo btop

```php
use const Bootgly\CLI;
use Bootgly\CLI\UI\Components\Charts\Graph;
use Bootgly\CLI\UI\Components\Frame;
use Bootgly\CLI\UI\Components\Grid;

$Terminal = CLI->Terminal;
$Output = $Terminal->Output;

// ! Layout — 2 trilhas de linha (2:1) × 2 trilhas de coluna (2:1), terminal inteiro
$Grid = new Grid($Output);
$Grid->rows = [2, 1];
$Grid->columns = [2, 1];

$CPU = new Frame($Output);
$CPU->title = 'CPU';
$Log = new Frame($Output);
$Log->title = 'Log';

$Grid
   ->place($CPU, row: 1, column: 1, colspan: 2)
   ->place($Log, row: 2, column: 1, colspan: 2);

// ! Um chart vinculado ao Output isolado do frame
$Graph = new Graph($CPU->Output);
$Graph->width = $CPU->columns;
$Graph->height = $CPU->lines;
$Graph->ceiling = 100.0;

// @@ O loop de tick
$Terminal->Screen->open();
$Output->Cursor->hide();

for ($tick = 0; $tick < 100; $tick++) {
   $CPU->clear();
   $Graph->feed(random_int(0, 100));
   $Graph->render();

   $Log->Output->render("tick @#yellow:{$tick}@;\n");

   $Grid->render();

   usleep(100000);
}

$Output->Cursor->show();
$Terminal->Screen->close();
```

## Trilhas com pesos

`$rows` e `$columns` são arrays de pesos — cada entrada é uma trilha, dimensionada proporcionalmente:

```php
$Grid->rows = [1, 2];        // 1/3 + 2/3 da altura
$Grid->columns = [2, 1, 1];  // 50% + 25% + 25% da largura
```

```text
┌─CPU──────────────────────────┐
│ (1/3 da altura)              │
├─Procs──────────────┬─Log─────┤
│ (2/3 · 50% larg.)  │ (25%)   │
└────────────────────┴─────────┘
```

Os tamanhos das trilhas são distribuídos por maior resto — sempre somam exatamente o retângulo, e colunas ímpares se espalham uniformemente em vez de acumular em uma trilha. `width`/`height` `null` (o padrão) acompanham o tamanho do terminal.

## Posicionando frames

`place()` ancora um Frame em uma trilha de linha/coluna (base 1) ocupando uma ou mais trilhas — e atribui a geometria do Frame **imediatamente**, então as métricas internas podem ser lidas logo em seguida para dimensionar componentes hospedados:

```php
$Grid->place($MEM, row: 1, column: 2, rowspan: 2);

$Meter = new Meter($MEM->Output);
$Meter->width = $MEM->columns;   // já dimensionado pelo posicionamento
```

Posicionamentos fora das trilhas são fixados dentro do grid. Sobreposições são permitidas e pintam na ordem de posicionamento (ordem do pintor) — o último frame posicionado vence, o que overlays intencionais podem explorar.

## Gap

`$gap` deixa colunas/linhas em branco entre as células — descontado apenas dos lados que encaram outra célula, então as bordas externas continuam alinhadas ao retângulo do grid:

```php
$Grid->gap = 1;
```

O padrão é `0` — bordas de frames adjacentes se tocam, o visual btop.

## Resize

`resize()` casa com a assinatura do handler do `Screen::watch` — conecte-o e despache sinais no loop de tick; o grid limpa a tela (removendo artefatos de encolhimento), reposiciona todos os frames e repinta:

```php
$Terminal->Screen->watch(function (int $columns, int $lines) use ($Grid): void {
   $Grid->resize($columns, $lines);
});

// dentro do loop de tick:
pcntl_signal_dispatch();
```

Nada é conectado sozinho: o grid nunca instala handlers de sinal escondidos.

## Saída não interativa

Em pipes e CI, a renderização escreve o retângulo de cada frame posicionado de forma plana, na ordem de posicionamento — determinística, testável com `RETURN_OUTPUT`.

## Referência

### Propriedades

```php
public int $row
```

Config. A linha superior do grid na tela (base 1). Padrão: `1`.

```php
public int $column
```

Config. A coluna esquerda do grid na tela (base 1). Padrão: `1`.

```php
public null|int $width
```

Config. A largura externa do grid, em colunas — `null` acompanha as colunas do terminal. Padrão: `null`.

```php
public null|int $height
```

Config. A altura externa do grid, em linhas — `null` acompanha as linhas do terminal. Padrão: `null`.

```php
public array $rows
```

Config. Os pesos das trilhas de linha. Padrão: `[1]`.

```php
public array $columns
```

Config. Os pesos das trilhas de coluna. Padrão: `[1]`.

```php
public int $gap
```

Config. Colunas/linhas em branco entre as células. Padrão: `0`.

```php
public private(set) array $Cells
```

Data (somente leitura). Os frames posicionados (instâncias de `Cell`), em ordem de pintura.

### place()

```php
public function place (Frame $Frame, int $row, int $column, int $rowspan = 1, int $colspan = 1): self
```

Posiciona um Frame sobre as trilhas do grid e atribui sua geometria imediatamente. Encadeável; sobreposições pintam na ordem de posicionamento.

### arrange()

```php
public function arrange (): void
```

Distribui os tamanhos das trilhas sobre o retângulo do grid e atribui a cada Frame posicionado sua geometria de tela — geometria pura, sem renderização.

### resize()

```php
public function resize (int $columns, int $lines): void
```

Redimensiona o retângulo do grid — limpa a tela, invalida todos os frames posicionados (conteúdo preservado) e repinta. A assinatura casa com o handler de resize do `Screen::watch`.

### render()

```php
public function render (int $mode = self::WRITE_OUTPUT): null|string
```

Arranja o layout e renderiza cada Frame posicionado, em ordem de posicionamento. Com `RETURN_OUTPUT`, retorna os retângulos dos frames concatenados.

### Cell

```php
public Frame $Frame
```

O value object `Grid\Cell` guarda um posicionamento: o `Frame` (gravável — designs empilhados podem redirecionar a célula) mais as trilhas `row`, `column`, `rowspan` e `colspan`.
