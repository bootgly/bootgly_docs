# Componente Tabs

O componente `Tabs` é um multiplexador de [Frames](/manual/CLI/UI/Components/Frame/overview): N frames de aba rotulados compartilham um retângulo de tela e apenas o ativo renderiza — a sensação do btop/lazygit. A barra de abas vive na borda superior do frame ativo (a faixa de labels vira o título dele, com o label ativo destacado), custando zero linhas extras. Abas inativas continuam bufferizando seus Outputs isolados — drenadas e limitadas a cada render — e revelam o acumulado ao serem visitadas.

Uma demo ao vivo está disponível no [showcase](/manual/CLI/UX/Tabs/showcase).

## Instância

Crie uma instância passando o `Input` e o `Output` do terminal (a assinatura dos compostos UX — o `Input` só é lido dentro do ciclo interativo):

```php
use const Bootgly\CLI;
use Bootgly\CLI\UX\Tabs;

$Terminal = CLI->Terminal;

$Tabs = new Tabs($Terminal->Input, $Terminal->Output);
$Tabs->width = CLI->Terminal::$columns;
$Tabs->height = CLI->Terminal::$lines;
```

## Adicionando abas

`add()` cria o Frame da aba para você, vinculado ao Output host, com a geometria compartilhada já atribuída — as métricas internas são legíveis na linha seguinte, para dimensionar componentes hospedados. A primeira aba adicionada ativa:

```php
use Bootgly\CLI\UI\Components\Charts\Graph;

$Log = $Tabs->add('Log');
$CPU = $Tabs->add('CPU');

$Graph = new Graph($CPU->Output);
$Graph->width = $CPU->columns;
$Graph->height = $CPU->lines;
```

Tudo escrito no Output isolado de um frame de aba renderiza dentro daquela aba — qualquer componente funciona vinculando-se a ele, exatamente como num Frame avulso.

## Trocando e ciclando

`switch()` ativa por ordinal (base 1) ou label; `cycle()` move relativamente com wrap-around. Ambos são estado puro — o próximo `render()` pinta:

```php
$Tabs->switch(2);        // por ordinal (teclas de dígito mapeiam 1:1)
$Tabs->switch('Log');    // por label
$Tabs->cycle(+1);        // próxima aba (com wrap)
$Tabs->cycle(-1);        // aba anterior (com wrap)
```

Labels desconhecidos, ordinais fora do alcance e a aba já ativa são no-ops silenciosos. Uma troca real invalida o frame recém-ativo — seu retângulo foi sobrescrito pela aba anterior, então o próximo render o repinta por inteiro.

## O ciclo interativo

`switching()` é o loop interativo (irmão de `rendering()`/`prompting()`): renderiza, entrega o ordinal ativo a cada tick — alimente os Outputs das abas no corpo do loop — e lê uma tentativa de tecla por tick. `←`/`→` e `Tab`/`Shift+Tab` ciclam, `1`-`9` pulam, `q`/Ctrl+C encerra e restaura o terminal:

```php
foreach ($Tabs->switching() as $tab) {
   $Log->Output->render("linha alimentada\n");

   $CPU->clear();
   $Graph->feed($load);
   $Graph->render();
}
```

Em saída não interativa (pipes, CI) ele renderiza uma vez e retorna. Para dashboards estilo btop que possuem o próprio loop (ou Tabs dentro de um [Grid](/manual/CLI/UI/Components/Grid/overview)), dispense o gerador: conecte as teclas você mesmo e chame `render()` por tick.

## A barra de abas

A faixa de labels é composta no título do frame ativo: segmentos com um espaço de cada lado, o ativo pintado com `$highlight` (negrito + inverso por padrão), os demais com `$color`, unidos por um divisor derivado do conjunto de borda do frame ativo (`│`, `║`, `┃`, ...):

```text
┌ ▌ Log ▐│ CPU │ Table ────────────────┐
│ 09:12:01 load 63% fed row 41         │
```

