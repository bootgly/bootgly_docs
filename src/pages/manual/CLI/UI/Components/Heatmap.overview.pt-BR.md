# Heatmap

O `Heatmap` renderiza uma grade densa de células coloridas por estado, com quebra automática de linha — um `■` por entrada, em ordem de execução. Labels de canto opcionais emolduram a grade: `heading`/`summary` acima (esquerda/direita), `caption`/`note` abaixo. As cores são truecolor (com fallback automático para 256 cores), as células mapeiam estados por uma paleta configurável, e os frames são strings sem cursor — idênticos em terminais, pipes e logs de CI. Em terminais interativos a grade também pode pintar ao vivo conforme as células chegam.

É a grade de assertions do `bootgly test --view=heatmap`, onde cada assertion vira uma célula. Demos ao vivo estão disponíveis no [showcase](/manual/CLI/UI/Components/Heatmap/showcase).

## Instância

O componente é instanciado com o `Output`:

```php
use const Bootgly\CLI;
use Bootgly\CLI\UI\Components\Heatmap;

$Heatmap = new Heatmap(CLI->Terminal->Output);
```

## Montando uma grade

Atribua as células — chaves de estado em ordem de execução — e renderize. A grade quebra automaticamente pela largura; cada célula ocupa duas colunas (`■` mais um espaço). Com `width` em `null`, a grade segue a largura do terminal, limitada a 100 colunas:

```php
$Heatmap->width = 64;
$Heatmap->cells = [
   'passed', 'passed', 'passed', 'failed', 'passed', 'skipped',
   // ...
];

$Heatmap->render();
```

## Labels de canto

Quatro labels opcionais emolduram a grade — todos aceitam markup e têm `''` (ausente) como padrão. Labels da direita alinham rente à largura:

```php
$Heatmap->heading = '@#White:Assertions@;';
$Heatmap->summary = '@:error:2 failed@;';
$Heatmap->caption = '@#Black:9 / 12 assertions@;';
$Heatmap->note = '@#Black:suite 4@;';

$Heatmap->render();
```

Os labels são propriedades simples — o host os atualiza a qualquer momento, inclusive entre repaints ao vivo.

## Estados e cores customizados

A paleta mapeia qualquer chave de estado para uma cor `#RRGGBB`; estados desconhecidos renderizam esmaecidos:

```php
$Heatmap->palette = [
   'ok'   => '#7ec699',
   'warn' => '#e5c07b',
   'bad'  => '#e06c75',
];
$Heatmap->cells = ['ok', 'ok', 'warn', 'ok', 'bad', 'ok'];

$Heatmap->render();
```

## Streaming ao vivo

A grade pode pintar conforme os resultados chegam — `start()` a coloca na tela, `feed()` acrescenta células e repinta no lugar (com throttle; a grade cresce conforme enche), e `finish()` pinta o frame final e restaura o cursor:

```php
$Heatmap->start();

foreach ($results as $state) {
   $Heatmap->feed($state);
}

$Heatmap->finish();
```

O streaming só engata em terminais interativos — em saída plana (pipes, CI) o `feed()` fica em silêncio e o frame único final é renderizado no `finish()`. Force qualquer um dos comportamentos com `decoration`.

## O dashboard de testes

O runner de testes compõe a view heatmap com três peças: um [Fieldset](/manual/CLI/UI/Base/Fieldset) encaixota um [Meter](/manual/CLI/UI/Components/Charts) de Charts (progresso por cases) e este Heatmap (uma célula por assertion), repintando o card ao vivo a cada case:

```bash
php bootgly test --view=heatmap
```

Veja [Executando Testes](/testing/basic/running-tests) para o comportamento do lado do runner.

## Referência

```php
public null|int $width;
```

Colunas da grade. `null` (padrão) segue a largura do terminal, limitada a 100.

```php
public array $palette;
```

Mapa estado ⇒ cor `#RRGGBB` usado pelas células. Padrão: `passed` (verde), `failed` (vermelho suave) e `skipped` (bege).

```php
public string $heading;
```

Label acima da grade, alinhado à esquerda. Aceita markup. Padrão `''`.

```php
public string $summary;
```

Label acima da grade, alinhado à direita. Aceita markup. Padrão `''`.

```php
public string $caption;
```

Label abaixo da grade, alinhado à esquerda. Aceita markup. Padrão `''`.

```php
public string $note;
```

Label abaixo da grade, alinhado à direita. Aceita markup. Padrão `''`.

```php
public null|bool $decoration;
```

Chave do streaming ao vivo — `null` (padrão) segue o TTY, `false` força saída plana, `true` força repaints ao vivo.

```php
public float $throttle;
```

Segundos mínimos entre repaints ao vivo. Padrão `0.1`.

```php
public array $cells;
```

Células em ordem de execução — cada entrada é uma chave de estado da paleta. Padrão `[]`.

```php
public function render (int $mode = self::WRITE_OUTPUT): null|string
```

Renderiza a grade. `WRITE_OUTPUT` escreve o frame no `Output`; `RETURN_OUTPUT` retorna a string crua do frame.

```php
public function start (): void
```

Inicia a grade ao vivo — pinta o frame inicial e esconde o cursor. Saída plana inicia em silêncio (o frame final é renderizado no `finish()`).

```php
public function feed (string ...$states): self
```

Acrescenta células e repinta a grade no lugar em terminais interativos, com throttle por `throttle`. Células nunca se perdem — a saída plana só pula a pintura.

```php
public function finish (): void
```

Finaliza a grade ao vivo — pinta o frame final e restaura o cursor. Saída plana renderiza seu frame único aqui.
