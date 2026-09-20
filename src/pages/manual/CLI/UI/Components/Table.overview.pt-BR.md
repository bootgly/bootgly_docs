# Classe `Table`

A classe `Table` é utilizada para criar e exibir tabelas no terminal. Ela foi desenvolvida para ser usada juntamente com as classes `CLI` e `Terminal`.

## Instância

Para criar uma instância da classe `Table`, deve-se utilizar o seguinte código:

```php
use const Bootgly\CLI;
use Bootgly\CLI\UI\Components\Table;

$Output = CLI->Terminal->Output;

$Table = new Table($Output);
```

Através do objeto `$Table`, é possível acessar os métodos e propriedades desta classe.

## Configuração

### bordas

É possível configurar as bordas da tabela através da propriedade `$borders`.
Existem 15 partes diferentes de bordas da tabela, e essa é a configuração padrão — o preset `Table::DEFAULT_STYLE` que o construtor atribui:

```php
$Table->borders = [
  'top'          => '═',
  'top-left'     => '╔',
  'top-mid'      => '╤',
  'top-right'    => '╗',

  'bottom'       => '═',
  'bottom-left'  => '╚',
  'bottom-mid'   => '╧',
  'bottom-right' => '╝',

  'mid'          => '─',
  'mid-left'     => '╟',
  'mid-mid'      => '┼',
  'mid-right'    => '╢',
  'middle'       => '│ ',

  'left'         => '║',
  'right'        => '║',
];
```

Atribua o segundo preset para remover a moldura por completo — todas as partes são strings vazias, então a tabela é renderizada como colunas simples preenchidas com espaços:

```php
$Table->borders = Table::NO_BORDER_STYLE;
```

```text
Products  Quantity
Product 1 280
Product 2 112
```

Cada parte é uma string comum, então um preset também serve de ponto de partida — sobrescreva apenas as partes que quiser:

```php
$Table->borders = Table::DEFAULT_STYLE;
$Table->borders['middle'] = '│ ';
```

## Uso

### Data set

Através da propriedade `$Data`, é possível definir os dados da tabela.
Uma tabela tem 3 seções — `Header`, `Body` e `Footer` — e cada uma recebe uma **matriz de linhas** através do seu próprio método `set()`. Cada linha é, por sua vez, uma matriz de células:

```php
$Table->Data->Header->set([
  ['Products', 'Quantity']
]);

$Table->Data->Body->set([
  ['Product 1', 280],
  ['Product 2', 112],
  ['Product 3', 209],
  ['@---;'],          // Isso é um separador de linha (row)
  ['Product 4', 276],
  ['Product 5', 93],
  ['Product 6', 297],
]);

// Além do método set(), o objeto Data também calcula sobre o body — o sum() aqui
// soma os valores da coluna 1 e o resultado vai direto para o rodapé da tabela
$Table->Data->Footer->set([[
  'Total:', $Table->Data->sum(column: 1)
]]);
```

Uma seção que você nunca definir simplesmente não é desenhada: uma tabela sem rodapé fecha logo depois do body, sem nenhuma borda perdida.

### Células

O objeto `$Cells` serve para configurar a aparência das células do conteúdo da tabela.

### Definindo alinhamento

É possível alinhar o texto das células à esquerda (`left`), ao centro (`center`) ou à direita (`right`).

Exemplo:

```php
$Table->Cells->align('left');
```

### Renderizando

Nada é desenhado até o `render()` ser chamado. Ele mede todas as colunas de acordo com os dados e então escreve o cabeçalho, o body e o rodapé — bordas incluídas — no `Output` que o construtor recebeu:

```php
$Table->render();
```

```text
╔═══════════╤══════════╗
║ Products  │ Quantity ║
╟───────────┼──────────╢
║ Product 1 │ 280      ║
║ Product 2 │ 112      ║
║ Product 3 │ 209      ║
╟───────────┼──────────╢
║ Product 4 │ 276      ║
║ Product 5 │ 93       ║
║ Product 6 │ 297      ║
╟───────────┼──────────╢
║ Total:    │ 1267     ║
╚═══════════╧══════════╝
```

