# TCP Server CLI

O TCP Server CLI é a base de servidor TCP de baixo nível do Bootgly PHP Framework. Ele expõe um runtime non-blocking, multi-worker, para protocolos customizados, serviços raw socket e camadas mais altas construídas sobre TCP — incluindo a própria pilha HTTP do Bootgly.

## Recursos

| Recurso | Descrição |
|---|---|
| **Runtime multi-worker** | Cria múltiplos workers para que cada processo aceite e trate conexões de forma independente. |
| **Sockets non-blocking** | Usa um event loop baseado em `stream_select()` para operações de leitura, escrita e aceite. |
| **Modos de operação** | Suporta `Daemon`, `Interactive`, `Monitor` e `Test`. |
| **Handler raw de pacotes** | Registre um único `on(Closure $package)` que recebe entrada bruta e retorna saída bruta. |
| **Sinais e controle** | Pause, retome, recarregue, pare, inspecione conexões e veja estatísticas com sinais POSIX e comandos CLI. |
| **SSL/TLS** | Aceita conexões criptografadas por meio de opções SSL em stream contexts do PHP. |
| **Recuperação de workers** | No processo master, workers que caem são recriados automaticamente via `SIGCHLD`. |
| **Rebaixamento de privilégios** | Faça bind como root quando necessário e depois reduza para um usuário/grupo POSIX menos privilegiado. |
| **Estatísticas de conexão** | Acompanha leituras, escritas, bytes transferidos, erros e metadados de conexões ativas. |

## Bootstrapping com Projects

No Bootgly, servidores normalmente são iniciados por Projects. Um arquivo de projeto instancia o servidor, configura o socket e registra o handler de pacotes antes de chamar `start()`.

```php
use function getenv;

use Bootgly\API\Projects\Project;
use Bootgly\API\Endpoints\Server\Modes;
use Bootgly\WPI\Interfaces\TCP_Server_CLI;


return new Project(
	name: 'Demo TCP Server CLI',
	description: 'Demonstration project for Bootgly TCP Server CLI',
	version: '1.0.0',
	author: 'Bootgly',

	boot: function (array $arguments = [], array $options = []): void
	{
		$Server = new TCP_Server_CLI(Mode: match (true) {
			isset($options['i']) => Modes::Interactive,
			isset($options['m']) => Modes::Monitor,
			default => Modes::Daemon
		});

		$Server->configure(
			host: '0.0.0.0',
			port: getenv('PORT') ? (int) getenv('PORT') : 8080,
			workers: 12
		);

		$Server->on(
			package: (require __DIR__ . '/../Demo/TCP_Server_CLI/TCP_Server_CLI.SAPI.php')['on.Package.Receive']
		);

		$Server->start();
	}
);
```

## Quick Start

O menor contrato público é simples: configure um socket de escuta, registre um callback de pacote e retorne uma string para ser escrita de volta ao peer.

```php
use Bootgly\API\Endpoints\Server\Modes;
use Bootgly\WPI\Interfaces\TCP_Server_CLI;


$Server = new TCP_Server_CLI(Modes::Monitor);

$Server->configure(
	host: '0.0.0.0',
	port: 8080,
	workers: 4
);

$Server->on(
	package: static function (string $input): string {
		return "PONG\r\n";
	}
);

$Server->start();
```

O projeto demo retorna uma resposta HTTP crua diretamente da camada TCP:

```php
return [
	'on.Package.Receive' => static function ($input) {
		return <<<HTTP_RAW
		HTTP/1.1 200 OK
		Server: Bootgly
		Content-Type: text/plain; charset=UTF-8
		Content-Length: 13

		Hello, World!
		HTTP_RAW;
	}
];
```

> [!IMPORTANT]
> Por padrão, `TCP_Server_CLI` trabalha com bytes / strings brutas. Framing de protocolo, parsing e formatação de resposta são responsabilidades da aplicação, a menos que você acople uma camada de encoder/decoder por cima.

## Modos de Operação

O construtor recebe um enum `Bootgly\API\Endpoints\Server\Modes`.

| Modo | Descrição |
|---|---|
| `Modes::Daemon` | Faz fork para segundo plano e mantém o processo master vivo sem interface. |
| `Modes::Interactive` | Executa um loop CLI estilo REPL com comandos como `status`, `stop`, `pause` e `reload`. |
| `Modes::Monitor` | Exibe uma tela de status em tempo real e faz hot-reload da camada de aplicação. |
| `Modes::Test` | Usa uma instância separada de estado de processo voltada para testes automatizados do servidor. |

## Configuração

O método `configure()` armazena as configurações do socket antes da inicialização:

