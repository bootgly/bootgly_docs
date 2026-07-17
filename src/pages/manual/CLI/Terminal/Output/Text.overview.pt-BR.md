# Terminal Output\Text

Output\Text é uma classe que permite a formatação de texto na saída padrão (`STDOUT`) da linha de comando, utilizando cores, estilos e modificando o conteúdo exibido. Esta classe é utilizada internamente pela classe Output para formatar as mensagens antes de serem enviadas ao Terminal.

## Instância

Para utilizar a classe Output\Text do Terminal, você precisa acessar a instância através da classe Output:

```php
use const Bootgly\CLI;

$Output = CLI->Terminal->Output;
$Text = $Output->Text;
```

## Configurações

Esta classe não possui configurações adicionais.

### Conjunto de cores

Um objeto do tipo `Text\Colors` armazena qual tipo de cor será usado e fornece acesso aos métodos `set` e `get` para alterá-lo ou acessá-lo. É possível definir a cor usando os valores predefinidos `DEFAULT_COLORS` ou `BRIGHT_COLORS`.

```php
// Definindo configurações para usar cores brilhantes na saída do Terminal
$Text->Colors::Bright->set();

// Definindo configurações para usar cores padrão na saída do Terminal
$Text->Colors::Default->set();

// Obtendo o valor atual das definições do conjunto de cores
$colors = $Text->Colors->get();
```

## Uso

### Colorindo

```php
colorize ([ int|string $foreground = 'default' [, int|string $background = 'default' ]]) : Output
```

Este método define a cor dos próximos textos a serem exibidos na saída do Terminal.
As seguintes cores são aceitas por parâmetro:
`black`, `red`, `green`, `yellow`, `blue`, `magenta`, `cyan`, `white` e `default` (reseta para cor padrão do Terminal).
Além disso, você pode definir cores customizadas passando um número entre `0` e `255`.

Os números de `0` a `255` referem-se aos códigos de cores ANSI, que são usados para especificar cores no terminal. Esses códigos de cores são uma convenção padrão e são suportados por muitos terminais diferentes.

Os primeiros 16 códigos de cores são predefinidos e têm significados específicos. Por exemplo, o código de cor `0` é preto, o código de cor `1` é vermelho e o código de cor `2` é verde. Os códigos de cores restantes, de `16` a `255`, são personalizáveis e podem ser usados para criar cores personalizadas.

Cada código de cor de `16` a `255` é composto por uma combinação de três valores: vermelho, verde e azul (RGB). Cada valor pode variar de `0` a `5`, e os valores são combinados para formar a cor final.

Exemplo:

```php
$Text->Colors::Bright->set();

// Definindo a cor do texto para vermelho brilhante com fundo amarelo claro
$Text->colorize(foreground: 'red', background: 'yellow');
```

### Estilizando

```php
stylize ([ string ...$styles ]) : Output
```

Aplica um ou mais estilos de texto à saída.
Aceita como parâmetro os estilos `bold` (negrito), `italic` (itálico), `underline` (sublinhado), `strike`(tachado), `blink` (para fazer piscar o cursor) e `null` (para remover os estilos aplicados).

Exemplo:

```php
// Definindo o estilo do texto para negrito somente
$Text->stylize('bold');

// Definindo o estilo do texto como italic e underline
$Text->stylize('italic', 'underline');
```

### Espaçando

```php
space ([ int $n = 1 ]) : Output
```

Insira `<n>` espaços na posição atual do cursor, deslocando todo o texto existente para a direita.
O texto que sai da tela à direita é removido.
Aceita um parâmetro opcional para especificar quantos espaços inserir.

Exemplo:

```php
// Adicionando cinco espaços em branco
$Text->space(5);
```

### Deletando

```php
delete ([ ? int $characters [, ? int $lines ]]) : Output
```

Exclua `<n>` caracteres e/ou `<n>` linhas na posição atual do cursor.

Caracteres: irão se deslocar em caracteres de espaço, a partir da borda direita da tela.
Linhas: exclui `<n>` linhas do buffer, a partir da linha em que o cursor está posicionado.

Exemplo:

```php
// Excluindo duas linhas
$Text->delete(lines: 2);
```

### Apagando caracteres

```php
erase (int $characters = 1) : Output
```

Você pode usar o método `erase` para apagar caracteres a partir da posição atual do cursor no terminal. O método aceita como parâmetro um número inteiro, que representa o número de caracteres a serem apagados.

Exemplo:

```php
// Isso apaga os 10 próximos caracteres à direita do cursor.
$Text->erase(characters: 10);
```

### Inserindo linhas e espaços

```php
insert (? int $lines = null, ? int $spaces = null) : Output
```

Você pode utilizar o método `insert` para inserir linhas e/ou espaços em branco no terminal a partir da posição atual do cursor. O método aceita dois parâmetros inteiros:

- `lines`: número de linhas a serem inseridas abaixo da linha atual.
- `spaces`: número de espaços em branco a serem inseridos na coluna atual.

Exemplo:

```php
// Isso insere 3 novas linhas abaixo da linha atual e adiciona 5 espaços em brancos na coluna atual.
$Text->insert(lines: 3, spaces: 5);
```

### Limpando o display

```php
clear ([ bool $up = false [, bool $down = false [, int $lines = 0 ]]] ) : Output
```

Você pode utilizar o método `clear` para limpar uma ou mais partes do terminal:

Se `up` for `true`: as linhas acima da linha atual serão apagadas.
Se `down` for `true`: as linhas abaixo da linha atual serão apagadas.

```php
// Isso limpa todas as linhas acima da posição atual do cursor no terminal.
$Text->clear(up: true);

// Isso limpa todas as linhas abaixo da posição atual do cursor no terminal.
$Text->clear(down: true);

// Isso limpa todas as linhas acima e abaixo da posição atual do cursor no terminal.
$Text->clear(up: true, down: true);

// Isso também limpa todas as linhas acima e abaixo da posição atual do cursor no terminal.
$Text->clear();

// Isto limpa exatamente 3 linhas (linha do cursor + 2 abaixo) e retorna o
// cursor à linha inicial — tudo abaixo das 3 linhas sobrevive (delimitado).
$Text->clear(lines: 3);
```

### Removendo caracteres

```php
trim ([ bool $left = false [, bool $right = false ]]) : Output
```

Você pode usar o método `trim` para remover caracteres da linha atual. O método aceita dois parâmetros boleanos:

Se `left` for `true`: todos os caracteres à esquerda do cursor serão removidos.
Se `right` for `true`: todos os caracteres à direita do cursor serão removidos.

```php
// Isso remove todos os caracteres na linha atual no terminal.
$Text->trim(left: true, right: true);
```
