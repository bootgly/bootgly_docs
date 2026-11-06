# HTTP Server CLI

O HTTP Server CLI é o servidor HTTP nativo do Bootgly PHP Framework. Ele é um servidor event-driven, multi-worker, construído sobre uma infraestrutura TCP non-blocking com suporte a PHP Fibers para respostas assíncronas — tudo em PHP 100% puro, sem pacotes de terceiros.

## Recursos

| Recurso | Descrição |
|---|---|
| **Modos de Operação** | Daemon (background), Foreground, Interactive (REPL), Monitor (visualizador de logs ao vivo) e Test (automatizado) |
| **Multi-Worker** | Workers via fork com `SO_REUSEPORT`; master reinicia workers automaticamente em caso de falha (um slot cujos boots continuam falhando espera até 5 s) |
| **Reciclagem de Workers** | Um worker é substituído após `maxRequests` requisições (cada worker dentro de ±`jitter`) ou acima de `maxMemory` bytes — o substituto serve na hora enquanto ele drena, registrado como reciclagem, nunca como crash |
| **PHP Fibers** | Respostas assíncronas adiadas via `$Response->defer()`, integradas ao event loop `stream_select` |
| **Event-Driven** | Event loop baseado em `stream_select`; I/O non-blocking, zero CPU em idle |
| **Roteamento** | Rotas estáticas e dinâmicas com restrições de parâmetros tipadas; cache de warmup único |
| **Middleware** | Pipeline por grupo via `intercept()`; execução em modelo onion |
| **SSL/TLS** | HTTPS completo via stream context do PHP; certificados autoassinados incluídos para desenvolvimento local |
| **HTTP/2** | h2 nativo (TLS-ALPN) e prior knowledge em texto claro — HPACK, multiplexação, controle de fluxo, proteção rapid-reset |
| **Compressão de Resposta** | gzip, deflate e compress via `$Response->compress()` |
| **Respostas Chunked** | `Transfer-Encoding: chunked` para respostas em streaming |
| **Autenticação** | Desafio HTTP Basic auth via `$Response->authenticate()` |
| **Keep-Alive** | Reutilização automática de conexões HTTP/1.1 |
| **Limites de Corpo** | Limites configuráveis para campos multipart, partes de arquivo e corpo não-multipart |
| **Rebaixamento de Privilégio** | Demoção POSIX de usuário/grupo após bind do socket para operação segura em portas privilegiadas |
| **Bootstrap por Projeto** | Ciclo de vida do servidor gerenciado por arquivos de Projeto Bootgly, não por comandos do framework |

## Bootstrapping com Projects

No Bootgly, servidores são iniciados por Projetos — não por comandos do framework. Cada projeto define sua própria lógica de boot, incluindo instanciação do servidor, configuração e registro do handler.

Um arquivo de projeto (ex: `HTTP_Server_CLI.Project.php`) retorna uma instância de `Project`:

```php
// A simplified shape of projects/Demo/HTTP_Server_CLI/HTTP_Server_CLI.Project.php
use Bootgly\API\Endpoints\Server\Modes;
use Bootgly\API\Projects\Project;
use Bootgly\WPI\Nodes\HTTP_Server_CLI;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Configs as ServerConfigs;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Events;


return new Project(
   name: 'HTTP Server CLI',
   description: 'HTTP server demo with routing and catch-all 404',
   version: '0.1.0',
   author: 'Your Name',
   exportable: true,

   boot: function (array $arguments = [], array $options = []): void
   {
      $Server = new HTTP_Server_CLI(Mode: match (true) {
         isSet($options['i']) => Modes::Interactive,
         isSet($options['m']) => Modes::Monitor,
         default              => Modes::Daemon
      });
      $Server->configure(
         new ServerConfigs(
            host: '0.0.0.0',
            port: 8082,
            workers: 4
         )
      );
      $Server->on(Events::RequestReceived, HTTP_Server_CLI::$Router->load(__DIR__ . '/router'));
      $Server->start();
   }
);
```

Para iniciar o servidor, execute:

```bash :toolbar="true";
bootgly project Demo/HTTP_Server_CLI start
```

Modo interativo:

```bash :toolbar="true";
bootgly project Demo/HTTP_Server_CLI start -i
```

Modo monitor:

```bash :toolbar="true";
bootgly project Demo/HTTP_Server_CLI start -m
```

## Modos de Operação

O servidor suporta múltiplos modos de operação, selecionados ao construir a instância de `HTTP_Server_CLI`:

| Modo | Descrição |
|---|---|
| `Modes::Daemon` | Faz fork para segundo plano. O processo master se torna líder de sessão, despacha sinais e gerencia workers. Modo padrão. |
| `Modes::Foreground` | Fica preso ao terminal, com os logs do servidor (e tudo o que um handler escreve com `echo`) impressos na sua frente. |
| `Modes::Interactive` | Loop REPL aceitando comandos CLI (`stop`, `help`, `monitor`). O prompt não bloqueia a supervisão: workers são recriados e sinais são tratados enquanto você digita (no libedit, um ESC, ^V ou ^R inacabado segura as recriações agendadas até a próxima tecla). Ctrl-D numa linha vazia para o servidor; uma entrada que não é um terminal (um pipe, `/dev/null`) é lida linha a linha e, quando termina, o master segue supervisionando até ser parado. |
| `Modes::Monitor` | Visualizador de logs em tela cheia: os registros do master e dos workers chegam em uma visão filtrável. Ele **não** observa arquivos — publique mudanças de código com `project reload` (veja [Reload](/guide/reload/overview/)). |
| `Modes::Test` | Cria um cliente TCP, carrega a suíte de testes, envia requisições HTTP e valida as respostas. Usado internamente para testes automatizados. Como todo modo, salva o estado de PID qualificado pela porta (ex.: `HTTP_Server_CLI.8080.json`), então só roda ao lado de um servidor ativo em outra porta. |

## Configuração

`configure()` recebe **Configs** — um objeto de configuração tipado por preocupação, em qualquer
ordem:

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Configs as ServerConfigs;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request\Configs as RequestConfigs;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response\Configs as ResponseConfigs;

