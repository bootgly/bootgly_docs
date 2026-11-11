# TCP Server CLI

O TCP Server CLI é a base de servidor TCP de baixo nível do Bootgly PHP Framework. Ele expõe um runtime non-blocking, multi-worker, para protocolos customizados, serviços raw socket e camadas mais altas construídas sobre TCP — incluindo a própria pilha HTTP do Bootgly.

## Recursos

| Recurso | Descrição |
|---|---|
| **Runtime multi-worker** | Cria múltiplos workers para que cada processo aceite e trate conexões de forma independente. |
| **Sockets non-blocking** | Usa um event loop baseado em `stream_select()` para operações de leitura, escrita e aceite. |
| **Modos de operação** | Suporta `Daemon`, `Interactive`, `Monitor` e `Test`. |
| **Handler raw de pacotes** | Registre um único `on(Events::DataReceive, Closure $Callback)` que recebe entrada bruta e retorna saída bruta. |
| **Sinais e controle** | Pause, retome, recarregue, pare, inspecione conexões e veja estatísticas com sinais POSIX e comandos CLI. |
| **SSL/TLS** | Aceita conexões criptografadas por meio de opções SSL em stream contexts do PHP. |
| **Recuperação de workers** | O master recria um worker que morre a partir do próprio loop (nunca dentro do handler de `SIGCHLD`). Um slot cujos workers morrem antes de entrar no loop de eventos três vezes seguidas (um boot que sempre falha) é recriado após 0,5 s, dobrando até 5 s, enquanto um worker que já serviu é sempre recriado na hora. Um slot em espera mantém sua parte do socket de escuta, então cerca de uma em cada N conexões novas espera a próxima tentativa. Um fork recusado (um limite de processos atingido) mantém o master e o slot e é tentado de novo a cada segundo. |
| **Reciclagem de workers** | Um worker acima de `maxRequests` despachos (cada worker dentro de ±`jitter`) ou de `maxMemory` bytes é substituído na hora — o substituto aceita no mesmo socket de escuta enquanto ele drena como num reload, um worker drenando por slot (a próxima reciclagem do slot espera por ele), encerrado após o seu prazo — registrado como reciclagem, nunca como crash, sem espera crescente. |
| **Rebaixamento de privilégios** | Faça bind como root quando necessário e depois reduza para um usuário/grupo POSIX menos privilegiado. |
| **Estatísticas de conexão** | Acompanha leituras, escritas, bytes transferidos, erros e metadados de conexões ativas. |

## Bootstrapping com Projects

No Bootgly, servidores normalmente são iniciados por Projects. Um arquivo de projeto instancia o servidor, configura o socket e registra o handler de pacotes antes de chamar `start()`.

```php
use Bootgly\API\Projects\Project;
use Bootgly\API\Endpoints\Server\Modes;
use Bootgly\WPI\Interfaces\TCP_Server_CLI;
use Bootgly\WPI\Interfaces\TCP_Server_CLI\Configs;
use Bootgly\WPI\Interfaces\TCP_Server_CLI\Events;


return new Project(
	name: 'Demo TCP Server CLI',
	description: 'Demonstration project for Bootgly TCP Server CLI',
	version: '1.0.0',
	author: 'Bootgly',
	exportable: true,

	boot: function (array $arguments = [], array $options = []): void
	{
		$Server = new TCP_Server_CLI(Mode: match (true) {
			isset($options['f']) => Modes::Foreground,
			isset($options['i']) => Modes::Interactive,
			isset($options['m']) => Modes::Monitor,
			default => Modes::Daemon
		});

		$Server->configure(
			new Configs(
				host: '0.0.0.0',
				port: getenv('PORT') ? (int) getenv('PORT') : 8080,
				workers: 12
			)
		);

		$Server->on(
			Events::DataReceive,
			static fn ($input) => "HTTP/1.1 200 OK\r\nServer: Bootgly\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Length: 13\r\n\r\nHello, World!"
		);

		$Server->start();
	}
);
```

## Quick Start

O menor contrato público é simples: configure um socket de escuta, registre um callback de dados e retorne uma string para ser escrita de volta ao peer.

