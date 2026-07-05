# Charts

A família Chart plota valores como texto ANSI. `Chart` é a base abstrata — série, escala, coloração por gradiente e o pipeline de saída — e os tipos concretos vivem em `Charts\`: um **Sparkline** de uma linha (`▁▂▃▄▅▆▇█`), **Bars** horizontais rotuladas, um gauge de porcentagem **Meter** (`■`) e um **Graph** multi-linha com streaming inspirado no btop, cujas células braille empacotam dois valores cada. Todo tipo colore suas células através de um **Gradient** truecolor (com fallback automático para 256 cores).

Sparkline, Bars e Meter renderizam strings puras — sem movimento de cursor, idênticas em terminais interativos e pipes. O Graph adicionalmente transmite ao vivo: `feed()` desliza um histórico de valores como um monitor de sistema. O `bootgly test benchmark` nativo usa o Bars para imprimir o throughput dos oponentes após a tabela de marks.

Esta família é distinta do chart SVG usado pelos relatórios de benchmark (`Bootgly\ACI\Tests\Benchmark\Chart`) — estes vivem no terminal. Demos ao vivo estão disponíveis no [showcase](/manual/CLI/UI/Components/Charts/showcase).

## Instância

Cada tipo de chart é um componente instanciado com o `Output`:

```php
use const Bootgly\CLI;
use Bootgly\CLI\UI\Components\Charts\Sparkline;

$Sparkline = new Sparkline(CLI->Terminal->Output);
```

## Plotando um sparkline

Atribua a série (rótulo ⇒ valor) e renderize — os valores normalizam entre o `min` e o `max` da série em 8 níveis de glyph, cada glyph colorido pelo seu nível através do gradiente:

```php
$Sparkline->series = ['q1' => 12.0, 'q2' => 25.0, 'q3' => 18.0, 'q4' => 40.0];

$Sparkline->render(); // ▁▄▂█
```

## Plotando barras

`Bars` renderiza uma linha rotulada por entrada — a sequência de `█` escala ao maior valor (ou ao `ceiling` fixo), e cada barra amostra o gradiente na sua fração do topo:

```php
use Bootgly\CLI\UI\Components\Chart\Gradient;
use Bootgly\CLI\UI\Components\Charts\Bars;

$Bars = new Bars(CLI->Terminal->Output);
$Bars->width = 30;
$Bars->precision = 0;
$Bars->Gradient = new Gradient(['#ff1744', '#ffd600', '#00c853']);
$Bars->series = [
   'bootgly'   => 166700.0,
   'workerman' => 83350.0
];

$Bars->render();
// bootgly   ██████████████████████████████ 166700
// workerman ███████████████ 83350
```

## Medindo com um meter

`Meter` renderiza uma porcentagem como uma sequência de `■` — células preenchidas amostram o gradiente na própria posição (rampas de calor leem naturalmente), células vazias renderizam esmaecidas:

```php
use Bootgly\CLI\UI\Components\Charts\Meter;

$Meter = new Meter(CLI->Terminal->Output);
$Meter->width = 30;
$Meter->Gradient = new Gradient(['#00c853', '#ffd600', '#ff1744']);
$Meter->value = 92.0;

$Meter->render(); // ■■■■■■■■■■■■■■■■■■■■■■■■■■■■(dim)■■
```

## Transmitindo um graph ao vivo

`Graph` é o monitor estilo btop: um gráfico de área multi-linha onde cada célula braille codifica dois valores consecutivos como um par de pontos (anterior, atual) — o dobro de resolução horizontal. `start()` reserva o frame, `feed()` desliza o histórico e repinta (com throttle), `finish()` restaura o cursor:

```php
use Bootgly\CLI\UI\Components\Charts\Graph;

$Graph = new Graph(CLI->Terminal->Output);
$Graph->width = 60;
$Graph->height = 6;
$Graph->ceiling = 100.0; // escala fixa 0-100 (um monitor estilo CPU)
$Graph->Gradient = new Gradient(['#00c853', '#ffd600', '#ff1744']);

$Graph->start();

while ($running) {
   $Graph->feed($load); // sua métrica amostrada

   usleep(50000);
}

$Graph->finish();
```

Cada linha amostra o gradiente na sua própria altura — o topo do frame renderiza a ponta quente. Em saída não interativa (pipes, CI) o `start()` é silencioso, o `feed()` apenas acumula e o `finish()` renderiza o único frame final — determinístico em scripts.

Os símbolos das células são configuráveis: `Symbols::Braille` (padrão, 2 valores por célula), `Symbols::Block` (quadrantes) ou `Symbols::TTY` (sombras `░▒█` para terminais limitados). `inverted` vira o gráfico de cabeça para baixo (down-graphs). Sem `start()`/`feed()`, o `render()` também plota uma `series` estática one-shot.

## Colorindo com gradientes

`Gradient` interpola de 1 a 3 stops hex em 101 níveis de cor. Terminais truecolor (detectados via `COLORTERM`) recebem escapes exatos `38;2;R;G;B`; os demais caem na entrada mais próxima do cubo de 256 cores. Um stop = cor sólida:

```php
use Bootgly\CLI\UI\Components\Chart\Gradient;

