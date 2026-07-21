# Theme

O Bootgly traz um sistema de temas nativo e sem dependências em
`Bootgly\ABI\Code\__String\Theme`. Um tema mapeia **chaves semânticas** (`success`, `info`,
`notice`, `warning`, `error`, `debug`) para decorações de terminal, então a mesma saída muda de
cor quando você troca de tema. Três temas já vêm embutidos — `dark`, `light` e `mono` (sem
cor) — e o renderizador de markup da CLI resolve seus tokens de cor `@:…:` através do tema
**ativo**, então todos os componentes de UI seguem o tema de uma vez.

> [!NOTE]
> O tema de UI ativo fica em `Theme::$Current`. Ele usa `dark` por padrão, ou `mono` quando a
> variável de ambiente [`NO_COLOR`](https://no-color.org) está presente.

## Trocar o tema ativo

Tudo que a CLI imprime pelo renderizador de markup — Menu, Question, Prompt, Form, Timeline,
Alerts, Text — colore seus tokens `@:success:`/`@:error:`/… através de `Theme::$Current`. Troque
uma vez e a UI inteira segue:

```php
use Bootgly\ABI\Code\__String\Theme;

Theme::$Current->select(Theme::LIGHT); // cores não-bright, para terminais claros
Theme::$Current->select(Theme::DARK);  // cores bright (padrão)
```

## Ficar sem cor

`mono` não emite nenhum ANSI — a escolha certa para pipes, logs de CI ou arquivos simples:

```php
use Bootgly\ABI\Code\__String\Theme;

Theme::$Current->select(Theme::MONO);
```

Você raramente precisa fazer isso na mão: definir `NO_COLOR=1` no ambiente já torna `mono` o
tema ativo padrão no boot.

## Aplicar um tema diretamente

Qualquer instância de tema decora uma string por chave semântica. `apply()` envolve o conteúdo
com a decoração de abertura da chave e o reset de fechamento:

```php
use Bootgly\ABI\Code\__String\Theme;

$Theme = new Theme(Theme::DARK);

echo $Theme->apply('error', 'Disco cheio');  // "Disco cheio" em vermelho bright, depois reset
echo $Theme->open('warning');                // apenas o escape de abertura
echo $Theme->close();                        // o reset
```

Sob `mono`, `open()` retorna uma string vazia e `apply()` retorna o conteúdo intacto — sem
condicional no ponto de chamada.

## Registrar seu próprio tema

Um tema é uma entrada `name => specifications`. `options` diz como **abrir** (`prepending`) e
**fechar** (`appending`) uma decoração; `values` são os argumentos por chave passados ao callback
de abertura. `add()` aceita um ou vários de uma vez:

```php
use Bootgly\ABI\Code\__String\Escapeable\Text\Formattable;
use Bootgly\ABI\Code\__String\Theme;

$Theme = new Theme;
$Theme->add(['ocean' => [
   'options' => [
      'prepending' => ['type' => 'callback', 'value' => Formattable::wrap(...)],
      'appending'  => ['type' => 'string',   'value' => Formattable::_RESET_FORMAT]
   ],
   'values' => [
      'success' => Formattable::_CYAN_BRIGHT_FOREGROUND,
      'error'   => Formattable::_RED_BRIGHT_FOREGROUND
   ]
]]);

$Theme->select('ocean');
echo $Theme->apply('success', 'Conectado');
```

O `value` de `prepending`/`appending` é uma `string` (emitida como está) ou um `callback`
(invocado com os `values` da chave como argumentos). Uma estrutura inválida lança uma
`ThemeException`.

## Referência

### `Bootgly\ABI\Code\__String\Theme`

```php
public function __construct (null|string $name = null)
```

Cria um handle de tema. Quando `$name` é informado e está registrado, ele é selecionado na hora.

```php
public static self $Current
```

O tema de UI ativo, lido pelo renderizador de markup da CLI. Troque por inteiro
(`Theme::$Current = new Theme(Theme::LIGHT)`) ou no lugar (`Theme::$Current->select('light')`).

```php
public private(set) null|string $active
```

O nome do tema atualmente selecionado nesta instância (`null` antes de qualquer seleção).

```php
public function open (string $key): string
```

Retorna a decoração de abertura de uma chave semântica (sem conteúdo, sem reset). String vazia
sob `mono` ou para uma chave desconhecida.

```php
public function close (string $key = ''): string
```

Retorna a decoração de fechamento (o reset, para os embutidos). `$key` só importa para temas cujo
`appending` é um callback.

```php
public function apply (string $key, string $content = ''): string
```

Retorna `open($key) . $content . close($key)` — o conteúdo envolvido na decoração da chave.

```php
public function add (array $themes): self
```

Registra um ou mais temas `name => specifications` no registro compartilhado. Lança
`ThemeException` numa estrutura inválida.

```php
public function select (null|string $name = null): bool
```

Ativa um tema registrado nesta instância (usa por padrão o `active` atual da instância). Retorna
`false` quando o nome não está registrado.

```php
public static function check (string $name): bool
```

Se um nome de tema está registrado.

```php
public static function list (): array
```

Os nomes de todos os temas registrados.

### Temas embutidos

| Constante      | Nome     | Cores                                        |
| -------------- | -------- | -------------------------------------------- |
| `Theme::DARK`  | `dark`   | foregrounds bright (padrão)                  |
| `Theme::LIGHT` | `light`  | foregrounds normais (não-bright)             |
| `Theme::MONO`  | `mono`   | nenhuma — sem cor (também o padrão de `NO_COLOR`) |

### Chaves semânticas

`dark` e `light` definem: `success`, `debug`, `info`, `notice`, `warning`, `error`. No markup da
CLI são os tokens `@:success:`, `@:info:`, `@:notice:`, `@:warning:`, `@:error:`, `@:debug:`
(formas curtas `@:s:`, `@:i:`, `@:n:`, `@:w:`, `@:e:`, `@:d:`), fechados com `@;`.
