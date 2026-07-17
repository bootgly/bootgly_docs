# Region

`Region` é um [Output](/manual/CLI/Terminal/Output/overview) que escreve **dentro** de uma área hospedeira: cada linha emitida carrega um gutter esquerdo pintado e é deslocada à direita pela largura do gutter. Os componentes renderizam através dele exatamente como sempre fizeram — um `\n` aqui, um `Cursor->up()` ali, um `Text->clear()` para repintar — e aparecem aninhados dentro da região sem uma única linha de mudança, sem nunca saber que estão embutidos.

O [Wizard](/manual/CLI/UX/Components/Wizard/overview) é construído sobre ele: o conteúdo de cada step renderiza atrás da guia `│` da timeline, entre o step ativo e os próximos.

## Aninhando um componente

Três movimentos. O hospedeiro pinta a área e estaciona o cursor na coluna da região, a `Region` envolve o stream do hospedeiro, e o componente é construído com a `Region` no lugar do `Output` hospedeiro:

```php
use const Bootgly\CLI;
use Bootgly\ABI\Templates\Template\Escaped;
use Bootgly\CLI\Terminal;
use Bootgly\CLI\Terminal\Output\Region;
use Bootgly\CLI\UI\Components\Question;

$Input = CLI->Terminal->Input;
$Output = CLI->Terminal->Output;

// ! O gutter: uma guia pintada mais o espaço de respiro após ela
$gutter = Escaped::render('@#Black:│@;') . '  ';

// @ O hospedeiro pinta a área e ancora o cursor na coluna da região
$Output->write("Host\n");
$Output->write(str_repeat("{$gutter}\n", 4));
$Output->Cursor->up(3, column: 1);
$Output->Cursor->moveTo(column: 4);

// @ A região compartilha o stream do hospedeiro — 3 colunas de gutter
$Region = new Region($Output->stream, $gutter, 3);

Terminal::$width -= 3;

try {
   $Question = new Question($Input, $Region);
   $Question->prompt = 'Nome do projeto';
   $Question->default = 'App';

   $answer = $Question->ask();
}
finally {
   Terminal::$width += 3;
}
```

A Question renderiza aninhada, guia e tudo:

```
Host
│
│  Nome do projeto [App]: App
│
```

A primeira linha é responsabilidade do hospedeiro: a região injeta o gutter **após** cada quebra de linha, nunca antes do primeiro byte. Então o hospedeiro pinta a linha onde o componente começa e deixa o cursor na coluna da região (`moveTo(column: 4)` acima) — da primeira `\n` em diante, as linhas são da região.

## O que é traduzido

`write()`, `render()` e `escape()` passam todos pela mesma tradução. Quatro sequências são reescritas na passagem:

| O componente emite | A região escreve |
|---|---|
| `\n`, `\r\n`, `\r` | a quebra e depois o gutter — a linha reentra após a guia |
| `CSI n F` (linha anterior) | `CSI n A` + `CSI <coluna> G` — pousa na coluna da região, não na coluna 1 |
| `CSI n G` (coluna absoluta) | o mesmo movimento deslocado à direita pelo `offset` |
| `CSI 2 K` (apagar linha) | o apagamento e depois o gutter repintado |

Todo o resto — cores, `CSI n A`/`B`/`C`/`D`, telas alternativas — passa intacto.

## Largura dentro de uma região

Uma região é mais estreita que o terminal pelo seu `offset`. Componentes que ajustam a saída à `Terminal::$width` — [Menu](/manual/CLI/UI/Components/Menu/overview), [Textarea](/manual/CLI/UI/Components/Textarea/overview), [Tree](/manual/CLI/UI/Components/Tree/overview) — precisam enxergar a largura reduzida, senão suas linhas quebram. E uma linha quebrada é fatal para um repaint aninhado: `Cursor->up()` e `Text->clear(lines: N)` contam linhas **lógicas**, então uma linha transbordando em duas linhas físicas desalinha tudo abaixo dela.

Reduza a largura em volta da renderização aninhada e sempre restaure (um `finally`, como acima): os componentes leem `Terminal::$width` quando são construídos, então construa-os dentro da janela reduzida.

## Ressalvas

Tudo que o terminal escreve por conta própria contorna a tradução — em especial o echo do kernel dos caracteres digitados em modo canônico, que o terminal imprime na coluna física, não através do seu stream. Os editores da UI do Bootgly leem entrada raw e pintam o echo eles mesmos, então não são afetados; pré-pintar as linhas da região (como o hospedeiro faz acima) cobre o resto.

A região compartilha o stream do hospedeiro em vez de bufferizar: as escritas chegam ao terminal imediatamente, em ordem, intercaladas com o que o hospedeiro escrever.

## Reference

`Bootgly\CLI\Terminal\Output\Region` estende `Bootgly\CLI\Terminal\Output` — todos os membros de Output continuam disponíveis, incluindo `Cursor`, `Text` e `Viewport`.

```php
public function __construct ($stream, string $gutter, int $offset)
```

Cria a região sobre um stream de saída hospedeiro (`$Output->stream` — compartilhado, não copiado). `$gutter` é o gutter esquerdo pintado injetado em cada linha da região (SGR permitido — pinte markup com `Escaped::render()`). `$offset` é a largura **visível** do gutter em colunas: conte apenas os caracteres imprimíveis, ignorando os códigos de escape.

```php
public function write (string $data, int $times = 1): self
```

Escreve dados raw através da tradução da região.

```php
public function render (string $data): self
```

Resolve o markup de Template e escreve o resultado através da tradução da região.

```php
public function escape (string $data): self
```

Escreve uma sequência de escape (sem o `CSI` inicial) através da tradução da região.

A região expõe `gutter` (`string`, somente leitura — o gutter pintado) e `offset` (`int`, somente leitura — o offset de coluna da região).
