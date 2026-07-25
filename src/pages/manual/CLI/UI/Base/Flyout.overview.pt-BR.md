# Flyout

O `Flyout` é a lista de opções ancorada — o bloco que um host pinta junto a um input quando ele oferece escolhas (completions, slash-commands, matches). Ele compõe as linhas e reporta a `height` delas; **onde** elas aterrissam é assunto do host, então o mesmo Flyout serve tanto uma lista que desce abaixo de um input quanto uma que sobe acima dele. Por viver no tier `UI/Base`, qualquer UI Component pode se montar sobre ele legalmente — o [Textbox](/manual/CLI/UI/Components/Textbox/overview) é seu consumidor hoje.

As opções são texto puro: markup **não** é resolvido nelas, então as larguras medidas continuam honestas. As molduras são compostas como strings puras, sem cursor — o host posiciona, compõe ou repinta.

## Instância

O componente é instanciado com o `Output`:

```php
use const Bootgly\CLI;
use Bootgly\CLI\UI\Base\Flyout;

$Flyout = new Flyout(CLI->Terminal->Output);
```

## Listando opções

Atribua as opções — um `array<int,string>` puro, de cima para baixo — mire uma delas e renderize. A linha mirada carrega o `marker` pintado com `color`; as demais carregam o `filler`, que as mantém alinhadas:

```php
$Flyout->options = ['/help', '/clear', '/model', '/exit'];
$Flyout->aim(1);

$Flyout->render();
```

```text
   /help
=> /clear
   /model
   /exit
```

Esse render reporta uma `height` de 4 — uma linha por opção.

## Mirando

`aim()` escolhe uma opção pelo índice e `advance()` / `regress()` caminham pela lista. Os três limitam nas bordas — a lista nunca dá a volta:

```php
$Flyout->advance(); // /model
$Flyout->regress(); // de volta a /clear

$Flyout->aim(99);   // limitado à última opção — $Flyout->aimed === 3
$Flyout->aim(-1);   // limitado à primeira opção — $Flyout->aimed === 0
```

`advance()` para na última opção e `regress()` na primeira. O `render()` re-limita a mira antes de compor, então trocar `options` por uma lista menor nunca deixa uma mira solta para trás.

## Janelando listas longas

`viewport` limita quantas opções ficam visíveis. A janela desliza para manter a opção mirada em vista, e cada borda cortada anuncia o que esconde:

```php
$Flyout->options = ['/help', '/clear', '/model', '/exit'];
$Flyout->viewport = 2;
$Flyout->aim(3);

$Flyout->render();
```

```text
↑ 2 more
   /model
=> /exit
```

Mirar de volta no topo corta a outra borda:

```php
$Flyout->aim(0);

$Flyout->render();
```

```text
=> /help
   /clear
↓ 2 more
```

Os marcadores `↑ N more` / `↓ N more` são linhas por si só: os dois renders acima reportam uma `height` de 3, não de 2. Um host que reserva espaço para o flyout precisa ler `height`, nunca `viewport`.

**Pegadinha —** `viewport` igual a `0` significa "renderize todas", e o Flyout implementa isso dimensionando a `Window` dele com o total da lista. Ele não pode simplesmente repassar o `0`: uma [Window](/manual/CLI/Terminal/Output/Window/overview) com `size` `0` produz um intervalo visível **vazio**, não um cheio. Qualquer host que reuse a `Window` diretamente herda essa regra.

## Cortando opções largas

`width` limita as colunas que uma opção pode ocupar. Qualquer coisa mais larga é cortada com reticências — uma linha quebrada escorreria para uma segunda linha e furaria a contabilidade de altura do host, então o Flyout nunca quebra linha:

```php
$Flyout->viewport = 0;
$Flyout->width = 8;
$Flyout->options = ['a-very-long-option-label'];
$Flyout->aim(0);

$Flyout->render();
```

```text
=> a-very-…
```

A medição cobre apenas o texto da opção — o prefixo de 3 colunas do `marker`/`filler` é pintado fora dela, então um host que dimensiona pelo terminal deixa espaço para ele (o Textbox passa `Terminal::$width - 4`). Com `width` em `null` (padrão), as opções renderizam inteiras.

## Composição com borda

`bordered` envolve as linhas em uma caixa e `title` a rotula. A caixa em si é delegada ao [Fieldset](/manual/CLI/UI/Base/Fieldset/overview):

