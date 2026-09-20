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

> [!IMPORTANT]
> **Um lançamento como root nunca escreve um sink de log como root.** Quando o servidor sobe
> como root com um `user` de runtime, os sinks globais — o fallback acima, ou os que o seu
> projeto registrou — ficam retidos a partir do momento em que o servidor é configurado — antes
> do primeiro record que ele escreve: o root só prepara `storage/logs` (um diretório comum, entregue à identidade de runtime por inode) e
> guarda os próprios records em memória. Logo depois de largar os privilégios, o master e cada
> worker instalam os sinks e reproduzem o que guardaram — o master escreve o aviso primeiro; um
> worker pode persistir os próprios records antes dele — então o arquivo nasce da identidade
> que continua escrevendo nele e o root nunca nomeia um arquivo dentro desse diretório. Se
> `storage/logs` for um link simbólico, o root o deixa exatamente como encontrou e não entrega
> nada: torne o alvo gravável pela identidade de runtime você mesmo. Se o daemon sair antes de
> conseguir largar os privilégios (usuário desconhecido, porta já ocupada), os records
> guardados vão para o logger do sistema. O próprio sink de arquivo recusa qualquer coisa que
> não seja um arquivo comum no destino — link simbólico, hard link, link pendurado — precisa de
> leitura e escrita nele, e reporta cada recusa uma vez ao logger do sistema (ident `bootgly`,
> silenciado com `BOOTGLY_ENVIRONMENT=test`) onde houver um, então um sink recusado nunca é um
> sink mudo (o runner de testes o silencia). A fronteira: num lançamento como root, nunca logue
> por um logger global *antes* de configurar o servidor — um record escrito ali é escrito pelo
> root, e também um que chega a um sink empurrado em `Logger::$Sinks` *depois* de o servidor ser
> configurado: registre todo sink antes do `configure()`. O root entrega `storage/logs` só quando
> este lançamento o criou e ele ainda é o diretório vazio que criou — como o inode que ele
> decidiu, nunca como um nome — e não toca em nada dentro: um `storage/logs` que já existia e não
> é da identidade de runtime (do root de um lançamento anterior, ou de qualquer outra pessoa)
> fica como está, o sink demotado o recusa e o aviso diz isso — torne-o da identidade de runtime
> você mesmo. Um sink que roda como root (lançamento sem
> `user`) só escreve sob um caminho que ninguém mais consiga desviar: todo diretório no caminho
> precisa pertencer ao root e ser gravável por mais ninguém (um diretório sticky vale, a menos
> que pertença à identidade de runtime, que poderia esvaziá-lo — e sem `user` nenhum, ou com
> `user: root`, todo diretório sticky que não seja do root é recusado), e um link no caminho precisa
> pertencer ao root; um volume de outra identidade é recusado, com o motivo no logger do
> sistema. Dentro de um user namespace (um container rootless), um dono que o namespace não
> mapeia aparece como a identidade de overflow (`nobody`, 65534) e conta como do root — foi o
> host que montou aquele volume; quando o namespace mapeia essa identidade, ela é alguém, e
> estranha. O sink anexa sob um lock consultivo (`flock`), não com o `O_APPEND` do kernel:
> escritores que ignoram o lock — um `>>` do shell, `logrotate copytruncate` — podem se intercalar.
> A retenção em si é um `Handlers\Memory` — um handler que guarda records em memória (limitado)
> para reproduzir depois; é diferente do processador `Processors\Memory` acima, e um projeto pode
> usar um seu em `Logger::$Sinks` sem confundir a retenção — só a retenção passa para o master
> destacado; um `Handlers\Memory` seu começa vazio lá, como em qualquer outro fork. Só
> `Logger::$Sinks` é retido: handlers
> empurrados nos `Handlers` do próprio logger (o padrão por logger) são escritos por quem loga,
> root inclusive. E só o `Handlers\File` reabre o arquivo a cada escrita, como quem escreve: um
> handler que capturou um descritor enquanto o root rodava (um `Stream` aberto no `boot()`) é
> retido e instalado como qualquer outro, mas continua escrevendo pelo descritor do root.

## Segure records até um sink poder ser escrito

Às vezes o destino ainda **não** é escrevível — o caso acima é o clássico: um launch como root que
não pode criar o arquivo de log como root. O `Handlers\Memory` é o handler dessa janela. Ele não
escreve em lugar nenhum; guarda todo record que recebe em memória — no máximo `Memory::LIMIT`
(10000), com o mais antigo dando lugar a partir daí — até que algo os reproduza pelos sinks reais.

O servidor faz isso por você. Você recorre a ele diretamente quando o seu próprio processo tem o
mesmo formato: muda de identidade, abre o destino tarde ou só decide depois para onde os records
vão.