Faixas longas truncam na largura interna (o estilo aberto sempre fecha no corte). Caveat: `Borders::None` no frame ativo esconde a borda — e a barra junto; mantenha os frames de aba com borda.

## Dentro de um Grid

Tabs implementa o mesmo contrato `Boxing` do Frame, então entra numa célula do Grid nativamente — o Grid atribui o retângulo compartilhado:

```php
$Grid->place($Tabs, row: 1, column: 2, rowspan: 2);
```

Combine com um loop de teclas do chamador (`switch()`/`cycle()`) e `Grid::render()` por tick — o modo canônico dentro do Grid. `switching()` é para Tabs avulso que possui o loop.

## Saída não interativa

Em pipes e CI, a renderização escreve as linhas do retângulo ativo de forma plana (herdado do Frame) e `switching()` entrega exatamente um yield — determinístico, testável com `RETURN_OUTPUT`.

## Referência

### Propriedades

```php
public int $row
```

Config. A linha superior do retângulo compartilhado na tela (base 1). Padrão: `1`.

```php
public int $column
```

Config. A coluna esquerda do retângulo compartilhado na tela (base 1). Padrão: `1`.

```php
public int $width
```

Config. A largura externa do retângulo compartilhado, em colunas. Padrão: `40`.

```php
public int $height
```

Config. A altura externa do retângulo compartilhado, em linhas. Padrão: `10`.

```php
public string $color
```

Config. A cor dos labels inativos e divisores (markup de Template). Padrão: `'@#Black:'`.

```php
public string $highlight
```

Config. A pintura do label ativo (SGR cru ou markup de Template). Padrão: `"\e[7;1m"` (inverso + negrito).

```php
public float $throttle
```

Config. Segundos por tick interativo — o clock do `switching()` é fixo: teclas seguradas drenam dentro do tick e nunca aceleram o loop. Padrão: `0.05`.

```php
public private(set) array $Frames
```

Data (somente leitura). Os Frames das abas, label ⇒ Frame, em ordem de adição.

```php
public private(set) int $tab
```

Data (somente leitura). O ordinal da aba ativa (base 1; `0` enquanto vazio).

```php
public null|Frame $Active
```

Metadata (somente leitura). O Frame de conteúdo da aba ativa — `null` enquanto vazio.

### add()

```php
public function add (string $label): Frame
```

Cria uma aba rotulada: um Frame vinculado ao Output host com a geometria compartilhada atribuída imediatamente. A primeira aba adicionada ativa; um label duplicado substitui seu Frame no lugar.

### arrange()

```php
public function arrange (): void
```

Atribui o retângulo compartilhado a todos os frames de aba — geometria pura, sem renderização.

### switch()

```php
public function switch (int|string $tab): void
```

Ativa uma aba por ordinal (base 1) ou label — estado puro. Alvos inválidos e a aba já ativa são no-ops silenciosos; uma troca real recompõe a barra e invalida o novo frame ativo.

### cycle()

```php
public function cycle (int $delta = 1): void
```

Cicla a aba ativa relativamente, com wrap-around nas duas pontas (semântica de `Tab`/`Shift+Tab`).

### invalidate()

```php
public function invalidate (): void
```

Invalida o frame ativo — o próximo render repinta o retângulo inteiro.

### resize()

```php
public function resize (int $columns, int $lines): void
```

Redimensiona o retângulo compartilhado: limpa a tela, invalida todos os frames de aba (conteúdo preservado) e repinta. A assinatura casa com o handler de resize do `Screen::watch`.

### render()

```php
public function render (int $mode = self::WRITE_OUTPUT): null|string
```

Renderiza o frame da aba ativa; todos os frames inativos drenam antes, mantendo seus streams e buffers limitados enquanto escondidos. Tabs vazio não renderiza nada.

### switching()

```php
public function switching (): Generator
```

O ciclo interativo: renderiza, entrega o ordinal ativo por tick e lê uma tentativa de tecla — `←`/`→`, `Tab`/`Shift+Tab`, `1`-`9`, `q`/Ctrl+C. Saída não interativa renderiza uma vez e retorna. Restaura o terminal ao sair.