$Server->configure(
   new ServerConfigs(
      host: '0.0.0.0',
      port: 8082,
      workers: 4,
      maxWorkerPendingBytes: 160 * 1024 * 1024 // 160 MiB — room for two 32 MB bodies at once (memory_limit ≥ 320M)
   ),
   new RequestConfigs(
      maxBodySize: 32 * 1024 * 1024  // 32 MB — accept larger non-multipart bodies
   ),
   new ResponseConfigs(
      deferredTimeout: 2.5           // seconds — bound every parked defer()
   )
);
```

Três preocupações, três classes:

| Configs | Cuida de |
|---|---|
| `HTTP_Server_CLI\Configs` | O servidor em si: endereço de bind, workers, TLS (manual ou Auto-TLS), rebaixamento de privilégios, HTTP/2, endpoint de health, tetos de conexão, orçamento de memória do worker. |
| `Request\Configs` | Limites de entrada: corpo, multipart e tetos de upload. |
| `Response\Configs` | Saída: response resources nomeados e o orçamento do deferred. |

Só `host`, `port` e `workers` são obrigatórios — todos os outros campos de todos os Configs são
opcionais e mantêm o padrão do framework quando omitidos. A lista completa de campos de cada classe
está na [Referência](#referência) ao final desta página.

A própria chamada garante cinco regras:

- **A ordem é irrelevante.** `configure(new ResponseConfigs(...), new ServerConfigs(...))` é a mesma chamada que a inversa — cada Configs é reconhecido pelo tipo, nunca pela posição.
- **Uma instância por classe, por chamada.** Passar dois `Request\Configs` no mesmo `configure()` lança `InvalidArgumentException` (`... received two ... instances.`) em vez de deixar o segundo vencer silenciosamente.
- **O primeiro `configure()` precisa carregar o Configs do servidor.** `host`, `port` e `workers` não têm padrão, então uma primeira chamada que nunca os define lança `ArgumentCountError`. Uma vez definidos, uma chamada posterior (ainda antes do start) pode refinar uma preocupação sozinha — `configure(new ResponseConfigs(deferredTimeout: 5))` é um complemento válido. Uma `configure()` vazia também é recusada.
- **Cada node recebe o Configs dele, por classe exata.** Um `HTTP_Server_CLI` aceita `HTTP_Server_CLI\Configs`, `Request\Configs` e `Response\Configs` — nada mais, nem o `TCP_Server_CLI\Configs` do pai (que carrega o socket mas nenhuma política HTTP: esquema, ALPN, defaults seguros de TLS), nem uma subclasse de um Configs aceito (cujos campos extras o servidor não saberia ler). Qualquer outra coisa lança `InvalidArgumentException` em vez de ser aplicada pela metade.
- **O conjunto é conferido antes de qualquer aplicação.** As regras de conjunto acima são decididas sobre a lista inteira primeiro, então uma chamada recusada por qualquer uma delas deixa todo limite, budget e cap global do processo exatamente como estava. O que um Configs *carrega* é validado pelo construtor dele sempre que dá — um factory de resource inválido, ou um `secure` junto com `AutoTLS`, lança no `new`. Algumas verificações só podem rodar contra estado vivo durante a aplicação (as precondições de runtime do Auto-TLS; um nome de resource que uma propriedade da response já ocupa): essas lançam com os Configs anteriores já aplicados.

`configure()` é um contrato **pré-start**: depois que o servidor cruza a fronteira de início, a
chamada é recusada com um erro logado, e a reconfiguração passa por um [reload](/guide/reload)
(`bootgly project <nome> reload`), que reexecuta o projeto e o seu `configure()`.

### Somente argumentos nomeados

Todo construtor de Configs começa com um slot de guarda — `Bootgly\ABI\Argument $Named` — que uma
chamada nomeada nunca preenche:

```php
new ServerConfigs(host: '0.0.0.0', port: 8080, workers: 4); // ✅
new ServerConfigs('0.0.0.0', 8080, 4);                      // ❌ TypeError
```

Uma chamada posicional liga `'0.0.0.0'` a `$Named`, que é tipado como o enum `Argument`, então o PHP
lança um `TypeError` antes de o objeto existir — e a análise estática aponta isso no seu editor. Essa
guarda é o motivo de a API ser assim: campos podem ser adicionados, reordenados ou aposentados sem que
nenhuma chamada existente religue silenciosamente um valor passado por posição.

### Padrões

Nada precisa ser passado para obter os padrões do framework; estes são eles, escritos por extenso:

```php
$Server->configure(
   new ServerConfigs(
      host: '0.0.0.0',
      port: 8082,
      workers: 4,
      secure: null,                    // null — plain HTTP; an array (or AutoTLS:) switches to https://
      user: null,                      // null — no privilege dropping
      group: null,
      enableHTTP2: true,               // true (default) — h2 over ALPN and h2c prior knowledge
      health: null,                    // null — the built-in health endpoint is opt-in
      maxConnections: 10000,           // 10000 (default) — concurrent-connection ceiling per worker (0 = unlimited)
      maxConnectionsPerIP: 0,          // 0 (default, opt-in) — per-IP concurrent-connection ceiling
      headroom: 32,                    // 32 (default) — selector entries kept for the worker's own dependency I/O (0 = disabled)
      connectionIdleTimeout: 15,       // 15 (default) — idle reaper in seconds; a parked defer() counts as activity (0 = disabled)
      maxWorkerPendingBytes: 64 * 1024 * 1024, // 64 MiB (default) — worker memory budget: bodies, route cache, pending output
      maxRequests: 0,                  // 0 (default, off) — requests after which a worker is recycled
      jitter: 0.1,                     // 0.1 (default) — each worker's own limit lies within ±10% of maxRequests
      maxMemory: 0                     // 0 (default, off) — real memory (bytes, or a size like '512M') past which a worker is recycled
   ),
   new RequestConfigs(
      maxFileSize: 500 * 1024 * 1024,         // 500 MB (default) — max size per uploaded file part
      maxBodySize: 10 * 1024 * 1024,          // 10 MB (default) — max total non-multipart body
      maxHeaderFields: 100,                   // 100 (default) — max header field lines of an HTTP/1.x request (more → 431)
      maxMultipartFieldSize: 1 * 1024 * 1024, // 1 MB (default) — max size per text field value
      maxMultipartHeaderSize: 8 * 1024,       // 8 KB (default) — max size of a single part's headers
      maxMultipartFields: 1024,               // 1024 (default) — max number of text fields
      maxMultipartFiles: 1024,                // 1024 (default) — max number of file parts
      downloadsMaxBytesOnDisk: 8 * 1024 * 1024 * 1024 // 8 GB (default) — aggregate spooled-upload ceiling
   ),
   new ResponseConfigs(
      Resources: null,                 // null (default) — no project response resources registered
      deferredTimeout: 0               // 0 (default, unbounded) — budget in seconds for a parked defer(); the per-call timeout wins
   )
);
```

### Limites de conexão

`maxConnections` e `maxConnectionsPerIP` protegem cada worker contra um DoS de exaustão de
conexões: um cliente que abre conexões até o limite de file descriptors do sistema operacional
pode, de outra forma, esgotar os FDs e a memória por conexão de um worker de event loop de
thread única.

O teto é verificado uma vez por conexão aceita (não no hot path por requisição), então não tem
efeito sobre a vazão das conexões keep-alive já estabelecidas. Quando um worker já está em
`maxConnections`, a próxima conexão é aceita e imediatamente fechada.

Deixe `maxConnectionsPerIP` em `0` quando o servidor estiver atrás de um proxy reverso ou
balanceador de carga — toda requisição chega do IP do proxy, e um limite por IP estrangularia
todo o tráfego legítimo. Habilite-o (com um valor confortavelmente acima da concorrência real
por cliente) apenas quando os clientes se conectam diretamente ao servidor.

`headroom` (padrão `32`) mantém parte do selector de cada worker livre para o I/O de
dependências do próprio worker — respostas deferred aguardando seus pools de banco ou KV, o
cliente HTTP embarcado — descartando clientes mais cedo. O selector admite `1000` entradas por
tabela e os sockets de clientes as compartilham, então um worker para de admitir clientes em
`1000 − headroom` (968 por padrão); o teto efetivo por worker é o menor entre esse valor e
`maxConnections`. Sem essa reserva, uma inundação de conexões ociosas deixa toda espera de
dependência recusada. O próprio socket de escuta do worker ocupa uma das entradas reservadas,
então o padrão deixa 31 para as esperas de dependências: dimensione-o para pelo menos a soma dos
`pool.max` dos resources do worker mais uma para o socket de escuta; `0` o desativa, e ele é
limitado para que um worker sempre admita clientes.

```php
// Direct-to-internet worker: cap total and per-client concurrency.
$Server->configure(
   new ServerConfigs(
      host: '0.0.0.0',
      port: 8080,
      workers: 8,
      maxConnections: 900,      // per worker (the selector already stops clients at 1000 − headroom)
      maxConnectionsPerIP: 200, // per source IP (only safe without a fronting proxy)
      headroom: 64              // per worker: the listener + up to 63 pooled DB/KV/HTTP-client connections
   )
);
```

#### Rejeições de protocolo

Uma requisição que o decoder não pode aceitar (head malformado, headers grandes
demais, mais linhas de header que `maxHeaderFields`, um corpo JSON que não poderia ser
decodificado dentro do orçamento de memória do worker, versão não suportada, `Host`
negado, violações de framing chunked, …) é respondida com uma status line pura — `400`, `408`, `413`, `414`, `417`, `431`,
`501`, `503` ou `505` — e a conexão é fechada. Os bytes do erro viajam pelo mesmo
writer ordenado de qualquer outra resposta: se um corpo de resposta ainda está sendo
descarregado para um cliente lento, o erro drena **atrás** dos bytes devidos em vez
de se intercalar neles, a conexão para de ler input adicional, e o fechamento só
acontece depois da drenagem — limitado pelo orçamento de saída pendente do worker e
pelo deadline de stall de escrita. No HTTP/2 a mesma ordenação vale para o frame
`GOAWAY` de encerramento, que sempre chega em uma fronteira limpa de frame.

### Orçamento de memória

Um worker mantém alguns bytes em memória entre eventos: os corpos de requisição que ainda está
recebendo, as respostas que o [cache de rotas](/manual/WPI/HTTP/HTTP_Server_CLI/Router/) guarda para
repetir e a saída que um cliente lento ainda não leu. Todos eles usam um único orçamento por worker,
`maxWorkerPendingBytes` (64 MiB por padrão), dividido em cotas:

| Cota | Guarda | No máximo |
|---|---|---|
| Corpos | corpos de requisição inacabados (HTTP/1.1 e HTTP/2), os cabeçalhos HTTP/1.1 parseados que eles guardam, campos de texto multipart, e a requisição que cada `defer()` estacionado guarda — cerca de 36 KiB pela geração estacionada em volta dela, o corpo, o cabeçalho (HTTP/1.x; o cabeçalho de um stream HTTP/2 fica com o stream) e o que é extraído dele (campos de formulário, cookies, variáveis de query, idiomas e credenciais — o que o trabalho deferred extrai é cobrado quando ele extrai) | metade do orçamento |
| Cache | entradas do cache de rotas (`cache: ['TTL' => ...]`) | um quarto do orçamento |
| Saída | saída pendente, cabeçalhos de requisição parciais, as requisições que um cliente HTTP/1.1 envia em pipeline atrás de um `defer()` estacionado (até uma leitura de 64 KiB por conexão, cobrada como a leitura inteira), estado de conexão HTTP/2 e cabeçalhos decodificados | o resto — nunca menos de um quarto |

Os bytes são cobrados pelo que o alocador do PHP gasta para mantê-los, não pelo seu tamanho: uma
string acima de cerca de 680 KiB é cobrada como um chunk inteiro de 2 MiB (strings desse tamanho se
acomodam mal quando crescem), e um corpo de 10 MB custa 10 MB mais uma página. É isso que o `memory_limit` conta, então o orçamento segura o que o worker gasta de fato.

Quando uma cota está cheia, o servidor recusa em vez de crescer:

- um corpo de requisição que não cabe recebe `503 Service Unavailable` e a conexão é fechada
  (HTTP/1.1); no HTTP/2 só aquele stream é recusado, com `413`;
- um `defer()` cuja requisição não cabe lança `Decoders\Bodies\Refusal` antes de o trabalho
  começar, assim como uma leitura de campos de formulário, cookies, variáveis de query, idiomas ou
  credenciais dentro do trabalho deferred que não cabe; sem tratamento, a requisição recebe
  `503 Service Unavailable` e nada é reportado como erro;
- um corpo JSON cuja estrutura decodificada não caberia na cota de corpos — arrays do PHP podem
  gastar cinquenta vezes os bytes que decodificam — recebe `413 Request Entity Too Large` e a
  conexão é fechada, antes de qualquer handler rodar (HTTP/2: só aquele stream). O limite é
  calculado a partir do corpo sem decodificá-lo: o que está dentro de uma string não conta, um corpo
  acima de uma estimativa rápida é precificado array a array, e um objeto com chaves numéricas é
  precificado como o PHP cresce a sua tabela. Um corpo que não é um único documento JSON — NDJSON,
  JSON concatenado ou comprimido — não é recusado: `$Request->fields` não decodifica nada dele, e a
  rota o lê raw em `$Request->input`. Payloads JSON típicos de cerca de 1 MB — registros em lote,
  linhas tabulares, objetos de API aninhados — cabem nos padrões; aumente `maxWorkerPendingBytes` e
  `memory_limit` juntos para payloads maiores;
- o cache de rotas despeja primeiro as entradas mais antigas; uma resposta que ainda assim não cabe
  é servida sem ir para o cache;
- requisições em pipeline atrás de um `defer()` estacionado que não cabem — ou que passam de uma
  leitura de 64 KiB — fecham a conexão, o que cancela o trabalho estacionado;
- uma saída que não cabe — ou que passa dos 12 MiB que uma única conexão pode segurar
  (`TCP_Server_CLI::$maxPendingBytes`, pelo mesmo footprint) — derruba aquela conexão; no HTTP/2 só
  aquele stream é resetado.

Na partida, o servidor confere o orçamento contra o `memory_limit`. Um worker reserva pelo menos
metade do `memory_limit` para a memória que nenhum orçamento vê — montagem de respostas, cópias de
strings, os objetos da sua própria aplicação —, então um orçamento acima dessa metade é reduzido,
com um aviso:

```
Worker memory budget (maxWorkerPendingBytes) lowered from 67108864 to 33554432 bytes to fit memory_limit 64M: ...
```

`memory_limit = -1` (sem limite) mantém o orçamento como configurado. A conferência roda uma vez, no
master, antes do fork dos workers: um `ini_set('memory_limit', ...)` feito depois, dentro de um
worker, não o altera.

O que os padrões seguram ao mesmo tempo, com `memory_limit` em 128M ou mais:

- 3 corpos de requisição inacabados de 10 MB (o `maxBodySize` padrão; partes de arquivo multipart vão
  para o disco e não contam);
- 8 respostas em cache de cerca de 1 MB — ou muitas mais, se pequenas;
- cerca de 850 requisições `defer()` estacionadas com cabeçalhos pequenos — menos quando o trabalho
  deferred extrai mais;
- 32 clientes lentos segurando cada um 1–2 MB de saída não lida, quando nada mais está retido.

Para aceitar corpos maiores, aumente o orçamento e o `memory_limit` juntos — o `memory_limit` em pelo
menos o dobro do orçamento. Dois tetos brutos continuam valendo por cima: os corpos inacabados de um
worker seguram no máximo 64 MiB de bytes raw (`Decoders\Bodies::$maxWorkerBodySize`) e, no HTTP/2,
os corpos de uma conexão no máximo 10 MiB (`Decoder_HTTP2::$maxConnectionBodySize`); o aviso da
partida nomeia aquele em que um `maxBodySize` não cabe. Defina o `memory_limit` no `php.ini`: um reload a quente re-executa o PHP
sem as opções `-d` da linha de comando.

```php
// php.ini: memory_limit = 320M
$Server->configure(
   new ServerConfigs(
      host: '0.0.0.0',
      port: 8080,
      workers: 4,
      maxWorkerPendingBytes: 160 * 1024 * 1024 // bodies may hold 80 MiB: two 32 MB bodies at once
   ),
   new RequestConfigs(
      maxBodySize: 32 * 1024 * 1024
   )
);
```

Um corpo de `maxBodySize` que nunca caberia na cota de corpos seria recusado sempre: o servidor
registra um aviso na partida quando é esse o caso.

### Conexões ociosas

Toda conexão estabelecida é supervisionada pelo reaper de ociosidade do transporte. Uma vez a cada
`connectionIdleTimeout` segundos ele faz duas perguntas: o *servidor* concluiu alguma escrita desde o
tick anterior, e a conexão ainda carrega trabalho pendente? Qualquer resposta positiva renova o lease
por mais `connectionIdleTimeout`; o primeiro tick silencioso depois do último tick com atividade — ou
depois do estabelecimento, para uma conexão que nunca escreveu — fecha a conexão.

Bytes de entrada nunca renovam o lease: só uma escrita concluída pelo servidor, trabalho pendente retido
ou um protocolo que o renove por conta própria (heartbeats do SSE, o supervisor do WebSocket). Um corpo de
requisição que demore mais que `connectionIdleTimeout` para chegar é, portanto, fechado no meio do upload
— aumente o knob (ou encerre uploads lentos num proxy) quando corpos grandes em links lentos forem
esperados.

**Trabalho pendente** é uma resposta deferred estacionada no reactor — um `defer()` esperando um banco,
uma chamada upstream ou qualquer `$Response->wait()`. Ela não escreve nada enquanto espera, mas sua
geração fica anexada à conexão (veja *Posse de teardown* abaixo), então o reaper a poupa enquanto
estiver estacionada. O lease não é permanente: assim que o deferral responde, a conexão volta à regra
comum de keep-alive e é ceifada depois da próxima janela de silêncio.

Duas consequências que valem saber:

- O reaper nunca limita uma resposta deferred. Use `Response\Configs(deferredTimeout:)` — ou o `defer($work, timeout:)`
  por chamada — para isso; veja *Deadlines* em *Ciclo de vida da resposta deferred*. Um deferral que
  estaciona sem deadline próprio (`Readiness::read($socket)` não tem nenhum por padrão) e sem orçamento
  segura a conexão e a Fiber até o cliente ir embora — limite-o, ou conte com `maxConnections`.
- A janela é grosseira por desenho: o supervisor roda no alarme de um segundo do worker, então o corte
  cai entre `N` e `N+1` segundos após o último tick com atividade (até `2N` a `2N+1` quando a escrita
  cai logo depois de um tick).

Protocolos de vida longa se comportam de outro jeito. Uma sessão WebSocket **substitui** o reaper pelo
seu supervisor de ping/pong logo depois do upgrade, então `connectionIdleTimeout` deixa de se aplicar a
ela. Um stream Server-Sent Events, em vez disso, **renova** o lease a partir do próprio supervisor, que
roda a cada `min(10, interval, heartbeat)` segundos e nunca mais devagar que a expiração da própria
conexão — então um `connectionIdleTimeout` curto só faz esse supervisor bater mais vezes.
`connectionIdleTimeout: 0` desativa o reaper por completo — só faça isso atrás de um proxy que imponha
o próprio timeout de ociosidade.

### Reciclagem de workers

Um worker vive enquanto o servidor viver, a menos que algo o substitua, e tudo o que ele acumula
fica com ele (veja [Modelo de Processos](#modelo-de-processos)). Para limitar o que um worker de
vida longa junta — um vazamento numa biblioteca, um cache sem descarte, um heap fragmentado —
deixe o servidor substituir workers por conta própria:

```php
new ServerConfigs(
   host: '0.0.0.0',
   port: 8082,
   workers: 4,
   maxRequests: 10_000, // recicla um worker após cerca de 10 000 requisições...
   jitter: 0.1,         // ...cada worker no seu próprio limite, dentro de ±10% (o padrão)
   maxMemory: '96M'     // ...ou assim que sua memória real passar de 96 MiB
)
```

O `maxMemory` precisa ficar abaixo do `memory_limit` do PHP (`128M` por padrão) — além dele um worker
morre com um erro fatal antes de conseguir reciclar: aumente o `memory_limit` no `php.ini` (ou com
`-d memory_limit=`) para usar um teto maior, como `'256M'` sob um `memory_limit` de `512M`.

- **O que conta.** Cada requisição que o worker despacha para a sua aplicação: cada requisição que
  uma conexão keep-alive carrega conta uma vez, e cada stream HTTP/2 também. Uma requisição
  recusada antes do despacho (um corpo JSON acima do seu limite de decodificação, respondido `413`)
  não conta.
- **`jitter`** impede que os workers reciclem juntos. Cada worker sorteia o seu próprio limite ao
  subir, dentro da sua própria faixa de `maxRequests ± jitter`: com 4 workers, `10_000` e `0.1`, o
  primeiro sorteia entre 9 000 e 9 500, o segundo entre 9 500 e 10 000, e assim por diante. Um
  substituto sorteia de novo dentro da sua faixa. É uma fração de `0` a `1`; `0` dá a todo worker
  exatamente `maxRequests`.
- **`maxMemory`** é comparado com `memory_get_usage(true)` — a memória que o worker tomou do
  sistema — a cada requisição que ele despacha: a requisição que encontra o teto ultrapassado ainda
  é respondida, e então o worker recicla. Um `int` de bytes, ou um tamanho em texto (`'512M'`,
  `'1.5 GB'`) lido por `Bytes::parse()`. Um worker pode ficar acima dele por até uma drenagem do
  worker anterior do seu slot (veja *Um worker drenando por slot* abaixo).
- **`0` desliga um gatilho** — os dois vêm desligados. Um valor negativo, um `jitter` fora de
  `0`–`1` ou um tamanho que não é interpretável lança `InvalidArgumentException` ao construir a
  Configs.

Quando um gatilho dispara, o worker responde essa requisição — em HTTP/1.x, com `Connection: close` —
e avisa o master, que **cria o substituto por fork na hora**, no próprio socket de escuta
pré-vinculado do slot: o worker antigo e o novo se sobrepõem, então o slot nunca fica sem um worker
aceitando. O worker antigo então **drena como na drenagem de um [reload](/guide/reload/overview/)** —
para de aceitar e termina o que está em andamento — mas não espera clientes ociosos:

- uma **conexão HTTP/1 keep-alive ociosa** (entre duas requisições, nada pendente nela) é fechada na
  hora, e cada uma das outras assim que o seu trabalho termina; uma requisição que chegar numa delas
  enquanto isso é respondida com `Connection: close` — inclusive uma resposta deferred, um stream ou
  uma resposta de erro;
- uma **conexão HTTP/2** recebe um GOAWAY na hora: os seus streams abertos terminam, um stream que ela
  abrir depois é recusado (`REFUSED_STREAM`, que os clientes repetem numa conexão nova) — nunca contado
  no orçamento contra rapid reset, por mais que um cliente ocupado tenha enviado antes de ler o GOAWAY,
  e nenhum GOAWAY posterior nomeia um stream mais alto — e ela é fechada quando não resta nenhum stream
  nela;
- uma **conexão que ainda não respondeu nenhuma requisição** é deixada em paz (o cliente pode estar
  enviando a primeira): ela é servida, ou fechada com o worker.

O que ainda espera é o trabalho em andamento: requisições sendo tratadas, respostas deferred, streams
e uploads. O worker antigo sai quando não segura mais nenhuma conexão — verificado uma vez por
segundo, e no máximo após `TCP_Server_CLI::$drainTimeout` (30 s), quando as conexões ainda abertas
são fechadas:

```text
NOTICE: Worker (PID: 50609) recycling: 9731 requests reached its limit of 9731; draining...
NOTICE: Worker #1 (PID: 50609) recycling, forking its replacement...
NOTICE: Worker #1 recovered (new PID: 51400)
NOTICE: Worker #1 (PID: 50609) recycled.
```

Uma reciclagem não é um crash: nunca é registrada como um, e encerra — nunca prolonga — a sequência
de backoff de um slot cujos workers continuam morrendo no boot. Um worker que sai com o status 75 sem
ter avisado uma reciclagem (no boot, por exemplo) é um crash do mesmo jeito. Uma reciclagem disparada
pela memória diz `its memory passed maxMemory (268435456 bytes) after 4120 requests`.

Vale saber:

- **Nenhuma janela sem worker.** Conexões novas chegam ao substituto enquanto o worker antigo drena;
  nenhuma espera a drenagem, nenhuma é descartada. Nos modos Foreground e Daemon o master cria o
  substituto assim que o worker avisa a reciclagem; no modo Monitor, dentro do seu turno de 30 ms; no
  modo Interactive — cujo prompt não consegue esperar pelo aviso — em até 50 ms enquanto a reciclagem
  está ligada. Um worker que sai antes de o master ouvi-lo é registrado como `recycled, reforking` e
  recriado na hora.
- **Um worker drenando por slot, e um prazo.** Um slot drena um worker por vez, então nada encurta
  uma drenagem: um download lento, um long poll ou um upload no worker antigo mantém todo o seu
  `drainTimeout`. O substituto, se atingir o seu próprio limite nesse meio-tempo, **segura a sua
  reciclagem**: continua respondendo — ainda aceitando, além de `maxRequests`, e além de `maxMemory`
  por até essa drenagem — até o master avisar que o worker antigo saiu (ele lê esse aviso uma vez por
  segundo), então recicla e registra
  `held its recycle while its slot's previous worker drained; recycling now`. Um aposentado que ainda
  drena `drainTimeout` + 5 s após o início da sua reciclagem (um handler que bloqueia) é encerrado
  (`killed, still draining past its deadline`), o que também libera a próxima reciclagem do slot. O
  servidor nunca roda mais que 2 × `workers` workers, e um cliente que prende um worker drenando só
  atrasa a próxima reciclagem do seu slot, em no máximo uma drenagem.
