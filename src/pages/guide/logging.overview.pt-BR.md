# Logging

O Bootgly traz um pipeline de logging nativo e sem dependências em `Bootgly\ACI\Logs`. Um `Logger`
transforma cada chamada em um `Record` que passa pelos **processors** (enriquecem), e então por
cada **handler**, onde atravessa um limite de severidade e os **filters**, é renderizado por um
**formatter** e escrito em um destino (terminal, arquivo, syslog, um pipe). Os níveis seguem a
RFC 5424. Tudo é embutido — sem dependência Composer.

## Registre uma mensagem

Crie um `Logger` para um canal e registre com o **nível como argumento nomeado**:

```php
use Bootgly\ACI\Logs\Logger;

$Logger = new Logger(channel: 'App');

$Logger->log(info: 'Servidor saudável.');
$Logger->log(error: 'Pagamento falhou.', context: ['order' => 42]);
```

O nível é o **nome** do argumento — existe um único verbo `log()`, não oito métodos. Níveis
reconhecidos: `emergency`, `alert`, `critical`, `error`, `warning`, `notice`, `info`, `debug`.
Chamadas posicionais são rejeitadas de propósito:

```php
$Logger->log('opa');             // ✗ lança erro — um nível é obrigatório
$Logger->log(error: 'opa');      // ✓
```

> [!NOTE]
> Um `Logger` recém-criado escreve uma linha colorida na **stdout** por padrão. `context` são
> dados estruturados opcionais anexados ao record (aparecem na íntegra no formatter JSON).

Você pode emitir **vários níveis numa só chamada** — cada par vira um record próprio, em ordem,
compartilhando o mesmo `context`:

```php
$Logger->log(
   info:  'Cache aquecido.',
   warning: 'Cache perto do limite.',
   context: ['region' => 'eu'],
);
```

## Envie logs para um arquivo (com rotação)

Adicione um handler `File`. A rotação é embutida — rotaciona por limite de tamanho **ou** por
mudança de dia, o que vier primeiro, e mantém um número limitado de arquivos:

```php
use const BOOTGLY_STORAGE_DIR;

use Bootgly\ACI\Logs\Handlers\File;
use Bootgly\ACI\Logs\Handlers\File\Rotation;
use Bootgly\ACI\Logs\Data\Levels;
use Bootgly\ACI\Logs\Logger;

$Logger = new Logger(channel: 'App');

$Logger->Handlers->push(
   new File(
      BOOTGLY_STORAGE_DIR . 'logs/app.log',
      Rotation: new Rotation(size: 10_485_760, daily: true, keep: 7),
   ),
   Levels::Warning,   // este handler só aceita Warning e mais severos
);
```

O segundo argumento de `push()` define a **severidade mínima** do handler (valor RFC 5424 menor =
mais severo). Os arquivos são numerados `app.log.1` … `app.log.7`; o mais antigo é descartado.

Um placeholder `{channel}` no caminho escreve **um arquivo por canal** — cada record cai num arquivo
nomeado pelo seu módulo:

```php
$Logger->Handlers->push(new File(BOOTGLY_STORAGE_DIR . 'logs/{channel}.log'));
// um logger no canal 'Demo.App' → storage/logs/Demo.App.log
```

Um placeholder `{project}` resolve para a **procedência** do record — o id de pasta canônico do
projeto bootado, ou `framework` quando nenhum projeto foi bootado — separando records do framework
e da aplicação com zero código de aplicação (os dois placeholders são sanitizados; sem path
traversal):

```php
$Logger->Handlers->push(new File(BOOTGLY_STORAGE_DIR . 'logs/{project}/{channel}.log'));
// um boot de 'Demo/HTTP_Server_CLI' → storage/logs/Demo_HTTP_Server_CLI/Demo.App.log
// um processo puro do framework    → storage/logs/framework/<canal>.log
```

## Persista logs em toda a aplicação

Um handler `File` por logger cobre um logger. Para persistir **todo logger que optou** num só lugar —
um canal de todo o framework — registre um **sink** global uma vez e faça os módulos optarem:

```php
use const BOOTGLY_STORAGE_DIR;

use Bootgly\ACI\Logs\Handlers;
use Bootgly\ACI\Logs\Handlers\File;
use Bootgly\ACI\Logs\Logger;

// destino — registre uma vez no boot, antes de forkar os workers
Logger::$Sinks ??= new Handlers;
Logger::$Sinks->push(new File(BOOTGLY_STORAGE_DIR . 'logs/{channel}.log'));

// origem — um módulo opta construindo seu logger global
$Logger = new Logger(channel: 'Payments', global: true);
```

