# MCP via stdio

`Bootgly\CLI\MCP` serve um **[servidor MCP](/manual/API/RPC/MCP/overview/)** pelo transporte
**stdio** do Model Context Protocol — o que um cliente MCP (uma IDE, um assistente desktop) usa
quando inicia o seu servidor como processo filho: ele escreve mensagens JSON-RPC no stdin do
processo e lê as respostas do stdout dele, uma mensagem por linha.

## Servir MCP a partir de um command

Monte o núcleo do servidor com as suas tools e entregue-o ao transporte dentro de um
**[command](/manual/CLI/Commands/overview/)**. `serving()` responde cada linha até o cliente
fechar o stdin:

```php
<?php
namespace projects\commands;

use stdClass;

use Bootgly\API\RPC;
use Bootgly\CLI\Command;
use Bootgly\CLI\MCP;


class MCPCommand extends Command
{
   // * Data
   public string $name = 'mcp';
   public string $description = 'Serve the MCP tools over stdio';


   public function run (array $arguments = [], array $options = []): bool
   {
      $Server = new RPC\MCP(
         name: 'Notes',
         version: '1.0.0',
         Lister: fn (): array => [
            ['name' => 'count', 'description' => 'How many notes there are.', 'inputSchema' => ['type' => 'object', 'properties' => new stdClass]]
         ],
         Caller: fn (string $name, array $arguments): array => [
            'content' => [['type' => 'text', 'text' => '3 notes.']],
            'isError' => false
         ]
      );

      // @ Até o cliente fechar o stdin
      return (new MCP($Server))->serving() === 0;
   }
}
```

Registre o command como qualquer outro e depois diga ao cliente como iniciá-lo — o script
`bootgly` do seu projeto com o nome do command. Por exemplo, na configuração `mcpServers` de um
cliente:

```json
{
   "mcpServers": {
      "notes": {
         "command": "/path/to/your/project/bootgly",
         "args": ["mcp"]
      }
   }
}
```

A classe se chama `MCP`, assim como o núcleo do servidor. Importe o namespace do núcleo em vez da
classe — `use Bootgly\API\RPC;` e `new RPC\MCP(…)` — e os dois nomes ficam livres de aliases.

## O que vai para onde

- O **stdin** carrega JSON-RPC delimitado por quebra de linha: uma mensagem (ou batch) por linha,
  `\n` ou `\r\n`. Linhas em branco são ignoradas; a última linha pode terminar sem quebra de linha.
- O **stdout** carrega as respostas, uma linha cada, e nada mais. Notificações não geram linha.
- O **stderr** carrega todo diagnóstico.

Tudo o que uma tool imprime enquanto roda — `echo`, `print`, `var_dump`, um output buffer que ela
deixou aberto, descarregou ou tentou encerrar, um erro impresso antes de o processo morrer — é
capturado e movido para o stderr, então uma linha de debug perdida nunca corrompe o protocolo. Os
erros que o PHP exibe também saem no stderr (com `display_errors` desligado — qualquer valor que o próprio PHP lê como desligado —, continuam ocultos),
e a captura continua de pé depois que `serving()` retorna: o que o comando imprimir em seguida
também vai para o stderr. O que contorna a saída do PHP não é
capturado: escritas no stream `STDOUT` ou em `php://stdout` (`fwrite(STDOUT, …)`, um handler de
log construído sobre eles) e processos filhos que herdam o stdout (`proc_open`/`exec` sem
redirecioná-lo). Num processo stdio, aponte os loggers para `STDERR` e redirecione o que um filho
imprime.

```bash
printf '%s\n' \
   '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"shell","version":"1"}}}' \
   '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
   '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"count"}}' \
   | bootgly mcp
# {"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2025-06-18","capabilities":{"tools":{"listChanged":false}},"serverInfo":{"name":"Notes","version":"1.0.0"}}}
# {"jsonrpc":"2.0","id":2,"result":{"content":[{"type":"text","text":"3 notes."}],"isError":false}}
```

## Quem está chamando

Um processo stdio atende um único cliente: o usuário que o iniciou. Descubra quem é essa pessoa
uma vez só — por exemplo, a partir de uma variável de ambiente que a configuração do cliente
define — e passe-a como `context`. Ela chega a cada uma das suas closures como o último argumento:

```php
use Bootgly\API\Security\Identity;

$Identity = Tokens::resolve((string) getenv('NOTES_TOKEN'));
// ? Sem token válido: recusa iniciar
if ($Identity === null) {
   fwrite(STDERR, "NOTES_TOKEN is missing or invalid\n");

   return false;
}

return (new MCP($Server, context: $Identity))->serving() === 0;
```

## Limites e encerramento

- Uma linha maior que `line` bytes (4 MiB por padrão; o final `\n` ou `\r\n` não conta) é
  descartada por inteiro e respondida uma vez com `-32600 Invalid Request` (`id: null`), com um
  aviso no stderr; a linha seguinte é atendida normalmente.
- O fim do stdin encerra o loop: `serving()` retorna `0`. Quando não dá mais para escrever no
  stdout (o cliente foi embora), ele para e retorna `1`.
- O loop bloqueia no stdin: o processo atende o seu único cliente e nada mais.

## Referência

```php
public function __construct (
   RPC\MCP $Server,
   mixed $context = null,
   int $line = 4_194_304,
   $input = STDIN,
   $output = STDOUT,
   $error = STDERR
)
```

Cria o transporte para um núcleo de servidor. `$context` é entregue a toda chamada; `$line` é a
linha mais longa aceita, em bytes; `$input`, `$output` e `$error` são os streams de mensagens,
respostas e diagnósticos — os do próprio processo por padrão, ou qualquer resource de stream
(um stream em memória num teste). Lança `InvalidArgumentException` para um `$line` abaixo de `1`
ou um stream que não seja um resource.

```php
public function serving (): int
```

Atende o cliente até o stdin terminar: lê uma linha por vez, responde-a pelo núcleo do servidor e
escreve a linha de resposta no stdout. Retorna `0` no fim da entrada e `1` quando não consegue
escrever no stdout.

```php
public private(set) RPC\MCP $Server;
```

O núcleo de servidor que este processo atende.

```php
public private(set) mixed $context;
```

O que toda chamada recebe como contexto.

```php
public private(set) int $line;
```

A linha mais longa aceita, em bytes (sem contar a quebra de linha).
