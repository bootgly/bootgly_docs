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
Existem 15 partes diferentes de bordas da tabela, e essa é a configuração padrão:

```php
$this->borders = [
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

## Uso

### Data set

Através da propriedade `$Data`, é possível definir os dados da tabela.
Ela permite adicionar uma matriz de dados para as 3 partes de uma tabela `header`, `body` e `footer` que são usadas como argumentos do método `set()`.

Exemplos:

```php
$Table->Data->set(header: ['Products', 'Quantity']);

$Table->Data->set(body: [
  ['Product 1', 280],
  ['Product 2', 112],
  ['Product 3', 209],
  ['@---;'],          // Isso é um separador de linha (row)
  ['Product 4', 276],
  ['Product 5', 93],
  ['Product 6', 297],
]);

// Além do método set(), é possível também utilizar outros métodos que trabalham com dados de tabelas como o sum que aqui é utilizado para calcular o somatório dos valores da coluna 1 e já mostrar o "Total" no rodapé da tabela
$Table->Data->set(footer: [
  'Total:',  $Table->Data->sum(column: 1)
]);
```

### Células

O objeto `$Cells` serve para configurar a aparência das células do conteúdo da tabela.

### Definindo alinhamento

É possível alinhar o texto das células à esquerda (`left`), ao centro (`center`) ou à direita (`right`).

Exemplo:

```php
$Table->Cells->align('left');
```
