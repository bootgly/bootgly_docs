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

Durante a edição: Enter quebra a linha no cursor; Backspace no início de linha a mescla com a anterior; `↑`/`↓` movem entre linhas (a coluna clampa); `Home`/`End` (ou `Ctrl+A`/`Ctrl+E`) saltam dentro da linha; **Ctrl+D finaliza**.

## Entrada não interativa

Em pipes e CI, `ask()` lê linhas do stdin até EOF e as une — determinístico:

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
public private(set) array $lines
```

Data (somente leitura). As linhas editadas.

```php
public private(set) int $row
```

Metadata (somente leitura). O índice da linha do cursor.

```php
public private(set) int $column
```

Metadata (somente leitura). A coluna do cursor, em codepoints.

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

Trata uma tecla de edição (bytes crus — setas chegam como sequências de escape). Exposto para drives programáticos e testes.