A persistência é **opt-in nas duas pontas**: nada é escrito até você registrar um sink (o destino),
e só loggers construídos `global: true` chegam nele (a origem). Com `{channel}` você ganha um arquivo
por módulo — `storage/logs/Payments.log`.

Os **canais de servidor do framework optam por padrão**: `HTTP.Server.CLI`, `TCP.Server.CLI` e os
demais loggers do servidor nascem `global: true`, então records de boot, Auto-TLS e ciclo de vida
chegam aos seus sinks sem contorno nenhum. Desfazer o opt-in de um servidor é uma linha:

```php
$Server->Logger->global = false;
```

Onde os records de um logger opted-in caem, por modo do servidor:

| Modo | Arquivo do sink | Viewer ao vivo |
|---|---|---|
| Foreground / Interactive | ✅ (e stdout) | `bootgly logs -f` |
| Daemon | ✅ (auto-instalado quando não definido) | `bootgly logs -f` |
| Monitor | ✅ | ✅ (no terminal) + `bootgly logs -f` |

> [!NOTE]
> **Daemon nunca é um buraco negro silencioso.** Quando um servidor daemoniza com `Logger::$Sinks`
> ainda não definido, ele instala o sink padrão — `File(BOOTGLY_STORAGE_DIR . 'logs/{channel}.log')`
> — e um NOTICE dizendo isso é o primeiro record do arquivo. Um projeto que registrou seus próprios
> sinks nunca é tocado (semântica `??=`). Siga qualquer modo ao vivo com
> **[`bootgly logs -f`](/guide/logs/overview/)** — sem `tail`.

## Saiba de quem é o record (procedência)

Todo `Record` carrega um campo `project`: o **id de pasta canônico** do projeto bootado
(`Demo/HTTP_Server_CLI`, `App`, …), ou `framework` quando nenhum projeto foi bootado no
processo. Ele é estampado **uma vez por processo** pelo `Project::mount()` (que o `boot()` chama)
— nunca derivado por record de heurística de caminho de arquivo — então records do framework e da
aplicação num arquivo compartilhado são sempre distinguíveis:

```json
{"timestamp":1788122369.47,"level":"INFO","project":"Demo/HTTP_Server_CLI","instance":"8082","channel":"Demo.App","message":"Heartbeat — server healthy.","context":[],"extra":[]}
```

Todo `Record` carrega também um campo `instance`: o qualificador que o registry de processos usa
para o processo que escreveu — a porta vinculada para servidores, o PID do master para processos
Console e TUI — estampado uma vez por processo quando a instância é reivindicada (o `start()` de
um servidor, `project start`, `project <Nome> schedule run`, o loop do terminal), e vazio (`""`)
quando o processo não reivindicou nenhuma (comandos do kit, scripts avulsos, clients WPI).

Os dois campos são filtros de primeira classe no `bootgly logs` (`--project=<Nome>`, `--framework`,
`--instance=<id>`), e `project` é o placeholder de caminho `{project}` acima. Linhas escritas antes
dos campos existirem voltam como `framework` com `instance` vazia.

## Escolha um formato

Cada handler tem um formatter. `Line` (padrão) é o formato humano/terminal com cores ANSI; `JSON`
emite um objeto estruturado por linha para coletores de log:

```php
use Bootgly\ACI\Logs\Formatters\JSON;
use Bootgly\ACI\Logs\Handlers\Stream;

$Logger->Handlers->push(new Stream(STDERR, new JSON));
```

Uma linha JSON carrega `timestamp`, `level`, `project`, `instance`, `channel`, `message`, `context`
e `extra` (o ANSI é removido da mensagem).

## Enriqueça records com processors

Processors adicionam campos ao `extra` de cada record. Anexe-os uma vez por logger:

```php
use Bootgly\ACI\Logs\Processors\Memory;
use Bootgly\ACI\Logs\Processors\PID;
use Bootgly\ACI\Logs\Processors\RequestID;

$Logger->Processors
   ->push(new PID)         // extra['pid']
   ->push(new Memory)      // extra['memory'], extra['memory_peak']
   ->push(new RequestID);  // extra['request_id'] quando há um id de correlação
```

`RequestID` lê um id de processo/requisição de `Processors\RequestID::$id` — defina-o de uma camada
superior (ex.: um middleware HTTP) para correlacionar todas as linhas de uma requisição.

## Filtre o que um handler aceita

Além do limite de severidade por handler, anexe `Filters` para controle fino. Todos compartilham
o contrato `check(Record): bool`:

