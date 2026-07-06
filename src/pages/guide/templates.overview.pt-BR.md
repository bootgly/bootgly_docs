# Templates

O Bootgly traz um motor de templates nativo e sem dependências em
`Bootgly\ABI\Templates\Template`. Templates são texto puro com diretivas `@`; o motor compila
uma única vez para PHP raw, guarda o compilado em `storage/cache/templates/` e recompila
automaticamente quando o fonte muda. Herança (`@extends`/`@section`/`@yield`), includes e
componentes com slots, output com escape HTML e erros apontando para a linha do template vêm
de fábrica.

> [!NOTE]
> No lado Web, as views renderizadas com `$Response->View->render()` são arquivos deste mesmo
> motor — tudo abaixo vale também para os arquivos `views/*.template.php`.

## Renderize seu primeiro template

Um `Template` aceita uma string inline ou um `File`, e `render()` retorna o output:

```php
use Bootgly\ABI\Templates\Template;

$Template = new Template('Olá, @> $name;!');

echo $Template->render(['name' => 'Bootgly']); // Olá, Bootgly!
```

Para renderizar um arquivo de template, passe um `File` (a extensão convencional é
`.template.php`):

```php
use Bootgly\ABI\IO\FS\File;
use Bootgly\ABI\Templates\Template;

$Template = new Template(new File(__DIR__ . '/welcome.template.php'));

echo $Template->render(['name' => 'Bootgly']);
```

O primeiro render compila e cacheia; os seguintes apenas fazem `include` do cache compilado.
Editar o arquivo fonte invalida o cache automaticamente (comparação de mtime) — servidores de
longa duração enxergam edições de template sem reiniciar.

## Output

Quatro diretivas de output raw e uma com escape:

```text
@> $value;      imprime a expressão
@>. $value;     imprime + quebra de linha depois
@.> $value;     quebra de linha antes + imprime
@.>. $value;    quebra de linha antes e depois
@>> $value;     imprime com htmlspecialchars (seguro para HTML)
```

Qualquer valor controlado pelo usuário que vá parar em HTML deve passar por `@>>`:

```php
$Template = new Template('<p>@>> $comment;</p>');

echo $Template->render(['comment' => '<script>alert(1)</script>']);
// <p>&lt;script&gt;alert(1)&lt;/script&gt;</p>
```

`@>` permanece raw — reserve-o para markup confiável.

## Controle de fluxo

Condicionais, switches e loops espelham o PHP com aberturas `:` e fechamentos `;`:

```text
@if $logged:
   Bem-vindo de volta!
@else:
   Faça login.
@if;

@foreach $users as $user:
   @> $user->name; (@> $@->iteration; de @> $@->count;)
@foreach;
```

Dentro de loops, a metavariável `$@` expõe `key`, `value`, `count`, `iteration`, `remaining`,
`isFirst`, `isLast`, `isOdd`, `isEven` — e `Parent`/`depth` em loops aninhados. Blocos de PHP
raw abrem com `@:` e fecham com `@;`.

## Layouts e herança

Templates nomeados (`@extends`, `@include`, `@component`) são resolvidos contra um diretório
base, `Template::$path`, com a extensão `.template.php`. Dentro de views WPI isso já vem
configurado (o diretório `views/` do projeto); avulso, configure uma vez:

```php
use Bootgly\ABI\Templates\Template;

Template::$path = __DIR__ . '/templates/';
```

Um layout declara seções substituíveis com `@yield` — `layouts/main.template.php`:

```text
<html>
<head><title>@yield title;</title></head>
<body>@yield content:Nenhum conteúdo fornecido.@yield;</body>
</html>
```

Um filho o estende e preenche as seções — `home.template.php`:

```text
@extends layouts/main;

@section title:Início@section;

@section content:
<h1>Bem-vindo!</h1>
@section;
```

```php
$Template = new Template(Template::resolve('home'));

echo $Template->render();
```

Regras de composição:

- O filho renderiza primeiro; output fora de blocos `@section` é descartado ao estender.
- Seções são **filho-vence**: se um pai declara a mesma seção, ela vira um default.
- `@yield name;` imprime uma seção; a forma em bloco `@yield name: ... @yield;` fornece
  conteúdo default usado apenas quando a seção não foi preenchida.
- Cadeias aninham (`A extends B extends C`); ciclos lançam `TemplateException`.

## Includes e componentes

`@include` renderiza outro template inline, compartilhando o escopo de variáveis atual:

```text
@include partials/alert;
@include partials/alert with ['level' => 'warning'];
```

Dados explícitos via `with` vencem o escopo compartilhado.

`@component` renderiza um template contra **slots** capturados — o conteúdo que você escreve
entre a abertura e o fechamento:

```text
@component components/card:
   Este corpo vira o slot default.
   @slot header:Título do card@slot;
@component;
```

O template do componente lê seus slots com `@yield` (`slot` é o nome do slot default) —
`components/card.template.php`:

```text
<div class="card">
   <header>@yield header;</header>
   <main>@yield slot;</main>
</div>
```