- **`maxMemory` precisa ser alcançável.** O `start()` se recusa a iniciar (`Server not started: …`,
  saída 1) quando ele não está acima da memória com que um worker começa (todo worker reciclaria na
  primeira requisição, e cada substituto depois dele) ou não está abaixo do `memory_limit` (o limite
  fatal do PHP viria primeiro). Um `reload` nunca para uma instância em serviço por isso: o master novo
  registra `Reloaded without a memory ceiling: …` e continua servindo com o teto desligado até o
  próximo start. Um worker que o próprio boot leva além de `maxMemory` continua servindo com o seu
  teto de memória desligado e registra um erro dizendo isso.
- **Servidores pausados continuam pausados.** Um substituto criado enquanto o servidor está pausado
  sobe pausado; o `resume` o retoma com os outros — alternar entre os consoles Monitor e Interactive
  mantém o servidor pausado. Um worker drenando não aceita nada, então uma pausa o deixa em paz.
- **Aposentados ainda são do servidor.** Os comandos, o `logs -f`, o `stats` e o `connections`
  alcançam um worker que drena a sua reciclagem, o `status` o conta, e o `stop` o encerra.
- **Inicialização com Auto-TLS.** Um worker que recicla enquanto o servidor ainda prova o seu
  certificado para cada worker não é um worker perdido: o seu slot é recriado quando a
  inicialização termina — dentro dessa barreira o substituto espera por ela. Um worker drenando ignora
  uma troca de certificado posterior: ele já não aceita, e as suas conexões abertas mantêm o
  certificado que negociaram.
