# Heatmap

O `Heatmap` renderiza um card de dashboard com borda: uma moldura arredondada com título em negrito e percentual de score no cabeçalho, um medidor Meter em células `■`, uma grade densa de células coloridas por estado (com quebra automática de linha) e um rodapé discreto de contagens. As cores são truecolor (com fallback automático para 256 cores), as células mapeiam estados por uma paleta configurável, e o render é one-shot e sem cursor — idêntico em terminais, pipes e logs de CI.

É o componente por trás do `bootgly test --view=heatmap`, onde cada suíte de testes vira um card e cada assertion vira uma célula. Demos ao vivo estão disponíveis no [showcase](/manual/CLI/UI/Components/Heatmap/showcase).

## Instância

O componente é instanciado com o `Output`:

```php
use const Bootgly\CLI;
use Bootgly\CLI\UI\Components\Heatmap;

$Heatmap = new Heatmap(CLI->Terminal->Output);
```

## Montando um card

Atribua um título e as células — chaves de estado em ordem de execução — e renderize. O score deriva da fração de células `positive` (`passed` por padrão), o Meter o mede, e o rodapé conta positivas sobre o total:

```php
$Heatmap->title = 'http';
$Heatmap->width = 64;
$Heatmap->cells = [
   'passed', 'passed', 'passed', 'failed', 'passed', 'skipped',
   // ...
];

$Heatmap->render();
```

A grade quebra automaticamente na largura do card — cada célula ocupa duas colunas (`■` mais um espaço). Com `width` em `null`, o card segue a largura do terminal, limitada a 100 colunas.

## Estados e cores personalizados

A paleta mapeia qualquer chave de estado para uma cor `#RRGGBB`; estados desconhecidos renderizam esmaecidos. Aponte `positive` para o estado que o score e o Meter devem medir:

```php
$Heatmap->palette = [
   'ok'   => '#7ec699',
   'warn' => '#e5c07b',
   'bad'  => '#e06c75',
];
$Heatmap->positive = 'ok';
$Heatmap->cells = ['ok', 'ok', 'warn', 'ok', 'bad', 'ok'];

$Heatmap->render();
```

## O dashboard de testes

O runner de testes usa este componente como view de resultados — um card por suíte, uma célula por assertion, falhas listadas sob cada card:

```bash
php bootgly test --view=heatmap
```

Veja [Executando Testes](/testing/basic/running-tests) para o comportamento do lado do runner.

## Referência

```php
public string $title;
```

Título do card, renderizado em negrito no canto superior esquerdo do cabeçalho. Padrão `''`.

```php
public null|int $width;
```

Colunas do card. `null` (padrão) segue a largura do terminal, limitada a 100. Valores abaixo de 20 são elevados a 20.

```php
public array $palette;
```

Mapa estado ⇒ cor `#RRGGBB` usado pelas células e pelo Meter. Padrões: `passed` (rosa), `failed` (vermelho suave) e `skipped` (bege).

```php
public string $positive;
```

O estado medido pelo Meter e pelo score derivado. Padrão `'passed'`.

```php
public array $cells;
```

Células em ordem de execução — cada entrada é uma chave de estado da paleta. Padrão `[]`.

```php
public null|float $score;
```

Percentual de score exibido no cabeçalho e medido pelo Meter. `null` (padrão) o deriva da fração de células `positive`.

```php
public function render (int $mode = self::WRITE_OUTPUT): null|string
```

Renderiza o card. `WRITE_OUTPUT` escreve o frame no `Output`; `RETURN_OUTPUT` retorna a string bruta do frame.
