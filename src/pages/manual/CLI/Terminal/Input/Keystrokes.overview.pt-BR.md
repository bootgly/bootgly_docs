# Keystrokes

Quando a entrada do terminal é colocada em modo raw (não canônico), cada tecla pressionada chega como bytes raw — caracteres imprimíveis como eles mesmos, e teclas especiais como sequências de escape (`↑` é `\e[A`, `F5` é `\e[15~`, `Ctrl+C` é `\x03`...).

O enum `Keystrokes` dá nome a cada uma dessas sequências, para que seu loop de leitura faça match em `Keystrokes::UP` em vez de strings mágicas. É o vocabulário usado pelos componentes interativos — a navegação do [Menu](/manual/CLI/UI/Components/Menu/overview) e os atalhos do [viewer de Logs](/manual/CLI/UI/Components/Logs/overview) são guiados por ele.

## Lendo teclas

Coloque o [Input](/manual/CLI/Terminal/Input/overview) em modo raw e faça match do que o `read()` retorna contra os valores do enum:

```php
use const Bootgly\CLI;
use Bootgly\CLI\Terminal\Input\Keystrokes;

$Input = CLI->Terminal->Input;
$Output = CLI->Terminal->Output;

// ! Modo raw: leituras bloqueantes, sem buffer de linha, sem echo
$Input->configure(blocking: true, canonical: false, echo: false);

while (true) {
   $key = $Input->read(16);

   match ($key) {
      Keystrokes::UP->value     => $Output->write("cima\n"),
      Keystrokes::DOWN->value   => $Output->write("baixo\n"),
      Keystrokes::ENTER->value  => $Output->write("enter\n"),
      Keystrokes::ESCAPE->value => exit(0),
      default                   => $Output->write("tecla: $key\n"),
   };
}
```

Leia pelo menos alguns bytes por chamada (`read(16)` acima): teclas especiais são sequências multi-byte e precisam chegar em uma única leitura para o match funcionar.

Para exibir qual tecla foi pressionada, resolva os bytes de volta para um case:

```php
$Keystroke = Keystrokes::tryFrom($key);

echo $Keystroke?->name ?? 'não mapeada'; // ex.: "CTRL_LEFT"
```

## Reference

`Bootgly\CLI\Terminal\Input\Keystrokes` é um enum com backing de string — o valor de cada case é a sequência exata de bytes que o terminal emite.

### Teclas básicas

| Case | Bytes |
|---|---|
| `BACKSPACE` | `\177` |
| `ESCAPE` | `\e` |
| `ENTER` | `\n` |
| `TAB` | `\t` |
| `SPACE` | ` ` |

### Teclas de navegação

| Case | Bytes |
|---|---|
| `UP` / `DOWN` / `RIGHT` / `LEFT` | `\e[A` / `\e[B` / `\e[C` / `\e[D` |
| `HOME` / `END` | `\e[H` / `\e[F` |
| `INSERT` / `DELETE` | `\e[2~` / `\e[3~` |
| `PAGEUP` / `PAGEDOWN` | `\e[5~` / `\e[6~` |

### Teclas de função

| Case | Bytes |
|---|---|
| `F1` – `F4` | `\eOP`, `\eOQ`, `\eOR`, `\eOS` |
| `F5` – `F8` | `\e[15~`, `\e[17~`, `\e[18~`, `\e[19~` |
| `F9` – `F12` | `\e[20~`, `\e[21~`, `\e[23~`, `\e[24~` |

### Teclas combinadas

| Grupo | Cases |
|---|---|
| `CTRL_A` – `CTRL_Z` | os bytes de controle `\x01` – `\x1A` (`CTRL_I`/`CTRL_J` são omitidos — duplicam `TAB`/`ENTER`) |
| `CTRL_UP` / `CTRL_DOWN` / `CTRL_RIGHT` / `CTRL_LEFT` | `\e[1;5A` – `\e[1;5D` |
| `CTRL_BACKSLASH`, `CTRL_RIGHT_BRACKET`, `CTRL_UNDERSCORE`, `CTRL_AT`, `CTRL_CIRCUMFLEX` | `\x1C`, `\x1D`, `\x1F`, `\x00`, `\x1E` |
| `SHIFT_TAB` | `\e[Z` |
| `SHIFT_UP` / `SHIFT_DOWN` / `SHIFT_RIGHT` / `SHIFT_LEFT` | `\e[1;2A` – `\e[1;2D` |
| `ALT_UP` / `ALT_DOWN` / `ALT_RIGHT` / `ALT_LEFT` | `\e[1;3A` – `\e[1;3D` |
| `ALT_INSERT`, `ALT_DELETE`, `ALT_HOME`, `ALT_END`, `ALT_PAGEUP`, `ALT_PAGEDOWN` | `\e[2;3~`, `\e[3;3~`, `\e[1;3H`, `\e[1;3F`, `\e[5;3~`, `\e[6;3~` |