- **Reciclar não é recarregar.** Substitui um worker, criado por fork do master em execução; uma
  mudança de código ainda pede o [`reload`](/guide/reload/overview/), que substitui o master e todos
  os workers.
- **O modo Test nunca recicla**: o seu master nunca recria um worker.

### SSL/TLS

Passe um array `secure` com opções de contexto de stream do PHP no Configs do servidor para habilitar HTTPS. O servidor muda automaticamente o esquema para `https://`:

```php
$Server->configure(
   new ServerConfigs(
      host: '0.0.0.0',
      port: 443,
      workers: 4,
      secure: [
         'local_cert'  => '/path/to/certificate.pem',
         'local_pk'    => '/path/to/private-key.pem',
         'verify_peer' => false,
      ]
   )
);
```

Para desenvolvimento local, o Bootgly inclui certificados auto-assinados em `@/certificates/`:

```php
secure: [
   'local_cert' => BOOTGLY_ROOT_DIR . '@/certificates/localhost.cert.pem',
   'local_pk'   => BOOTGLY_ROOT_DIR . '@/certificates/localhost.key.pem',
   'verify_peer' => false,
],
```

> [!NOTE]
> Para produção, use certificados de uma CA confiável como o Let's Encrypt.

Para um certificado que o próprio servidor obtém e renova, passe uma instância de `AutoTLS` no
parâmetro `AutoTLS:` em vez do array `secure:` — veja o guia [Auto-TLS](/guide/auto-tls):

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\AutoTLS;

$Server->configure(
   new ServerConfigs(
      host: '0.0.0.0',
      port: 443,
      workers: 4,
      AutoTLS: new AutoTLS(
         domains: ['example.com'],
         email: 'admin@example.com'
      ),
      user: 'www-data',
      group: 'www-data'
   )
);
```

`secure:` e `AutoTLS:` são mutuamente exclusivos — uma fonte de certificado, nunca duas. Passar os
dois lança `InvalidArgumentException` na construção.

### HTTP/2

O servidor fala HTTP/2 nativamente na mesma porta e rotas. Com `secure` definido, o ALPN
anuncia `h2,http/1.1` automaticamente; em texto claro, clientes conectam com prior
knowledge — sem configuração alguma (desligue o HTTP/2 por completo com
`enableHTTP2: false` no Configs do servidor):

```bash
curl -s --http2-prior-knowledge http://127.0.0.1:8080/ -w '%{http_version}\n'
# 2
```

Os handlers não mudam — `$Request->protocol` reporta `'HTTP/2'`. Modos de negociação,
HPACK, multiplexação, controle de fluxo, limites embutidos e ressalvas atuais estão na
página **[HTTP/2](/manual/WPI/HTTP/HTTP_Server_CLI/HTTP2/)**.

### Rebaixamento de Privilégios

Ao fazer bind em portas privilegiadas (< 1024), o processo precisa iniciar como root. Use `user` e `group` para rebaixar para uma identidade sem privilégios imediatamente após o socket ser vinculado:

```php
$Server->configure(
   new ServerConfigs(
      host: '0.0.0.0',
      port: 443,
      workers: 4,
      secure: [ /* ... */ ],
      user: 'www-data',
      group: 'www-data'
   )
);
```

> [!WARNING]
> Tanto `user` quanto `group` requerem a extensão PHP `posix` e o processo deve ser iniciado como root.

## Eventos

O método `on()` registra callbacks para o ciclo de vida do servidor e o tratamento de requisições:

| Evento | Callback | Descrição |
|---|---|---|
| `Events::RequestReceived` | `callable` | Obrigatório — trata cada requisição HTTP recebida. |
| `Events::ServerAdvertised` | `?callable` | Opcional — banner de inicialização; disparado no processo que possui o terminal (no modo Daemon, o launcher). |
| `Events::ServerStarted` | `?callable` | Opcional — disparado após todos os workers estarem ativos. |
| `Events::ServerStopped` | `?callable` | Opcional — disparado após todos os workers serem encerrados. |

### `Events::RequestReceived`

Chamado por cada processo **worker** para cada requisição HTTP recebida. Recebe os objetos `$Request` e `$Response`.

```php
$Server->on(
   Events::RequestReceived,
   function ($Request, $Response) {
      return $Response(body: 'Hello, World!');
   }
);
```

Para aplicações maiores, carregue as rotas da pasta `router/` do projeto com `Router::load()`:

```php
$Server->on(Events::RequestReceived, HTTP_Server_CLI::$Router->load(__DIR__ . '/router'));
```

> [!IMPORTANT]
> O handler `Events::RequestReceived` executa dentro de cada processo **worker**. O estado não é compartilhado entre workers — use memória compartilhada ou armazenamentos externos (Redis, DB) para comunicação entre workers.

### Carregando rotas

`Router::load()` é a forma canônica de registrar rotas. Aponta para a pasta `router/` do projeto e retorna o handler de requisição passado para `Events::RequestReceived`:

```php :filename="HTTP_Server_CLI.Project.php";
$Server->on(Events::RequestReceived, HTTP_Server_CLI::$Router->load(__DIR__ . '/router'));
```

Dentro da pasta:

- **`router/router.index.php`** — um manifesto listando os nomes dos route sets ativos. Cada nome resolve para `router/routes/<Name>.routes.php`. Liste mais de um para compor vários sets em um único handler.
- **`router/routes/<Name>.routes.php`** — um route set: uma generator-closure `(Request, Response, Router): Generator` que faz `yield` das suas rotas.

```php :group="router-load"; :tab="router.index.php"; :breadcrumb="router > router.index.php";
// Manifest of active route set names
return [
   'Database',           // active
   // 'Authentication',  // uncomment to also load (sets are composed in order)
];
```

```php :group="router-load"; :tab="Database.php"; :breadcrumb="router > routes > Database.php";
// A route set (generator-closure)
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router;

return static function (Request $Request, Response $Response, Router $Router): Generator {
   yield $Router->route('/users', fn (Request $Request, Response $Response) =>
      $Response->JSON->send(['ok' => true]), GET);
};
```

Um único set é retornado diretamente; múltiplos sets são compostos (`yield from` em cada) num só handler. A pasta também é a casa do router — reservada para um futuro arquivo `router.Config.php` de defaults.

```php
Router::load (string $path): Closure
```

Lê `$path/router.index.php` (um manifesto de nomes de route sets), resolve cada nome para `$path/routes/<Name>.routes.php`, e retorna um único handler closure (compondo múltiplos sets com `yield from`). Lança `InvalidArgumentException` quando o index ou um set nomeado não existe, ou quando um set não retorna um `Closure`.

### serverAdvertised

Disparado uma vez na inicialização, no processo que **possui o terminal** — no modo Daemon, o launcher (então o banner sobrevive ao detach); nos outros modos, o master logo antes do seu loop. Componha o banner de inicialização do projeto aqui e chame `advertise()` para as linhas de endereço:

```php
use const Bootgly\CLI;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Events;

$Server->on(
   Events::ServerAdvertised,
   function ($Server) {
      CLI->Terminal->Output->render('@.;@#green:✓ My project started@;@.;');
      $Server->advertise();
   }
);
```

`advertise()` imprime o endpoint vinculado: `Local:` sempre e `Network:` quando o bind cobre interfaces externas — o primeiro IPv4 não-loopback da máquina, também exposto como `$Server->network`. Fica mudo no runner de testes e com a saída totalmente silenciada.

### serverStarted

Disparado no processo **master** após todos os workers terem sido criados via fork e o socket do servidor estar vinculado. Use para registrar timers ou configurar estado no lado do master. No modo Daemon o terminal do master já está desconectado — renderize o banner de inicialização em `serverAdvertised`.

Propriedades do `$Server` disponíveis no callback:

| Propriedade | Tipo | Descrição |
|---|---|---|
| `$Server->host` | `string` | Endereço de host vinculado. |
| `$Server->port` | `int` | Número da porta vinculada. |
| `$Server->socket` | `string` | Prefixo do esquema — `http://` ou `https://`. |
| `$Server->network` | `null\|string` | Primeiro IPv4 não-loopback da máquina — `null` quando nenhum é resolvível. |

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Events;

$Server->on(
   Events::ServerStarted,
   function ($Server) {
      // Master-side setup — timers, schedulers, registries...
   }
);
```

### serverStopped

Disparado no processo **master** após todos os workers serem encerrados. Use para limpeza ou saída final.

```php
use const Bootgly\CLI;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Events;

$Server->on(
   Events::ServerStopped,
   function ($Server) {
      $Output = CLI->Terminal->Output;
      $Output->render('@.;@#yellow:■ HTTP Server stopped@;@.;');
   }
);
```

### Exemplo Completo

```php
use const Bootgly\CLI;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Events;

$Server
   ->on(Events::RequestReceived, fn ($Request, $Response) => $Response(body: 'Hello, World!'))
   ->on(Events::ServerAdvertised, function ($Server) {
      $Output = CLI->Terminal->Output;

      $Output->render('@.;@#green:✓ HTTP Server started@;@.;');
      $Server->advertise();
      $Output->render('  @#green:● Ready for connections@;@..;');
   })
   ->on(Events::ServerStopped, function ($Server) {
      $Output = CLI->Terminal->Output;
      $Output->render('@.;@#yellow:■ HTTP Server stopped@;@.;');
   });
