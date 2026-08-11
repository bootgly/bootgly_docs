# Listbox

O `Listbox` é a lista de opções janelada e mirada — as linhas que um host oferece quando tem escolhas: completions, slash-commands, matches. Ele compõe as linhas e reporta o `height`; **onde** elas caem é assunto do host — emendadas num frame, entregues a um [Flyout](/manual/CLI/UI/Base/Flyout/overview) como conteúdo de overlay, ou escritas diretamente. Vivendo no tier `UI/Base`, qualquer UI Component pode legalmente montar sobre ele — o [Textbox](/manual/CLI/UI/Components/Textbox/overview) lista suas completions com ele, e o [Prompt](/manual/CLI/UX/Components/Prompt/overview) preenche seus menus de trigger e seu bottom sheet com ele.

Opções são texto puro: markup **não** é resolvido nelas, então as larguras medidas permanecem honestas. As linhas são compostas como strings puras, sem cursor — o host as posiciona, compõe ou repinta.

## Instância

O componente é instanciado com o `Output`:

```php
use const Bootgly\CLI;
use Bootgly\CLI\UI\Base\Listbox;

$Listbox = new Listbox(CLI->Terminal->Output);
```

## Listando opções

Atribua as opções — um `array<int,string>` simples, de cima para baixo — mire uma delas e renderize. A linha mirada carrega o `marker` pintado em `color`; as outras carregam o `filler`, que as mantém alinhadas:

```php
$Listbox->options = ['/help', '/clear', '/model', '/exit'];
$Listbox->aim(1);

$Listbox->render();
```

```text
  /help
❯ /clear
  /model
  /exit
```

Esse render reporta `height` 4 — uma linha por opção. Uma lista vazia não renderiza nada e reporta `height` 0: é assim que um host fecha a lista.

## Mirando

`aim()` escolhe uma opção pelo índice e `advance()` / `regress()` caminham pela lista. Os três clampam por padrão:

```php
$Listbox->advance(); // /model
$Listbox->regress(); // de volta a /clear

$Listbox->aim(99);   // clampado à última opção — $Listbox->aimed === 3
$Listbox->aim(-1);   // clampado à primeira opção — $Listbox->aimed === 0
```

`render()` re-clampa a mira antes de compor, então trocar `options` por uma lista mais curta nunca deixa uma mira pendurada.

**Navegação circular** é opt-in: com `circular` ligado, `advance()` além da última opção volta à primeira e `regress()` antes da primeira vai à última. Um `aim()` explícito continua clampado de qualquer forma:

```php
$Listbox->circular = true;

$Listbox->aim(0);
$Listbox->regress(); // dá a volta — $Listbox->aimed === 3
```

## Janelando listas longas

`viewport` limita quantas opções ficam visíveis. A janela desliza para manter a opção mirada à vista, e cada borda cortada anuncia o que esconde:

```php
$Listbox->options = ['/help', '/clear', '/model', '/exit'];
$Listbox->viewport = 2;
$Listbox->aim(3);

$Listbox->render();
```

```text
↑ 2 more
  /model
❯ /exit
```

Os marcadores `↑ N more` / `↓ N more` são linhas próprias: o render acima reporta `height` 3, não 2. Um host que orça espaço para a lista deve ler `height`, nunca `viewport`. `viewport` `0` (padrão) renderiza todas as opções.

## Scrollbar

Com `scrollbar` ligado, uma barra na borda direita substitui os marcadores `N more` em listas cortadas — a altura da janela fica exatamente em `viewport` linhas. O polegar (`█`) e o trilho (`│`) espelham as proporções do [Scrollarea](/manual/CLI/UI/Components/Scrollarea/overview), e `width` dá à barra uma coluna para alinhar:

```php
$Listbox->options = ['/one', '/two', '/three', '/four', '/five', '/six'];
$Listbox->viewport = 3;
$Listbox->width = 12;
$Listbox->scrollbar = true;
$Listbox->aim(0);

$Listbox->render(); // height === 3 — polegar no topo, sem linhas `N more`
```

## Cortando opções largas

`width` limita as colunas que uma opção pode ocupar. Qualquer coisa mais larga corta com reticências — uma linha quebrada transbordaria para uma segunda linha e quebraria a contabilidade de altura do host, então o Listbox nunca quebra linha:

```php
$Listbox->width = 8;
$Listbox->options = ['a-very-long-option-label'];

$Listbox->render();
```

```text
❯ a-very-…
```

A medição cobre só o texto da opção — o prefixo `marker`/`filler` é pintado fora dela, então um host dimensionando contra o terminal deixa espaço para ele. Com `width` em `null` (padrão), as opções renderizam inteiras.

## Accent da query

`query` acende a busca digitada dentro de cada opção — a primeira ocorrência, case-insensitive, pintada com os tokens do `accent`. É assim que um menu mostra *por que* cada opção casou:

```php
$Listbox->options = ['/help', '/hello'];
$Listbox->query = '/he';
```

