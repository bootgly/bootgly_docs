# Componente Frame

Um building block da camada **UI Base** — infraestrutura de layout sobre a qual outros componentes e a camada UX montam. O componente `Frame` é um iframe para o seu terminal: uma região retangular da tela com seu próprio **Output isolado/individual**. Tudo o que é escrito em `$Frame->Output` é bufferizado, recortado (ou quebrado) para o interior do frame e pintado no lugar — independente dos frames vizinhos, como as caixinhas de um dashboard btop. Em terminais interativos, apenas as linhas que mudaram desde o último render são repintadas (diff blit), e escapes de apagamento nunca são emitidos — frames adjacentes ficam intactos.

Uma demo ao vivo está disponível no [showcase](/manual/CLI/UI/Base/Frame/showcase).

## Instância

Para usar o componente, crie uma instância passando o `Output` do terminal — essa é a superfície *host* onde o frame pinta. O frame então cria seu próprio Output isolado:

```php
use const Bootgly\CLI;
use Bootgly\CLI\UI\Base\Frame;

$Terminal = CLI->Terminal;

$Frame = new Frame($Terminal->Output);
$Frame->row = 2;       // linha superior na tela (base 1)
$Frame->column = 4;    // coluna esquerda na tela (base 1)
$Frame->width = 40;    // largura externa, borda incluída
$Frame->height = 10;   // altura externa, borda incluída
$Frame->title = 'Log';
```

## O Output isolado

`$Frame->Output` é uma instância real de `Output` — escreva nele exatamente como escreveria no terminal (markup de Template suportado) e então renderize o frame:

```php
$Frame->Output->render("@#Black:12:00:01@; worker @#green:started@;\n");
$Frame->render();
```

Por ser um Output real, **qualquer componente renderiza dentro de um frame sem nenhuma adaptação** — basta construí-lo sobre `$Frame->Output`. As métricas internas `$Frame->columns` e `$Frame->lines` dimensionam o componente hospedado:

```php
use Bootgly\CLI\UI\Components\Charts\Sparkline;

$Sparkline = new Sparkline($Frame->Output);
$Sparkline->series = ['a' => 2.0, 'b' => 7.0, 'c' => 4.0];
$Sparkline->render();

$Frame->render();
```

## O padrão de tick

Dashboards estilo btop reescrevem cada caixa a cada tick. O padrão é sempre *clear → escrever conteúdo → render*:

```php
while (true) {
   $Frame->clear();                       // esvazia o conteúdo anterior
   $Chart->render();                      // componente hospedado escreve em $Frame->Output
   $Frame->render();                      // só as linhas que mudaram repintam

   usleep(100000);                        // ~10 FPS
}
```

`clear()` esvazia o conteúdo bufferizado mas preserva o resource do stream isolado — componentes hospedados continuam escrevendo no mesmo Output. Um frame quieto (mesmo conteúdo, mesma geometria) escreve **zero bytes**.

## Tail, head, clip e wrap

Conteúdo mais alto que o interior mostra o **tail** por padrão (`$follow = true`, as linhas mais novas vencem — semântica de log). Use `$Frame->follow = false;` para segurar as primeiras linhas.

Conteúdo mais largo que o interior é **recortado** por padrão (semântica de iframe). Use `$Frame->wrap = true;` para quebrar linhas longas em linhas extras do interior — a cor ativa segue para a linha quebrada.

## Estilos de borda

O conjunto de glifos da borda é um enum — `Sharp` (padrão), `Round`, `Double`, `Heavy` ou `None` (o interior ocupa o retângulo inteiro). O título é embutido na linha superior da borda e truncado para caber:

```php
use Bootgly\CLI\UI\Base\Frame\Borders;

$Frame->Borders = Borders::Round;   // ╭─ Log ──────╮
$Frame->color = '@#Black:';         // cor da borda + título (markup de Template)
```

## Política de conteúdo

Apenas texto e escapes SGR de estilo (cores, negrito, …) entram no buffer do frame. Escapes de movimentação de cursor, apagamento (`EL`/`ED`) e OSC são **removidos** quando o stream é drenado — um `\e[2J` perdido alimentado em um frame nunca consegue apagar o dashboard. Duas consequências práticas:

