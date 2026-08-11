# Flyout

O `Flyout` é o overlay genérico ancorado — uma região delimitada que um host abre em relação à própria posição: um menu de contexto sobre um input, um painel de completions, um bottom sheet. O conteúdo é markup arbitrário definido por composição — um [Listbox](/manual/CLI/UI/Base/Listbox/overview) renderiza escolhas dentro dele, mas qualquer coisa cabe. Vivendo no tier `UI/Base`, qualquer UI Component pode legalmente montar sobre ele — o [Prompt](/manual/CLI/UX/Components/Prompt/overview) abre seus menus de trigger e seu bottom sheet através dele.

Há duas formas de posicionar o bloco. `RETURN_OUTPUT` o compõe como string para hosts que o emendam no próprio frame — o ponto de emenda é o posicionamento. `WRITE_OUTPUT` o pinta **relativo à linha-âncora** (a linha do cursor no momento da chamada), acima ou abaixo dela, usando apenas movimento relativo — e `close()` o apaga.

## Instância

O componente é instanciado com o `Output`:

```php
use const Bootgly\CLI;
use Bootgly\CLI\UI\Base\Flyout;

$Flyout = new Flyout(CLI->Terminal->Output);
```

## Abrindo conteúdo

Atribua o `content` — linhas de markup separadas por `\n` — e renderize. `height` reporta as linhas que o bloco ocupa:

```php
$Flyout->content = "@#Cyan:❯ /help@;\n  /exit";

$Flyout->render();

$Flyout->height; // 2
```

Conteúdo vazio não renderiza nada e reporta `height` `0` — esse é o estado fechado; não existe flag separada de abrir/fechar para acompanhar.

## Caixa com borda

`bordered` embrulha o conteúdo numa caixa e `title` a rotula — a caixa em si é delegada ao [Fieldset](/manual/CLI/UI/Base/Fieldset/overview), e as duas linhas de borda contam no `height`. `width` escolhe as colunas internas: `null` (padrão) deriva da linha de conteúdo mais larga (autowide), `0` ocupa a largura total do terminal e `N` fixa as colunas. `background` preenche o interior da caixa (um token de markup `@!color:`, repassado ao Fieldset):

```php
$Flyout->bordered = true;
$Flyout->title = 'Commands';
$Flyout->width = 0;                 // largura total do terminal
$Flyout->background = '@!black:';
$Flyout->content = "❯ /help\n  /exit";

$Flyout->render();

$Flyout->height; // 4 — 2 linhas de conteúdo + 2 de borda
```

```text
┌ Commands ──────────────────────────────┐
│ ❯ /help                                │
│   /exit                                │
└────────────────────────────────────────┘
```

## Embutindo — o bloco como string

`RETURN_OUTPUT` retorna o bloco em vez de escrevê-lo, então o host o emenda no próprio frame e decide onde ele cai. É assim que o Prompt posiciona seu menu de contexto rente ao frame do input — a maquinaria de repintura do frame faz o posicionamento:

```php
$block = (string) $Flyout->render(Flyout::RETURN_OUTPUT);
$rows = $Flyout->height;
```

`height` reporta as linhas que o *último* render produziu — o único número que um host precisa para orçar o espaço do bloco. Sob `RETURN_OUTPUT` o conteúdo vazio retorna `''`, então o host pode anexá-lo ao frame incondicionalmente.

## Pintura ancorada

Sob `WRITE_OUTPUT` o bloco pinta **relativo à linha do cursor** — a âncora. `placement` escolhe o lado, como um case de `Placements`:

```php
use Bootgly\CLI\UI\Base\Flyout\Placements;

$Flyout->placement = Placements::Below;   // o padrão
$Flyout->render();                        // pinta sob a linha-âncora

$Flyout->placement = Placements::Above;
$Flyout->render();                        // pinta sobre as linhas acima da âncora
```

Ambos os placements terminam com o cursor de volta na linha-âncora, na coluna 1, e ambos usam apenas movimento relativo — posições absolutas derivariam quando escrever no fundo da tela rola o terminal. Cada linha pintada é aparada à direita antes, então repinturas mais estreitas não deixam resíduo.

**O contrato do Above —** pintar acima *sobrescreve* o que ocupava aquelas linhas. O host precisa ter aberto espaço: uma região gerenciada (a banda ajustada do Prompt, uma Region do Wizard) que orça `height` linhas para o bloco. `Below` não precisa desse acordo — escrever no fundo rola a tela nativamente.

Uma repintura que muda a altura do bloco precisa de `close()` antes — cada pintura cobre exatamente as próprias linhas.

## Fechando

`close()` apaga o bloco pintado pelo último render WRITE, conforme o `placement`, e zera o `height`. Espera o cursor na linha-âncora e o devolve lá. No-op enquanto fechado — hosts que emendam frames nunca precisam dele:

```php
$Flyout->close();
```

## Referência

```php
public Placements $placement;
```

Config. Onde a pintura WRITE ancora o bloco, relativo à linha do cursor — `Placements::Below` (padrão) ou `Placements::Above`. `RETURN_OUTPUT` o ignora: o ponto de emenda é o posicionamento.

```php
public bool $bordered;
```

Config. Compõe o bloco dentro de uma caixa `Fieldset` com borda — as duas linhas de borda contam no `height`. Padrão `false`.

```php
public null|string $title;
```

Config. Título da caixa, usado quando `bordered` é `true` (markup suportado). Padrão `null`.

```php
public null|int $width;
```

Config. Colunas internas, quando `bordered`: `null` (padrão) deriva da linha de conteúdo mais larga, `0` ocupa a largura total do terminal, `N` fixa as colunas.

```php
public null|string $background;
```

Config. Preenchimento de fundo interno (um token de markup `@!color:`), quando `bordered` — repassado ao Fieldset. Padrão `null`.

```php
public string $content;
```

Data. O conteúdo do bloco — linhas de markup separadas por `\n`. Vazio (padrão) fecha o flyout: nada renderiza e `height` reporta `0`.

```php
public private(set) int $height;
```

Metadata (somente leitura). Linhas que o último render compôs ou pintou, bordas incluídas. `0` enquanto fechado.

```php
public function render (int $mode = self::WRITE_OUTPUT): null|string
```

Renderiza o bloco e atualiza o `height`. `RETURN_OUTPUT` retorna o markup do bloco para o host emendar; `WRITE_OUTPUT` o pinta ancorado à linha atual do cursor conforme o `placement` e devolve o cursor à linha-âncora, coluna 1. Conteúdo vazio não renderiza nada (`''` sob `RETURN_OUTPUT`).

```php
public function close (): self
```

Apaga o bloco pintado pelo último render WRITE — a contraparte da pintura ancorada. Espera o cursor na linha-âncora e o devolve lá, na coluna 1. No-op enquanto fechado. Retorna o Flyout.

### Placements

```php
enum Placements
{
   case Above;
   case Below;
}
```

O enum `Bootgly\CLI\UI\Base\Flyout\Placements` — onde a pintura ancorada abre o bloco, relativo à linha-âncora.