Cada chamada escreve uma tabela completa, então chamar `render()` de novo imprime uma segunda tabela abaixo da primeira. Para redesenhar no mesmo lugar — o padrão que o demo ao vivo usa para percorrer os três alinhamentos — suba o cursor e apague antes de renderizar novamente:

```php
$alignments = ['left', 'center', 'right'];

foreach ($alignments as $index => $alignment) {
   $Table->Cells->align($alignment);
   $Table->render();

   // ? Apaga só entre os frames: a última tabela permanece na tela
   if ($index < count($alignments) - 1) {
      $Output->Cursor->up(13);   // as 13 linhas que a tabela acima escreveu
      $Output->Text->clear(down: true);
   }
}
```

As larguras das colunas ficam guardadas na tabela e só crescem entre as chamadas: renderizar um conjunto de dados mais estreito pela mesma instância mantém a maior medição já feita. Construa uma nova `Table` quando os dados mudarem de formato.

Como o `Output` é injetado, uma tabela pode ser renderizada em qualquer lugar aonde uma stream chegue — um [Frame](/manual/CLI/UI/Base/Frame/overview), um arquivo, `php://memory` para testes — e não somente no terminal:

```php
use Bootgly\CLI\Terminal\Output;

$Table = new Table(new Output('php://memory'));
$Table->render();
```

## Veja ao vivo

O demo oficial de Table roda no [showcase ao vivo](/manual/CLI/UI/Components/Table/showcase) — código real do framework em PHP 8.4 WebAssembly, no seu navegador, direto desta página.

## Referência

### Propriedades

```php
public array $borders
```

Config. As 15 partes da borda. Começa como `Table::DEFAULT_STYLE`; atribua um preset ou sobrescreva partes isoladas.

```php
public DataTable $Data
```

Data. O `Bootgly\ADI\Table` que guarda as linhas — `Header`, `Body` e `Footer` —, além das operações sobre o body.

```php
public private(set) Output $Output
```

Config (somente leitura). O `Terminal\Output` no qual toda borda e toda linha são escritas — o que foi dado ao construtor.

```php
public Cells $Cells
```

Data. A aparência das células para a tabela inteira (alinhamento).

```php
public Columns $Columns
```

Data. A medição das colunas: a estratégia de autowiden e o mapa de `Width` calculado.

```php
public Row $Row
```

Data. O renderizador de uma linha, no qual `Rows` delega — uma linha de células entre as bordas esquerda e direita.

```php
public Rows $Rows
```

Data. O renderizador de seções: abre a tabela, desenha cada seção e a fecha.

### Presets de borda

```php
public const DEFAULT_STYLE
```

A moldura de linha dupla (box-drawing) que o construtor atribui: `═ ╔ ╤ ╗` no topo, `═ ╚ ╧ ╝` embaixo, `─ ╟ ┼ ╢` nos separadores de seção, `│ ` entre as células e `║` nos dois lados.

```php
public const NO_BORDER_STYLE
```

As mesmas 15 chaves, todas com string vazia. A tabela é renderizada como colunas preenchidas com espaços, sem moldura e sem linhas separadoras — as linhas separadoras `@---;` não desenham nada.

### render()

```php
public function render (int $mode = self::WRITE_OUTPUT): void
```

Renderiza a tabela inteira: alarga as colunas automaticamente de acordo com os dados atuais (`Columns->autowiden()`) e então desenha cada seção não vazia (`Rows->render()`). A saída sempre vai para o `$Table->Output`; o parâmetro `$mode` existe por causa do contrato de `Component` (`RETURN_OUTPUT` / `WRITE_OUTPUT`) e o modo que devolve a string ainda não está implementado na `Table` — o tipo de retorno é `void`. Para capturar uma tabela, injete um `Output` sobre `php://memory` e leia a stream.

