# Lines

`Lines` é o motor de edição multilinha: uma [Line](/manual/CLI/Terminal/Input/Line/overview) por linha, mais o índice da linha sendo editada. Como a `Line`, ele é **estado puro** — sem I/O de stream, sem janelamento, sem decisões de renderização. Você é dono do laço de leitura, você decide qual tecla submete, e você renderiza as linhas.

É ele que sustenta o [Textarea](/manual/CLI/UI/Components/Textarea/overview) e a entrada multilinha do [Prompt](/manual/CLI/UX/Components/Prompt/overview).

## Editando através das linhas

Crie, entregue o que o [`listen()`](/manual/CLI/Terminal/Input/overview) devolver, e leia o valor de volta:

```php
use const Bootgly\CLI;
use Bootgly\CLI\Terminal\Input\Keystrokes;
use Bootgly\CLI\Terminal\Input\Lines;

$Input = CLI->Terminal->Input;
$Output = CLI->Terminal->Output;

$Lines = new Lines;

$Input->configure(blocking: false, canonical: false, echo: false);

while (true) {
   $key = $Input->listen();

   // ? Canal fechado, ou a tecla de submit — Ctrl+D aqui, escolha sua
   if ($key === false || $key === Keystrokes::CTRL_D->value) {
      break;
   }
   // ? Drenado
   if ($key === '') {
      usleep(20000);

      continue;
   }

   $Lines->control($key);

   // @ Repaint: uma linha por row, a célula do cursor na ativa
   foreach ($Lines->Lines as $index => $Line) {
      $Line->width = 40;

      $Output->render(($index === $Lines->row ? $Line->render() : $Line->value) . "\n");
   }
}

$Input->configure(blocking: true, canonical: true, echo: true);

// $Lines->value === "ab\n cd"
```

Digitar `ab`, Enter, ` cd` deixa `value` como `"ab\n cd"`, com `row` em `1` e `column` em `3`.

Apenas a linha **ativa** renderiza sua célula de cursor — as outras renderizam o `value` puro. Definir `width` por linha é o que faz uma linha longa deslizar em vez de quebrar; deixe `null` para renderizar a linha inteira.

## O que ele trata, e o que ele delega

`Lines` cuida apenas das teclas que cruzam fronteira de linha. Todo o resto — inclusive input imprimível — vai direto para a `Line` ativa, então você ganha o keymap inteiro dela de graça.

| Tecla | Tratada por |
|---|---|
| `↑` / `↓` | `Lines` — move entre linhas, limitando a coluna ao comprimento da linha de destino |
| `←` / `→` | `Lines` nas bordas da linha (indo para a anterior/próxima), senão `Line` |
| `Enter` | `Lines` — divide a linha no cursor |
| `Backspace` | `Lines` no início da linha (funde com a anterior), senão `Line` |
| `Delete` | `Lines` no fim da linha (puxa a próxima para cima), senão `Line` |
| `Home` / `End` / `Ctrl+A` / `Ctrl+E` / `Ctrl+U` / `Ctrl+K` / `Ctrl+W` | `Line`, na linha ativa |
| texto imprimível | `Line`, inserido no cursor |

Sequências de escape não tratadas nunca entram no valor como texto, então um `PgUp` sem binding é simplesmente um no-op.

## Enter quebra — submeter é com você

`Lines::control()` **sempre** quebra a linha no Enter, e não devolve nada. Qual tecla submete é política do host, e isso é deliberado: o Textarea submete com `Ctrl+D` enquanto o Prompt submete com `Enter` e quebra com `Shift+Enter` — o mesmo buffer serve os dois, justamente porque ele nunca decide.

Se a sua tecla de submit for o Enter, intercepte antes de repassar:

```php
if ($key === Keystrokes::ENTER->value) {
   $answer = $Lines->value;

   $Lines->reset();
}
else {
   $Lines->control($key);
}
```

## Carregando um valor

`load()` divide um valor nas quebras de linha e reconstrói as linhas, deixando o cursor no fim da última — para um default multilinha, ou para restaurar uma entrada de histórico com as linhas intactas:

```php
$Lines->load("primeira\nsegunda");

// $Lines->lines === ['primeira', 'segunda']
// $Lines->row === 1
// $Lines->column === 7
```

`reset()` volta a uma única linha vazia.

## Reference

`Bootgly\CLI\Terminal\Input\Lines` expõe `Lines` (`array<int,Line>`, somente leitura — os buffers de linha, de cima para baixo, nunca vazio) e `row` (`int`, somente leitura — o índice da linha ativa), mais quatro visões computadas somente leitura: `Line` (o buffer da linha ativa), `column` (`int` — o cursor da linha ativa, em codepoints), `lines` (`array<int,string>` — os valores das linhas) e `value` (`string` — as linhas unidas por `\n`).

```php
public function __construct ()
```

Cria o buffer com uma única linha vazia.

```php
public function feed (string $input): self
```

Insere input imprimível no cursor da linha ativa, com reconhecimento de UTF-8. Bytes de controle são ignorados. Quebras de linha no input **não** dividem linhas — use `control()` com Enter, ou `load()`.

```php
public function control (string $key): void
```

Trata uma tecla de edição. As teclas que cruzam fronteira de linha são tratadas aqui; todo o resto delega para a linha ativa, inclusive input imprimível. O Enter sempre quebra a linha — qual tecla submete é política do host.

```php
public function load (string $value): self
```

Carrega um valor no buffer, dividindo nas `\n`. O cursor pousa no fim da última linha.

```php
public function reset (): self
```

Reseta o buffer para uma única linha vazia.
