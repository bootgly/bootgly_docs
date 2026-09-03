# TCP Client CLI

O TCP Client CLI é o cliente TCP de baixo nível do Bootgly para protocolos customizados, geração de carga e fluxos de socket event-driven. Ele é a base sob clientes de nível mais alto e uma forma prática de scriptar tráfego TCP bruto em PHP puro.

## Recursos

| Recurso | Descrição |
|---|---|
| **Conexão assíncrona** | Abre sockets com `STREAM_CLIENT_ASYNC_CONNECT` e completa a conexão pelo event loop. |
| **API baseada em callbacks** | Expõe hooks para boot do worker, conexão, desconexão, leitura e escrita. |
| **Modo multi-worker** | Pode criar workers para benchmarking ou carga de saída coordenada. |
| **I/O raw de pacotes** | Lê e escreve payloads brutos sem impor formato de protocolo. |
| **SSL/TLS** | Suporta TLS por meio de opções SSL em stream contexts do PHP. |
| **Modo monitor** | Mantém o processo master anexado enquanto os workers executam, útil para observação e benchmarks. |
| **PHP puro** | Sem cURL e sem extensões externas obrigatórias. |

## Quick Start

Para uma única conexão TCP, configure o cliente, enfileire bytes no `connect`, troque para modo de leitura após a escrita e feche quando terminar.

```php
use Bootgly\WPI\Interfaces\TCP_Client_CLI;
use Bootgly\WPI\Interfaces\TCP_Client_CLI\Configs;
use Bootgly\WPI\Interfaces\TCP_Client_CLI\Events;


$Client = new TCP_Client_CLI;

$Client->configure(
	new Configs(
		host: '127.0.0.1',
		port: 8080
	)
);

$Client
	->on(Events::ClientConnect, function ($Socket, $Connection) {
		$Connection->output = "PING\r\n";

		$Connection->Client->Event->add(
			$Socket,
			$Connection->Client->Event::EVENT_WRITE,
			$Connection
		);
	})
	->on(Events::DataRead, function ($Socket, $Connection, $Package) {
		echo $Package->input;
		$Connection->close();
	})
	->on(Events::DataWrite, function ($Socket, $Connection, $Package) {
		$Connection->Client->Event->add(
			$Socket,
			$Connection->Client->Event::EVENT_READ,
			$Connection
		);
	});

$Client->start();
```

O projeto demo usa modo monitor e um payload HTTP simples para dirigir o servidor por 10 segundos:

```php
$Client
	->on(Events::WorkerStarted, function ($Client) {
		$Socket = $Client->connect();

		if ($Socket) {
			$Client->Event->loop();
		}
	})
	->on(Events::ClientConnect, function ($Socket, $Connection) {
		$Connection->output = "GET / HTTP/1.1\r\nHost: localhost:8080\r\n\r\n";

		$Connection->Client->Event->add($Socket, $Connection->Client->Event::EVENT_WRITE, $Connection);
	});
```

## Modos

O construtor recebe uma das constantes de modo do cliente.

| Modo | Descrição |
|---|---|
| `TCP_Client_CLI::MODE_DEFAULT` | Modo single-process. Chama `connect()` e entra no event loop automaticamente quando não há hook `Events::WorkerStarted`. |
| `TCP_Client_CLI::MODE_MONITOR` | Executa workers e mantém o processo master vivo em monitoramento até você parar o cliente. |
| `TCP_Client_CLI::MODE_TEST` | Modo leve que pula a infraestrutura de processo/comandos para testes ou harnesses internos. |
| `TCP_Client_CLI::MODE_EMBEDDED` | Modo biblioteca para um cliente que vive dentro de outro processo — tipicamente um worker de servidor HTTP. Pula a infraestrutura de processo/comandos como o `MODE_TEST` e, além disso, não mexe nas `Vars` globais de debugging: quem controla tudo isso é o processo hospedeiro. Combine com `react()` para rodar no reactor do hospedeiro. |

## Configuração

O `configure()` é variádico sobre value objects **Configs** — um por concern, aplicados em qualquer ordem.
O transporte vive em `TCP_Client_CLI\Configs`:

| Parâmetro | Tipo | Padrão | Descrição |
|---|---|---|---|
| `host` | `string` | — | Host remoto ou IP para conexão. |
| `port` | `int` | — | Porta TCP remota. |
| `workers` | `int` | `0` | Número de workers a criar via fork. |
| `secure` | `null\|array` | `null` | Opções seguras SSL/TLS de stream context do PHP para negociação TLS. |

```php
use Bootgly\WPI\Interfaces\TCP_Client_CLI\Configs;


$Client->configure(
	new Configs(
		host: 'secure.example.com',
		port: 443,
		workers: 4,
		secure: [
			'peer_name' => 'secure.example.com',
			'verify_peer' => true,
			'verify_peer_name' => true,
		]
	)
);
```