```text
❯ /help      ← o trecho `/he` vai em negrito + branco brilhante
  /hello
```

## Tint e detalhes

`details` adiciona uma coluna esmaecida por opção — descrição, uso — alinhada após o label mais largo. `tint` pinta a coluna de labels de todas as linhas, dando contraste aos comandos contra os detalhes esmaecidos:

```php
$Listbox->options = ['/help [cmd]', '/exit'];
$Listbox->details = ['Lists commands', 'Quits'];
$Listbox->tint = '@#Cyan:';

$Listbox->render();
```

```text
❯ /help [cmd]  Lists commands
  /exit        Quits
```

Com um `width` definido, os detalhes cortam nas colunas que a coluna de labels deixa sobrar.

## Destaque da linha mirada

`background` pinta o fundo da linha mirada por toda a `width` (a linha é preenchida até ela), então o destaque varre a linha inteira em vez de só o texto — o visual de painel de overlay. `blink` adicionalmente pisca a linha mirada:

```php
$Listbox->width = 40;
$Listbox->background = '@!black:';
$Listbox->blink = true;
```

## Referência

```php
public int $viewport;
```

Config. Máximo de opções visíveis — listas mais longas janelam ao redor da mira. `0` (padrão) renderiza todas.

```php
public null|int $width;
```

Config. Colunas disponíveis para uma linha — opções mais largas cortam com reticências; o `background` da linha mirada e a `scrollbar` preenchem e alinham por ela. `null` (padrão) renderiza as opções inteiras.

```php
public string $marker;
```

Config. Pintado antes da opção mirada. Padrão `'❯ '`.

```php
public string $filler;
```

Config. Pintado antes das outras opções — alinhe-o com o `marker`. Padrão `'  '` (dois espaços).

```php
public string $color;
```

Config. A pintura da linha mirada, como token de markup. Padrão `'@#Cyan:'`.

```php
public string $tint;
```

Config. Pintura da coluna de labels (token de markup) de todas as linhas — contrasta os labels contra os detalhes esmaecidos. Vazio (padrão) mantém o foreground do terminal.

```php
public string $background;
```

Config. Fundo da linha mirada (token de markup, ex.: `'@!black:'`) — preenche a linha até `width`, então o destaque varre o bloco. Vazio (padrão) mantém a mira só por marcador.

```php
public bool $blink;
```

Config. Pisca a linha mirada. Padrão `false`.

```php
public bool $scrollbar;
```

Config. Scrollbar na borda direita em listas cortadas — substitui os marcadores `↑/↓ N more` e mantém a altura da janela em `viewport`. Padrão `false`.

```php
public bool $circular;
```

Config. Navegação circular — `advance()` além da última opção volta à primeira e `regress()` antes da primeira vai à última. Padrão `false`.

```php
public string $query;
```

Config. A query destacada dentro de cada opção (primeira ocorrência, case-insensitive). Vazio (padrão) não destaca nada.

```php
public string $accent;
```

Config. A pintura do match da query, como tokens de markup. Padrão `'@*:@#White:'` (negrito + branco brilhante).

```php
public array $options;
```

Data. As opções, de cima para baixo — `array<int,string>`, texto puro (markup não é resolvido nelas). Padrão `[]`.

```php
public array $details;
```

Data. Coluna de detalhe esmaecida por índice de opção (descrição, uso) — alinhada após o label mais largo. Padrão `[]`.

```php
public private(set) int $aimed;
```

Metadata (somente leitura). O índice da opção mirada. Começa em `0` e é sempre clampado aos limites da lista.

```php
public private(set) Window $Window;
```

Metadata (somente leitura). O calculador da fatia visível — `render()` o dimensiona pelo `viewport` (ou pelo total da lista quando `viewport` é `0`) e o desliza até a mira.

```php
public private(set) int $height;
```

Metadata (somente leitura). Linhas que o último render produziu, incluindo os marcadores `↑/↓ N more` — hosts posicionam o bloco por ele. `0` quando a lista está vazia.

```php
public function aim (int $index): self
```

Mira uma opção pelo índice, clampado aos limites da lista — um índice negativo mira a primeira opção, um fora do alcance mira a última. Retorna o Listbox.

```php
public function advance (): self
```

Mira a próxima opção — clampada na última, ou com a volta à primeira quando `circular` está ligado. Retorna o Listbox.

```php
public function regress (): self
```

Mira a opção anterior — clampada na primeira, ou com a volta à última quando `circular` está ligado. Retorna o Listbox.

```php
public function render (int $mode = self::WRITE_OUTPUT): null|string
```

Compõe as linhas de opções e atualiza o `height`. `WRITE_OUTPUT` as escreve no `Output`; `RETURN_OUTPUT` retorna as linhas de markup em vez disso. Uma lista vazia não renderiza nada e reporta `height` 0 (`''` sob `RETURN_OUTPUT`).
