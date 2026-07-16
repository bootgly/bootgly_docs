# Componente Scrollarea

O componente `Scrollarea` armazena conteúdo em uma banda fixa da tela com rolagem própria — independente do scrollback nativo do terminal. Linhas alimentadas são quebradas em linhas visuais e mantidas em um buffer limitado; a banda segue as linhas mais novas enquanto grudada no rodapé, mantém a posição enquanto rolada para cima e renderiza uma scrollbar na borda direita. É o engine de conteúdo por trás da banda REPL do [Prompt](/manual/CLI/UX/Components/Prompt/overview). Em saída não interativa (pipes, CI) degrada para escritas planas.

Uma demo ao vivo está disponível no [showcase](/manual/CLI/UI/Components/Scrollarea/showcase).

## Instância

Para usar o componente, é necessário criar uma instância passando como parâmetro a instância do componente `Output`:

```php
use const Bootgly\CLI;
use Bootgly\CLI\UI\Components\Scrollarea;

$Terminal = CLI->Terminal;

$Scrollarea = new Scrollarea($Terminal->Output);
$Scrollarea->row = 1;    // linha do topo da banda na tela
$Scrollarea->rows = 12;  // linhas visíveis
```

## Alimentando conteúdo

`feed()` aceita markup de Template, quebra linhas longas na largura da banda (a cor ativa segue para a linha quebrada) e repinta a banda. Enquanto a visão está grudada no rodapé, ela segue as linhas mais novas:

```php
foreach ($records as $record) {
   $Scrollarea->feed("@#Black:{$record->time}@; {$record->message}");
}
```

## Rolando

`scroll()` move a visão por um delta de linhas; `stick()` volta para o rodapé. Rolar para cima desgruda a visão — novos feeds mantêm a posição (a scrollbar a acompanha) até a visão alcançar a última linha de novo:

```php
$Scrollarea->scroll(-11);  // uma página para cima (11 linhas)
$Scrollarea->scroll(+11);  // uma página para baixo
$Scrollarea->stick();      // seguir as linhas mais novas de novo
```

O componente é somente de renderização: ligue as teclas no seu próprio loop de leitura (o [Prompt](/manual/CLI/UX/Components/Prompt/overview) faz isso com `PgUp`/`PgDn` e o mouse).

## Scrollbar

Quando o buffer excede a banda, a coluna da borda direita renderiza um trilho (`│`) com um cursor (`█`) proporcional à fatia visível — o conteúdo quebra uma coluna antes para reservá-la. Desative com `$Scrollarea->scrollbar = false;`.

## Pointer (mouse)

Três primitivas tornam a scrollbar interativa com mouse a partir de qualquer loop de leitura SGR: `hit()` testa qual parte da banda está sob uma coordenada (`'thumb'`, `'track'`, `'content'` ou `null`), `aim()` centraliza o cursor da scrollbar em uma linha da tela (arrasto e salto por clique no trilho) e `hover()` destaca o cursor enquanto o ponteiro está sobre ele:

```php
// dentro de um loop de leitura de mouse SGR (reports \e[<Cb;Cx;CyM):
match ($Scrollarea->hit($column, $line)) {
   'thumb', 'track' => $Scrollarea->aim($line),  // clique: salto + agarra
   default => null
};

$Scrollarea->hover($Scrollarea->hit($column, $line) === 'thumb');
```

O [Prompt](/manual/CLI/UX/Components/Prompt/overview) já liga tudo (roda do mouse, hover, clique e arrasto); a demo do showcase conduz standalone.

## Saída não interativa

Em pipes e CI, `feed()` escreve o conteúdo plano e nada é bufferizado — determinístico, sem ruído de escapes.

## Referência

### Propriedades

```php
public int $row
```

Config. A linha do topo da banda na tela (base 1). Padrão: `1`.

```php
public int $rows
```

Config. As linhas visíveis (altura da banda). Padrão: `10`.

```php
public int $width
```

Config. A largura da banda, em colunas. Padrão: a largura do terminal.

```php
public int $capacity
```

Config. Máximo de linhas visuais bufferizadas — as mais antigas são descartadas. Padrão: `1000`.

```php
public bool $scrollbar
```

Config. Se a coluna da borda direita renderiza a scrollbar. Padrão: `true`.

```php
public private(set) array $buffer
```

Data (somente leitura). As linhas visuais bufferizadas, da mais antiga à mais nova (bytes pintados).

```php
public private(set) int $first
```

Metadata (somente leitura). A primeira linha bufferizada visível.

```php
public private(set) bool $stuck
```

Metadata (somente leitura). Se a visão está seguindo as linhas mais novas.

```php
public private(set) bool $hovered
```

Metadata (somente leitura). Se o ponteiro está sobre o cursor da scrollbar (render destacado).

### feed()

```php
public function feed (string $content): void
```

Bufferiza conteúdo (markup de Template suportado), quebrando linhas lógicas em linhas visuais na largura da banda, e repinta a banda. Escrita plana em saída não interativa.

### scroll()

```php
public function scroll (int $delta): void
```

Rola a visão por um delta de linhas (negativo = para cima). Alcançar a última linha gruda a visão de volta no rodapé.

### stick()

```php
public function stick (): void
```

Gruda a visão de volta no rodapé (linhas mais novas) e repinta.

### hit()

```php
public function hit (int $column, int $line): null|string
```

Testa qual parte da banda está em uma coordenada da tela: `'thumb'`, `'track'`, `'content'` — ou `null` fora da banda.

### aim()

```php
public function aim (int $line): void
```

Mira a visão para que o cursor da scrollbar centralize em uma linha da tela — a primitiva de arrasto e clique no trilho. Alcançar a última linha re-gruda a visão.

### hover()

```php
public function hover (bool $over): void
```

Atualiza o estado ponteiro-sobre-cursor — o cursor destaca enquanto hovered (repinta só na mudança).

### render()

```php
public function render (int $mode = self::WRITE_OUTPUT): null|string
```

Repinta as linhas visíveis na banda, no lugar (mais a scrollbar). Com `RETURN_OUTPUT`, retorna o frame como string.

### reset()

```php
public function reset (): void
```

Reseta o buffer e a visão.
