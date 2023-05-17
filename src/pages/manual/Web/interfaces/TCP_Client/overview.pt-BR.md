# Classe TCP\Client

A classe TCP\Client permite criar clientes utilizando o protocolo TCP/IP.

## Instância

Para instanciar a classe TCP\Client, é necessário incluir o autoload do framework e instanciar a classe da seguinte maneira:

```php
use Bootgly\Web\TCP;

$TCPClient = new TCP\Client(mode: int);
```

### Parâmetros

- `mode`: define o modo do cliente. As opções disponíveis são: `TCP\Client::MODE_CLIENT`, que faz uma única conexão com o servidor; `TCP\Client::MODE_MONITOR` que configura o cliente para monitorar um grande número de execuções separadas simultaneamente.

## Configurações

As configurações da classe TCP\Client consistem em um conjunto de propriedades que podem ser ajustadas usando seus acessores.

### Propriedades

- `public string|null $host`: endereço IP ou nome do host.
- `public int $port`: número da porta usada pelo serviço.
- `public bool $secure`: se a comunicação deve ser encriptada TLS.
- `public array $options`: Opções adicionais para configuração da conexão. Aqui você pode optar por definir várias opções específicas para esta biblioteca.

### Acessores

#### `configure(host: string|null, port: int, secure: bool = false, options: array) : self`

Método utilizado para atualizar as configurações iniciais do cliente.

### Uso

Esta seção fornece informações sobre os métodos necessários para utilizar a classe.

### Eventos Disponíveis

A classe TCP\Client utiliza eventos para executar tarefas específicas do ciclo de vida do cliente.

Os evento disponíveis são:

#### `instance(callable $handler)`

Este evento é acionado quando uma nova instância do cliente é criada. O parâmetro `$handler` recebe como argumento a instância atual da classe.

#### `connect(callable $handler)`

Este evento é acionado quando o cliente se conecta ao servidor. O parâmetro `$handler` recebe como argumento um objeto de conexão.

#### `disconnect(callable $handler)`

Este evento é acionado quando o cliente é desconectado do servidor. O parâmetro `$handler` recebe como argumento um objeto de conexão que foi fechado.

#### `write(callable $handler)`

Este evento é acionado quando um pacote é escrito no servidor. Recebe como argumentos o(s) socket(s), a conexão e o pacote que será transmitido.

#### `read(callable $handler)`

Este evento é acionado quando um novo pacote chega no cliente. Recebe como argumentos o(s) socket(s), a conexão e o pacote recebido.

#### `error(callable $handler)`

Este evento é acionado no caso de qualquer erro ocorrer durante a execução das operações do cliente.

### Métodos Disponíveis

#### `start()`

Método utilizado para iniciar o cliente e acionar os eventos necessários.

#### `stop()`

Método utilizado para parar o cliente com segurança.

#### `log(string $message)`

Método utilizado para registrar uma entrada de log. Recebe como parâmetro a mensagem a ser registrada.

#### `send($data)`

Método utilizado para enviar dados ao servidor remotamente. Toma como parâmetro a carga útil dos dados a serem transmitidos.
