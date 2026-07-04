# Componente Dialog

O componente `Dialog` cuida de interações rápidas, baseadas em linha, no terminal: confirmações sim/não, prompts raw e alertas de reconhecimento. Ele lê linhas inteiras do `Input` do Terminal e renderiza através do `Output` do Terminal, então se comporta da mesma forma em terminais interativos (TTY) e em entrada via pipe — scripts e execuções de CI permanecem determinísticos assumindo os valores padrão.

Junto com os componentes [Menu](/manual/CLI/UI/Components/Menu/overview) e [Question](/manual/CLI/UI/Components/Question/overview), o `Dialog` impulsiona o wizard interativo do `bootgly project create` — eles fazem parte dos componentes UX Interativos da v0.20.0-beta.

Exemplos em estilo de transcript estão disponíveis no [showcase](/manual/CLI/UI/Components/Dialog/showcase).

## Instância

Para utilizar o componente, é necessário criar uma instância passando como parâmetros as instâncias dos componentes `Input` e `Output`:

```php
use const Bootgly\CLI;
use Bootgly\CLI\UI\Components\Dialog;

$Terminal = CLI->Terminal;

$Dialog = new Dialog($Terminal->Input, $Terminal->Output);
```

## Confirmando uma ação

O método `confirm()` renderiza a mensagem seguida de um sufixo `[y/N]` e retorna um booleano:

```php
if ($Dialog->confirm('Delete all logs?') === true) {
   // apaga os logs...
}
```

`y`/`yes` e `n`/`no` são aceitos sem diferenciar maiúsculas de minúsculas. Uma resposta vazia (apenas Enter) ou EOF assume o valor padrão — `false`, a menos que você passe `default: true`, o que também troca o sufixo para `[Y/n]`:

```php
// Renderiza `Keep the generated files? [Y/n] `
$keep = $Dialog->confirm('Keep the generated files?', default: true);
```

Em terminais interativos, respostas inválidas fazem a pergunta ser refeita; em entrada não interativa, elas recuam para o valor padrão.

## Solicitando um valor raw

O método `prompt()` renderiza a mensagem com um sufixo `[default]` opcional e retorna a resposta raw com trim aplicado:

```php
// Renderiza `Your name [anonymous]: `
$name = $Dialog->prompt('Your name', default: 'anonymous');
```

Uma resposta vazia ou EOF retorna o valor padrão. O `prompt()` não valida nada — quando a resposta precisa ser validada, obrigatória ou refeita, use o [componente Question](/manual/CLI/UI/Components/Question/overview).

## Alertando e pausando

O método `alert()` renderiza a mensagem através do [componente Alert](/manual/CLI/UI/Components/Alert/overview) (tipo Attention). Em terminais interativos, ele então imprime `Press Enter to continue...` e espera pelo Enter; em terminais não interativos, ele retorna imediatamente:

```php
$Dialog->alert('Disk is almost full!');
```

## Referência

### Propriedades

```php
public string $message
```

Config. A mensagem renderizada pelo diálogo. Padrão: `''`. Ela é definida por `alert()`, `confirm()` e `prompt()` a partir do argumento `$message` deles.

```php
public bool $default
```

Config. O valor assumido pelo `confirm()` em resposta vazia ou EOF. Padrão: `false`.

```php
public string $suffix
```

Data. O texto renderizado depois da mensagem — definido internamente por `confirm()` (` [y/N] ` / ` [Y/n] `) e `prompt()` (` [default]: `).

```php
public private(set) null|bool $confirmed
```

Metadata (somente leitura). O resultado da última chamada de `confirm()` — `null` até a primeira confirmação.

```php
public private(set) string $answer
```

Metadata (somente leitura). A resposta retornada pela última chamada de `prompt()`.

### alert()

```php
public function alert (string $message): void
```

Renderiza `$message` através do componente Alert (tipo Attention). Em terminais interativos (TTY), imprime em seguida `Press Enter to continue...` e espera pelo Enter; em terminais não interativos, retorna imediatamente.

### confirm()

```php
public function confirm (string $message, bool $default = false): bool
```

Renderiza `$message` seguida de ` [y/N] ` (ou ` [Y/n] ` quando `$default` é `true`) e lê uma linha. Aceita `y`/`yes`/`n`/`no` sem diferenciar maiúsculas de minúsculas; uma resposta vazia ou EOF assume `$default`. Respostas inválidas refazem a pergunta em terminais interativos e recuam para `$default` em entrada não interativa. Armazena o resultado em `$confirmed` e o retorna.

### prompt()

```php
public function prompt (string $message, string $default = ''): string
```

Renderiza `$message` seguida de ` [$default]: ` (ou apenas `: ` quando `$default` é vazio) e lê uma linha. Retorna a resposta raw com trim aplicado; uma resposta vazia ou EOF retorna `$default`. Nenhuma validação é feita — entrada validada é trabalho do componente Question. Armazena o resultado em `$answer` e o retorna.
