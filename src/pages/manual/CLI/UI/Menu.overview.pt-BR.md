# Menu Component

O componente `Menu` da biblioteca Bootgly é responsável por renderizar e manipular um menu interativo no terminal.

## Instância

Para utilizar o componente, é necessário criar uma instância passando como parâmetros as instâncias dos componentes `Input` e `Output`.

```php
use const Bootgly\CLI;
use Bootgly\CLI\UI\Menu\Menu;

$Input = CLI->Terminal->Input;
$Output = CLI->Terminal->Output;

$Menu = new Menu($Input, $Output);
```

## Configurações

As configurações do menu podem ser definidas diretamente na instância do componente após a sua criação. As principais configurações são a largura do menu (`$width`) e a prompt exibida antes da apresentação das opções (`$prompt`).

### Largura

```php
// Define a largura do menu para 80 colunas
Menu::$width = 80;
```

### Prompt

A propriedade `$prompt` do componente define a mensagem que deve aparecer antes da lista de opções do menu quando este for aberto com a função `open()`. A mensagem pode ser personalizada pelo usuário de acordo com o contexto em que o menu está sendo utilizado.

Exemplo:

```php
$Menu->prompt = "Choose an option:"; // Define a mensagem "Choose an option:" como prompt do menu
```

## Uso

O uso do componente `Menu` se dá através da manipulação de suas propriedades e métodos. Entre as principais propriedades do componente estão `->Items`, `->Items->Options`, entre outras.

### Itens

A propriedade `$Items` armazena a configuração das opções do menu. O usuário pode adicionar opções, divisores, cabeçalhos, etc.

Existem duas formas de definir as opções dos itens: a primeira é acessando a propriedade `Options` do objeto `Items` e utilizando o método `add()` e a segunda é instanciando cada item separadamente e adicionando sua instância passando por argumento através do método `push()` do objeto `Items`.

#### Adicionando itens

```php
// > Items
$Items = $Menu->Items;

// > Items > Options
$Options = $Items->Options;

// * Config
// @ Selecting
$Options->Selection::Multiple->set();
$Options->selectable = true; // define se a opção é selecionável
$Options->deselectable = true; // define se o usuário pode remover a seleção após selecionar

// @ Styling
$Options->divisors = '-'; // define divisores em todas as opções
// @ Displaying
$Options->Orientation::Vertical->set();
$Options->Aligment::Left->set();

// * Items set - Option #1 */
$Items->Options->add(label: 'Option 1');
```

O exemplo acima adiciona uma opção simples no menu com rótulo "Option 1". As configurações de seleção (`Selection`) definem se é possível selecionar uma ou várias opções (`Single` ou `Multiple` respectivamente) e as propriedades de estilo (`Styling`) controlam a aparência visual do menu.

É possível utilizar dividores (`Divisor`) e cabeçalhos (`Header`) para melhor organizar as opções do menu.

#### Compondo itens

```php
// * Items set - Option #1 */
$Items->extend(
  new Divisors($Menu) // Estende itens com um novo tipo de Itens
);
$Items->push(
  (new Divisor(characters: '')),
  new Option(label: 'Option 1'),
  new Divisor(characters: '#'),
  new Option(label: 'Option 2'),
  new Divisor(characters: '.'),
  new Option(label: 'Option 3'),
  new Divisor(characters: '='),
);
```

### Open

O método `open()` do componente é responsável por renderizar o menu e processar as entradas fornecidas pelo usuário. Este método retorna um array com os índices das opções selecionadas.

Exemplo:

```php
$selected = $Menu->open();
```

O exemplo acima executa a função `open()` do componente e armazena as opções selecionadas em uma variável chamada `$selected`.