```php
use Bootgly\ACI\Logs\Filters\Channel;
use Bootgly\ACI\Logs\Filters\Level;
use Bootgly\ACI\Logs\Filters\Search;

$Handler->Filters
   ->push(new Level(Min: Levels::Warning, Max: Levels::Emergency))  // uma faixa de severidade
   ->push(new Channel(allowed: ['App', 'Auth']))                    // permitir/negar canais
   ->push(new Search('timeout'));                                   // substring na mensagem
```

Todos os filtros anexados precisam passar para o record ser escrito. `Filters\Callback` recebe
qualquer `Closure(Record): bool` e `Filters\Tags` casa tags lidas de `context['tags']`.

## Acompanhe os logs ao vivo no terminal

Inicie um `HTTP_Server_CLI` em modo **Monitor** e seu terminal vira um painel de logs em tempo
real e filtrável. O master **e** cada worker transmitem seus records ao master, que os renderiza:

```bash :toolbar="true";
bootgly project Demo/HTTP_Server_CLI start -m
```

Você tem uma barra de status, um painel de logs em tailing e um rodapé com os atalhos. Filtre e
navegue ao vivo:

| Tecla | Ação |
|---|---|
| `l` | cicla o **limite de severidade** (Debug → … → Emergency) |
| `1`–`9` | liga/desliga um **canal** (numerados na barra de status) |
| `/` | **busca** — digite para filtrar mensagens, `Enter`/`Esc` para manter |
| `espaço` | **pausa** — congela a visão (novos logs continuam no buffer, a tela não move) |
| `↑`/`↓`, `PgUp`/`PgDn` | **seleciona** um record (pausa para navegar um snapshot congelado) |
| `Enter` | **expande** o record selecionado — visão de detalhe com todas as linhas, context e extra, quebradas na largura (nada é cortado) |
| `Home`/`End` | pula para o mais antigo / volta à cauda ao vivo (na visão de detalhe: topo / fim do record) |
| `q` / `Esc` | sai do viewer (cai no prompt interativo) |

Mensagens multilinha — exceptions, stack traces — são **colapsadas em uma linha** com um marcador
`⏎N` para nunca inundar o painel. Selecione o record e tecle `Enter` para ler tudo (mensagem,
`context` e `extra`) numa visão de detalhe rolável — `context` e `extra` saem uma chave por linha,
linhas longas quebram na largura do terminal em vez de serem cortadas, e `Home`/`End` pulam para o
topo/fim do record.

> [!NOTE]
> O viewer funciona porque o Monitor liga um tap ao vivo (`Logger::$Tap`) que **todo** `Logger`
> alimenta — independente de opt-in — enquanto `Display::show(Display::NONE)` muta a saída local de
> stdout para nada rabiscar a TUI diretamente. (O tap é separado do `Logger::$Sinks`, que é o canal
> persistente opt-in abaixo.) Sob enxurrada de logs, a escrita não-bloqueante do pipe de um worker é
> descartada em vez de travar o caminho da requisição.

A mesma tela também funciona **de qualquer outro terminal, contra qualquer modo** — Daemon
incluído: **[`bootgly project <Nome> logs -f`](/guide/logs/overview/)** anexa ao tap ao vivo da
instância em execução e renderiza por este exato viewer (mesmos filtros, mesmas teclas). Anexar
arma o tap; desanexar desarma — um servidor que ninguém está olhando não paga nada.

## Escolha o que a linha no terminal mostra

A saída padrão `Line` é montada a partir de **segmentos** independentes — escolha exatamente as
partes que quiser com `Display::show()` (não afeta os handlers de arquivo/JSON):

```php
use Bootgly\ACI\Logs\Data\Display;

Display::show(Display::MESSAGE, Display::TIMESTAMP, Display::CHANNEL);
```

| Segmento | Adiciona |
|---|---|
| `Display::MESSAGE` | o texto da mensagem (o conteúdo) |
| `Display::TIMESTAMP` | `[hora ISO-8601]` antes da linha |
| `Display::CHANNEL` | o nome do canal |
| `Display::SEVERITY` | o rótulo do nível (`ERROR`, `INFO`, …) |
| `Display::CONTEXT` | o array `context`, codificado inline |

`CHANNEL` e `SEVERITY` são independentes — juntos viram `canal.NÍVEL`, qualquer um aparece
sozinho. `Display::show()` sem argumentos (ou `Display::NONE`) silencia a saída local de stdout por
completo. As flags são um bitmask, então `Display::MESSAGE | Display::TIMESTAMP` também funciona. O
padrão é só `Display::MESSAGE` — uma linha inline compacta, sem quebra final.

## Referência