```php
$Flyout->width = null;
$Flyout->bordered = true;
$Flyout->title = 'Commands';
$Flyout->options = ['/help', '/exit'];
$Flyout->aim(0);

$Flyout->render();
```

```text
┌ Commands ──┐
│ => /help   │
│    /exit   │
└────────────┘
```

As duas linhas de borda contam na `height` — 4 aqui, para 2 opções. Diferente das opções, o `title` aceita markup.

## Embutindo — linhas como strings

`RETURN_OUTPUT` retorna as linhas cruas (raw) em vez de escrevê-las, então o host compõe o bloco na moldura dele e decide onde ele aterrissa:

```php
$frame = (string) $Flyout->render(Flyout::RETURN_OUTPUT);
$rows = $Flyout->height;
```

`height` reporta as linhas que o *último* render produziu — é o único número de que um host precisa para posicionar o bloco, ou para andar com o cursor de volta por cima dele antes de repintar. Como o Flyout reporta a altura e nunca move o cursor por conta própria, a mesma instância funciona abaixo de um input ou acima dele.

## Fechando o flyout

Uma lista vazia não renderiza nada e reporta uma `height` de 0. É assim que um host fecha o flyout — não há um estado aberto/fechado separado para rastrear:

```php
$Flyout->options = [];

$Flyout->render(); // não escreve nada — $Flyout->height === 0
```

Sob `RETURN_OUTPUT` a lista vazia retorna `''`, então o host pode seguir concatenando-a à moldura dele incondicionalmente.

## Referência

```php
public int $viewport;
```

Config. Máximo de opções visíveis — listas maiores janelam em torno da mira com marcadores `↑ N more` / `↓ N more`. `0` (padrão) renderiza todas.

```php
public bool $bordered;
```

Config. Compõe as linhas dentro de uma caixa `Fieldset` com borda, cujas duas linhas de borda contam na `height`. Padrão `false`.

```php
public null|int $width;
```

Config. Colunas disponíveis para uma linha — opções mais largas são cortadas com reticências. `null` (padrão) renderiza as opções inteiras.

```php
public null|string $title;
```

Config. Título da caixa, usado quando `bordered` é `true` (aceita markup). Padrão `null`.

```php
public string $marker;
```

Config. Pintado antes da opção mirada. Padrão `'=> '`.

```php
public string $filler;
```

Config. Pintado antes das outras opções — alinhe-o com o `marker`. Padrão `'   '` (três espaços).

```php
public string $color;
```

Config. A pintura da linha mirada, como token de markup. Padrão `'@#Cyan:'`.

```php
public array $options;
```

Data. As opções, de cima para baixo — `array<int,string>`, texto puro (markup não é resolvido nelas). Padrão `[]`.

```php
public private(set) int $aimed;
```

Metadata (somente leitura). O índice da opção mirada. Começa em `0` e é sempre limitado às bordas da lista.

```php
public private(set) Window $Window;
```

Metadata (somente leitura). O calculador da fatia visível — o `render()` o dimensiona pelo `viewport` (ou pelo total da lista quando `viewport` é `0`) e o desliza até a mira.

```php
public private(set) int $height;
```

Metadata (somente leitura). Linhas que o último render produziu, incluindo os marcadores `↑/↓ N more` e as duas linhas de borda quando `bordered` — os hosts posicionam o bloco por ela. `0` quando a lista está vazia.

```php
public function aim (int $index): self
```

Mira uma opção pelo índice, limitada às bordas da lista — um índice negativo mira a primeira opção, um fora do intervalo mira a última. Retorna o Flyout.

```php
public function advance (): self
```

Mira a próxima opção, limitado — a lista nunca dá a volta, então para na última opção. Retorna o Flyout.

```php
public function regress (): self
```

Mira a opção anterior, limitado — a lista nunca dá a volta, então para na primeira opção. Retorna o Flyout.

```php
public function render (int $mode = self::WRITE_OUTPUT): null|string
```

Compõe as linhas de opção e atualiza a `height`. `WRITE_OUTPUT` as escreve no `Output`; `RETURN_OUTPUT` retorna as linhas cruas (raw) de markup. Uma lista vazia não renderiza nada e reporta uma `height` de 0 (`''` sob `RETURN_OUTPUT`).
