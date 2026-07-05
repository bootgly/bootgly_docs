# Componente Chart

O componente `Chart` plota uma série rotulada como texto ANSI — um **Sparkline** de uma linha (`▁▂▃▄▅▆▇█`) ou **Bars** horizontais rotuladas escaladas ao maior valor. O render é uma string pura: sem movimento de cursor, idêntico em terminais interativos e pipes. O `bootgly test benchmark` nativo o usa para imprimir o throughput dos oponentes após a tabela de marks.

É distinto do chart SVG usado pelos relatórios de benchmark (`Bootgly\ACI\Tests\Benchmark\Chart`) — este vive no terminal. Uma demo ao vivo está disponível no [showcase](/manual/CLI/UI/Components/Chart/showcase).

## Instância

Para usar o componente, é necessário criar uma instância passando como parâmetro a instância do componente `Output`:

```php
use const Bootgly\CLI;
use Bootgly\CLI\UI\Components\Chart;

$Chart = new Chart(CLI->Terminal->Output);
```

## Plotando um sparkline

Atribua a série (label ⇒ valor) e renderize — os valores normalizam entre o `min` e o `max` da série em 8 níveis de glifos:

```php
$Chart->series = ['q1' => 12.0, 'q2' => 25.0, 'q3' => 18.0, 'q4' => 40.0];

$Chart->render(); // ▁▄▂█
```

## Plotando barras

Troque `Plots` para `Bars` para uma linha rotulada por entrada — a sequência de `█` escala ao maior valor:

```php
use Bootgly\CLI\UI\Components\Chart\Plots;

$Chart->Plots = Plots::Bars;
$Chart->width = 30;
$Chart->precision = 0;
$Chart->series = [
   'bootgly'   => 166700.0,
   'workerman' => 83350.0
];

$Chart->render();
// bootgly   ██████████████████████████████ 166700
// workerman ███████████████ 83350
```

## Capturando a saída

Passe `RETURN_OUTPUT` para obter a string final (escapes ANSI resolvidos) em vez de escrever:

```php
$plot = $Chart->render(Chart::RETURN_OUTPUT);
```

## Referência

### Plots

```php
enum Bootgly\CLI\UI\Components\Chart\Plots
{
   case Sparkline;
   case Bars;
}
```

O estilo de plotagem.

### Propriedades

```php
public Plots $Plots
```

Config. O estilo de plotagem. Padrão: `Plots::Sparkline`.

```php
public null|int $width
```

Config. A largura da área de barras em colunas (Bars) — `null` deriva da largura do terminal menos as colunas de label e valor. Padrão: `null`.

```php
public string $color
```

Config. A cor do plot (markup de Template). Padrão: `'@#Cyan:'`.

```php
public int $precision
```

Config. Casas decimais dos valores formatados (Bars). Padrão: `1`.

```php
public array $series
```

Data. A série a plotar — label ⇒ valor float.

```php
public private(set) float $max
```

Metadata (somente leitura). O máximo da série, resolvido por `render()`.

```php
public private(set) float $min
```

Metadata (somente leitura). O mínimo da série, resolvido por `render()`.

### render()

```php
public function render (int $mode = self::WRITE_OUTPUT): mixed
```

Plota a série: escreve o frame (`WRITE_OUTPUT`) ou o retorna como string resolvida (`RETURN_OUTPUT`). Série vazia é no-op (`null`).
