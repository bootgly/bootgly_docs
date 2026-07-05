# Menu Component

O componente `Menu` da biblioteca Bootgly é responsável por renderizar e manipular um menu interativo no terminal.

## Instância

Para utilizar o componente, é necessário criar uma instância passando como parâmetros as instâncias dos componentes `Input` e `Output`.

```php
use const Bootgly\CLI;
use Bootgly\CLI\UI\Components\Menu;

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

### Renderizando

O Generator `rendering()` renderiza o menu e processa as teclas do usuário até o Enter. Conduza-o com um `foreach`; os índices das opções selecionadas ficam em `$Menu->selected`:

```php
foreach ($Menu->rendering() as $frame);

$selected = $Menu->selected;
```

Em entrada não interativa (pipes, CI) o menu renderiza uma vez e retorna as opções pré-selecionadas — determinístico em scripts.

### Mirando um default

`aim()` define a mira inicial (o marcador `=>`) — combine com o Enter-confirma para tornar uma opção o default:

```php
$Options->add(label: 'Console');
$Options->add(label: 'Web');

$Options->aim(1); // a mira começa em `Web`
```

Opções locked nunca seguram a mira.

### Confirmando com Enter

Enter com a seleção vazia confirma a opção mirada — sem precisar de Espaço. Com uma seleção explícita (Espaço), o Enter a mantém e ignora a mira.

### Viewport (listas longas)

Defina `viewport` para janelar listas verticais longas em N opções visíveis. A janela desliza com a mira e indicadores esmaecidos `↑/↓ N more` contam as opções ocultas:

```php
$Options->viewport = 5; // 5 opções visíveis por vez
```

### Filtro type-ahead

Digitar letras filtra as opções incrementalmente: a mira pula para o primeiro match e opções que não casam ficam ocultas enquanto o filtro está ativo. Um hint esmaecido `/filtro` renderiza sob o prompt. Backspace remove o último caractere; `Esc` puro limpa o filtro. Espaço sempre seleciona — nunca entra no filtro.

### Colunas em grade

Defina `columns` para dispor um menu vertical em grade — N opções por linha visual, cada célula com padding de `Menu::$width / columns`. `←`/`→` movem uma célula; `↑`/`↓` movem uma linha visual:

```php
Menu::$width = 60;
$Options->columns = 3;
```

## Veja ao vivo

O demo oficial de Menu roda no [showcase ao vivo](/manual/CLI/UI/Components/Menu/showcase) — código real do framework em PHP 8.4 WebAssembly, no seu navegador, direto desta página.
