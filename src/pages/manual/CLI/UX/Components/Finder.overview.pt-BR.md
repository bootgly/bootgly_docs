# Finder

Seletor de busca ao vivo — pergunta "qual deles?" ao usuário sem que ele percorra um [Menu](/manual/CLI/UI/Components/Menu/overview) longo com as setas. Digitar filtra as opções (case-insensitive, multibyte-aware), `↑`/`↓` mira, `Enter` confirma o match mirado e `Esc` cancela. As opções vêm de um array estático ou de um source Closure dinâmico chamado com a query a cada edição. `find()` abre a busca e retorna o **valor** encontrado — `null` em cancelamento.

## Encontre um valor

```php
use const Bootgly\CLI;
use Bootgly\CLI\UX\Components\Finder;

$Input = CLI->Terminal->Input;
$Output = CLI->Terminal->Output;

$Finder = new Finder($Input, $Output);
$Finder->prompt = '@*:Busque um componente@;';
$Finder->hint = '(digite para filtrar, ↑/↓ mira, Enter confirma, Esc cancela)';
$Finder->options = [
   'alert' => 'Alert',
   'dialog' => 'Dialog',
   'filepicker' => 'Filepicker',
   'finder' => 'Finder',
   'menu' => 'Menu',
   'progress' => 'Progress',
   'prompt' => 'Prompt',
   'toasts' => 'Toasts',
   'tree' => 'Tree',
   'wizard' => 'Wizard'
];
$Finder->viewport = 6;
$Finder->blink = true;

$found = $Finder->find();

if ($found !== null) {
   echo "Você encontrou: {$found}\n";
}
```

```text
Busque um componente: fi█
(digite para filtrar, ↑/↓ mira, Enter confirma, Esc cancela)
=> Filepicker
   Finder
```

Cada tecla refiltra os matches com `mb_stripos` — case-insensitive e multibyte-aware — e reseta a mira para a primeira linha. O `hint` é uma linha de ajuda esmaecida renderizada logo abaixo do prompt (string vazia a esconde), e o prompt aceita markup de Template — `@*:...@;` o renderiza em negrito. Quando a interação termina, o frame final substitui o dropdown por `{prompt}: {label}`.

## Source dinâmico

Defina `source` com uma Closure e as opções se tornam dinâmicas: ela recebe a query a **cada edição** — inclusive a query vazia inicial, antes de qualquer digitação — e retorna opções no mesmo formato. O filtro estático é ignorado: o source filtra por conta própria:

```php
use function array_filter;
use function array_values;
use function stripos;

$extensions = [
   'bcmath', 'curl', 'dom', 'fileinfo', 'gd', 'iconv', 'intl', 'json',
   'libxml', 'mbstring', 'mysqli', 'opcache', 'openssl', 'pcntl', 'pcre',
   'pdo_mysql', 'pdo_pgsql', 'pdo_sqlite', 'phar', 'posix', 'readline',
   'session', 'sockets', 'sodium', 'xdebug', 'xml', 'zip', 'zlib'
];

$Finder = new Finder($Input, $Output);
$Finder->prompt = '@*:Busque uma extensão@;';
$Finder->hint = '(source dinâmico — o lookup roda a cada tecla)';
$Finder->source = static function (string $query) use ($extensions): array {
   if ($query === '') {
      return $extensions;
   }

   return array_values(array_filter(
      $extensions,
      static fn (string $extension): bool => stripos($extension, $query) !== false
   ));
};

$found = $Finder->find();
```

A lista acima tem chaves int, então `find()` retorna o próprio label (`'mbstring'`, `'sodium'`, ...).

## Teclas

| Tecla | Ação |
|-------|------|
| digitação | Filtra as opções — cada edição refiltra e reseta a mira |
| `↑` / `↓` | Mira um match (limitado — sem dar a volta) |
| `Enter` | Confirma o match mirado — **sem match é um no-op** (um seletor puro nunca submete texto cru) |
| `Esc` | Cancela — `find()` retorna `null` |
| `Backspace`, `Ctrl+U`, `←`/`→`, ... | Editam a query (teclas do editor de linha) |

## Valores vs labels

`options` (e o retorno do source) mapeiam **valor ⇒ label**: a chave é o que `find()` retorna, o item é o que o usuário vê. Chaves int retornam o próprio label:

```php
$Finder->options = [
   'pt-BR' => 'Português (Brasil)', // Enter aqui retorna 'pt-BR'
   'en-US' => 'English (US)'        // Enter aqui retorna 'en-US'
];

$Finder->options = ['Alpha', 'Beta']; // chaves int — Enter retorna 'Alpha' ou 'Beta'
```

## Entrada não interativa

Em pipes e CI o `find()` degrada para uma linha digitada (semântica do [Question](/manual/CLI/UI/Components/Question/overview)): a linha digitada resolve por **match exato de label** case-insensitive para o seu valor — linha vazia ou desconhecida retorna `null`. Scripts continuam automatizáveis:

```bash :toolbar="true";
echo "Finder" | php app.php
```

## Notas

- O source Closure roda **sincronamente a cada tecla** — não há debounce, então um lookup lento atrasa a digitação. Mantenha os lookups rápidos (memória, indexados).
- Labels e prompts mais largos que o terminal ainda não são cortados.
- `viewport` (padrão 8) janela listas longas de matches com marcadores `↑/↓ N more`; `blink` faz o marcador de mira piscar.
- O último resultado também fica exposto na propriedade somente leitura `$found` — `null` após um cancelamento.

## Referência

### Finder

```php
public function __construct (Input $Input, Output $Output)
```

Cria o finder ligado ao `Input` e ao `Output` do terminal.

```php
public function find (): mixed
```

Abre a busca ao vivo e retorna o valor encontrado — `null` em cancelamento (`Esc`, `EOF`) ou, em entrada não interativa, quando a linha digitada não casa com nenhum label. Fluxo interativo: digitar filtra, `↑`/`↓` mira, `Enter` confirma o match mirado (sem match ⇒ no-op); o frame final substitui o dropdown por `{prompt}: {label}`.

```php
public function control (string $key): bool
```

Controla o finder com uma tecla — uma máquina de estados pura (sem I/O) para embutir e testar. Retorna `false` quando a interação termina (`Enter`/`Esc`). `$key` são os bytes da tecla montados (veja `Input::listen`).

### Propriedades

```php
public string $prompt
```

Config. Linha de cabeçalho / prefixo do input (markup de Template suportado). Padrão: `'Search'`.

```php
public string $hint
```

Config. Linha de ajuda esmaecida renderizada logo abaixo do prompt — string vazia a esconde. Padrão: `''`.

```php
public array $options
```

Config. Opções estáticas — `array<int|string,string>`: chave = valor retornado, item = label exibido (chaves int retornam o próprio label). Padrão: `[]`.

```php
public null|Closure $source
```

Config. Source dinâmico — `Closure (string $query): array`, chamada com a query a cada edição (inclusive a query vazia inicial) e retornando opções no mesmo formato. Quando definido, o filtro estático é ignorado — o source filtra por conta própria. Padrão: `null`.

```php
public int $viewport
```

Config. Máximo de matches visíveis — listas mais longas ganham janela com marcadores `↑/↓ N more`. Padrão: `8`.

```php
public bool $blink
```

Config. Faz o marcador de mira piscar. Padrão: `false`.

```php
public private(set) mixed $found
```

Data (somente leitura). O último valor encontrado — `null` após um cancelamento.
