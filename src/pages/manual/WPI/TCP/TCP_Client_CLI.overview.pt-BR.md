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


$Client = new TCP_Client_CLI;

$Client->configure(
	host: '127.0.0.1',
	port: 8080
);

$Client->on(
	clientConnect: function ($Socket, $Connection) {
		$Connection->output = "PING\r\n";

		TCP_Client_CLI::$Event->add(
			$Socket,
			TCP_Client_CLI::$Event::EVENT_WRITE,
			$Connection
		);
	},
	dataRead: function ($Socket, $Connection, $Package) {
		echo $Package->input;
		$Connection->close();
	},
	dataWrite: function ($Socket, $Connection, $Package) {
		TCP_Client_CLI::$Event->add(
			$Socket,
			TCP_Client_CLI::$Event::EVENT_READ,
			$Connection
		);
	}
);

$Client->start();
```

O projeto demo usa modo monitor e um payload HTTP simples para dirigir o servidor por 10 segundos:

```php
$Client->on(
	workerStarted: function ($Client) {
		$Socket = $Client->connect();

		if ($Socket) {
			$Client::$Event->loop();
		}
	},
	clientConnect: function ($Socket, $Connection) {
		$Connection->output = "GET / HTTP/1.1\r\nHost: localhost:8080\r\n\r\n";

		TCP_Client_CLI::$Event->add($Socket, TCP_Client_CLI::$Event::EVENT_WRITE, $Connection);
	}
);
```

## Modos

O construtor recebe uma das constantes de modo do cliente.

| Modo | Descrição |
|---|---|
| `TCP_Client_CLI::MODE_DEFAULT` | Modo single-process. Chama `connect()` e entra no event loop automaticamente quando não há hook `workerStarted`. |
| `TCP_Client_CLI::MODE_MONITOR` | Executa workers e mantém o processo master vivo em monitoramento até você parar o cliente. |
| `TCP_Client_CLI::MODE_TEST` | Modo leve que pula a infraestrutura de processo/comandos para testes ou harnesses internos. |

## Configuração

O método `configure()` recebe o endpoint de destino e as configurações opcionais de concorrência / TLS:

| Parâmetro | Tipo | Padrão | Descrição |
|---|---|---|---|
| `host` | `string` | — | Host remoto ou IP para conexão. |
| `port` | `int` | — | Porta TCP remota. |
| `workers` | `int` | `0` | Número de workers a criar via fork. |
| `secure` | `?array` | `null` | Opções seguras SSL/TLS de stream context do PHP para negociação TLS. |

```php
$Client->configure(
	host: 'secure.example.com',
	port: 443,
	workers: 4,
	secure: [
		'peer_name' => 'secure.example.com',
		'verify_peer' => true,
		'verify_peer_name' => true,
	]
);
```

## Hooks

Registre callbacks de runtime com `on()`:

```php
$Client->on(
	workerStarted: ?Closure,
	clientConnect: ?Closure,
	clientDisconnect: ?Closure,
	dataRead: ?Closure,
	dataWrite: ?Closure,
);
```

### Hooks disponíveis

| Hook | Assinatura | Finalidade |
|---|---|---|
| `workerStarted` | `Closure(TCP_Client_CLI $Client)` | Executa quando um worker inicializa; útil para lógica customizada de conexão. |
| `connect` | `Closure($Socket, $Connection)` | Executa quando o objeto de conexão está estabelecido e pronto. |
| `clientDisconnect` | `Closure($Connection)` | Executa depois que o socket é fechado e removido do pool do cliente. |
| `dataWrite` | `Closure($Socket, $Connection, $Package)` | Executa depois da escrita; normalmente muda o socket para leitura. |
| `dataRead` | `Closure($Socket, $Connection, $Package)` | Executa após a leitura de dados de entrada. |

> [!IMPORTANT]
> `Connection` herda o estado de pacote, então o mesmo objeto carrega metadados do socket e também `output`, `input`, contadores e dados de expiração.

## Fluxo de Conexão

O ciclo de vida do socket cliente se parece com isto:

```text
configure() → start() → connect() → EVENT_CONNECT → onConnect → EVENT_WRITE → onWrite → EVENT_READ → onRead → close()
```

- `connect()` abre o socket com `STREAM_CLIENT_ASYNC_CONNECT | STREAM_CLIENT_CONNECT`.
- Se a conexão não completar imediatamente, o cliente agenda um evento futuro de conexão no event loop.
- Quando a conexão é estabelecida, o hook `connect` é chamado.
- Os callbacks de escrita e leitura passam então a conduzir a conversa do protocolo.

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
	host: 'secure.example.com',
	port: 443,
	secure: []
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

Veja [`Connection`](./TCP_Client_CLI/Connection) e [`Packages`](./TCP_Client_CLI/Packages) para os detalhes de baixo nível sobre sockets e pacotes.

## Exemplo Completo

```php
use function getenv;

use Bootgly\ACI\Events\Timer;
use Bootgly\API\Projects\Project;
use Bootgly\WPI\Interfaces\TCP_Client_CLI;


return new Project(
	name: 'Demo TCP Client CLI',
	description: 'Demonstration project for Bootgly TCP Client CLI',
	version: '1.0.0',
	author: 'Bootgly',

	boot: function (array $arguments = [], array $options = []): void
	{
		$Client = new TCP_Client_CLI(TCP_Client_CLI::MODE_MONITOR);
		$Client->configure(
			host: '127.0.0.1',
			port: getenv('PORT') ? (int) getenv('PORT') : 8082,
			workers: 1
		);

		$Client->on(
			workerStarted: function ($Client) {
				$Socket = $Client->connect();

				if ($Socket) {
					$Client::$Event->loop();
				}
			},
			clientConnect: function ($Socket, $Connection) {
				Timer::add(
					interval: 10,
					handler: function ($Connection) {
						$Connection->close();
					},
					args: [$Connection],
					persistent: false
				);

				$Connection->output = "GET / HTTP/1.1\r\nHost: localhost:8080\r\n\r\n";

				TCP_Client_CLI::$Event->add($Socket, TCP_Client_CLI::$Event::EVENT_WRITE, $Connection);
			},
			clientDisconnect: function ($Connection) use ($Client) {
				$Client->log(
					'Connection #' . $Connection->id . ' (' . $Connection->address . ':' . $Connection->port . ')'
					. ' from Worker with PID @_:' . $Client->Process->id . '_@ was closed! @\\;'
				);
			},
			dataWrite: function ($Socket, $Connection, $Package) {
				TCP_Client_CLI::$Event->add($Socket, TCP_Client_CLI::$Event::EVENT_READ, $Connection);
			},
			dataRead: null,
		);

		$Client->start();
	}
);
```