```

## Ciclo de Vida do Servidor

O servidor segue um ciclo de vida de status bem definido:

```
Booting → Configuring → Starting → Running → Paused → Stopping
```

- **Booting**: Inicialização interna (logger, conexões, event loop, gerenciador de processos).
- **Configuring**: Os Configs entregues ao `configure()` são adotados — host, port, workers, TLS, limites de request, response resources.
- **Starting**: O SAPI é iniciado, sinais POSIX são instalados, workers são criados via fork.
- **Running**: Workers estão processando requisições no event loop.
- **Paused**: O socket do servidor é removido do event loop — novas conexões não são aceitas. Conexões existentes continuam.
- **Stopping**: Workers são encerrados, arquivos PID/lock são removidos.

## Arquitetura Master/Worker

O servidor utiliza uma arquitetura **multi-processo** com `fork()`:

- O processo **master** gerencia o ciclo de vida: tratamento de sinais, recuperação de workers e coordenação.
- Cada processo **worker** cria seu próprio socket de servidor usando `SO_REUSEPORT`, de forma que todos fazem bind independentemente na mesma porta. Isso evita contenção em um socket compartilhado.
- Um worker acima de `maxRequests` ou `maxMemory` avisa o master, que cria o substituto por fork na hora enquanto o worker antigo drena e sai de propósito — registrado como reciclagem; um slot mantém no máximo um worker drenando (a sua próxima reciclagem espera por ele), e o master encerra um que ainda drena `drainTimeout` + 5 s depois (veja [Reciclagem de workers](#reciclagem-de-workers)).
- Quando um worker morre inesperadamente, o master automaticamente cria um substituto no mesmo índice via tratamento do `SIGCHLD`. Um slot cujos workers morrem antes de entrar no loop de eventos três vezes seguidas é recriado após 0,5 s, dobrando até 5 s, e cerca de uma em cada N conexões novas espera essa tentativa; um fork recusado é tentado de novo a cada segundo, em vez de encerrar o master.
- Opções de socket por worker: `backlog: 102400`, `SO_KEEPALIVE`, `TCP_NODELAY`.

```
Master Process
├── fork() → Worker 1: socket bind → event loop
├── fork() → Worker 2: socket bind → event loop
├── ...
└── fork() → Worker N: socket bind → event loop
```

## Event Loop

Cada worker executa um event loop baseado em `stream_select()` que lida com:

- **Conexões de entrada**: Aceitas e registradas para monitoramento de leitura.
- **Leitura de requisições**: Dados TCP brutos são decodificados em requisições HTTP.
- **Escrita de respostas**: Respostas HTTP codificadas são escritas nos sockets dos clientes.
- **PHP Fibers**: O event loop se integra com PHP Fibers para suportar respostas deferred (assíncronas). Veja `$Response->defer()` para detalhes.

O event loop admite até 1000 descriptors por tabela do selector **por worker** (limitado pelo `stream_select()`), compartilhados entre os sockets de clientes e as esperas de dependências do próprio worker, então a capacidade total cresce com a quantidade de workers. Os clientes param em `1000 − headroom` — cerca de 968 por padrão — o que mantém o restante livre para o socket de escuta do worker (uma entrada) e para o I/O deferred de banco, KV e cliente HTTP. `maxConnections`, `maxConnectionsPerIP` e `headroom` ([Limites de conexão](#limites-de-conexão)) limitam a admissão por worker. Quando Fibers estão ativas, o loop opera em modo non-blocking (polling); caso contrário, ele bloqueia até que I/O esteja disponível, garantindo zero uso de CPU em idle.

## Modelo de Processos

Cada worker inicializa seu projeto uma única vez — rotas, classes, objetos — e então atende
requisição após requisição a partir do seu event loop. Nada é desmontado entre uma requisição e
outra. Se você vem do PHP-FPM, essa é a ideia que muda a forma de escrever código; se vem do
Swoole, do Workerman ou do RoadRunner, é o modelo que você já conhece, com as diferenças listadas
em [Vindo do Swoole](#vindo-do-swoole).

### O que sobrevive entre requisições

Variáveis globais, propriedades estáticas, variáveis `static` dentro de funções e closures, e todo
objeto criado enquanto as rotas foram registradas vivem enquanto o worker viver — elas **não** são
zeradas quando uma requisição termina:

```php
yield $Router->route('/count', function (Request $Request, Response $Response) {
   static $count = 0; // lives as long as the worker
   $count++;

   return $Response(body: 'pid=' . getmypid() . " count={$count}");
}, GET);
```

Disso decorrem duas regras:

- **Nunca guarde dados da requisição nelas.** Um valor colocado em uma static ou em uma global
  ainda está lá — com o conteúdo da requisição anterior — quando a próxima requisição chega.
- **Mantenha caches em processo limitados.** Tudo o que só cresce (um cache em array sem
  descarte, uma lista que recebe um item por requisição) cresce durante toda a vida do worker —
  a menos que a [reciclagem de workers](#reciclagem-de-workers) o substitua após `maxRequests`
  requisições ou acima de `maxMemory` bytes. O [`reload`](/guide/reload/overview/) reinicia todos
  os workers de forma graciosa.

Use isso a seu favor para o que é caro de construir e seguro de compartilhar: configuração já
interpretada, templates compilados, prepared statements, pools de conexão.

### Workers não compartilham memória

Cada worker é um processo separado com a sua própria cópia de tudo o que foi dito acima. Com
`workers: 2`, a rota `/count` conta por worker:

```text
pid=50609 count=1
pid=50608 count=1
pid=50609 count=2
```

Estado que precisa ser o mesmo para todos os workers pertence a algo fora do processo — o driver
`shared` do [Cache](/guide/cache/overview/) (memória compartilhada System V, mesmo host), `apcu`,
Redis ou o banco de dados:

```php
use Bootgly\ABI\Resources\Cache;

$Visits = new Cache(['driver' => 'shared', 'prefix' => 'visits:']);

yield $Router->route('/visits', function (Request $Request, Response $Response) use ($Visits) {
   return $Response(body: (string) $Visits->increment('home')); // 1, 2, 3... across workers
}, GET);
```

### Leia a requisição em `$Request`, responda por `$Response`

As superglobais de requisição do PHP não são preenchidas: `$_GET`, `$_POST`, `$_COOKIE`, `$_FILES`
e `$_REQUEST` ficam vazias, e `$_SERVER` descreve o processo CLI, não a requisição. As funções que
escrevem na SAPI também não chegam ao cliente. Use os objetos que todo handler recebe:

| Em vez de | Use |
| --- | --- |
| `$_GET['page']` | `$Request->queries['page']` |
| `$_POST['name']` | `$Request->fields['name']` |
| `$_FILES['avatar']` | `$Request->files['avatar']` |
| `$_COOKIE['theme']` | `$Request->Cookies->get('theme')` |
| `$_SERVER['REQUEST_METHOD']`, `$_SERVER['REQUEST_URI']` | `$Request->method`, `$Request->URI` |
| `$_SERVER['REMOTE_ADDR']` | `$Request->address` |
| `$_SERVER['HTTP_X_TOKEN']`, `getallheaders()` | `$Request->Header->get('X-Token')` |
| `session_start()`, `$_SESSION` | `$Request->Session` |
| `header('X-Frame-Options: DENY')` | `$Response->Header->set('X-Frame-Options', 'DENY')` |
| `setcookie('theme', 'dark')` | `$Response->Header->Cookies->append(new Cookie('theme', 'dark'))` |
| `echo`, `print` | `return $Response(body: '...')` |
| `exit`, `die` | `return $Response` |

`Cookie` é `Bootgly\WPI\Modules\HTTP\Server\Response\Raw\Header\Cookie`. Saída escrita com `echo`
vai para a saída padrão do worker — o seu terminal no modo foreground, lugar nenhum no modo
daemon — e nunca para o cliente. Veja [Request](/manual/WPI/HTTP/HTTP_Server_CLI/Request/overview/)
e [Response](/manual/WPI/HTTP/HTTP_Server_CLI/Response/overview/) para a API completa.

Leia a requisição enquanto o seu handler roda. Depois que a resposta é escrita, o servidor descarta o
cabeçalho que o `$Request` da conexão guardava — headers, cookies, URI, query e as credenciais
decodificadas deles — para que uma conexão keep-alive ociosa não guarde nenhuma requisição na
memória, além de um cabeçalho curto de campos padrão que ela pode reaproveitar numa próxima
requisição idêntica. Uma leitura posterior desse objeto não é confiável: pode encontrá-los vazios, ou
já descrevendo a próxima requisição. O trabalho deferred lê o
seu próprio snapshot (veja [Respostas Assíncronas](/manual/WPI/HTTP/HTTP_Server_CLI/Response/overview/));
um stream SSE montado numa rota síncrona mantém o cabeçalho do seu `$Request` — headers, cookies,
URI, query e credenciais — enquanto transmite (o corpo e os campos são liberados como os de qualquer
outra requisição).

### `exit()` encerra o worker

`exit()` e `die()` terminam o próprio processo do worker. O cliente recebe uma resposta vazia,
todas as outras conexões daquele worker caem, e o master faz fork de um substituto — que começa
com estado novo:

```text
WARNING: Worker #1 (PID: 50609) crashed, reforking...
NOTICE: Worker #1 recovered (new PID: 51400)
```

Retorne uma resposta em vez disso; para parar antes, retorne-a de onde você estiver.

### Uma requisição por vez em cada worker

Um handler síncrono roda do início ao fim antes que o seu worker leia a próxima requisição. Nada
mais roda naquele worker no meio do seu handler, então uma global definida no começo de um
handler ainda é sua no final dele.

O outro lado: **uma chamada bloqueante bloqueia todas as conexões daquele worker.** Com um
worker, uma rota que passa 1,5 s em um loop de CPU fez uma rota trivial em outra conexão esperar
1,2 s. `sleep()`, um cliente HTTP bloqueante (`file_get_contents('https://...')`, curl), PDO e
qualquer outro I/O síncrono têm o mesmo efeito — e o `sleep()` ainda é interrompido pelo sinal de
timer do próprio worker, então nem como pausa ele é confiável.

O Bootgly é PHP puro: ele não consegue transformar as funções bloqueantes do PHP em não
bloqueantes por baixo dos panos. Use os clientes que estacionam no event loop:

- **SQL** — os drivers PostgreSQL e MySQL do [ADI Database](/guide/database-dbal/overview/).
- **Redis** — o `$Response->KV`, o driver Redis da fachada [KV](/manual/ADI/Databases/KV/overview/)
  aguardado pelos [Response Resources](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/overview/#aguardar-trabalho-key-value)
  (o driver `redis` do [Cache](/guide/cache/overview/) é bloqueante, assim como o `await()` da
  própria fachada KV).
- **HTTP** — o cliente upstream em [Response Resources](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/overview/).

Distribua trabalho pesado de CPU entre os workers, ou mova-o para uma [fila](/guide/queues/overview/).
[Performance](/guide/performance/overview/) cobre o dimensionamento de workers e pools.

### Trabalho diferido se intercala no `wait()`

`$Response->defer()` executa o seu trabalho em uma Fiber. Cada `$Response->wait()` devolve o
worker ao event loop, e outras requisições rodam até a Fiber ser retomada. Este é o único lugar
em que duas requisições se intercalam dentro de um worker — e ali, estado compartilhado é
compartilhado:

```php
yield $Router->route('/hello', function (Request $Request, Response $Response) {
   $name = (string) ($Request->queries['name'] ?? '');

   return $Response->defer(function (Response $Response) use ($name): void {
      $GLOBALS['name'] = $name; // ❌ one global per worker, shared by every request

      $until = microtime(true) + 1;
      while (microtime(true) < $until) {
         $Response->wait(); // other requests run here
      }

      $Response->send("Hello, {$name}! (the global now says {$GLOBALS['name']})\n");
   });
}, GET);
```

Duas requisições sobrepostas no mesmo worker, `?name=alice` e depois `?name=bob`, respondem:

```text
Hello, bob! (the global now says bob)
Hello, alice! (the global now says bob)
```

Mantenha tudo o que uma deferral precisa em variáveis locais ou na lista `use` da closure — o
`$name` acima continua correto. Leia a requisição pelos parâmetros da closure, nunca por uma cópia
do `$Request`/`$Response` da rota guardada à parte: as regras estão em
[Deferred Responses](/manual/WPI/HTTP/HTTP_Server_CLI/Response/overview/).

### Mudanças de código pedem um reload

Um worker carrega o seu código uma vez. Editar um arquivo não muda nada até os workers serem
substituídos: rode [`project reload`](/guide/reload/overview/) — gracioso, as requisições em
andamento terminam. Ainda nenhum modo observa o disco por você. Um reload também zera todo o
estado em processo descrito acima.

### Vindo do Swoole

As regras são quase as mesmas que você já segue: globais persistem por worker, workers não
compartilham memória, superglobais ficam vazias, `exit()` mata o worker. O que muda:

- **Sem concorrência implícita.** O Swoole pode fazer hook de funções bloqueantes em corrotinas,
  então qualquer chamada de I/O pode trocar para outra requisição no meio do handler. O Bootgly
  nunca troca implicitamente: requisições só se intercalam em um `wait()` explícito dentro de
  `defer()`.
- **Sem hooks para funções bloqueantes.** O preço do item anterior — PDO, curl e `sleep()`
  bloqueiam o worker. Use os clientes assíncronos nativos listados acima.
- **`Swoole\Table` → Cache `shared`.** Estado entre workers no mesmo host é o driver `shared` do
  Cache; entre hosts, Redis ou o banco de dados.
- **`max_request` → `maxRequests`.** Desligado por padrão; defina-o, com `jitter` e `maxMemory`,
  na Configs do servidor — veja [Reciclagem de workers](#reciclagem-de-workers).
- **`sendfile` → streaming.** Veja [Arquivos Estáticos](#arquivos-estáticos).

## Ciclo de vida da resposta deferred

Uma resposta deferred (`$Response->defer()`) sobrevive ao handler que a criou: o cliente pode sumir e o worker pode desligar enquanto o trabalho deferido ainda está estacionado — e no HTTP/2 a conexão continua atendendo os seus outros streams (no HTTP/1.1 as requisições encadeadas atrás dele esperam a resposta dele). Três peças colaboram para que isso seja seguro.

Trabalho deferido que chama um upstream por um response resource (`$Response->Upstream->request()`, veja [Response Resources](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/)) estaciona do mesmo jeito: o dial, o handshake TLS e a espera pela resposta suspendem a Fiber no reactor do worker, então o worker continua atendendo as outras conexões — e quando o deferral termina, normalmente ou porque o cliente foi embora, o resource libera todas as conexões upstream que abriu.

As três são **pay-for-use**. Uma requisição síncrona que ninguém observa não aloca nenhuma delas — sem exchange, sem token, sem weak map.

### O exchange: o dono terminal de uma requisição

Um `Exchange` só é aberto quando algo observa a admissão da requisição — por exemplo, ao subir a `Telemetry`. Ele chega ao estado terminal exatamente uma vez, tendo a requisição terminado com resposta ou sido cancelada:

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request\Exchange;

$Exchange->observe(static function (Exchange $Exchange, null|int $code): void {
   // $code is the final status code — or null when the exchange was cancelled.
});
```

