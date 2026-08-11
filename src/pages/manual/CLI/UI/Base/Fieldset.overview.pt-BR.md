# Fieldset

O `Fieldset` encaixota conteúdo em uma moldura com borda, embutindo um título opcional na borda superior. É o bloco de layout por trás das tabelas de ajuda da CLI do Bootgly, do resumo do Form e dos cards heatmap do `bootgly test` — e, por viver no tier `UI/Base`, qualquer UI Component pode se montar sobre ele legalmente.

O conteúdo entende markup — cada linha é resolvida (`@#Cyan:`, `@:success:`, …) antes do encaixotamento e o padding mede apenas colunas visíveis — e as molduras são compostas como strings puras, sem cursor: idênticas em terminais interativos, pipes e logs de CI.

## Instância

O componente é instanciado com o `Output`:

```php
use const Bootgly\CLI;
use Bootgly\CLI\UI\Base\Fieldset;

$Fieldset = new Fieldset(CLI->Terminal->Output);
```

## Encaixotando conteúdo

Atribua um título e o conteúdo — uma string multi-linha, com markup à vontade — e renderize. Com `width` em `null`, a caixa deriva a largura interna da linha mais larga:

```php
$Fieldset->title = 'Usage';
$Fieldset->content = "bootgly test @#Black:[suite] [case]@;\nbootgly test --view=heatmap";

$Fieldset->render();
```

```text
┌ Usage ──────────────────────┐
│ bootgly test [suite] [case] │
│ bootgly test --view=heatmap │
└─────────────────────────────┘
```

## Separadores

Uma linha de conteúdo composta por `@---;` renderiza como uma linha separadora horizontal:

```php
$Fieldset->content = "Primeira seção\n@---;\nSegunda seção";
```

## Largura fixa e bordas customizadas

`width` fixa as colunas internas (as linhas de conteúdo são preenchidas até ela), `borders` troca os glifos e `color` define a cor de markup da borda:

```php
$Fieldset->width = 60;
$Fieldset->borders = [
   'top-left'     => '╭',
   'top-right'    => '╮',
   'bottom-left'  => '╰',
   'bottom-right' => '╯',
] + Fieldset::DEFAULT_BORDERS;
```

## Preenchimento de fundo

`background` pinta o interior da caixa — cada linha de conteúdo se preenche com a cor, de borda a borda. Ele recebe um token de markup `@!color:`, e qualquer reset que o próprio conteúdo carregue é reafirmado, então um `@;` dentro de uma linha nunca abre um buraco no preenchimento:

```php
$Fieldset->background = '@!black:';
```

Com `background` em `null` (padrão), a saída permanece byte a byte idêntica a uma caixa sem preenchimento.

## Embutindo — molduras como strings

`RETURN_OUTPUT` retorna a moldura crua em vez de escrevê-la, então o host pode posicionar, compor ou repintar. Qualquer componente renderizado para string funciona como conteúdo — o runner de testes repinta um Fieldset ao vivo em volta de um `Meter` de Charts e de um `Heatmap` exatamente assim:

```php
$frame = (string) $Fieldset->render(Fieldset::RETURN_OUTPUT);
```

Demos ao vivo estão disponíveis no [showcase](/manual/CLI/UI/Base/Fieldset/showcase).

## Referência

```php
public null|int $width;
```

Colunas internas de conteúdo. `null` (padrão) deriva da linha resolvida mais larga entre conteúdo e título — o valor derivado é armazenado de volta no render.

```php
public string $color;
```

Cor da borda, como token de markup. Padrão `'@#Black:'` (preto brilhante).

```php
public array $borders;
```

Mapa de glifos da borda — `top`, `top-left`, `top-right`, `mid`, `left`, `right`, `bottom`, `bottom-left`, `bottom-right`. Padrão `Fieldset::DEFAULT_BORDERS` (cantos retos).

```php
public null|string $background;
```

Preenchimento de fundo interno, como token de markup `@!color:` — as linhas de conteúdo se preenchem de borda a borda, com resets internos reafirmados. `null` (padrão) mantém a saída byte a byte idêntica a uma caixa sem preenchimento.

```php
public null|string $title;
```

Título embutido na borda superior, envolvido por um espaço de cada lado. Escapado e resolvido na atribuição. Padrão `null`.

```php
public null|string $content;
```

O conteúdo encaixotado — linhas de markup separadas por `\n`; uma linha de `@---;` renderiza como linha separadora. Padrão `null`.

```php
public function render (int $mode = self::WRITE_OUTPUT): null|string
```

Encaixota o conteúdo. `WRITE_OUTPUT` escreve a moldura no `Output`; `RETURN_OUTPUT` retorna a string crua da moldura.