- Componentes auto-animados (um Graph com `start()`, um Spinner) repintam com escapes de cursor — dentro de um frame eles degradam para seus quadros estáticos. Use o padrão de tick: reescreva o conteúdo a cada tick e deixe o frame fazer o diff.
- Um carriage return (`\r`) sobrescreve a linha pendente — escritas estilo progress degradam para "o último estado vence".

Glifos largos (CJK, emoji) contam como uma coluna — a mesma limitação do framework presente no `Scrollarea`.

## Saída não interativa

Em pipes e CI, `render()` escreve as linhas do retângulo de forma plana (sem escapes de cursor, sem diff) — saída determinística, testável com `RETURN_OUTPUT`.

## Referência

### Propriedades

```php
public int $row
```

Config. A linha superior do retângulo externo na tela (base 1). Padrão: `1`.

```php
public int $column
```

Config. A coluna esquerda do retângulo externo na tela (base 1). Padrão: `1`.

```php
public int $width
```

Config. A largura externa, em colunas (borda incluída). Padrão: `20`.

```php
public int $height
```

Config. A altura externa, em linhas (borda incluída). Padrão: `5`.

```php
public Borders $Borders
```

Config. O conjunto de glifos da borda — `Borders::None` remove a borda. Padrão: `Borders::Sharp`.

```php
public string $color
```

Config. A cor da borda e do título (markup de Template). Padrão: `'@#Black:'`.

```php
public bool $follow
```

Config. Se o interior segue as linhas mais novas (tail) em vez das primeiras (head). Padrão: `true`.

```php
public bool $wrap
```

Config. Se linhas longas quebram em linhas extras do interior em vez de recortar o excedente. Padrão: `false`.

```php
public int $capacity
```

Config. Máximo de linhas lógicas bufferizadas — as mais antigas são descartadas. Padrão: `1000`.

```php
public null|string $title
```

Data. O título do frame (markup de Template) — renderizado na linha superior da borda, truncado para a largura interna.

```php
public private(set) Output $Output
```

Data (somente leitura). O Output isolado/individual — tudo escrito aqui renderiza dentro do frame.

```php
public private(set) array $buffer
```

Data (somente leitura). As linhas lógicas bufferizadas (bytes pintados, apenas SGR).

```php
public int $columns
```

Metadata (somente leitura). A largura interna, em colunas (`width` menos as bordas).

```php
public int $lines
```

Metadata (somente leitura). A altura interna, em linhas (`height` menos as bordas).

### drain()

```php
public function drain (): void
```

Puxa as escritas pendentes do Output isolado para o buffer de linhas sem pintar — sanitizadas, divididas em linhas lógicas e limitadas à capacidade. Coordenadores (como o [Tabs](/manual/CLI/UX/Components/Tabs/overview)) drenam frames inativos para manter seus streams limitados; `render()` sempre drena primeiro, então chamadas diretas só são necessárias para frames escondidos.

### clear()

```php
public function clear (): void
```

Esvazia o conteúdo do frame — o buffer, o resto não terminado e o stream do Output isolado. O resource do stream é preservado, então componentes hospedados continuam escrevendo no mesmo Output.

### invalidate()

```php
public function invalidate (): void
```

Descarta o front buffer do blit — o próximo render repinta o retângulo inteiro. Chame após a tela ser limpa externamente ou o frame ser sobreposto por outro.

### render()

```php
public function render (int $mode = self::WRITE_OUTPUT): null|string
```

Renderiza o retângulo do frame — borda, título e a vista visível do interior. Terminais interativos fazem diff blit apenas das linhas que mudaram, em suas posições absolutas; pipes escrevem as linhas de forma plana. Com `RETURN_OUTPUT`, retorna o retângulo como string.

### Borders

```php
enum Borders
```

Os conjuntos de glifos de borda: `Sharp` (`┌┐└┘`), `Round` (`╭╮╰╯`), `Double` (`╔╗╚╝`), `Heavy` (`┏┓┗┛`) e `None`.

```php
public function map (): array
```

Mapeia o conjunto de borda para sua tabela posição ⇒ glifo — vazia para `None`.