> [!IMPORTANT]
> Todo Configs aceita **apenas named arguments**. Seu primeiro parâmetro é um guard slot que você nunca preenche, então
> um `new Configs('secure.example.com', 443)` posicional levanta um `TypeError` em vez de vincular silenciosamente os valores errados.

Passar duas instâncias da mesma classe de Configs em uma mesma chamada de `configure()` lança `InvalidArgumentException`, e um
`configure()` que nunca carregou `host` e `port` lança `ArgumentCountError`.

## Hooks

Registre callbacks de runtime com `on()`:

| Evento | Assinatura | Finalidade |
|---|---|---|
| `Events::WorkerStarted` | `Closure(TCP_Client_CLI $Client)` | Executa quando um worker inicializa; útil para lógica customizada de conexão. |
| `Events::ClientConnect` | `Closure($Socket, $Connection)` | Executa quando o objeto de conexão está estabelecido e pronto. |
| `Events::ClientDisconnect` | `Closure($Connection)` | Executa depois que o socket é fechado e removido do pool do cliente. |
| `Events::DataWrite` | `Closure($Socket, $Connection, $Package)` | Executa depois da escrita; normalmente muda o socket para leitura. |
| `Events::DataRead` | `Closure($Socket, $Connection, $Package)` | Executa após a leitura de dados de entrada. |

> [!IMPORTANT]
> `Connection` herda o estado de pacote, então o mesmo objeto carrega metadados do socket e também `output`, `input`, contadores e dados de expiração.

## Adoção de reactor

Cada instância do cliente tem o seu próprio reactor `Select`, construído no construtor sobre as suas próprias `Connections` e legível como `$Client->Event`. Esse é o padrão: o cliente dirige o próprio event loop e `start()` o executa.

Um cliente embarcado em outro runtime não pode fazer isso — um segundo loop dentro de um processo que já tem um nunca chega a rodar. `react()` entrega ao cliente o reactor que aquele runtime já possui:

```php
$Client->react($Event);
```

A partir dessa chamada o cliente está *adotado*:

- `$Client->owned` passa a ser `false`.
- `start()` lança `LogicException`. O modo event-driven é dono do reactor por definição, então os dois modelos de posse são exclusivos.
- `halt()` nunca destrói o loop; ele libera apenas a contabilidade do próprio cliente.

A adoção precisa vir antes de qualquer conexão ser aberta — chamar `react()` depois disso lança `LogicException`.

### O wait bridge

Um cliente adotado também não pode bloquear: um `stream_select()` bloqueante dentro de um worker congela todas as outras conexões que aquele worker atende. `schedule()` instala o bridge que transforma essas esperas bloqueantes em parks:

```php
$Client->schedule(function (mixed $value = null): void {
	Fiber::suspend($value);
});
```

O bridge é uma closure que recebe um `Readiness` — ou um resource raw, ou `null` — e suspende a Fiber chamadora nele. Cabe ao hospedeiro retomar essa Fiber quando a readiness chegar, o que do lado do reactor é `schedule (Fiber $Fiber, mixed $value = null, int $flag = self::SCHEDULE_READ): bool`. É o mesmo contrato que os response resources do servidor HTTP usam.

Com um bridge instalado, e apenas enquanto a chamada roda sobre uma Fiber, as duas esperas bloqueantes de um dial viram parks:

- **`connect()` faz park em write readiness.** Primeiro vem uma sondagem não bloqueante, para que um dial que já resolveu não pague uma ida e volta ao reactor. Depois, fatias finitas de 1 s: cada fatia reprova o deadline do dial — `connectTimeout`, estreitado por `$deadline` e `$monotonicDeadline` quando definidos — nos dois relógios, o de parede e o monotônico, e cada acordar ressonda o socket sem bloquear.
- **O handshake TLS faz park em read readiness**, nas mesmas fatias de 1 s contra os mesmos dois deadlines, entre as tentativas de `stream_socket_enable_crypto()`.

A falha continua determinística — o cliente nunca entra em spin:

| Situação | Resultado |
|---|---|
| O bridge para de suspender | Um tripwire conta 8 esperas consecutivas que retornaram em menos de 100 µs com o socket ainda não pronto e então falha o dial (ou o handshake), registrando em log. |
| O reactor recusa o socket | Uma rejeição de `selector admission` — o orçamento de fds acabou — falha o dial (ou o handshake) de forma determinística e registra em log. |
| O bridge lança qualquer outra coisa | A exceção propaga para o chamador. No handshake ela é relançada depois que a conexão é fechada, nunca disfarçada de falha de TLS. |
| A Fiber é desenrolada no meio do dial | O socket é fechado em um `finally`. Ele ainda não está registrado em reactor nenhum, então nada mais o fecharia. |