$Heat = new Gradient(['#00c853', '#ffd600', '#ff1744']); // verde → amarelo → vermelho
$Cyan = new Gradient(['#00ffff']);                        // sólido
$Cube = new Gradient(['#00ffff'], extended: true);        // força 256 cores
```

## Capturando a saída

Todo tipo aceita `RETURN_OUTPUT` para obter a string final (escapes ANSI resolvidos) em vez de escrever:

```php
$plot = $Bars->render(Bars::RETURN_OUTPUT);
```

## Referência

### Propriedades da base (`Bootgly\CLI\UI\Components\Chart`)

```php
public null|int $width
```

Config. A largura do frame em colunas — `null` deriva do terminal (Graph) ou do terminal menos as colunas de rótulo/valor (Bars); o Meter usa `20` como padrão. Padrão: `null`.

```php
public int $precision
```

Config. Casas decimais dos valores formatados (Bars). Padrão: `1`.

```php
public null|float $ceiling
```

Config. Um topo de escala fixo — `null` escala ao máximo medido da série. Padrão: `null`.

```php
public Gradient $Gradient
```

Config. O gradiente de cor amostrado pelo tipo. Padrão lazy: ciano sólido.

```php
public array $series
```

Data. A série a plotar — rótulo ⇒ valor float.

```php
public private(set) float $max
```

Metadata (somente leitura). O máximo medido.

```php
public private(set) float $min
```

Metadata (somente leitura). O mínimo medido.

### Gradient

```php
public function __construct (array $stops, null|bool $extended = null)
```

Cria um gradiente de 1 a 3 stops `#RRGGBB`. `extended` força o cubo de 256 cores — `null` detecta truecolor via `COLORTERM`.

```php
public function sample (int $percent): string
```

Amostra o escape SGR de foreground em uma porcentagem (restringida a 0-100). Amostras não carregam reset — os consumidores resetam no fim do frame.

### Symbols

```php
enum Bootgly\CLI\UI\Components\Chart\Symbols
{
   case Braille;
   case Block;
   case TTY;
}
```

Os conjuntos de símbolos de célula do Graph. Também expõe `Symbols::RAMP` (os 8 glyphs de nível do sparkline) e `Symbols::METER` (`■`).

```php
public function map (bool $inverted = false): array
```

Mapeia o conjunto para sua tabela plana 5×5 — 25 células indexadas `anterior * 5 + atual`, níveis 0-4. `inverted` preenche de cima para baixo.

### Sparkline / Bars

```php
public function render (int $mode = self::WRITE_OUTPUT): mixed
```

Plota a série one-shot: escreve o frame (`WRITE_OUTPUT`) ou o retorna como string resolvida (`RETURN_OUTPUT`). Série vazia é um no-op (`null`).

### Meter

```php
public float $value
```

Data. A porcentagem medida (0-100).

```php
public bool $inverted
```

Config. Amostra o gradiente da ponta alta para baixo. Padrão: `false`.

```php
public function render (int $mode = self::WRITE_OUTPUT): mixed
```

Renderiza o gauge — células preenchidas amostram o gradiente na sua posição, células vazias renderizam esmaecidas.

### Graph

```php
public int $height
```

Config. Linhas do frame. Padrão: `4`.

```php
public Symbols $Symbols
```

Config. O conjunto de símbolos de célula. Padrão: `Symbols::Braille`.

```php
public bool $inverted
```

Config. Preenche de cima para baixo (down-graph). Padrão: `false`.

```php
public null|int $capacity
```

Config. A capacidade do histórico de valores — `null` mantém dois valores por coluna do frame. Padrão: `null`.

```php
public float $throttle
```

Config. Segundos mínimos entre repinturas ao vivo. Padrão: `0.1`.

```php
public private(set) array $values
```

Data (somente leitura). O histórico de valores alimentado.

```php
public function start (): void
```

Inicia o graph ao vivo — reserva as linhas do frame e oculta o cursor. Silencioso em saída não interativa.

```php
public function feed (float $value): self
```

Alimenta um valor no histórico (deslizando-o na `capacity`) e repinta ao vivo em terminais interativos, com throttle. Em pipes apenas acumula.

```php
public function finish (): void
```

Finaliza o graph ao vivo — restaura o cursor; saída não interativa renderiza seu único frame final aqui. Também roda no destruct.

```php
public function render (int $mode = self::WRITE_OUTPUT): mixed
```

Renderiza o frame atual (`height` linhas, sem cursor) a partir do histórico alimentado — ou da `series` estática quando nada foi alimentado.
