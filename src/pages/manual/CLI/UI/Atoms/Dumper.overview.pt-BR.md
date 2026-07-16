# Componente Dumper

O componente `Dumper` renderiza qualquer valor PHP como saída estruturada e colorizada no terminal — o equivalente do Rich Pretty / symfony var-dumper, com zero dependências de terceiros. Escalares renderizam como literais tipados, arrays como árvores com contagem, e objetos expandem via reflection com sigilos de visibilidade — com segurança: get hooks de propriedades nunca são disparados, e ciclos reais são guardados com uma marca `*RECURSION*`.

É um **UI Atom** — uma primitiva sem dependência de outros componentes. O mesmo engine do ABI alimenta os globais `dump()`/`dd()` do framework e a saída de falha de assertion do `bootgly test`. Uma demo ao vivo está disponível no [showcase](/manual/CLI/UI/Atoms/Dumper/showcase).

## Instância

Para usar o componente, crie uma instância passando a instância do `Output`:

```php
use const Bootgly\CLI;
use Bootgly\CLI\UI\Atoms\Dumper;

$Dumper = new Dumper(CLI->Terminal->Output);
```

## Dump de um valor

Atribua qualquer valor e renderize. Arrays renderizam como árvores com header de contagem, uma entrada por linha:

```php
$Dumper->value = [
   'framework' => 'Bootgly',
   'version' => 1.0,
   'stable' => true,
   'ports' => [80, 443]
];

$Dumper->render();
```

```text
array:4 [
   'framework' => 'Bootgly'
   'version' => 1.0
   'stable' => true
   'ports' => array:2 [
      0 => 80
      1 => 443
   ]
]
```

Floats sempre mantêm a precisão (`1.0`, `0.30000000000000004`, `INF`); strings são single-quoted com caracteres de controle escapados visivelmente (`\n`, `\033`) — escape codes injetados nunca conseguem repintar seu terminal.

## Dump de um objeto

Objetos expandem via reflection. Cada propriedade carrega um sigilo de visibilidade — `+` public, `#` protected, `-` private — além de um prefixo `readonly` quando aplicável:

```php
$Dumper->value = $User;
$Dumper->render();
```

```text
App\User {
   +name: 'Rodrigo'
   readonly +id: 7
   #email: 'r@bootgly.com'
   -hash: 'c4ff33…' (+15)
   +status: App\Status::Active = 'active'
   +manager: App\User *RECURSION*
   #token: uninitialized
}
```

O walk é livre de efeitos colaterais por design: propriedades com hooks mostram o **valor cru de backing** (get hooks nunca rodam), propriedades virtuais renderizam uma nota `virtual`, propriedades tipadas não inicializadas uma nota `uninitialized`. Propriedades privadas de classes pai são incluídas com a classe declarante como nota. Enums renderizam inline com seu backing value, closures renderizam sua localização `file:line`, e `__debugInfo()` — quando definido — substitui o walk de propriedades por completo.

## Caps

Três caps mantêm grafos enormes legíveis. Containers mais profundos colapsam para `…`, containers mais longos colapsam a cauda, strings mais longas truncam com uma nota de caracteres restantes:

```php
$Dumper->depth = 2;      // níveis de aninhamento (default 8)
$Dumper->items = 3;      // entradas por container (default 100)
$Dumper->strings = 12;   // caracteres de string (default 150)

$Dumper->render();
```

```text
array:3 [
   'hash' => 'f00dfacefeed…' (+13)
   'fibonacci' => array:7 [
      0 => 1
      1 => 1
      2 => 2
      … +4 more
   ]
   'nested' => array:1 [
      'deep' => [ … ]
   ]
]
```

## Temas

A paleta é um **tema de dump nomeado**. Dois builtins acompanham o framework: `bootgly` (a paleta default) e `plain` (incolor). Registre o seu mapeando grupos de tema para códigos de cor SGR e selecione pelo nome:

```php
use Bootgly\ABI\Debugging\Data\Vars;

Vars\Dumper::$Themes['dracula'] = [
   Vars\Dumper::TYPE_STRING => '38;2;241;250;140',
   Vars\Dumper::TYPE_INT    => '38;2;189;147;249',
   Vars\Dumper::CLASSNAME   => '38;2;255;121;198',
   Vars\Dumper::PROPERTY    => '38;2;139;233;253',
];

$Dumper->theme = 'dracula';
$Dumper->render();
```

Os valores aceitam qualquer código SGR — cores nomeadas (`31`), variantes bright (`91`) ou truecolor (`38;2;R;G;B`). Grupos de tema sem entrada renderizam sem estilo. Selecionar um nome não registrado lança um `ValueError`. Os grupos disponíveis: `TYPE_NULL`, `TYPE_BOOL`, `TYPE_INT`, `TYPE_FLOAT`, `TYPE_STRING`, `CLASSNAME`, `PROPERTY`, `MODIFIER`, `PONTUATION`, `NOTE`.

## Saída não-interativa

Em pipes e CI o render mantém a estrutura com **zero escape codes**. `decoration` é tri-state: `null` (default) segue o TTY, `false` força plano, `true` força cores.

## Reference

### Propriedades

```php
public null|bool $decoration = null;
```

Config. Decoração SGR — `null` segue o TTY, `false` força plano, `true` força cores.

```php
public int $depth = 8;
```

Config. Nível máximo de aninhamento — containers mais profundos renderizam como `…`.

```php
public int $strings = 150;
```

Config. Máximo de caracteres de string — strings mais longas truncam com uma nota `(+N)`.

```php
public int $items = 100;
```

Config. Máximo de entradas por container — entradas extras colapsam em `… +N more`.

```php
public string $theme = 'bootgly';
```

Config. Tema de dump nomeado — resolvido do registro público `Vars\Dumper::$Themes` (grupo de tema → códigos SGR; builtins `bootgly` e `plain`). Nomes desconhecidos lançam `ValueError` no render.

```php
public mixed $value = null;
```

Data. O valor a dumpar — qualquer valor PHP, incluindo grafos de objetos cíclicos.

### render()

```php
public function render (int $mode = self::WRITE_OUTPUT): null|string
```

Renderiza o dump estruturado. `WRITE_OUTPUT` escreve no `Output` e retorna `null`; `RETURN_OUTPUT` retorna a string renderizada.