```php
use Bootgly\API\Endpoints\Server\Modes;
use Bootgly\WPI\Interfaces\TCP_Server_CLI;
use Bootgly\WPI\Interfaces\TCP_Server_CLI\Configs;
use Bootgly\WPI\Interfaces\TCP_Server_CLI\Events;


$Server = new TCP_Server_CLI(Modes::Monitor);

$Server->configure(
	new Configs(
		host: '0.0.0.0',
		port: 8080,
		workers: 4
	)
);

$Server->on(
	Events::DataReceive,
	static function (string $input): string {
		return "PONG\r\n";
	}
);

$Server->start();
```

O projeto demo retorna uma resposta HTTP crua diretamente da camada TCP:

```php
return static function ($input) {
	return <<<HTTP_RAW
	HTTP/1.1 200 OK
	Server: Bootgly
	Content-Type: text/plain; charset=UTF-8
	Content-Length: 13

	Hello, World!
	HTTP_RAW;
};
```

> [!IMPORTANT]
> Por padrão, `TCP_Server_CLI` trabalha com bytes / strings brutas. Framing de protocolo, parsing e formatação de resposta são responsabilidades da aplicação, a menos que você acople uma camada de encoder/decoder por cima.

## Modos de Operação

O construtor recebe um enum `Bootgly\API\Endpoints\Server\Modes`.

| Modo | Descrição |
|---|---|
| `Modes::Daemon` | Faz fork para segundo plano e mantém o processo master vivo sem interface. Quando `Logger::$Sinks` não está definido, instala o sink de arquivo padrão (`storage/logs/{channel}.log`) para um daemon nunca ficar sem log; um sink registrado antes do `start()` toma o lugar dele. |
| `Modes::Interactive` | Executa um loop CLI estilo REPL com comandos como `status`, `stop`, `pause` e `reload`. O prompt não bloqueia a supervisão: workers são recriados e sinais são tratados enquanto você digita (no libedit, um ESC, ^V ou ^R inacabado segura as recriações agendadas até a próxima tecla). Ctrl-D numa linha vazia para o servidor; uma entrada que não é um terminal (um pipe, `/dev/null`) é lida linha a linha e, quando termina, o master segue supervisionando até ser parado. |
| `Modes::Monitor` | Exibe uma tela de status em tempo real e faz hot-reload da camada de aplicação. |
| `Modes::Test` | Usa uma instância separada de estado de processo voltada para testes automatizados do servidor. |

Em todo modo exceto Test, o master também publica um **tap de logs ao vivo** por instância — um
socket unix ao lado dos arquivos PID ao qual o [`bootgly logs -f`](/guide/logs/overview/) se
anexa. Anexar arma o `Logger::$Tap` no master e em todos os workers; desanexar desarma, então um
servidor que ninguém olha não paga nada. Todo record que o master e seus workers escrevem carrega a
porta vinculada como campo `instance` (estampado em todo modo, Test incluído), então
`bootgly logs --instance=<porta>` isola um servidor tanto no backlog quanto ao vivo.

## Configuração

O `configure()` é variádico sobre value objects **Configs** — um por concern, aplicados em qualquer ordem antes da inicialização.
O transporte vive em `TCP_Server_CLI\Configs`:

