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

```bash :toolbar="true";
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

Lê uma linha do usuário com o prompt `>_: `, mantendo histórico de comandos (↑/↓) e registrando autocompleção via TAB contra a lista estática `Terminal::$commands`. Retorna `false` quando o stream de entrada é fechado; senão, retorna o que o comando executado retorna — sempre `true` num Terminal base, enquanto uma subclasse pode retornar `false` para um comando que responde de forma assíncrona, e quem chama espera essa saída antes de pedir a próxima linha. Bloqueia quem chama até uma linha ser digitada e precisa da ext-readline; quem precisa seguir trabalhando enquanto ninguém digita usa o `prompting()`.

```php
public function prompting (Closure $Supervise): Generator
```

Pede linhas de comando sem bloquear quem chama enquanto espera e entrega cada linha completa (`Generator<int,string>`). `$Supervise` roda antes de cada espera por entrada e retorna quanto essa espera pode durar em microssegundos (`0` só verifica), ou `false` para encerrar o prompt; qualquer sinal interrompe a espera. Num terminal, a linha é editada pelo readline (autocompleção via TAB contra `Terminal::$commands`, ↑/↓ para recuperar as linhas passadas ao `execute()`) e uma linha digitada pela metade sobrevive a cada espera; Ctrl-D numa linha vazia ou o terminal desligado encerram o prompt. No libedit, um ESC, ^V ou ^R inacabado segura a espera até a próxima tecla; um sinal ainda a interrompe. Sem a ext-readline, o terminal mostra o mesmo prompt `>_: ` e é lido como linhas simples que o próprio terminal edita: sem recuperar linhas nem autocompleção via TAB, e as setas chegam à linha como bytes de escape. Qualquer outra entrada (um pipe, um arquivo, `/dev/null`) é lida como linhas simples, sem prompt, e, quando termina, o prompt segue rodando `$Supervise` sem entrada. Cada linha entregue chega com o prompt desarmado, então quem chama a executa com o terminal no próprio modo.

```php
public function disarm (): void
```

Remove o handler de callback do readline que o `prompting()` instalou — sem efeito quando não há nenhum — e reescreve os handlers de sinal que o readline substituiu enquanto estava armado. Chame antes de o processo sair ou se reexecutar de dentro de um prompt — um `exit()` num handler de sinal despachado enquanto o prompt roda, ou um `pcntl_exec()`, pula o `finally` do generator —, senão o terminal fica em modo raw.

```php
public private(set) bool $armed
```

Se o handler de callback do readline do `prompting()` está instalado neste momento.

```php
public bool $editing
```

Se o `prompting()` edita a linha pelo readline (autocompleção via TAB, recuperação das linhas executadas): a entrada é um terminal e a ext-readline está carregada. Os consoles dos servidores só anunciam autocompleção e histórico quando é `true`.