- **Terminal exatamente uma vez.** Um finish reentrante ou repetido é no-op.
- **Um observador tardio ainda dispara**, imediatamente, com o resultado retido — registrar depois da transição não é um no-op silencioso.
- **Os observadores são contidos.** Um que lance exceção não suprime outro nem quebra o teardown.
- **O exchange retém só o status code**, nunca a `Response` terminal. Segurar a resposta prenderia a requisição, o corpo e os recursos dela enquanto qualquer listener mantivesse o token.

### Cancelamento não é um status

Quando o transporte ou o scheduler derruba o trabalho antes que uma resposta se tornasse observável, o exchange finaliza com `$code === null`.

O Bootgly **não** inventa uma classe de status para esse caso — não existe um `499` sintético. Um exchange cancelado fecha sua contabilidade central (conta como requisição, tem a duração observada, sai do gauge de in-flight) e não contribui em nada para os contadores de resposta por classe. Veja o guia de [Observabilidade](/guide/observability) para como isso aparece nas métricas.

### Capacidade do scheduler

Deferir um exchange **observado** exige que o reactor implemente `Bootgly\ACI\Events\Cancelling`, um marcador sobre `Contextualizing` que não adiciona métodos:

```php
use Bootgly\ACI\Events\Cancelling;
use Bootgly\ACI\Events\Contextualizing;

interface Cancelling extends Contextualizing {}
```

O marcador existe porque um exchange observado precisa ser fechado *deterministicamente* quando seu trabalho é cancelado — um scheduler incapaz de garantir isso deixaria a contabilidade de in-flight presa para sempre. O reactor `Select` do próprio Bootgly o implementa, então isso só te afeta se você substituir o reactor: um scheduler customizado que implemente apenas `Contextualizing` faz um `defer()` observado falhar cedo, antes de a requisição ser clonada ou de arquivos enviados serem movidos.

O contrato base `Scheduler` também carrega `interrupt()` — o meio pelo qual um deadline alcança uma Fiber estacionada (veja *Deadlines* e a Referência). Um scheduler customizado precisa implementá-lo.

### Posse de teardown

`Ownership` vincula donos de teardown a um escopo de transporte ou protocolo — uma conexão, uma stream HTTP/2 — sem adicionar métodos públicos a essas classes não-finais:

```php
use Bootgly\WPI\Endpoints\Servers\Ownership;

Ownership::attach($Connection, $Owner);   // $Owner implements Disconnecting
Ownership::detach($Connection, $Owner);   // its work completed normally
Ownership::close($Connection);            // notify every attached owner exactly once
```

- **Exatamente uma vez, sempre.** Anexar a um escopo *já fechado* notifica o dono imediatamente, e um segundo attach do mesmo dono não faz nada — inclusive um attach reentrante de dentro do próprio `disconnect()` dele.
- **Fechar não custa nada quando ninguém anexou**, que é o caso comum de toda conexão e toda stream HTTP/2: o escopo guarda apenas um marcador terminal e nenhuma coleção.
- **Um escopo fechado nunca reabre.** `detach()` nele é ignorado, então um attach tardio nunca pode ser notificado duas vezes.

### Deadlines

Um deferral estacionado é limitado por um **orçamento**, em segundos: o `deferredTimeout` do
`Response\Configs` (padrão `0` = sem teto) ou, com precedência, o `timeout` por chamada do `defer()`. O
orçamento só é armado quando o trabalho de fato estaciona, e é desarmado no instante em que a geração
termina — normalmente, por um handoff aninhado ou por teardown — então um deferral concluído nunca deixa
um deadline velho para a Fiber que será reaproveitada em seguida.

Quando ele estoura, o reactor entrega um `Bootgly\WPI\Nodes\HTTP_Server_CLI\Response\Timeout` no
ponto de suspensão da Fiber — **antes** de o exchange terminar. O trabalho deferido o vê exatamente como
qualquer outra exceção lançada de `$Response->wait()` (ou de uma chamada de resource construída sobre
ele): seus `catch` e `finally` rodam, e ele ainda pode escolher a própria resposta:

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response\Timeout;

yield $Router->route('/report', function ($Request, Response $Response) {
   return $Response->defer(function (Response $Response): void {
      try {
         // 'Upstream' is an HTTP response resource registered in Response\Configs(Resources:)
         $Upstream = $Response->Upstream->request('GET', '/report');
         $Response->JSON->send(['code' => $Upstream->code]);
      }
      catch (Timeout $Timeout) {
         $Response(code: 504, body: "The upstream took longer than {$Timeout->timeout}s.");
      }
   }, timeout: 2.5);
}, GET);
```

Sem tratamento pelo trabalho, o `Timeout` é oferecido aos middlewares `Recovering` da rota, depois aos do
pipeline global (veja *Fronteiras de Erro e Trabalho Deferred* na página
[Middlewares](/manual/WPI/HTTP/HTTP_Server_CLI/Middlewares)); sem tratamento por eles também, é respondido
com um `503 Service Unavailable` limpo — a página de erro do ambiente, sem trace de throwable. Um warning
é registrado com a linha da requisição e o orçamento em qualquer dos casos. O mesmo orçamento limita um
middleware `Recovering` que estaciona dentro de `recover()` — um orçamento re-armado para a caminhada das
fronteiras, depois o `503` limpo. O
exchange termina com esse `503`, então a telemetria conta uma resposta `5xx`, não um cancelamento. Um
orçamento por geração: um deferral que captura o `Timeout` e estaciona de novo não é rearmado.

### Quando o cliente vai embora

Se a conexão — ou a stream HTTP/2 — fecha enquanto o deferral ainda está estacionado, a geração dele é
cancelada e a Fiber **nunca é retomada**: nenhum bloco `catch` roda, porque nada é lançado dentro dela —
e nenhum middleware `Recovering` é consultado: nada foi lançado, e não há mais ninguém para responder.
Em vez disso o reactor libera a Fiber no seu próximo safe point, fora de qualquer varredura de fila, e
o PHP a desenrola — todo `finally` pendente roda na hora, antes de o worker voltar a esperar I/O.
Coloque no `finally` a limpeza que não pode esperar — soltar um lock, fechar um arquivo, devolver um
handle ao pool — e lembre de duas regras:

- Não chame `wait()` nem um resource de dentro desse `finally`. O `wait()` não vai estacionar ali — a
  capacidade de esperar da geração é revogada no instante do cancelamento, então ele devolve o
  `Response` na hora e seu código segue como se tivesse esperado; nunca use isso para detectar o
  desenrolar. Um resource recusa: o resource HTTP lança `LogicException` ("must be used inside a live
  deferred context") e, sem captura, o resto do bloco é pulado.
- Use o `$Response` entregue à sua closure, não o `WPI->Response` ambiente: o contexto do segmento de
  execução não é religado durante o desenrolar. O mesmo vale para o request: leia o snapshot que a
  closure recebeu (o segundo argumento dela, o mesmo objeto que `$Response->Request`) — nunca o
  `$Request` da rota, que o servidor já esvaziou e reutilizou. Depois de um cancelamento os uploads e os
  fields do snapshot também já foram liberados: leia o que precisa antes de estacionar.

Um `Fiber::getCurrent()` guardado numa variável através de um `wait()` prende a Fiber à própria pilha e
anula a liberação imediata — leia, use, `unset()`.

## Arquivos Estáticos

O Bootgly serve arquivos por conta própria — sem Nginx ou Apache na frente. Há dois caminhos, um
para cada tarefa:

- **`Statics`** (plataforma Web) para os assets que as suas páginas carregam: stylesheets,
  scripts, imagens, fontes. Servidos inline, com o media type correto e uma política de cache
  para o navegador.
- **`$Response->upload()`** para downloads e arquivos grandes: transmitidos do disco em fatias,
  nunca carregados inteiros na memória, com byte ranges, em HTTP/1.1 e HTTP/2.

Nenhum dos dois usa a system call `sendfile(2)`. [Por que, e o que isso significa](#por-que-não-há-sendfile),
está explicado abaixo.

### Sirva os assets do seu site

Coloque os arquivos na pasta `statics/` do projeto e registre uma rota catch-all para eles:

```text
projects/Blog/
├── router/routes/Blog.routes.php
└── statics/
    ├── app.css
    └── logo.png
