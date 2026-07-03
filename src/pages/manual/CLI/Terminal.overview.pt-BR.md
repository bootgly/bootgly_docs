# Terminal

A classe `Terminal` é o hub de tudo que acontece na tela em uma sessão CLI do Bootgly. Ela resolve as dimensões do terminal no boot, expõe os três pontos de entrada de I/O — `Input`, `Output` e `Reporting` de Mouse — e oferece operações de tela como o `clear()`.

Você nunca a instancia manualmente: a classe `CLI` cria um `Terminal` durante o autoboot.

## Instância

```php
use const Bootgly\CLI;

$Terminal = CLI->Terminal;

$Input  = $Terminal->Input;   // teclado / stdin
$Output = $Terminal->Output;  // tela / stdout
$Mouse  = $Terminal->Mouse;   // mouse reporting
```

Cada parte tem sua própria página no manual: [Input](/manual/CLI/Terminal/Input/overview), [Output](/manual/CLI/Terminal/Output/overview) e [Reporting](/manual/CLI/Terminal/Reporting/overview).

## Tamanho do terminal

Quando o `Terminal` é construído, ele resolve as dimensões da tela uma única vez e as guarda em propriedades estáticas:

```php
use Bootgly\CLI\Terminal;

Terminal::$columns; // ex.: 80
Terminal::$lines;   // ex.: 30

Terminal::$width;   // alias de $columns
Terminal::$height;  // alias de $lines
```

A ordem de resolução de cada dimensão é:

1. as variáveis de ambiente `COLUMNS` / `LINES`, quando numéricas (a convenção do ncurses);
2. `tput cols` / `tput lines`, quando a função `exec` está disponível;
3. os padrões de `80` colunas × `30` linhas.

Isso torna o tamanho confiável em qualquer runtime: TTYs interativos obtêm o tamanho real via `tput`, enquanto pipes, jobs de CI e runtimes embarcados (como o [showcase ao vivo](/manual/CLI/showcase) rodando em PHP WASM) podem definir o tamanho explicitamente:

```bash
COLUMNS=100 LINES=40 bootgly demo 12
```

## Limpando a tela

```php
CLI->Terminal->clear();
```

O `clear()` posiciona o cursor no início e apaga o display — o mesmo que o tour do `bootgly demo` faz entre demos encadeados.

## Veja ao vivo

Toda capacidade do Terminal documentada nesta seção roda ao vivo no [showcase do CLI](/manual/CLI/showcase) — código real do framework executando em PHP 8.4 WebAssembly no seu navegador.

## Reference

```php
public function clear (): true
```

Escreve as sequências de escape de cursor-home e erase-in-display no stream do `Output`, deixando o cursor no canto superior esquerdo. Sempre retorna `true`.

```php
public function interact (): bool
```

Lê uma linha do usuário com o prompt `>_: `, mantendo histórico de comandos (↑/↓) e registrando autocompleção via TAB contra a lista estática `Terminal::$commands`. Retorna `false` quando o stream de entrada é fechado.