A adoção e o bridge são o mecanismo, não a API do dia a dia. As formas prontas são o [`HTTP_Client_CLI`](../HTTP/HTTP_Client_CLI) em modo embarcado e o response resource HTTP alcançado como `$Response->Upstream`, que já ligam `react()` e `schedule()` por você — veja as páginas deles. Use o `TCP_Client_CLI` diretamente apenas quando estiver embarcando um protocolo TCP raw dentro de um runtime hospedeiro.

```php
use Fiber;

use Bootgly\WPI\Interfaces\TCP_Client_CLI;
use Bootgly\WPI\Interfaces\TCP_Client_CLI\Configs;


// $Event é o reactor do runtime hospedeiro; este código roda sobre uma Fiber dirigida por ele.
$Client = new TCP_Client_CLI(TCP_Client_CLI::MODE_EMBEDDED);

$Client
	->react($Event)
	->schedule(function (mixed $value = null): void {
		// Um Readiness, um resource ou null: entregue ao hospedeiro e suspenda
		// até o reactor retomar esta Fiber.
		Fiber::suspend($value);
	})
	->configure(
		new Configs(
			host: '127.0.0.1',
			port: 8080
		)
	);

$Socket = $Client->connect();
```

## Fluxo de Conexão

### Cliente autônomo

O ciclo de vida padrão, em que o cliente é dono do loop e o executa:

```text
configure() → start() → connect() → EVENT_CONNECT → Events::ClientConnect → EVENT_WRITE → Events::DataWrite → EVENT_READ → Events::DataRead → close()
```

- `connect()` abre o socket com `STREAM_CLIENT_ASYNC_CONNECT | STREAM_CLIENT_CONNECT`.
- Se a conexão não completar imediatamente, o cliente agenda um evento futuro de conexão no event loop, limitado pelo deadline do dial.
- Quando a conexão é estabelecida, o hook `Events::ClientConnect` é chamado.
- Os callbacks de escrita e leitura passam então a conduzir a conversa do protocolo.

### Cliente adotado

Com um reactor hospedeiro e um wait bridge, o dial é um park em vez de um evento de conexão agendado:

```text
configure() → react() → schedule() → connect() → park on write readiness → [TLS: park on read readiness] → Events::ClientConnect → EVENT_WRITE → Events::DataWrite → EVENT_READ → Events::DataRead → close()
```

- `start()` nunca é chamado — o processo hospedeiro já executa o loop.
- Nenhum `EVENT_CONNECT` é armado: a Fiber chamadora faz park em write readiness e retoma quando o reactor a sinaliza.
- Com `secure` configurado, o handshake então faz park em read readiness entre as tentativas de negociação.
- Da conexão estabelecida em diante nada muda: os mesmos hooks disparam, no loop do hospedeiro.

## Leitura e Escrita de Dados Brutos

`TCP_Client_CLI` não impõe framing ou boundaries de mensagem. Você decide o que entra em `output` e como `input` será interpretado.

Fluxo típico:

1. definir `$Connection->output`
2. agendar `EVENT_WRITE`
3. no `write`, agendar `EVENT_READ`
4. inspecionar `$Package->input` em `read`
5. fechar ou continuar a conversa

A camada de pacotes acompanha bytes lidos/escritos, contagem de reads/writes, erros de transporte e estado de expiração.

## SSL/TLS

Quando `secure` é passado para `configure()`, o cliente mescla essas opções ao contexto do socket e executa um handshake TLS na conexão.

```php
$Client->configure(
	new Configs(
		host: 'secure.example.com',
		port: 443,
		secure: []
	)
);
```

O objeto de conexão negocia TLS com métodos de crypto do cliente para TLS 1.2 / 1.3.

## Multi-worker e Monitoramento

Quando `workers > 0`, o cliente instala sinais de processo, cria workers e persiste o estado do processo para o master. Isso é especialmente útil para benchmarks, testes repetitivos de protocolo ou geração de carga de saída.

O modo monitor mantém o processo master anexado e registra o ciclo de vida dos workers até que você pare o cliente.

## Notas de Runtime

- A expiração padrão da conexão é `10` segundos.
- A camada de pacotes tenta um `fread()` extra não bloqueante em sockets TLS para drenar bytes descriptografados que possam estar bufferizados.
- `MODE_TEST` pula intencionalmente a infraestrutura de processo/comandos.
- A superfície de comandos interativos é propositalmente mínima em comparação com `TCP_Server_CLI`.

> [!WARNING]
> **Breaking change na v1.0.0-beta.5.** O reactor, os hooks de transporte e os contadores agora são por instância. O antigo estático `TCP_Client_CLI::$Event` não existe mais — leia `$Client->Event`, ou `$Connection->Client->Event` de dentro de um hook. Código que referenciava o estático precisa ser atualizado. Em troca, dois clientes no mesmo processo não compartilham (nem sobrescrevem) loop, callbacks ou estatísticas.