| Parâmetro | Tipo | Padrão | Descrição |
|---|---|---|---|
| `host` | `string` | — | Host ou IP em que o socket de escuta será vinculado. |
| `port` | `int` | — | Porta TCP de escuta. |
| `workers` | `int` | — | Número de processos filhos criados via fork. |
| `secure` | `?array` | `null` | Opções seguras SSL/TLS de stream context do PHP para sockets TLS. |
| `user` | `?string` | `null` | Usuário POSIX para o qual o processo será rebaixado após o bind. |
| `group` | `?string` | `null` | Grupo POSIX para o qual o processo será rebaixado após o bind. |

```php
$Server->configure(
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
);
```

### SSL/TLS

Quando `secure` não está vazio, o servidor armazena o contexto seguro SSL/TLS e executa um handshake TLS para cada conexão aceita. O socket principal de escuta permanece com crypto desabilitado; o handshake acontece em cada objeto de conexão.

> [!NOTE]
> O handshake é executado durante a criação da conexão. Se você espera um volume alto de tráfego TLS, vale medir o custo desse passo no seu workload.

### Rebaixamento de privilégios

Se você fizer bind em portas privilegiadas, pode iniciar como root e depois rebaixar o processo após a criação do socket:

```php
$Server->configure(
	host: '0.0.0.0',
	port: 443,
	workers: 4,
	secure: [/* ... */],
	user: 'www-data',
	group: 'www-data'
);
```

O Bootgly resolve o UID/GID de destino, inicializa grupos suplementares e então aplica `setgid()` / `setuid()` nessa ordem.

## Handler de Pacotes

`TCP_Server_CLI` expõe um único método público para registrar o handler:

```php
$Server->on(
	package: function (string $input): string {
		return strtoupper($input);
	}
);
```

O callback é armazenado como handler de pacote do lado do servidor e executado pelos workers quando há dados prontos para processamento.

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
| `SIGTSTP`, `pause` | Pausa os workers ou troca de Monitor para Interactive. |
| `SIGCONT`, `resume` | Retoma workers pausados. |
| `SIGUSR2`, `reload` | Recarrega o estado da aplicação nos workers. |
| `SIGIOT`, `connections` | Imprime informações das conexões ativas. |
| `SIGIO`, `stats` | Imprime estatísticas de conexões e tráfego. |
| `status` | Renderiza uma visão geral do estado do servidor no terminal. |
| `monitor` | Entra no modo de monitoramento em tempo real. |
| `check jit`, `error on/off`, `test` | Utilidades operacionais e de debugging. |

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

- O **master** instala sinais, salva o estado do processo, monitora workers e recria um substituto se algum cair.
- Cada **worker** cria seu próprio socket de servidor com `SO_REUSEPORT` e entra no event loop compartilhado `Select`.
- Os sockets aceitos são encapsulados em objetos de conexão que acompanham peer remoto, timers, escritas e status da conexão.

As opções de socket configuradas por padrão incluem:

- `backlog: 102400`
- `so_reuseport: true`
- `ipv6_v6only: false`
- `SO_KEEPALIVE`
- `TCP_NODELAY`

## Event Loop e Conexões

Cada worker adiciona o socket principal de escuta ao event loop com um evento de aceite/conexão. Os peers aceitos passam então a ser monitorados para leitura e escrita.

Na camada de conexão, o Bootgly acompanha:

- IP e porta remotos
- instante de criação e último uso
- estado do handshake TLS
- contadores de escrita e estatísticas globais de leitura/escrita
- timers de expiração (padrão: `15` segundos)
- verificações opcionais de blacklist

Veja [`Connection`](./TCP_Server_CLI/Connection) e [`Packages`](./TCP_Server_CLI/Packages) para os detalhes de nível mais baixo.

## Exemplo Completo

```php
use function getenv;

use Bootgly\API\Projects\Project;
use Bootgly\API\Endpoints\Server\Modes;
use Bootgly\WPI\Interfaces\TCP_Server_CLI;


return new Project(
	name: 'Demo TCP Server CLI',
	description: 'Demonstration project for Bootgly TCP Server CLI',
	version: '1.0.0',
	author: 'Bootgly',

	boot: function (array $arguments = [], array $options = []): void
	{
		$Server = new TCP_Server_CLI(Mode: match (true) {
			isset($options['i']) => Modes::Interactive,
			isset($options['m']) => Modes::Monitor,
			default => Modes::Daemon
		});

		$Server->configure(
			host: '0.0.0.0',
			port: getenv('PORT') ? (int) getenv('PORT') : 8080,
			workers: 12
		);

		$Server->on(
			package: (require __DIR__ . '/../Demo/TCP_Server_CLI/TCP_Server_CLI.SAPI.php')['on.Package.Receive']
		);

		$Server->start();
	}
);
```