- **Logger** — `Bootgly\ACI\Logs\Logger(string $channel = '', bool $global = false)`:
  `log(string|array ...$args): bool` (variádico de nível nomeado, multi-nível). Tem `Handlers` e
  `Processors` públicos. `$global` (padrão `false`) opta o logger no estático `$Sinks` — um fan-out
  `Handlers` global para persistência em todo o framework (adicione um sink `File` uma vez; só
  loggers que optaram chegam nele; os canais de servidor do framework nascem `global: true`). O
  estático `$Tap` (um único `Handler`) é o tap ao vivo — alimentado por todo record independente
  de opt-in; armado pelo viewer do Monitor e, em qualquer modo, enquanto uma sessão de
  `bootgly logs -f` estiver anexada.
- **Display** — `Logs\Data\Display`: `show(int ...$segments): void` define o mask ativo, guardado no
  estático `$segments`. Flags `Display::NONE` / `MESSAGE` / `TIMESTAMP` / `CHANNEL` / `SEVERITY` /
  `CONTEXT` — os segmentos da saída padrão `Line` (um bitmask; combine à vontade).
- **Levels** — enum com backing `Logs\Data\Levels` (`Emergency` = 1 … `Debug` = 8; menor = mais severo):
  `Levels::fetch(string $name): null|self`, `render(): string`.
- **Record** — `Logs\Data\Record(Levels $Level, string $channel, string $message, array $context = [])`:
  públicos `$Level`, `$channel`, `$message`, `$project`, `$instance`, `$context`, `$extra`,
  `$timestamp`; estático `$provenance` (a procedência do processo, estampada em `$project` na
  construção — `'framework'` até o `Project::mount()` definir o id de pasta do projeto bootado);
  estático `$qualifier` (o qualificador de instância do processo, estampado em `$instance` na
  construção — `''` até o dono reivindicar uma instância: a porta para servidores, o PID do master
  para Console/TUI); estático `import(array $data): self` reconstrói um record de uma linha JSON
  decodificada (linha sem a chave `project` importa como `framework`; sem a chave `instance`, como `''`).
- **Handler** — abstrato `Logs\Handler`: `handle(Record): bool`; públicos `$Level` (severidade
  mínima), `$Formatter`, `$Filters`. Concretos: `Handlers\Stream($stream = STDOUT, …)`,
  `Handlers\File($path, …, Rotation)` — o caminho resolve `{channel}` e `{project}` por record,
  sanitizados —, `Handlers\Syslog($ident, $facility, …)`, `Handlers\Pipe(IPC\Pipe, …)`.
- **Handlers** — `Logs\Handlers`: `push(Handler $Handler, null|Levels $Level = null): self`.
- **Formatter** — interface `Logs\Formatter`: `format(Record): string`. Concretos: `Formatters\Line`
  (ANSI + tokens de template), `Formatters\JSON` (um objeto por linha).
- **Processor** — abstrato `Logs\Processor`: `process(Record): Record`. Concretos:
  `Processors\PID`, `Processors\Memory`, `Processors\RequestID` (estático `$id`). Coleção
  `Logs\Processors`: `push()`, `process()`.
- **Filter** — abstrato `Logs\Filter`: `check(Record): bool`. Concretos: `Filters\Level(Min, Max)`,
  `Filters\Channel(allowed, denied)`, `Filters\Callback(Closure)`, `Filters\Tags(tags, all)`,
  `Filters\Search(term)`. Coleção `Logs\Filters`: `push()`, `check()`.
- **Rotation** — `Handlers\File\Rotation(int $size = 10_485_760, bool $daily = true, int $keep = 7)`:
  `rotate(string $path): void`.
- **Viewer ao vivo** — `Bootgly\CLI\UI\Components\Logs(Input, Output, int $max = 5000)`:
  `feed(string)`, `control(string $key): bool`, `render(): void`. Dirigido por
  `TCP_Server_CLI::monitoring()`.
- **Camadas** — `ACI\Logs` depende só do ABI (helpers de template/ANSI, `IO/IPC/Pipe`); o viewer
  CLI e os servidores WPI o consomem — sem back-dependency `ACI → CLI/WPI`.

## Próximas referências

- **[CLI de Logs](/guide/logs/overview/)** — `bootgly logs` / `bootgly project <Nome> logs`: leia o
  backlog e siga qualquer instância ao vivo, de qualquer terminal.
- **[Eventos](/guide/events/overview/)** — o barramento de eventos do ABI usado no resto da stack.
- **[Docker](/guide/docker/overview/)** — rode o servidor (e seus logs) em container com `-f`.
- **[Performance](/guide/performance/overview/)** — os padrões de zero-alocação que o logger segue.