```

```php
use Web\App\Statics;

yield $Router->route('/statics/:file*', new Statics, [GET, HEAD]);
```

As páginas os referenciam pela URL:

```html
<link rel="stylesheet" href="/statics/app.css">
<img src="/statics/logo.png" alt="Logo">
```

A resposta leva o media type mapeado a partir da extensão e uma política de cache para o
navegador:

```text
HTTP/1.1 200 OK
Content-Type: text/css; charset=UTF-8
Cache-Control: public, max-age=3600
Content-Length: 4400
```

O `Statics` mapeia 26 extensões comuns — CSS, JavaScript, JSON e source maps, HTML, SVG, o web
manifest e os formatos usuais de imagem, fonte, vídeo, PDF e WebAssembly. Uma extensão
desconhecida é enviada como `application/octet-stream`. Um caminho que sai da pasta `statics/`
(`../`, codificado ou não) ou que aponta para um arquivo inexistente responde `404`, assim como
dotfiles (`.env`, `.git/config`) e fontes PHP, mesmo quando existem na pasta — só o `.well-known/`
(RFC 8615) é servido, para arquivos como o `security.txt`.

O construtor recebe a pasta, o parâmetro da rota e o valor de `Cache-Control`. Para nomes de
arquivo com fingerprint (`app.3f9a1c.css`), que nunca mudam, deixe os navegadores guardá-los por
um ano:

```php
yield $Router->route('/statics/:file*', new Statics(cache: 'public, max-age=31536000, immutable'), [GET, HEAD]);
```

### Revalide e comprima

Adicione os middlewares [`ETag` e `Compression`](/manual/WPI/HTTP/HTTP_Server_CLI/Middlewares/overview/)
à rota. O `ETag` vem primeiro — o mais externo — para que a tag descreva os bytes comprimidos que
de fato vão para a rede:

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Compression;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\ETag;
use Web\App\Statics;

yield $Router->route('/statics/:file*', new Statics, [GET, HEAD], middlewares: [new ETag, new Compression]);
```

A primeira requisição recebe o corpo em gzip e uma tag; um navegador que devolve a tag recebe um
`304` vazio:

```text
HTTP/1.1 200 OK
Content-Encoding: gzip
ETag: W/"f060e02266f84f8e"
Content-Length: 73

HTTP/1.1 304 Not Modified
ETag: W/"f060e02266f84f8e"
```

### Use o `Statics` para assets web

O `Statics` lê o arquivo inteiro para a memória a cada requisição. É a troca certa para
stylesheets, scripts, ícones e fontes — arquivos pequenos, servidos com frequência, que depois o
navegador guarda em cache. É a troca errada para vídeo, PDFs grandes ou downloads de muitos
megabytes: transmita esses com `upload()`, como mostrado a seguir, ou sirva-os a partir de um
CDN.

### Envie downloads e arquivos grandes

`$Response->upload()` transmite um arquivo do diretório do projeto:

```php
yield $Router->route('/reports/latest', function (Request $Request, Response $Response) {
   return $Response->upload('storage/files/report.pdf');
}, GET);
```

- O arquivo é lido em **fatias** — até 1 MiB por vez no HTTP/1.1, dimensionadas pela janela de
  controle de fluxo do stream no HTTP/2 — e escrito à medida que a conexão as aceita. Quando o
  cliente é lento, o restante espera o próximo evento de escrita: enquanto isso o worker continua
  atendendo as suas outras conexões.
- Requisições com `Range` são respondidas com `206 Partial Content`, incluindo
  `multipart/byteranges` com vários intervalos, em HTTP/1.1 e HTTP/2.
- O caminho fica confinado ao diretório do projeto; qualquer coisa fora dele responde `403`.

`upload()` escreve headers de **download**: `Content-Type: application/octet-stream`,
`Content-Disposition: attachment` e `Cache-Control: no-cache, must-revalidate`, então o
navegador salva o arquivo em vez de exibi-lo.

### Transmita um arquivo grande que o navegador exibe

Para um vídeo, um PDF grande ou qualquer outra coisa que a página deve mostrar, chame `upload()`
e depois substitua os headers que ele escreveu — eles só são serializados depois que o handler
retorna. O arquivo continua sendo transmitido, com ranges:

```php
yield $Router->route('/media/intro.mp4', function (Request $Request, Response $Response) {
   $Response->upload('storage/media/intro.mp4');

   // ? Only a single-body answer (the whole file or one range) carries these headers
   if ($Response->Header->get('Content-Disposition') !== '') {
      $Response->Header->set('Content-Type', 'video/mp4');
      $Response->Header->set('Content-Disposition', 'inline');
      $Response->Header->set('Cache-Control', 'public, max-age=3600');
   }

   return $Response;
}, GET);
```