## Verbatim e escape de diretivas

Para imprimir uma diretiva literal, dobre o `@` (`@@if`, `@@>`, `@@extends`, ...). Para
proteger uma região inteira da compilação, envolva-a em um bloco verbatim:

```text
@!:
@if isto não é compilado:
@> isto também não;
@if;
@!;
```

Tudo entre `@!:` e `@!;` passa byte a byte.

## Cache de compilação

Templates compilados vivem em `storage/cache/templates/`:

- **Templates de arquivo** são chaveados pelo caminho do fonte — editar o arquivo sobrescreve a
  mesma entrada de cache, e um mtime mais novo dispara a recompilação.
- **Templates inline** são chaveados pelo conteúdo — mudar a string já é a invalidação.
- As chaves levam a versão do Bootgly como salt: upgrades do framework nunca reutilizam caches
  compilados por um conjunto de diretivas antigo.
- Escritas são atômicas (arquivo temporário + rename) — uma compilação interrompida nunca deixa
  cache parcial.

## Tratamento de erros

`render()` lança `Bootgly\ABI\Templates\Template\Exceptions\TemplateException` em falhas — e
`getFile()`/`getLine()` apontam para a **linha do template fonte**, não para o PHP compilado.
Erros de runtime, erros de sintaxe (`ParseError`) e erros dentro de includes, componentes ou
layouts pai são todos mapeados de volta; o erro original fica disponível via `getPrevious()`.

```php
use Bootgly\ABI\Templates\Template;
use Bootgly\ABI\Templates\Template\Exceptions\TemplateException;

try {
   echo new Template(Template::resolve('home'))->render($data);
}
catch (TemplateException $Exception) {
   // $Exception->getFile()  → /project/templates/home.template.php
   // $Exception->getLine()  → a linha no fonte .template.php
   // $Exception->template   → mesmo arquivo (null para templates inline)
   // $Exception->getPrevious() → o Throwable original
}
```

## Resumo das diretivas

| Diretiva | Propósito |
|---|---|
| `@: ... @;` | Bloco de PHP raw |
| `@if cond:` / `@elseif:` / `@else:` / `@if;` | Condicionais (também `$x?` → `!empty`, `$x??` → `isSet`) |
| `@switch:` / `@case:` / `@default:` / `@switch;` | Switch |
| `@for:` / `@foreach:` / `@while:` + fechamentos `;` | Loops (metavariável `$@` dentro) |
| `@break n in cond;` / `@continue n in cond;` | Controle de loop |
| `@> expr;` (+ `@>.`, `@.>`, `@.>.`) | Output raw (+ variantes com quebra de linha) |
| `@>> expr;` | Output com escape HTML |
| `@extends name;` | Herdar um layout pai |
| `@section name: ... @section;` | Preencher uma seção |
| `@yield name;` / `@yield name: ... @yield;` | Imprimir uma seção (com default opcional) |
| `@include name [with [...]];` | Include inline (escopo compartilhado) |
| `@component name [with [...]]: ... @component;` | Componente com slots |
| `@slot name: ... @slot;` | Slot nomeado de um componente |
| `@!: ... @!;` | Região verbatim |
| `@@diretiva` | Escape de diretiva literal |

## Referência

```php
public function __construct (string|File $raw)
```

Cria um template a partir de uma string inline ou de um `Bootgly\ABI\IO\FS\File`. A construção
é barata — nenhuma compilação acontece até o primeiro `render()`.

```php
public function render (array $parameters = []): string
```

Renderiza o template com `$parameters` extraídos como variáveis locais, compondo a cadeia de
herança registrada por `@extends`. Lança `TemplateException` em falhas, com arquivo/linha
mapeados para o fonte do template. O último output também fica legível na propriedade
`$output`.

```php
public static function resolve (string $name): File
```

Resolve um nome de template (ex.: `layouts/main`) para seu `File` dentro de `Template::$path`,
usando a extensão `.template.php`. Nomes são validados (somente `[A-Za-z0-9_/-]`, sem
traversal) e presos ao diretório base. Lança `TemplateException` para path não configurado,
nomes inválidos ou arquivos ausentes.

```php
public static string $path = '';
```

Diretório base usado para resolver templates nomeados. Views WPI o configuram automaticamente
para o diretório `views/` do projeto.

```php
public const string EXTENSION = '.template.php';
```

A extensão canônica de arquivo de template, anexada por `resolve()`.

```php
public protected(set) string $output;
```

O último output renderizado (somente leitura por fora).

```php
final class TemplateException extends Exception implements Exceptioning
```

Lançada por `render()`/`resolve()`. `getFile()`/`getLine()` apontam para o fonte do template; a
propriedade `$template` carrega o caminho do fonte (`null` para templates inline);
`getPrevious()` retorna o erro original.

> [!NOTE]
> `Template::include()` e `Template::compose()` são públicos porque os templates compilados os
> chamam — trate-os como internos às diretivas `@include`/`@component`.
