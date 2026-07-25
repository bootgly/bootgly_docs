# Componente Textarea

O componente `Textarea` edita texto multilinha no terminal: Enter quebra linhas, setas navegam (com wrap nas bordas das linhas), e **Ctrl+D submete**. A janela de linhas visíveis desliza com o cursor. Em entrada não interativa (pipes, CI) lê linhas do stdin até EOF — estilo heredoc, determinístico.

Uma demo ao vivo está disponível no [showcase](/manual/CLI/UI/Components/Textarea/showcase).

## Instância

Para usar o componente, é necessário criar uma instância passando como parâmetros as instâncias dos componentes `Input` e `Output`:

```php
use const Bootgly\CLI;
use Bootgly\CLI\UI\Components\Textarea;

$Terminal = CLI->Terminal;

$Textarea = new Textarea($Terminal->Input, $Terminal->Output);
```

## Pedindo texto multilinha

Defina o `prompt` e chame `ask()` — retorna as linhas unidas por `\n`:

```php
$Textarea->prompt = 'Commit message';
$Textarea->rows = 5; // linhas visíveis

$message = $Textarea->ask();
```

Durante a edição, todo o vocabulário de edição de linha funciona na linha ativa — o buffer trata as teclas que cruzam a fronteira entre linhas e delega todas as outras para a própria linha:

| Teclas | Ação |
|---|---|
| `←` / `→` | movem um caractere, com wrap nas bordas da linha |
| `↑` / `↓` | movem entre linhas (a coluna clampa) |
| `Home` / `End`, `Ctrl+A` / `Ctrl+E` | saltam para o início / fim da linha |
| `Backspace` | apaga antes do cursor — no início da linha, mescla com a anterior |
| `Delete` | apaga depois do cursor — no fim da linha, puxa a próxima para cima |
| `Ctrl+U` / `Ctrl+K` | matam até o início / fim da linha |
| `Ctrl+W`, `Alt+Backspace` | cortam a palavra antes do cursor |
| `Enter` | quebra a linha no cursor |
| **`Ctrl+D`** | **submete** |

O estado de edição vive em `Textarea->Lines`, um buffer [Lines](/manual/CLI/Terminal/Input/Lines/overview) que guarda uma [Line](/manual/CLI/Terminal/Input/Line/overview) por linha. As propriedades `lines`, `row` e `column` são views somente leitura sobre esse buffer, então o conteúdo editado pode ser inspecionado a qualquer momento:

```php
$Textarea->ask();

echo count($Textarea->lines);  // linhas
echo $Textarea->row;           // índice da linha do cursor
echo $Textarea->column;        // coluna do cursor, em codepoints
```

## Entrada não interativa

Em pipes e CI, `ask()` lê linhas do stdin até EOF, carrega-as no buffer (então `lines` também as reflete) e as une — determinístico:

```bash :toolbar="true";
printf 'first line\nsecond line\n' | php app.php
```

## Referência

### Propriedades

```php
public string $prompt
```

Config. O título do editor renderizado acima das linhas. Padrão: `''`.

```php
public int $rows
```

Config. Linhas visíveis — a janela desliza com o cursor; um indicador esmaecido `↓ N more` conta as linhas ocultas. Padrão: `5`.

```php
public private(set) Lines $Lines
```

Data (somente leitura). O buffer multilinha ([Lines](/manual/CLI/Terminal/Input/Lines/overview)) — uma [Line](/manual/CLI/Terminal/Input/Line/overview) por linha — que guarda todo o estado de edição.

```php
public array $lines { get; }
```

Data (virtual, somente leitura). Os valores das linhas, de cima para baixo — uma view sobre `Lines->lines`.

```php
public int $row { get; }
```

Metadata (virtual, somente leitura). O índice da linha do cursor — uma view sobre `Lines->row`.

```php
public int $column { get; }
```

Metadata (virtual, somente leitura). A coluna do cursor, em codepoints — uma view sobre `Lines->column`.

```php
public private(set) string $answer
```

Metadata (somente leitura). As linhas unidas por `\n`, preenchida por `ask()`.

### ask()

```php
public function ask (): string
```

Edita interativamente até Ctrl+D (ou EOF) e retorna as linhas unidas por `\n`. Entrada não interativa lê linhas do stdin até EOF.

### control()

```php
public function control (string $key): void
```

Trata uma tecla de edição (bytes crus — setas chegam como sequências de escape) encaminhando-a para o buffer `Lines`. Exposto para drives programáticos e testes.