Veja [`Connection`](./TCP_Client_CLI/Connection) e [`Packages`](./TCP_Client_CLI/Packages) para os detalhes de baixo nível sobre sockets e pacotes.

## Exemplo Completo

```php
use function getenv;

use Bootgly\ACI\Events\Timer;
use Bootgly\API\Projects\Project;
use Bootgly\WPI\Interfaces\TCP_Client_CLI;
use Bootgly\WPI\Interfaces\TCP_Client_CLI\Configs;
use Bootgly\WPI\Interfaces\TCP_Client_CLI\Events;


return new Project(
	name: 'Demo TCP Client CLI',
	description: 'Demonstration project for Bootgly TCP Client CLI',
	version: '1.0.0',
	author: 'Bootgly',
	exportable: true,

	boot: function (array $arguments = [], array $options = []): void
	{
		$Client = new TCP_Client_CLI(TCP_Client_CLI::MODE_MONITOR);
		$Client->configure(
			new Configs(
				host: '127.0.0.1',
				port: getenv('PORT') ? (int) getenv('PORT') : 8082,
				workers: 1
			)
		);

		$Client
			->on(Events::WorkerStarted, function ($Client) {
				$Socket = $Client->connect();

				if ($Socket) {
					$Client->Event->loop();
				}
			})
			->on(Events::ClientConnect, function ($Socket, $Connection) {
				Timer::add(
					interval: 10,
					handler: function ($Connection) {
						$Connection->close();
					},
					args: [$Connection],
					persistent: false
				);

				$Connection->output = "GET / HTTP/1.1\r\nHost: localhost:8080\r\n\r\n";

				$Connection->Client->Event->add($Socket, $Connection->Client->Event::EVENT_WRITE, $Connection);
			})
			->on(Events::ClientDisconnect, function ($Connection) use ($Client) {
				$Client->Logger->log(
					'Connection #' . $Connection->id . ' (' . $Connection->address . ':' . $Connection->port . ')'
					. ' from Worker with PID @_:' . $Client->Process->id . '_@ was closed! @\\;'
				);
			})
			->on(Events::DataWrite, function ($Socket, $Connection, $Package) {
				$Connection->Client->Event->add($Socket, $Connection->Client->Event::EVENT_READ, $Connection);
			});

		$Client->start();
	}
);
```

## Referência

```php
public const int MODE_EMBEDDED = 4;
```

Modo embarcado/biblioteca, passado ao construtor: `new TCP_Client_CLI(TCP_Client_CLI::MODE_EMBEDDED)`. O cliente roda dentro do runtime de outro processo, então não pega lock de estado do `Process`, não monta superfície de `Commands`/Terminal, não dispara `SIGINT` de shutdown e não sobrescreve as `Vars` de debugging — tudo isso pertence ao hospedeiro.

```php
public protected(set) Events & Loops & Scheduler $Event;
```

O reactor em uso por esta instância. Todo cliente constrói o seu próprio `Select` sobre as suas `Connections` e o mantém, a menos que `react()` o substitua. Leitura pública, escrita apenas de dentro da classe.

```php
public protected(set) bool $owned = true;
```

Se este cliente ainda é dono — e pode destruir — o seu reactor. `react()` põe em `false`; a partir daí `halt()` deixa o loop em paz e `start()` se recusa a rodar.

```php
public private(set) null|Closure $Wait = null;
```

O bridge de parking instalado por `schedule()`, ou `null` quando nenhum foi instalado. Só é honrado em um reactor adotado e apenas de dentro de uma Fiber.

```php
public function configure (Bootgly\ABI\Configs ...$Configs): self
```

Adota um Configs por concern — para este cliente, `TCP_Client_CLI\Configs` — em qualquer ordem, e devolve o cliente para encadeamento. Lança `InvalidArgumentException` em uma classe de Configs repetida na mesma chamada ou em um Configs que este node não aceita, e `ArgumentCountError` enquanto `host` e `port` nunca tiverem sido definidos.

```php
public function react (Events & Loops & Scheduler $Event): self
```

Adota um reactor já pertencente a outro runtime. Põe `$owned` em `false` e devolve o cliente para encadeamento. Lança `LogicException` quando já existe conexão aberta — a adoção precisa preceder qualquer registro de socket.

```php
public function schedule (Closure $Wait): self
```

Instala o wait bridge usado pelas esperas com park de um cliente adotado. `$Wait` recebe um `Readiness` (ou um resource, ou `null`) e precisa suspender a Fiber chamadora nele. Devolve o cliente para encadeamento.