```php
use const BOOTGLY_STORAGE_DIR;

use Bootgly\ACI\Logs\Handlers;
use Bootgly\ACI\Logs\Handlers\File;
use Bootgly\ACI\Logs\Handlers\Memory;
use Bootgly\ACI\Logs\Logger;

// ! Fica no lugar dos sinks reais — nada chega a um destino ainda
$Sinks = Logger::$Sinks ?? new Handlers;
$Hold = new Memory;
Memory::hold($Hold, $Sinks->Handlers);
Logger::$Sinks = new Handlers;
Logger::$Sinks->push($Hold);

// ... todo record logado daqui em diante fica retido em memória ...

// @ O destino está seguro agora: instale os sinks reais e reproduza o que foi retido
Logger::$Sinks = new Handlers;
Logger::$Sinks->push(new File(BOOTGLY_STORAGE_DIR . 'logs/{channel}.log'));

$Hold->replay(...Logger::$Sinks->Handlers);
Memory::release();
```

O `Memory::hold()` é um registro, por processo, de **uma** retenção: é assim que uma fase
posterior do mesmo processo — ou um código que não sabe nada do seu launch — encontra a retenção
em vigor e os handlers pelos quais ela está no lugar (`$Hold->Withheld`), sem passar nada adiante.
O `replay()` entrega cada record retido aos handlers que você nomear, na ordem de chegada, e os
esquece, de modo que chamá-lo de novo não reproduz nada; o `release()` então esquece o registro.

A retenção é **por processo**. Um `fork()` herda o array, não a posse: no filho, o próximo record
retido — ou o próximo `replay()` — limpa o que foi herdado, então um worker nunca reproduz o que
o pai reteve. O único processo que precisa ficar com a herança — um master daemon destacado,
forkado do launcher que iniciou a retenção — a reivindica com `adopt()` logo depois do detach.

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
  sanitizados —, `Handlers\Syslog($ident, $facility, …)`, `Handlers\Pipe(IPC\Pipe, …)`,
  `Handlers\Memory` (a retenção — detalhada abaixo).
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

### Handlers\Memory

```php
public static function hold (null|self $Hold = null, array $Withheld = []): null|self
```

Registra — ou lê — a única retenção deste processo. Sem argumentos, apenas lê: o handler em vigor,
ou `null` quando nenhum está registrado. Recebendo um handler, registra **aquela instância** — uma
retenção é conhecida por identidade, nunca por classe, então um `Handlers\Memory` que um projeto
tenha empurrado no `Logger::$Sinks` por conta própria nunca vira a retenção — junto com
`$Withheld`, os handlers pelos quais ela fica no lugar, e a devolve. Re-registrar a retenção que
já está em vigor sem nomear handlers mantém aqueles pelos quais ela já está no lugar; nomear
handlers substitui essa lista, e registrar uma instância diferente sem nomear nenhum a deixa no
lugar de nada.

```php
public static function release (): void
```

Esquece a retenção registrada — o `hold()` volta a ler `null`. Chamado assim que os sinks reais
estão instalados e o que foi retido já foi reproduzido. A instância `Memory` em si não é tocada.

```php
public function replay (Handler ...$Handlers): int
```

Entrega cada record retido, na ordem de chegada, a cada handler informado —
`$Hold->replay(...Logger::$Sinks->Handlers)` é a chamada usual — então os esquece e devolve
quantos foram reproduzidos. Uma segunda chamada não reproduz nada (`0`). Num processo que herdou
os records de um `fork()` e não os adotou, eles são descartados em vez de reproduzidos.

```php
public function adopt (): void
```

Torna os records herdados os deste processo, de modo que um `replay()` posterior os persista. Só o
processo que sucede o que reteve o chama — o master daemon destacado, forkado do launcher que
iniciou a retenção, logo depois do detach. Sem ele, a herança de um fork é descartada no primeiro
record retido ou no primeiro replay, que é exatamente o que um worker quer.

```php
public private(set) array $Records
```

Data (somente leitura). Os objetos `Record` retidos, na ordem de chegada. Um record abaixo do
`$Level` do handler, ou descartado pelos filtros dele, nunca é retido.

```php
public private(set) array $Withheld
```

Data (somente leitura). Os handlers pelos quais esta retenção fica no lugar — o que foi dado ao
`hold()`, para que o processo que se estabelecer primeiro os instale.

```php
public const int LIMIT
```

`10000` — o máximo de records que uma retenção guarda. A partir daí o mais antigo dá lugar: a
janela que uma retenção cobre (a emissão do Auto-TLS roda dentro dela) não tem duração controlada.

## Próximas referências

- **[CLI de Logs](/guide/logs/overview/)** — `bootgly logs` / `bootgly project <Nome> logs`: leia o
  backlog e siga qualquer instância ao vivo, de qualquer terminal.
- **[Eventos](/guide/events/overview/)** — o barramento de eventos do ABI usado no resto da stack.
- **[Docker](/guide/docker/overview/)** — rode o servidor (e seus logs) em container com `-f`.
- **[Performance](/guide/performance/overview/)** — os padrões de zero-alocação que o logger segue.
