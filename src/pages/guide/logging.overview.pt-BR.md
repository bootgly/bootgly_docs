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
use Bootgly\ACI\Logs\Handlers\File;
use Bootgly\ACI\Logs\Handlers\File\Rotation;
use Bootgly\ACI\Logs\Data\Levels;
use Bootgly\ACI\Logs\Logger;

$Logger = new Logger(channel: 'App');

$Logger->Handlers->push(
   new File(
      BOOTGLY_WORKING_BASE . '/workdata/logs/app.log',
      Rotation: new Rotation(size: 10_485_760, daily: true, keep: 7),
   ),
   Levels::Warning,   // este handler só aceita Warning e mais severos
);
```

O segundo argumento de `push()` define a **severidade mínima** do handler (valor RFC 5424 menor =
mais severo). Os arquivos são numerados `app.log.1` … `app.log.7`; o mais antigo é descartado.

## Escolha um formato

Cada handler tem um formatter. `Line` (padrão) é o formato humano/terminal com cores ANSI; `JSON`
emite um objeto estruturado por linha para coletores de log:

```php
use Bootgly\ACI\Logs\Formatters\JSON;
use Bootgly\ACI\Logs\Handlers\Stream;

$Logger->Handlers->push(new Stream(STDERR, new JSON));
```

Uma linha JSON carrega `timestamp`, `level`, `channel`, `message`, `context` e `extra` (o ANSI é
removido da mensagem).

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

```bash
bootgly project Demo-HTTP_Server_CLI -m
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
| `Enter` | **expande** o record selecionado — visão de detalhe com todas as linhas, context e extra |
| `Home`/`End` | pula para o mais antigo / volta à cauda ao vivo |
| `q` / `Esc` | sai do viewer (cai no prompt interativo) |

Mensagens multilinha — exceptions, stack traces — são **colapsadas em uma linha** com um marcador
`⏎N` para nunca inundar o painel. Selecione o record e tecle `Enter` para ler tudo (mensagem,
`context` e `extra`) numa visão de detalhe rolável.

> [!NOTE]
> O viewer funciona porque **todo** `Logger` também despacha para um sink global
> (`Logger::$Sink`) no modo Monitor, enquanto `Display::$mode` fica em `Display::NONE` para nada
> rabiscar a TUI diretamente. Sob enxurrada de logs, a escrita não-bloqueante do pipe de um worker
> é descartada em vez de travar o caminho da requisição.

## Verbosidade da saída padrão no terminal

O estático `Display::$mode` controla como a saída padrão `Line` é decorada (não afeta os
handlers de arquivo/JSON):

| Modo | Mostra |
|---|---|
| `Display::NONE` | nada (silencia o handler local de stdout) |
| `Display::MESSAGE` | só a mensagem (padrão) |
| `Display::MESSAGE_WHEN` | mensagem + timestamp ISO-8601 |
| `Display::MESSAGE_WHEN_ID` | mensagem + timestamp + canal e severidade |

## Referência

- **Logger** — `Bootgly\ACI\Logs\Logger(string $channel = '')`: `log(string|array ...$args): bool`
  (variádico de nível nomeado, multi-nível). Tem `Handlers` e `Processors` públicos; estático `$Sink`
  (um `Handler` global aplicado a toda instância, ex.: o pipe do Monitor).
- **Display** — `Logs\Data\Display`: estático `$mode` + as constantes `Display::NONE` / `MESSAGE` /
  `MESSAGE_WHEN` / `MESSAGE_WHEN_ID` — a verbosidade da saída padrão `Line`.
- **Levels** — enum com backing `Logs\Data\Levels` (`Emergency` = 1 … `Debug` = 8; menor = mais severo):
  `Levels::fetch(string $name): null|self`, `render(): string`.
- **Record** — `Logs\Data\Record(Levels $Level, string $channel, string $message, array $context = [])`:
  públicos `$Level`, `$channel`, `$message`, `$context`, `$extra`, `$timestamp`; estático
  `import(array $data): self` reconstrói um record de uma linha JSON decodificada.
- **Handler** — abstrato `Logs\Handler`: `handle(Record): bool`; públicos `$Level` (severidade
  mínima), `$Formatter`, `$Filters`. Concretos: `Handlers\Stream($stream = STDOUT, …)`,
  `Handlers\File($path, …, Rotation)`, `Handlers\Syslog($ident, $facility, …)`,
  `Handlers\Pipe(IPC\Pipe, …)`.
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

- **[Eventos](/guide/events/overview/)** — o barramento de eventos do ABI usado no resto da stack.
- **[Docker](/guide/docker/overview/)** — rode o servidor (e seus logs) em container com `-f`.
- **[Performance](/guide/performance/overview/)** — os padrões de zero-alocação que o logger segue.