### border()

```php
public function border (string $position, string $section): void
```

Escreve uma linha horizontal de borda no `Output`. `position` é `'top'`, `'mid'` ou `'bottom'` (qualquer outro valor não escreve absolutamente nada); `section` nomeia a seção à qual a linha pertence e é registrada em `$Columns->section`. A linha é construída a partir das larguras já medidas em `$Columns->Width`, então ela só se alinha depois que `Columns->autowiden()` (ou um `render()` anterior) tiver rodado. Com `NO_BORDER_STYLE` nada é escrito. É esta a chamada que `Rows->render()` faz para abrir, separar e fechar a tabela.

### Cells->align()

```php
public function align (string $alignment): int
```

Define — e devolve — o alinhamento das células usado por toda linha renderizada: `'left'` (`1`, o padrão), `'right'` (`0`) ou `'center'` (`2`). Qualquer outro valor cai de volta para `'left'`. O valor guardado pode ser lido em `$Table->Cells->alignment`.

### Columns->autowiden()

```php
public function autowiden (): bool
```

Mede toda célula de toda seção e registra a mais larga por coluna em `$Columns->Width`, ignorando sequências de escape ANSI e contando texto multibyte por caracteres. O `render()` o chama; chame você mesmo antes de usar `border()` ou `Row->render()` diretamente. As larguras são guardadas com `max()`, então chamadas repetidas só as fazem crescer. Sempre retorna `true`.

### Columns->Autowiden

```php
public Autowiden $Autowiden
```

Config. A estratégia de largura. `Autowiden::Based_On_Entire_Column` — uma largura por coluna em toda a tabela — é o que o construtor atribui e o que o renderizador desenha.

### Columns->count()

```php
public function count (null|string $section = null): int
```

Retorna quantas colunas foram medidas. `0` antes do primeiro `autowiden()`.

### Columns->Width

```php
public function set (string|int $index, int $width, null|string $section = null): void
```

Guarda a largura de uma coluna, substituindo o que tiver sido medido.

```php
public function get (null|string $section = null): array
```

Retorna o mapa `[índice da coluna => largura]` a partir do qual as bordas e as linhas são desenhadas.

```php
public function max (string|int $index, int $width, null|string $section = null): void
```

Guarda a largura apenas quando ela for maior do que a já registrada — é assim que o `autowiden()` faz uma coluna crescer.

```php
public function count (null|string $section = null): int
```

Retorna o número de colunas registradas.

### Row->render()

```php
public function render (array $row, string $section): void
```

Escreve uma linha: a borda esquerda, cada célula preenchida até a largura da sua coluna com o alinhamento atual, o separador `middle` entre as células e então a borda direita. Uma linha que seja exatamente `['@---;']` desenha uma borda `mid` no lugar — o separador de linhas usado dentro de uma seção. Células ausentes em `$row` são renderizadas vazias.

### Rows->render()

```php
public function render (): void
```

Desenha a tabela seção por seção, pulando as vazias: a primeira seção abre com uma borda `top`, cada seção seguinte é precedida por uma borda `mid` e a última fecha com uma borda `bottom`. Uma tabela cujas seções estejam todas vazias não escreve absolutamente nada.

### Data->Header / Body / Footer ->set()

```php
public function set (array $rows): void
```

Substitui as linhas da seção. Cada linha é uma matriz de células (`[['Products', 'Quantity']]` é uma linha de duas células). As seções são coleções `Bootgly\ADI\Table\Rows` — também são iteráveis e suportam acesso por array, então `$Table->Data->Body[] = ['Product 7', 42];` acrescenta uma linha.

### Data->sum()

```php
public function sum (int $column): false|int|float
```

Soma os valores numéricos de uma coluna do body — o total do rodapé no exemplo acima. O `Bootgly\ADI\Table` oferece `subtract()`, `multiply()` e `divide()` com o mesmo argumento `column`, além de `find(int $column, mixed $value): bool` para procurar um valor no body.