Mantenha a verificação de `Content-Disposition`: um pedido de vários ranges de uma vez é
respondido como `multipart/byteranges`, cujo `Content-Type` não pode ser substituído, e respostas
de erro (`403`, `416`) não definem nenhum dos dois headers. O
[manual do Response](/manual/WPI/HTTP/HTTP_Server_CLI/Response/#enviar-o-conteúdo-de-um-arquivo-inline)
cobre essa receita, offsets, ranges e as verificações de identidade do arquivo.

### Por que não há `sendfile`

O Nginx (com `sendfile on`) e o `$response->sendfile()` do Swoole pedem ao kernel que copie um
arquivo direto para o socket com `sendfile(2)`, sem que os bytes passem pela aplicação. O PHP não
expõe nenhuma função `sendfile()`, e o Bootgly não precisa de extensão, então todo byte que ele
serve passa pelo PHP: lê uma fatia, escreve no socket não bloqueante. O mesmo caminho carrega o
TLS (que de qualquer forma criptografa na camada OpenSSL do PHP) e o framing do HTTP/2.

Na prática:

- **Assets da aplicação e downloads** — sirva-os pelo Bootgly, como mostrado acima.
- **Tráfego estático pesado** — mídia grande, muitos megabytes por página, alto volume de
  requisições — coloque um CDN ou um proxy reverso (Nginx, Caddy) na frente e deixe-o servir ou
  guardar esses arquivos em cache. Seus workers do Bootgly passam então o tempo com as requisições
  da aplicação.

### O cache de resposta de rota não é para assets

O [cache de resposta de rota](/manual/WPI/HTTP/HTTP_Server_CLI/Router/overview/)
(`cache: ['TTL' => 60]`) reproduz respostas prontas a partir da memória, mas sai de cena
justamente nas situações em que os assets vivem: uma requisição que leva um `Cookie` (o navegador
envia o cookie de sessão em toda requisição de asset do seu site), uma requisição que passou por
um proxy (`X-Forwarded-*`), uma rota com middlewares (portanto não junto com o `ETag`) e qualquer
servidor com um middleware global. Para assets, conte com `Cache-Control` e um CDN.

### Sem a plataforma Web

O `Statics` vem com a plataforma Web. Um projeto que usa só o HTTP Server serve os seus assets
com a receita acima — `upload()` mais os headers inline, com o `Content-Type` de cada arquivo —
ou com `upload()` sozinho para downloads.

A assinatura completa de `upload()` está no manual do [Response](/manual/WPI/HTTP/HTTP_Server_CLI/Response/overview/);
o construtor do `Statics`, no manual do [Web App](/manual/Web/App/overview/).

## Referência

### `HTTP_Server_CLI->configure()`

```php
public function configure (Bootgly\ABI\Configs ...$Configs): self
```

Adota um Configs por preocupação — `HTTP_Server_CLI\Configs`, `Request\Configs`, `Response\Configs` — em qualquer ordem, e retorna o servidor para encadeamento. Lança `InvalidArgumentException` quando a mesma classe de Configs se repete na chamada ou quando o node não aceita aquele Configs, e `ArgumentCountError` enquanto `host`, `port` e `workers` nunca tiverem sido definidos. Depois que o servidor cruza a fronteira pré-start, a chamada é recusada com um erro logado e não muda nada.

Quais Configs um node aceita não é adivinhação: cada node declara isso em duas constantes de classe,
`TRANSPORT` (o Configs que carrega o socket) e `CONFIGS` (toda classe de Configs que ele aplica).

```php
protected const string TRANSPORT = HTTP_Server_CLI\Configs::class;
protected const array CONFIGS = [
   HTTP_Server_CLI\Configs::class,
   Request\Configs::class,
   Response\Configs::class
];
```

Herdar de um node significa redeclarar as duas — uma subclasse que adiciona o Configs dela mas
herda as constantes do pai aceitaria o Configs do pai e configuraria só o que o pai conhece.

### `HTTP_Server_CLI\Configs`

```php
new Bootgly\WPI\Nodes\HTTP_Server_CLI\Configs(/* named arguments only */)
```

O servidor em si. Somente argumentos nomeados — o primeiro slot do construtor é a guarda `Bootgly\ABI\Argument`, então uma chamada posicional lança um `TypeError`.

| Parâmetro | Tipo | Padrão | Descrição |
|---|---|---|---|
| `host` | `string` | — (obrigatório) | Endereço de bind. Use `'0.0.0.0'` para escutar em todas as interfaces. Quando definido como `'0.0.0.0'`, o domínio padrão é `localhost`. |
| `port` | `int` | — (obrigatório) | Porta de escuta. |
| `workers` | `int` | — (obrigatório) | Número de processos filhos criados via fork. Cada worker cria seu próprio socket via `SO_REUSEPORT`. |
| `secure` | `null\|array` | `null` | Opções de contexto seguro SSL/TLS. Quando fornecido, o esquema muda para `https://`. Mutuamente exclusivo com `AutoTLS`. |
| `user` | `null\|string` | `null` | Nome do usuário POSIX para rebaixar o processo após o bind. |
| `group` | `null\|string` | `null` | Nome do grupo POSIX para rebaixar o processo após o bind. |
| `AutoTLS` | `null\|AutoTLS` | `null` | Ciclo de vida gerenciado do certificado (ACME): bootstrap, emissão em segundo plano, hot swap e renovação. Mutuamente exclusivo com `secure` — passar os dois lança `InvalidArgumentException`. Veja o guia [Auto-TLS](/guide/auto-tls). |
| `enableHTTP2` | `null\|bool` | `null` (= habilitado) | `false` serve apenas HTTP/1.x — sem `h2` no anúncio ALPN e sem a sondagem do preface por prior knowledge em texto claro. Veja a página [HTTP/2](/manual/WPI/HTTP/HTTP_Server_CLI/HTTP2/). |
| `health` | `null\|string` | `null` | Caminho do endpoint de health-check embutido (ex.: `'/health'`). Requisições GET/HEAD nesse caminho exato são respondidas antes do pipeline de middlewares, então nenhum middleware do usuário quebra um probe. `null` o mantém desligado. |
| `maxConnections` | `null\|int` | `null` (= `10000`) | Número máximo de conexões estabelecidas simultaneamente **por worker**. Conexões aceitas além desse teto são imediatamente descartadas (aceitas e então fechadas) para limitar o uso de file descriptors e memória sob um DoS de inundação de conexões. `0` desativa o limite. Avaliado uma vez por accept — nunca no hot path por requisição. |
| `maxConnectionsPerIP` | `null\|int` | `null` (= `0`) | Número máximo de conexões estabelecidas simultaneamente **de um único IP de origem**. Opcional: `0` significa ilimitado, porque um proxy reverso concentra todos os clientes em um único IP de origem — habilite apenas quando o IP do par é o cliente real. |
| `headroom` | `null\|int` | `null` (= `32`) | Entradas do selector que cada worker mantém livres para o próprio I/O de dependências (esperas deferred de DB/KV, o cliente HTTP embarcado), descartando clientes mais cedo: quando um worker já segura `1000 − headroom` conexões, a próxima é aceita e imediatamente fechada, então o teto efetivo é o menor entre esse valor e `maxConnections`. O socket de escuta ocupa uma dessas entradas, então dimensione-o para pelo menos a soma dos `pool.max` dos resources do worker mais uma. `0` o desativa; ele é limitado para que um worker sempre admita clientes. Define `TCP_Server_CLI::$headroom`. |
| `connectionIdleTimeout` | `null\|int` | `null` (= `15`) | Segundos que uma conexão estabelecida pode ficar em silêncio — sem escrita concluída desde o tick anterior do supervisor e sem trabalho pendente retido nela — antes de o worker fechá-la. Uma resposta deferred estacionada conta como trabalho pendente, então nunca é ceifada como ociosa. `0` desativa o reaper. Segundos inteiros: o supervisor roda na roda de timers de um segundo, então o corte cai entre `N` e `N+1` segundos após o último tick com atividade. |
| `maxWorkerPendingBytes` | `null\|int` | `null` (= `64 MiB`) | Orçamento de memória do worker: os bytes que um worker pode segurar entre eventos — corpos de requisição inacabados (no máximo metade), entradas do cache de rotas (no máximo um quarto) e saída pendente —, cobrados pelo footprint no alocador. Reduzido para metade do `memory_limit` na partida, com um aviso, quando maior. Define `TCP_Server_CLI::$maxWorkerPendingBytes`. Veja [Orçamento de memória](#orçamento-de-memória). |
| `maxRequests` | `int` | `0` (= desligado) | Requisições após as quais um worker é reciclado — substituído na hora, enquanto drena como num reload. Cada requisição que uma conexão keep-alive carrega conta uma vez, e cada stream HTTP/2. Um substituto cujo antecessor no slot ainda drena segura a sua reciclagem até ele sair. Negativo lança `InvalidArgumentException`. Define `TCP_Server_CLI::$maxRequests`. Veja [Reciclagem de workers](#reciclagem-de-workers). |
| `jitter` | `float` | `0.1` | Dispersão do limite próprio de cada worker em torno de `maxRequests`, como fração de `0` a `1` (`0.1` = ±10%): cada worker sorteia dentro da sua própria faixa, então os workers nunca reciclam juntos. Fora de `0`–`1` lança `InvalidArgumentException`. Define `TCP_Server_CLI::$jitter`. |
| `maxMemory` | `int\|string` | `0` (= desligado) | Memória real (`memory_get_usage(true)`) acima da qual um worker é reciclado, verificada a cada requisição que ele despacha. Bytes, ou um tamanho em texto (`'512M'`, `'1.5 GB'`) lido por `Bootgly\ABI\Code\__String\Bytes::parse()`. Um valor negativo ou malformado lança `InvalidArgumentException`; o `start()` recusa um que não esteja acima da memória com que um worker começa ou abaixo do `memory_limit`, e um `reload` desliga um teto assim em vez disso. Um substituto cujo antecessor no slot ainda drena pode ficar acima dele até o antecessor sair. Define `TCP_Server_CLI::$maxMemory`. |

### `Request\Configs`

```php
new Bootgly\WPI\Nodes\HTTP_Server_CLI\Request\Configs(/* named arguments only */)
```

Limites de entrada. Todo parâmetro é opcional; `null` mantém o padrão do framework.

| Parâmetro | Tipo | Padrão | Descrição |
|---|---|---|---|
| `maxFileSize` | `null\|int` | `null` (= `500 MB`) | Tamanho máximo em bytes por parte de arquivo em requisições multipart. |
| `maxBodySize` | `null\|int` | `null` (= `10 MB`) | Tamanho máximo total do corpo em bytes para requisições não-multipart. |
| `maxHeaderFields` | `null\|int` | `null` (= `100`) | Número máximo de linhas de header de uma requisição HTTP/1.x; acima disso ela recebe `431 Request Header Fields Too Large` e a conexão é fechada. Cada campo parseado custa bem mais memória que os seus bytes. |
| `maxMultipartFieldSize` | `null\|int` | `null` (= `1 MB`) | Tamanho máximo em bytes do valor de um campo de texto multipart. |
| `maxMultipartHeaderSize` | `null\|int` | `null` (= `8 KB`) | Tamanho máximo em bytes do bloco de headers de uma parte multipart. |
| `maxMultipartFields` | `null\|int` | `null` (= `1024`) | Número máximo de campos de texto aceitos em uma requisição multipart. |
| `maxMultipartFiles` | `null\|int` | `null` (= `1024`) | Número máximo de partes de arquivo aceitas em uma requisição multipart. |
| `downloadsMaxBytesOnDisk` | `null\|int` | `null` (= `8 GB`) | Teto agregado, entre todos os workers, dos bytes que os uploads em spool podem manter em disco ao mesmo tempo. |

### `Response\Configs`

```php
new Bootgly\WPI\Nodes\HTTP_Server_CLI\Response\Configs(/* named arguments only */)
```

Configuração de saída. Todo parâmetro é opcional; `null` mantém o padrão do framework.

| Parâmetro | Tipo | Padrão | Descrição |
|---|---|---|---|
| `Resources` | `null\|array<string,Closure>` | `null` | Factories de response resources do projeto, por nome — cada uma um `Closure(object): Response\Resource` construído lazy na primeira leitura (`$Response->Database`, `$Response->Upstream`, …). Veja [Response Resources](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/). |
| `deferredTimeout` | `null\|int\|float` | `null` (= `0`, sem teto) | Segundos que uma resposta deferred (`$Response->defer()`) pode ficar estacionada no reactor antes de um `Response\Timeout` ser entregue no ponto de espera. Um `defer($work, timeout:)` por chamada tem precedência. Um timeout que escapa do trabalho sempre registra um warning; se nenhum middleware `Recovering` o tratar, ele responde `503 Service Unavailable`. |

### Resposta deferred

```php
public function observe (Closure $Observer): bool
```

Registra um observador terminal em um `Exchange`. A closure recebe `(Exchange $Exchange, null|int $code)`. Retorna `true` quando o observador foi enfileirado e `false` quando o exchange já havia finalizado e o observador rodou imediatamente.

```php
public function check (): bool
```

Se este exchange já alcançou sua transição terminal.

```php
public function finish (null|Response $Response): bool
```

Finaliza o exchange exatamente uma vez, retendo somente `$Response->code`. Passe `null` para cancelamento de transporte ou scheduler. Retorna `false` se ele já era terminal.

```php
public static function fetch (object $Owner): null|self
```

O exchange carregado por um alias `Request` ativo ou por um snapshot fraco retido.

```php
public static function attach (object $Scope, Disconnecting $Owner): void
```

Anexa um dono de teardown a um escopo. Se o escopo já estiver fechado, o `disconnect()` do dono é invocado imediatamente — uma vez por dono, para sempre.

```php
public static function detach (object $Scope, Disconnecting $Owner): void
```

Remove um dono cujo trabalho terminou normalmente. Ignorado em escopo fechado, cujas identidades notificadas ficam retidas como marcadores terminais.

```php
public static function close (object $Scope): void
```

Fecha um escopo e invoca `disconnect()` em cada dono anexado exatamente uma vez. Refechar é no-op.

```php
public static function check (object $Scope): bool
```

Se um escopo vivo ainda carrega pelo menos um dono anexado — a pergunta do reaper de ociosidade. `false` para um escopo fechado, um desconhecido ou um storage esvaziado por `detach()`.

```php
public function defer (Closure $work, int|float $timeout = 0): Response
```

Roda `$work` numa Fiber do pool que pode estacionar no reactor do worker. `$timeout` é o orçamento, em segundos, antes de um `Response\Timeout` ser entregue no ponto de espera; `0` usa `Response::$deferredTimeout`, onde `0` significa sem teto.

```php
public function interrupt (Fiber $Fiber, Throwable $Throwable): bool
```

(`Bootgly\ACI\Events\Scheduler`) Entrega `$Throwable` no ponto de suspensão de uma Fiber que este scheduler estacionou: a Fiber sai de todo assento de espera, é retomada com `Fiber::throw()` dentro do seu binding de segmento de execução, e o que ela suspender em seguida é enfileirado de novo — a geração dela fica intocada. Retorna `false` quando a Fiber não está estacionada neste scheduler (rodando, terminada, desanexada ou ligada a uma geração terminal, que é despejada em vez disso).

```php
final class Timeout extends RuntimeException
```

`Bootgly\WPI\Nodes\HTTP_Server_CLI\Response\Timeout` — entregue no ponto de suspensão de uma resposta deferred quando o orçamento dela estourou. `$timeout` (readonly, segundos) é o orçamento que estourou.