| Parâmetro | Tipo | Padrão | Descrição |
|---|---|---|---|
| `host` | `string` | — | Host ou IP em que o socket de escuta será vinculado. |
| `port` | `int` | — | Porta TCP de escuta. |
| `workers` | `int` | — | Número de processos filhos criados via fork. |
| `secure` | `null\|array` | `null` | Opções seguras SSL/TLS de stream context do PHP para sockets TLS. |
| `user` | `null\|string` | `null` | Usuário POSIX para o qual o processo será rebaixado após o bind. |
| `group` | `null\|string` | `null` | Grupo POSIX para o qual o processo será rebaixado após o bind. |
| `maxRequests` | `int` | `0` (= desligado) | Despachos após os quais um worker é reciclado — neste servidor, conexões aceitas. Veja [Reciclagem de workers](#reciclagem-de-workers). |
| `jitter` | `float` | `0.1` | Dispersão do limite próprio de cada worker em torno de `maxRequests`, uma fração de `0` a `1` (`0.1` = ±10%). |
| `maxMemory` | `int\|string` | `0` (= desligado) | Memória real (`memory_get_usage(true)`) acima da qual um worker é reciclado: bytes, ou um tamanho em texto como `'512M'` (lido por `Bytes::parse()`). Precisa ficar abaixo do `memory_limit` — o `start()` recusa um que nenhum worker consegue respeitar (veja [Reciclagem de workers](#reciclagem-de-workers)). |

```php
use Bootgly\WPI\Interfaces\TCP_Server_CLI\Configs;


$Server->configure(
	new Configs(
		host: '0.0.0.0',
		port: 443,
		workers: 8,
		secure: [
			'local_cert'  => BOOTGLY_ROOT_DIR . '@/certificates/localhost.cert.pem',
			'local_pk'    => BOOTGLY_ROOT_DIR . '@/certificates/localhost.key.pem',
			'verify_peer' => false,
		],
		user: 'www-data',
		group: 'www-data'
	)
);
```

> [!IMPORTANT]
> Todo Configs aceita **apenas named arguments**. Seu primeiro parâmetro é um guard slot que você nunca preenche, então
> um `new Configs('0.0.0.0', 443, 8)` posicional levanta um `TypeError` em vez de vincular silenciosamente os valores errados.

Passar duas instâncias da mesma classe de Configs em uma mesma chamada de `configure()` lança `InvalidArgumentException`, e um
`configure()` que nunca carregou `host`, `port` e `workers` lança `ArgumentCountError`.

### SSL/TLS

Quando `secure` não está vazio, o servidor armazena o contexto seguro SSL/TLS e executa um handshake TLS para cada conexão aceita. O socket principal de escuta permanece com crypto desabilitado; o handshake acontece em cada objeto de conexão.

> [!NOTE]
> O handshake é executado durante a criação da conexão. Se você espera um volume alto de tráfego TLS, vale medir o custo desse passo no seu workload.

### Rebaixamento de privilégios

Se você fizer bind em portas privilegiadas, pode iniciar como root e depois rebaixar o processo após a criação do socket:

```php
$Server->configure(
	new Configs(
		host: '0.0.0.0',
		port: 443,
		workers: 4,
		secure: [/* ... */],
		user: 'www-data',
		group: 'www-data'
	)
);
```

O Bootgly resolve o UID/GID de destino, inicializa grupos suplementares e então aplica `setgid()` / `setuid()` nessa ordem.

Os workers rodam como esse usuário desde a primeira requisição, então o que eles escrevem no diretório de storage já precisa ser deles. Antes do fork, uma inicialização como root com `user` prepara os diretórios de storage que os workers do nó escrevem — no `HTTP_Server_CLI`, `storage/sessions` (a chave e os registros de sessão, só para o dono); em todo nó, a árvore de cache própria dos workers, `storage/cache-<uid>` (templates compilados, caches de arquivo padrão), cujos problemas só geram aviso — os workers passam a usar um diretório temporário privado:

| Encontrado | O que acontece |
| --- | --- |
| Ausente | Criado com o modo do nó (`0700` para os dois) e entregue ao `user`. |
| Já é do `user`, sem permissão de escrita para grupo ou outros além desse modo | Usado como está — nunca recebe chown de novo. |
| Um diretório de outro dono | O servidor não inicia: registra `Server not started: storage/<nome> is not <user>'s …` com o `chown -R` a rodar e sai com status 1. |
| Do `user`, mas gravável pelo grupo ou por todos | O servidor não inicia e indica o `chmod` a rodar. |
| Um link simbólico, ou algo que não é diretório | O servidor não inicia: o diretório de um worker nunca é um destino escolhido por outra pessoa. |

O `storage/cache` não é entregue: código executado como root — um comando de CLI, o runner de testes — lê o que ele guarda. Um ancestral de um diretório de worker que outra conta poderia substituir — um link, que não é do root nem do `user`, ou gravável pelo grupo ou por todos sem o sticky bit — é informado num aviso com o ancestral, a causa e o remédio (o armazenamento de sessões padrão recusa esse caminho; os caches dos workers vão para um diretório temporário privado), uma vez por diretório, mas não impede o servidor de subir. Para `cache-<uid>`, um link que pertence ao root ou ao `user` não é informado por si só: o cache resolve a sua raiz de storage, então o aviso verifica para onde o link leva.

O master se rebaixa logo após o fork; cada worker se rebaixa assim que seu listener está pronto. O master espera até conseguir sinalizar todos os workers (até 5 segundos) antes de o `start()` seguir, então um comando ou um stop enviado logo após o servidor subir chega a todos os workers.

### Reciclagem de workers

Um worker pode ser substituído de propósito, para limitar o que ele acumula numa vida longa — um
vazamento, um cache que só cresce, um heap fragmentado. Dois gatilhos, ambos desligados por padrão:

```php
use Bootgly\WPI\Interfaces\TCP_Server_CLI\Configs;


$Server->configure(
	new Configs(
		host: '0.0.0.0',
		port: 8080,
		workers: 4,
		maxRequests: 5_000, // recicla um worker após cerca de 5 000 conexões...
		jitter: 0.1,        // ...cada worker no seu próprio limite, dentro de ±10% (o padrão)
		maxMemory: '96M'    // ...ou quando sua memória real passar de 96 MiB
	)
);
```

O `maxMemory` precisa ficar abaixo do `memory_limit` do PHP (`128M` por padrão): além desse limite um
worker morre com um erro fatal antes de conseguir reciclar. Aumente o `memory_limit` para usar um teto
maior.

**O que conta é o despacho do nó.** Este servidor conta cada conexão que aceita — TCP puro não tem
fronteira de requisição. O [servidor HTTP](/manual/WPI/HTTP/HTTP_Server_CLI/overview/#reciclagem-de-workers)
conta requisições (cada requisição que uma conexão keep-alive carrega), e o
[servidor WebSocket](/manual/WPI/WS/WS_Server_CLI/overview/) conta conexões. Um único contador vive no
transporte; um nó que conta outra coisa chama `TCP_Server_CLI::count()` uma vez por despacho e o
declara em `DISPATCH`.

**Cada worker sorteia o seu próprio limite** ao subir: a faixa `maxRequests ± jitter` é dividida em
uma banda por worker e cada worker sorteia dentro da sua, então os workers nunca reciclam juntos; um
substituto sorteia de novo. **`maxMemory`** é comparado com `memory_get_usage(true)` a cada despacho —
neste servidor, quando uma conexão é aceita: uma conexão longa que faz a memória do worker crescer não
dispara nada até a próxima chegar. `0` desliga um gatilho; um valor negativo, um `jitter` fora de `0`–`1` ou um tamanho que não é
interpretável lança `InvalidArgumentException` ao construir a Configs.

Quando um gatilho dispara, **o worker antigo e o seu substituto se sobrepõem**: o worker avisa o master
na hora, e o master cria o substituto por fork, no próprio socket de escuta pré-vinculado do slot, de
imediato — o slot nunca fica sem um worker aceitando. Enquanto isso o worker antigo **drena como na
drenagem de um reload**: sai do conjunto de accept, serve as conexões que segura até elas fecharem (no
máximo `drainTimeout`, 30 s, quando as restantes são fechadas) e sai com o status
`TCP_Server_CLI::RECYCLE` (75). O master o recolhe como o worker reciclado que já substituiu — sem um
segundo fork:

```text
NOTICE: Worker (PID: 50609) recycling: 4877 connections reached its limit of 4877; draining...
NOTICE: Worker #2 (PID: 50609) recycling, forking its replacement...
NOTICE: Worker #2 recovered (new PID: 51400)
NOTICE: Worker #2 (PID: 50609) recycled.
```

Quão cedo o master ouve o aviso depende do modo: nos modos Foreground e Daemon ele acorda com o aviso na
hora, no modo Monitor dentro do seu turno de 30 ms, e no modo Interactive — cujo prompt não consegue
esperar por ele — em até 50 ms enquanto a reciclagem está ligada. Um worker que sai antes de o master
ouvi-lo (um sem nada para drenar, por exemplo) é recolhido primeiro e registrado como
`Worker #2 (PID: 50609) recycled, reforking...` — uma reciclagem do mesmo jeito, recriada na hora. Dentro da
barreira de inicialização de um nó (a [inicialização com Auto-TLS do servidor HTTP](/manual/WPI/HTTP/HTTP_Server_CLI/overview/#reciclagem-de-workers)),
o substituto espera a inicialização terminar.

O que o worker antigo devolve antes depende do nó: o [servidor HTTP](/manual/WPI/HTTP/HTTP_Server_CLI/overview/#reciclagem-de-workers)
fecha na hora as suas conexões keep-alive ociosas e manda um GOAWAY ao HTTP/2, o
[servidor WebSocket](/manual/WPI/WS/WS_Server_CLI/overview/) fecha as suas sessões com `1001 Going Away`.
TCP puro não distingue um fluxo ocioso de um prestes a falar, então este servidor mantém cada conexão
até o par fechá-la ou o `drainTimeout` encerrar a drenagem — conexões novas chegam ao substituto
enquanto isso.

**Uma reciclagem nunca multiplica os processos, nem encurta uma drenagem.** Um slot drena um worker
por vez: um substituto criado enquanto o worker anterior do seu slot ainda drena — um download lento, um
stream, um cliente que mantém uma conexão aberta — e que atinge o seu próprio limite nesse meio-tempo
**segura a sua reciclagem**. Ele continua servindo, ainda aceitando, além de `maxRequests` (e além de
`maxMemory`: um teto pode ser ultrapassado por até uma drenagem), até o master avisar que o worker
antigo saiu; então ele recicla na hora, e diz isso. O trabalho em andamento do worker antigo mantém todo
o seu `drainTimeout`:

```text
NOTICE: Worker #2 (PID: 50609) recycled.
NOTICE: Worker (PID: 51400) held its recycle while its slot's previous worker drained; recycling now.
NOTICE: Worker (PID: 51400) recycling: 4919 connections reached its limit of 4919; draining...
```

O worker lê o aviso do master uma vez por segundo. Um aposentado que ainda drena `drainTimeout` + 5 s
após o início da sua reciclagem é encerrado, como um reload limita a sua própria drenagem — um handler
que bloqueia (um sleep, uma chamada sem timeout) impede que o próprio timer de drenagem do aposentado
dispare — e isso também libera a próxima reciclagem do seu slot. Assim um servidor nunca roda mais que
2 × `workers` processos de worker, e um cliente que prende um aposentado só atrasa a próxima reciclagem
do seu slot, em no máximo uma drenagem:

```text
WARNING: Worker #2 (PID: 50609) killed, still draining past its deadline (drainTimeout + 5 s); its replacement serves the slot.
```

Um aposentado continua sendo um dos processos do servidor: os comandos, o `logs -f`, o `stats` e o
`connections` o alcançam, o `status` o conta (`+1 retiring`), o `stop` — e o `project stop`, caso o
master não responda — o encerra, e o estado persistido o lista em `retirees` até ele sair. Uma pausa o
deixa em paz (ele já não aceita nada), e um substituto criado enquanto o servidor está pausado sobe
pausado, até o `resume` — alternar entre os consoles Monitor e Interactive mantém o servidor pausado.

Uma reciclagem nunca é registrada como crash e nunca prolonga a espera crescente do seu slot — ela
encerra uma sequência de crashes, como qualquer worker que serviu. A prova é o aviso, não o status de
saída: um worker que sai com 75 sem ter avisado uma reciclagem (no boot, por exemplo) é um crash como
qualquer outro, com espera crescente se continuar morrendo antes de servir. Uma reciclagem substitui
um worker criado por fork do master em execução; mudanças de código ainda pedem o `reload`. Um
servidor em `Modes::Test` nunca recicla, já que o seu master nunca recria workers.

**Um teto de memória que nenhum worker consegue respeitar é recusado.** O `start()` sai com
`Server not started: maxMemory (…) …` quando `maxMemory` não está acima da memória com que um worker
começa (todo worker reciclaria no primeiro despacho, e cada substituto depois dele), ou não está abaixo
do `memory_limit` (o erro fatal do PHP viria primeiro). Um `reload` nunca derruba uma instância em
serviço por isso — os seus workers antigos já foram drenados: o master novo registra
`Reloaded without a memory ceiling: …` e continua servindo com o teto desligado até o próximo start. Um
worker que o próprio boot — um listener de `Worker::Boot`, por exemplo — leva além de `maxMemory`
continua servindo com o seu teto de memória desligado e registra um erro dizendo isso: nunca um fork
por despacho. E um worker cujo canal de aviso o master não conseguiu criar (faltaram descritores) não
consegue avisar uma reciclagem, nem ouvir o aviso do master: ele registra um aviso e não recicla, em vez
de drenar sem substituto.

## Handler de Dados

`TCP_Server_CLI` expõe um único método público para registrar o handler:

```php
$Server->on(
	Events::DataReceive,
	function (string $input): string {
		return strtoupper($input);
	}
);
```

O callback é armazenado como handler de dados do lado do servidor e executado pelos workers quando há dados prontos para processamento.

### Contrato de entrada e saída

| Lado | Contrato padrão |
|---|---|
| Entrada | Bytes brutos lidos do socket do cliente. |
| Saída | Bytes brutos escritos de volta no mesmo socket. |
| Contexto de execução | Roda dentro do processo worker que está tratando a conexão. |

Se uma camada de decoder/encoder for instalada, ela pode pré-processar a entrada ou modelar a saída antes do handler. Para a API pública, porém, o modelo mental mais seguro continua sendo “entrada bruta entra, saída bruta sai”.

## Ciclo de Vida do Servidor

O status do runtime segue o ciclo de vida do enum do servidor:

```text
Booting → Configuring → Starting → Running → Paused → Stopping
```

- **Booting** inicializa logger, conexões, event loop e estado do processo.
- **Configuring** armazena host, port, workers e SSL.
- **Starting** inicializa a aplicação, instala sinais e cria os workers.
- **Running** aceita conexões e dirige o event loop.
- **Paused** remove temporariamente o socket de escuta do event loop do worker.
- **Stopping** encerra workers e limpa arquivos de estado do processo.

## Sinais e Comandos CLI

O processo master do servidor expõe uma superfície rica de controle.

| Sinal / comando | Efeito |
|---|---|
| `SIGINT`, `SIGTERM`, `stop` | Para o servidor e encerra os workers. |
| Ctrl-D (Interactive) | Numa linha vazia, para o servidor como `stop`. |
| `SIGTSTP`, `pause` | Só no modo Interactive — `Daemon` e `Foreground` ignoram `SIGTSTP`. Pausa o serving: os workers saem do accept enquanto o master continua supervisionando (workers que morrem seguem sendo reforkados) e o console permanece interativo. `bootgly project show` reporta a instância como `paused`. No modo Monitor, SIGTSTP troca para Interactive. |
| `SIGCONT`, `resume` | Retoma um servidor pausado: os workers voltam ao accept e o status retorna a Running. Um worker cujo socket de escuta não consegue voltar ao selector (as entradas estão ocupadas por esperas de dependências) registra uma mensagem crítica, continua Paused e tenta de novo a cada segundo até entrar — ele nunca reporta Running sem aceitar nada. Um `pause` cancela uma nova tentativa pendente e o worker continua Paused; um `resume` bem-sucedido também a cancela. |
| `SIGUSR2`, `reload` | Recarrega o estado da aplicação nos workers. |
| `SIGIOT`, `connections` | Imprime informações das conexões ativas. |
| `SIGIO`, `stats` | Imprime estatísticas de conexões e tráfego; `stats reset` as zera. |
| `status` | Renderiza uma visão geral do estado do servidor no terminal. |
| `monitor` | Entra no modo de monitoramento em tempo real. |
| `check jit`, `error on/off` | Utilidades operacionais e de debugging. |

> [!NOTE]
> Os comandos interativos são, principalmente, recursos do processo master. Os workers continuam focados em I/O e tratamento de conexões.

## Arquitetura Master / Worker

O servidor usa uma arquitetura clássica baseada em `fork()`:

```text
Processo master
├── Worker #1 → bind do socket → event loop
├── Worker #2 → bind do socket → event loop
├── …
└── Worker #N → bind do socket → event loop
```

- O **master** instala sinais, salva o estado do processo, monitora workers e recria um substituto se algum cair — com espera crescente para um slot cujos workers continuam morrendo no boot — ou reciclar — criando o substituto assim que o worker avisa a reciclagem, enquanto o antigo drena (um aposentado por slot: a próxima reciclagem do slot espera por ele, e ele é encerrado após o seu prazo) — registrado como reciclagem. Um reload cujo fork do relay é recusado é abortado, e o servidor continua servindo.
- Cada **worker** cria seu próprio socket de servidor com `SO_REUSEPORT` e entra no event loop compartilhado `Select`. O worker entrega os sinais do servidor a esse loop, que executa os handlers entre callbacks (veja [Select](/manual/WPI/Events/Select/overview/)).
- Os sockets aceitos são encapsulados em objetos de conexão que acompanham peer remoto, timers, escritas e status da conexão.

As opções de socket configuradas por padrão incluem:

- `backlog: 102400`
- `so_reuseport: true`
- `ipv6_v6only: false`
- `SO_KEEPALIVE`
- `TCP_NODELAY`

## Event Loop e Conexões

Cada worker adiciona o socket principal de escuta ao event loop com um evento de aceite/conexão. Os peers aceitos passam então a ser monitorados para leitura e escrita.

O selector admite `1000` entradas por tabela de descriptors (`Select::CAPACITY`), compartilhadas entre os sockets de clientes e o próprio I/O de dependências do worker — esperas deferred de banco/KV, o cliente HTTP embarcado. `TCP_Server_CLI::$headroom` (padrão `32`; os servidores HTTP e WebSocket o expõem como `headroom:` nas suas Configs) mantém essa quantidade de entradas livre descartando clientes quando um worker já segura `1000 − headroom` conexões, antes de `$maxConnections` quando este é maior. O socket de escuta do worker ocupa uma dessas entradas (o relay de broadcast de um worker WebSocket, mais uma), então dimensione-o para pelo menos a soma dos `pool.max` dos resources do worker mais uma para o socket de escuta (e mais uma para o relay); `0` o desativa, e ele é limitado para que um worker sempre admita clientes. Um descriptor fechado enquanto ainda registrado — uma sessão de dependência derrubada enquanto outro Fiber aguarda o socket dela — é removido do selector e quem o aguardava é retomado para observar o fechamento, em vez de derrubar o worker.

Na camada de conexão, o Bootgly acompanha:

- IP e porta remotos
- instante de criação e último uso
- estado do handshake TLS
- contadores de escrita e estatísticas globais de leitura/escrita
- timers de expiração por ociosidade, semeados por `TCP_Server_CLI::$connectionIdleTimeout` (padrão `15` segundos; o servidor HTTP o expõe como `new HTTP_Server_CLI\Configs(connectionIdleTimeout: ...)`) — trabalho deferred pendente conta como atividade
- verificações opcionais de blacklist

A saída que um peer ainda não leu fica em memória até o socket drenar, cobrada pelo que o alocador do PHP gasta para mantê-la (uma string acima de cerca de 680 KiB é cobrada como um chunk inteiro de 2 MiB), contra dois tetos: `TCP_Server_CLI::$maxPendingBytes` (12 MiB) por conexão e `TCP_Server_CLI::$maxWorkerPendingBytes` (64 MiB) por worker — o orçamento de memória do worker, no qual os servidores HTTP e WebSocket também cobram os seus corpos de requisição, mensagens inacabadas e cache de rotas. Uma escrita que não cabe derruba aquela conexão. Na partida, o orçamento do worker é reduzido para metade do `memory_limit`, com um aviso, quando é maior; `memory_limit = -1` o mantém.

Veja `Connection` e `Packages` para os detalhes de nível mais baixo.

## Exemplo Completo

```php
use Bootgly\API\Projects\Project;
use Bootgly\API\Endpoints\Server\Modes;
use Bootgly\WPI\Interfaces\TCP_Server_CLI;
use Bootgly\WPI\Interfaces\TCP_Server_CLI\Configs;
use Bootgly\WPI\Interfaces\TCP_Server_CLI\Events;


return new Project(
	name: 'Demo TCP Server CLI',
	description: 'Demonstration project for Bootgly TCP Server CLI',
	version: '1.0.0',
	author: 'Bootgly',
	exportable: true,

	boot: function (array $arguments = [], array $options = []): void
	{
		$Server = new TCP_Server_CLI(Mode: match (true) {
			isset($options['f']) => Modes::Foreground,
			isset($options['i']) => Modes::Interactive,
			isset($options['m']) => Modes::Monitor,
			default => Modes::Daemon
		});

		$Server->configure(
			new Configs(
				host: '0.0.0.0',
				port: getenv('PORT') ? (int) getenv('PORT') : 8080,
				workers: 12
			)
		);

		$Server->on(
			Events::DataReceive,
			static fn ($input) => "HTTP/1.1 200 OK\r\nServer: Bootgly\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Length: 13\r\n\r\nHello, World!"
		);

		$Server->start();
	}
);
```
