# Componente Logs

O componente `Logs` é um **visualizador** de logs em tempo real e tela cheia para o terminal. Ele
mantém um buffer de `Record`s estruturados, aplica filtros ao vivo (severidade, canal, texto) e
renderiza uma barra de status, um painel de logs em tailing e um rodapé de atalhos — o painel que
você vê quando um `HTTP_Server_CLI` roda em modo **Monitor**.

Ele não é um logger: nunca produz records, apenas os consome. Os records chegam como JSON
delimitado por nova linha (um por linha) — normalmente drenado do pipe IPC em que o master e seus
workers escrevem via `ACI\Logs\Handlers\Pipe`.

## Acompanhe os logs de um servidor em execução

O componente é dirigido por `TCP_Server_CLI::monitoring()` (herdado por `HTTP_Server_CLI`), então o
caminho comum é apenas iniciar um servidor em modo Monitor — sem fiação manual:

```bash
bootgly project Demo/HTTP_Server_CLI start -m
```

O servidor entra na tela alternativa, aponta todo `Logger` para o pipe do Monitor e alimenta o
viewer num laço não-bloqueante. Você ganha um painel ao vivo e filtrável até teclar `q`/`Esc`.

## Dirija você mesmo

Se você montar seu próprio laço de monitoramento, o ciclo é: alimentar bytes, ler uma tecla,
renderizar um frame.

```php
use const Bootgly\CLI;
use Bootgly\CLI\UI\Components\Logs;

$Input = CLI->Terminal->Input;
$Output = CLI->Terminal->Output;

$Viewer = new Logs($Input, $Output, max: 5000);

// Num laço não-bloqueante:
$Viewer->feed($chunk);            // JSON delimitado por nova linha drenado do pipe de logs
$running = $Viewer->control($key); // uma tecla crua (retorna false ao sair)
$Viewer->render();                 // desenha um frame completo
```

`feed()` carrega entre chamadas uma linha final incompleta, então leituras parciais do pipe são
seguras. `control()` retorna `false` apenas quando o usuário sai (`q`, ou `Esc` ao vivo) — seu laço
é dono do entra/sai da tela alternativa e da restauração do terminal.

## Filtre e navegue

`control()` mapeia as teclas abaixo. As mesmas teclas aparecem no rodapé que o componente renderiza:

| Tecla | Ação |
|---|---|
| `l` | cicla o **limite de severidade** (Debug → … → Emergency) |
| `1`–`9` | liga/desliga um **canal** (numerados na barra de status) |
| `/` | **busca** — digite para filtrar mensagens, `Enter`/`Esc` para manter |
| `espaço` | **pausa** — congela um snapshot; novos logs continuam no buffer, a visão não move |
| `↑`/`↓`, `PgUp`/`PgDn` | **seleciona** um record (pausa para navegar o snapshot congelado) |
| `Enter` | **expande** o record selecionado — detalhe completo (todas as linhas, `context`, `extra`) |
| `Home`/`End` | pula para o mais antigo / volta à cauda ao vivo |
| `q` / `Esc` | sai do viewer |

Mensagens multilinha — exceptions, stack traces — são **colapsadas em uma linha** com um marcador
`⏎N` para um trace nunca inundar o painel. Selecione o record e tecle `Enter` para ler tudo numa
visão de detalhe rolável.

Em **pausa**, a renderização usa um snapshot congelado do buffer (`$paused` true), então a tela não
se move enquanto novos records chegam. `End` (ou `espaço`) retoma a cauda ao vivo.

## Referência

```php
public function __construct (Input &$Input, Output &$Output, int $max = 5000)
```

Cria um viewer ligado a um `Input`/`Output` de terminal. `$max` é a capacidade do ring buffer em
records (o mais antigo é descartado ao passar do limite). Espera-se que o laço configure o `Input`
para leituras cruas não-bloqueantes.

```php
public function feed (string $chunk): void
```

Anexa bytes crus do pipe (records JSON delimitados por nova linha). Linhas completas são decodadas
via `Record::import()` e bufferizadas; um fragmento final incompleto é carregado para a próxima
chamada.

```php
public function control (string $key): bool
```

Trata uma tecla — muta estado de filtro, seleção, busca e detalhe. Retorna `false` para sair do
viewer, `true` para continuar.

```php
public function render (): void
```

Desenha um frame completo: a visão de detalhe expandida quando há record selecionado, senão a barra
de status + painel de logs em janela + rodapé. Usa cursor-home + clear-to-EOL por linha para evitar
flicker.

### Estado (público)

- `$Records` — o ring buffer ao vivo (`array<int,Record>`).
- `$level` — limite de severidade atual (`Levels`, padrão `Levels::Debug` = mostrar tudo).
- `$channels` — mapa de visibilidade `canal => bool` (canal ausente = visível).
- `$search` — substring de mensagem ativa (case-insensitive).
- `$paused`, `$searching` — flags do sub-modo atual.
- `$cursor` — índice do record selecionado na lista visível durante a pausa.
- `$Detail` — o `Record` expandido (visão de detalhe), ou `null` no modo lista (somente leitura).

### Camadas

`Logs` vive em `CLI/UI/Components` e consome `ACI\Logs\{Record, Data\Levels}` mais `CLI\Terminal`
para dimensão/teclas — depende só para baixo. O transporte (`ACI\Logs\Handlers\Pipe`) e o laço de
monitoramento (`WPI`) ficam em lados opostos dele e nunca o acessam de volta.

## Veja ao vivo

O demo oficial de Logs roda no [showcase ao vivo](/manual/CLI/UI/Components/Logs/showcase) — código real do framework em PHP 8.4 WebAssembly, no seu navegador, direto desta página.
