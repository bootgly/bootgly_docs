# Banco KV

`Bootgly\ADI\Databases\KV` é a fachada pela qual uma aplicação envia comandos ao Redis. O único
verbo dela, `command()`, transforma o nome de um comando e os argumentos dele em uma
`KV\Operation` pendente no pool de conexões da fachada; o `await()` conduz uma operação até o fim, e
o `advance()` deixa vários comandos dividirem os mesmos round-trips. O Redis é o único driver da
fachada: ele fala RESP sobre o mesmo pool não bloqueante que os drivers SQL usam.

As chaves de conexão e os padrões delas estão em
**[Configuração do banco](/manual/ADI/Database/Config/overview/)**, e o que o pool faz com uma
operação — esperas, prazos, cancelamento, retirada — está em
**[Pool de conexões](/manual/ADI/Database/Pool/overview/)**. **[Bancos de dados](/manual/ADI/Databases/overview/)**
coloca o `KV` ao lado do `SQL`, e o protocolo do Redis em si — autenticação, o índice do banco, TLS —
está na página do driver **[Redis](/manual/ADI/Databases/KV/Drivers/Redis/overview/)**.

O `KV` não é um cache. O `Bootgly\ABI\Resources\Cache` guarda valores PHP, com TTLs, tags e um
prefixo de chave opcional, por drivers que bloqueiam — o de Redis também, com chaves próprias:
`timeout` `5.0`, `secure` um booleano, porta `6379` por padrão (veja
**[Cache](/guide/cache/overview/)**). O driver Redis do `Bootgly\ACI\Queues` também bloqueia, e só
serve filas de jobs (veja **[Filas](/guide/queues/overview/)**). O `KV` envia os comandos que você
escreve, do jeito que você os escreve, pelo pool assíncrono: sem serialização, sem prefixo de chave,
sem TTL padrão.

## Abra um banco KV

Onde o código roda decide como ele abre a fachada:

- **Em uma rota `HTTP_Server_CLI`**, não crie uma. Use `$Response->KV`, o response resource que o
  projeto registra com `KV::provide()` (veja
  **[Registrar o resource KV](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/overview/#registrar-o-resource-kv)**):
  ele envolve um `KV` por worker e, dentro de `$Response->defer()`, espera através do `Response` em
  vez de bloquear o worker — veja
  **[Aguardar trabalho key-value](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/overview/#aguardar-trabalho-key-value)**.
  O `await()` da própria fachada nunca suspende a Fiber que o chama, então numa rota cada espera
  bloqueia o worker, e toda requisição que ele atende, até o Redis responder — dentro de
  `$Response->defer()` também.
- **Em um projeto** — a função de boot dele, um comando de console, um worker ou um script rodando
  dentro dele —, crie-a a partir do escopo de config `kv` do projeto, como no primeiro bloco abaixo
  (veja [Configure a partir do escopo kv](#configure-a-partir-do-escopo-kv)).
- **Fora de um projeto**, passe a conexão como array, como no segundo.

```php
use Bootgly\ADI\Databases\KV;
use Bootgly\API\Environment\Configs\KVConfig;

$KV = new KV(new KVConfig(BOOTGLY_PROJECT->Configs->get('kv'))->configure());
```

```php
use Bootgly\ADI\Databases\KV;

$KV = new KV([
   'driver' => 'redis',
   'host' => '127.0.0.1',
   'port' => 6379,
   'secure' => ['mode' => 'disable'], // a plaintext Redis is declared, never inferred
]);
```

Um array aceita as chaves de conexão compartilhadas de
**[Chaves e padrões](/manual/ADI/Database/Config/overview/#chaves-e-padrões)**, cujos padrões são os
de um PostgreSQL local, seja qual for a fachada. Então informe três delas explicitamente:

- `driver` — `'redis'`, o único nome que o `KV` registra. Sem ele a config diz `pgsql`, e o primeiro
  `command()` lança `InvalidArgumentException` com `Database driver is not registered: pgsql.`
- `port` — sem ela o driver conecta na `5432`; sem nada escutando ali, todo comando falha com
  `Redis connection failed: 127.0.0.1:5432 refused the connection (ECONNREFUSED).`
- `secure` — sem ela o modo é `prefer`, que abre toda conexão com um handshake TLS. Um Redis
  plaintext nunca responde a ele, então cada nova conexão falha depois de um segundo, ou de metade do
  `timeout` quando ela é menor, com
  `Redis TLS handshake timed out: the peer did not answer the TLS handshake within 1s — set secure.mode => 'disable' for a plaintext Redis.`
  Os modos estão em **[TLS](/manual/ADI/Database/Config/overview/#tls)**, e o que o Redis faz com
  cada um, na página do **[Redis](/manual/ADI/Databases/KV/Drivers/Redis/overview/)**.

A fachada também lê `host`, `password` (enviada com `AUTH`), `database` (um índice de `SELECT`,
enviado só quando tem apenas dígitos e não é `0`), `timeout` (o prazo de cada comando, veja
[Timeouts](#timeouts)) e `pool.max`; ela ignora `username`, `replicas` e `secure.key`. Criar a
fachada valida a config e não abre nada: o primeiro comando abre a conexão. Cada fachada tem o
próprio pool, então crie uma por processo e reaproveite-a.

Por enquanto a conexão tenta só o primeiro endereço para o qual um nome de host resolve, então onde
`localhost` resolve primeiro para `::1`, um Redis que escuta só em `127.0.0.1` recusa
`'host' => 'localhost'`
(`Redis connection failed: localhost:6379 refused the connection (ECONNREFUSED).`). Escreva o
endereço IP.

## Execute comandos

```php
$KV->await($KV->command('SET', ['greeting', 'hello']));

$KV->await($KV->command('GET', ['greeting']))->response;      // 'hello'
$KV->await($KV->command('GET', ['missing']))->response;       // null
$KV->await($KV->command('INCRBY', ['visits', 5]))->response;  // 5

$KV->await($KV->command('RPUSH', ['letters', 'a', 'b', 'c']));
$KV->await($KV->command('LRANGE', ['letters', 0, -1]))->response; // ['a', 'b', 'c']

$KV->await($KV->command('HSET', ['user:1', 'name', 'Ada', 'lang', 'en']));
$KV->await($KV->command('HGETALL', ['user:1']))->response;    // ['name', 'Ada', 'lang', 'en']
```

O `command()` recebe o nome do comando e os argumentos dele, um por item do array, e retorna na hora
uma `KV\Operation`. Ela já está atribuída a um pool, mas nada é enviado até ela ser avançada; o
`await()` a avança até o fim e a retorna, e a resposta decodificada é o `response` dela. O nome vai
para o Redis como você o escreve — `set` funciona tanto quanto `SET` — e um subcomando é um
argumento: `command('CLIENT', ['SETNAME', 'worker-1'])`, enquanto
`command('CLIENT SETNAME', ['worker-1'])` falha com
`ERR unknown command 'CLIENT SETNAME', with args beginning with: 'worker-1'`. O Redis responde no
protocolo da conexão: RESP2, a menos que aquela conexão tenha sido trocada com `HELLO 3`.

### Argumentos

Todo argumento viaja como uma bulk string RESP, convertida a partir do valor PHP dele:

| Valor PHP | Enviado como |
|---|---|
| `string` | Do jeito que é |
| `int` | Os dígitos dele |
| `float` | A conversão para string do PHP, que mantém os dígitos da configuração ini `precision` (`14` por padrão): `1.5` → `1.5`, `1/3` → `0.33333333333333`, `0.1 + 0.2` → `0.3`, `1e20` → `1.0E+20` |
| `bool` | `true` → `1`; `false` → uma string vazia |
| `null`, um array, um objeto | Uma string vazia, sem erro — um objeto `Stringable` também |

Formate você mesmo um float quando os dígitos dele importam — `sprintf('%.17g', 1/3)` envia
`0.33333333333333331` — e converta um objeto para string antes de passá-lo: um `SET` que recebe
`null`, `false`, um array ou um objeto grava um valor vazio.

### Respostas

A resposta decodificada depende do tipo RESP com que o Redis responde:

| Resposta | `response` | Por exemplo |
|---|---|---|
| Simple string | `string` | `SET` → `'OK'`, `PING` → `'PONG'` |
| Bulk string | `string`; `null` para um valor ausente | `GET` |
| Integer | `int` | `INCR`, `EXISTS`, `DEL` |
| Array | Uma lista (`array<int,mixed>`), com arrays aninhados; `null` para um array nulo | `LRANGE`, `HGETALL`, `BLPOP` depois do timeout dele |
| Error | Nenhum: o comando falha (veja [Erros](#erros)) | `INCR` sobre um valor que não é número |

Um erro aninhado num array não falha o comando: ele fica na lista como um objeto
`RuntimeException`, que o `instanceof RuntimeException` distingue dos outros itens. O `EXEC` de uma
transação responde assim quando um dos comandos enfileirados falha, e o mesmo faz um script Lua que
retorna `redis.error_reply()` dentro de uma tabela: `return {1, redis.error_reply('boom')}` resolve
com `1` e, depois, uma `RuntimeException` cuja mensagem é `ERR boom`.

O RESP2 só tem esses cinco tipos, então um hash volta como uma lista plana de campos e valores, e a
pontuação de um sorted set como string — o `ZSCORE` responde `'1.5'`. Uma conexão trocada para RESP3
com `HELLO 3` — só aquela conexão, veja [Estado da conexão](#estado-da-conexão) — responde também
com estes tipos:

| Resposta RESP3 | `response` | Por exemplo |
|---|---|---|
| Map | Um array associativo | `HGETALL` → `['name' => 'Ada', 'lang' => 'en']`; o próprio `HELLO 3` |
| Set | Uma lista | `SMEMBERS` |
| Double | `float` | `ZSCORE` → `1.5` |
| Boolean | `bool` | Um script Lua que retorna `true` ou `false` depois de `redis.setresp(3)` |
| Null | `null` | `GET` de uma chave ausente |
| Big number | `string`, para nenhum dígito se perder | Um script Lua que retorna `{big_number = '…'}` |
| Verbatim string | `string`, com o prefixo de formato | `INFO` → `'txt:# Server…'` |

Duas respostas RESP3 ainda não são decodificadas por completo. Um double que é `inf`, `-inf` ou
`nan` é lido como `0.0`, então um membro com pontuação `+inf` volta do `ZSCORE` como `0.0`. Uma
verbatim string mantém o formato de três letras e os dois-pontos, então `INFO` e `CLIENT INFO`
começam com `txt:`. No RESP2 as mesmas respostas são strings comuns: `'inf'`, e o `INFO` sem
prefixo. Os pushes que o Redis envia por conta própria no RESP3, como as invalidações do client
tracking, não respondem a nenhum comando e são descartados; o pub/sub é tratado em
[Pub/sub e MONITOR](#pubsub-e-monitor).

### Leia o resultado

```php
$Operation = $KV->await($KV->command('SET', ['greeting', 'hello']));

$Operation->response;       // 'OK'
$Operation->command;        // 'SET'
$Operation->arguments;      // ['greeting', 'hello']
$Operation->error;          // null
$Operation->Result->status; // 'SET'
```

Uma operação key-value guarda o `command` e os `arguments` com que foi criada, e a resposta
decodificada em `response`. O `Result` dela traz só `status`, com o nome do comando como você o
escreveu; `rows` e `columns` ficam vazios. Ela não tem `code` nem `SQL`, e nada é anunciado para
ela: os `SQL\Events` pertencem à fachada SQL. Os campos que toda operação compartilha — `state`,
`finished`, `timeout`, `deadline`, `cancelled`, `revoked` e o resto — estão em
**[Operação](/manual/ADI/Database/overview/#operação)**, e `$Operation->Protocol` é o driver Redis
em que o comando rodou.

## Comandos em pipeline

O Redis responde aos comandos de uma conexão na ordem em que os recebeu, então um cliente pode
enviar vários antes de ler qualquer resposta e pagar um round-trip por todos eles. Com a fachada,
crie os comandos, chame `advance()` em cada um para escrevê-lo, e depois `await()` na ordem em que
você os criou:

```php
use Bootgly\ADI\Databases\KV;

$KV = new KV([
   'driver' => 'redis',
   'host' => '127.0.0.1',
   'port' => 6379,
   'secure' => ['mode' => 'disable'],
   'pool' => ['max' => 1],
]);

$KV->await($KV->command('PING')); // opens the connection

$Operations = [];
foreach (['ada', 'grace', 'linus'] as $name) {
   $Operations[] = $KV->command('INCR', ["visits:$name"]);
}

foreach ($Operations as $Operation) {
   $KV->advance($Operation);
}

$visits = [];
foreach ($Operations as $Operation) {
   $visits[] = $KV->await($Operation)->response;
}

$visits; // [1, 1, 1]
```

O `advance()` move uma operação até onde o socket dela permite e retorna sem esperar: numa conexão
aberta ele escreve o comando, que fica então `Reading`. Com os três escritos, o primeiro `await()`
lê as respostas conforme elas chegam, e cada resposta resolve o comando na frente da fila da conexão
— uma leitura pode terminar os próximos comandos também. O lote custa cerca de um round-trip,
enquanto aguardar cada comando logo depois de criá-lo custa três.

- O `advance()` não lança para um comando que falhou; o `await()` lança, então capture por comando
  quando um deles puder falhar. Uma resposta de erro falha só o próprio comando: os outros na
  conexão continuam resolvendo com as próprias respostas.
- Aguarde na ordem de criação. O `await()` bloqueia e conduz só o comando que recebe, então aguardar
  um comando ainda estacionado em `pending` antes dos que seguram as conexões faz ele falhar com
  `Database pool has no capacity for the operation.` (veja
  **[Aguarde de forma síncrona](/manual/ADI/Database/Pool/overview/#aguarde-de-forma-síncrona)**).

Para onde cada comando vai é escolha do pool (veja
**[Saturação e co-localização](/manual/ADI/Database/Pool/overview/#saturação-e-co-localização)**):
primeiro uma conexão ociosa, depois uma nova enquanto o pool tem menos de `pool.max` conexões, e só
então uma conexão aberta e pronta, em round-robin. Isso decide quanto um lote custa:

- Com `pool.max` `1` e a conexão aberta, como acima, o lote inteiro sai por um socket.
- Com o `pool.max` padrão, `8`, o primeiro comando pega a conexão aberta, os sete seguintes abrem
  uma conexão nova cada um, e só o resto entra na conexão aberta. Para lotes enviados de um script,
  dê à fachada `pool.max` `1`.
- Num pool frio, sem nada aberto ainda, os primeiros `pool.max` comandos abrem uma conexão cada um e
  o resto estaciona em `pending`, onde cada `await()` que libera uma conexão promove o próximo: com
  `pool.max` `1`, o lote roda um comando por vez. Abra a conexão antes, com um comando aguardado,
  como acima.

## Timeouts, cancelamento e retirada

A fachada conduz cada operação pelo pool dono dela, então as regras do pool valem — veja
**[Defina um prazo](/manual/ADI/Database/Pool/overview/#defina-um-prazo)**,
**[Cancele um statement em execução](/manual/ADI/Database/Pool/overview/#cancele-um-statement-em-execução)** e
**[Operações retiradas](/manual/ADI/Database/Pool/overview/#operações-retiradas)**. Isto é o que elas
significam para o Redis.

### Timeouts

```php
use RuntimeException;

use Bootgly\ADI\Databases\KV;

$KV = new KV([
   'driver' => 'redis',
   'host' => '127.0.0.1',
   'port' => 6379,
   'secure' => ['mode' => 'disable'],
   'timeout' => 0.5,
]);

try {
   $KV->await($KV->command('BLPOP', ['jobs', 2]));
}
catch (RuntimeException $Exception) {
   $Exception->getMessage(); // Database operation timed out after 0.5 seconds.
}
```

O `timeout` (em segundos, padrão `30`) é o prazo de cada comando, fixado quando o `command()` o cria:
a espera por uma conexão, a conexão em si, o TLS, `AUTH` e `SELECT`, e a resposta contam contra ele,
e `0` significa nenhum. Todo comando de uma fachada recebe o mesmo `timeout` — não há opção por
comando — e o timeout próprio de um comando bloqueante não o estica: o `BLPOP` acima pediu para
esperar dois segundos e falhou depois de meio segundo.

O Redis não fica sabendo que um comando expirou: ele o executa e responde. O driver mantém o lugar
do comando expirado na fila da conexão, então essa resposta atrasada é descartada em vez de
responder ao próximo comando. Quando outro comando ainda espera a resposta dele naquela conexão, a
resposta atrasada é lida e descartada ali, e a conexão fica; quando nenhum espera, a conexão é
fechada — o que também encerra um comando bloqueante no Redis — e o próximo comando abre uma nova.
Um comando cujo prazo passa enquanto ele ainda está sendo escrito nunca roda, e a conexão dele é
fechada, como em [Cancelamento](#cancelamento).

### Cancelamento

O driver Redis não tem pedido de cancelamento — a maioria dos comandos termina assim que o Redis os
lê —, então o `cancel()` nunca envia nada:

```php
$KV->await($KV->command('SET', ['greeting', 'hello'])); // the connection is open

$Operation = $KV->command('SET', ['greeting', 'bonjour']);
$KV->advance($Operation); // written

$KV->cancel($Operation);

$Operation->error;     // Database driver does not support cancellation.
$Operation->cancelled; // false
$Operation->revoked;   // true

$KV->await($KV->command('GET', ['greeting']))->response; // 'bonjour'
```

O que o `cancel()` faz depende de onde o comando está:

| Onde o comando está | O que o `cancel()` faz |
|---|---|
| Estacionado em `pending`, ainda sem conexão | Faz ele falhar com `Database operation has no protocol to cancel.` |
| Criado, não avançado (`Queued`) | Faz ele falhar com `Database operation was cancelled before reaching the server.`; nada chega ao Redis, e a conexão fica |
| Abrindo a conexão, ou no handshake TLS | Faz ele falhar com `Database driver does not support cancellation.`; nada chega ao Redis, e a conexão semiaberta é fechada |
| Esperando a escrita de outro comando terminar | Faz ele falhar com `Database driver does not support cancellation.`; nada dele é enviado, e a conexão fica |
| Sendo escrito | Faz ele falhar com `Database driver does not support cancellation.`; ele nunca roda, mas a conexão é fechada: os comandos escritos nela falham com `Redis operation was abandoned while writing its command.`, e os que esperavam para ser escritos, com `Redis connection was torn down before the command was sent.` |
| Escrito | Faz ele falhar com `Database driver does not support cancellation.`; ele ainda roda no Redis, e a escrita dele acontece |

O `revoked` vira `true` em todos os casos, e o `cancelled` continua `false`. Depois de `Queued`, o
erro é o mesmo, tenha o comando chegado ao Redis ou não. Um comando escrito é reconciliado como um
expirado: a resposta dele é descartada numa conexão em que outro comando ainda lê, e senão a conexão
é fechada — então um `BLPOP` cancelado só para de bloquear no Redis quando está sozinho na conexão.
O que cada caso faz no wire está na página do driver Redis, em
**[Cancelamento](/manual/ADI/Databases/KV/Drivers/Redis/overview/#cancelamento)** e
**[Comandos abandonados](/manual/ADI/Databases/KV/Drivers/Redis/overview/#comandos-abandonados)**.

### Retirada

O `withdraw()`, herdado de `Database`, desiste de comandos localmente quando quem os chamou para de
esperar (veja **[Operações retiradas](/manual/ADI/Database/Pool/overview/#operações-retiradas)**).
Cada um falha com `Database operation was withdrawn: its caller stopped waiting.` e é marcado
`revoked`; um que já terminou mantém a resposta. No Redis:

- Um comando do qual nada foi escrito nunca roda. A conexão dele fica, a menos que ainda estivesse
  sendo aberta ou no handshake TLS: essa conexão semiaberta é fechada.
- Um comando retirado enquanto está sendo escrito também nunca roda, mas o resto do frame dele não
  tem como ser desfeito: a conexão é fechada, os comandos escritos nela falham com
  `Redis operation was abandoned while writing its command.`, e os que esperavam para ser escritos,
  com `Redis connection was torn down before the command was sent.`
- Um comando escrito ainda roda no Redis. Os drivers SQL mantêm uma sessão assim aberta para o
  próximo chamador drenar; o driver Redis só a mantém enquanto outro comando ainda lê na conexão, e
  senão a fecha.
- Nenhuma vaga sobrevive a uma conexão fechada: o Redis descarta na hora o trabalho de um cliente
  desconectado, então o pool nunca conta um comando retirado contra o `pool.max` até o prazo dele
  (`LINGERING` é `false` nos drivers key-value).

Por enquanto, uma conexão que guarda a resposta de um comando retirado para outro comando não recebe
nenhum comando novo até esse outro terminar: num pool cheio, o próximo comando estaciona em
`pending`, onde o `await()` o faz falhar com `Database pool has no capacity for the operation.`,
então aguarde antes o comando que restou.

## Erros

O `await()` lança uma `RuntimeException` cuja mensagem é o `error` da operação que falhou, e a
operação o mantém; o `command()` só lança a `InvalidArgumentException` de um `driver` sob o qual
nenhum driver key-value está registrado — por enquanto, só `pool.max` vezes: cada uma dessas
chamadas guarda uma vaga do pool, então as chamadas seguintes retornam uma operação estacionada em
`pending`, cujo `await()` falha com `Database pool has no capacity for the operation.`

```php
use RuntimeException;

$KV->await($KV->command('SET', ['greeting', 'hello']));

$Increment = $KV->command('INCR', ['greeting']);

try {
   $KV->await($Increment);
}
catch (RuntimeException $Exception) {
   $Exception->getMessage(); // ERR value is not an integer or out of range
   $Increment->error;        // ERR value is not an integer or out of range
   $Increment->response;     // null
}
```

Uma resposta de erro do Redis começa com um código em maiúsculas — `ERR`, `WRONGTYPE`, `NOSCRIPT`,
`NOAUTH` —, então decida por essa primeira palavra, não pela mensagem inteira. Ela falha só o
próprio comando, e a conexão fica. Uma falha da própria conexão falha todo comando nela — o que está
em andamento e os que estão em pipeline atrás dele — e a fecha: esses comandos se perdem, e o
próximo comando abre uma conexão nova, então a fachada continua funcionando.

| Mensagem | Causa |
|---|---|
| `ERR value is not an integer or out of range` | Uma resposta de erro do Redis; `WRONGTYPE Operation against a key holding the wrong kind of value`, `NOSCRIPT No matching script. Please use EVAL.` e as demais se leem do mesmo jeito |
| `Database operation timed out after 0.5 seconds.` | O `timeout` do comando venceu ([Timeouts](#timeouts)) |
| `Redis socket closed.` | O Redis fechou a conexão antes de a resposta chegar — um restart, um `CLIENT KILL`, o `timeout` dele para clientes ociosos |
| `Redis connection was torn down before the command was sent.` | O comando foi criado numa conexão que se perdeu antes de o comando ser escrito |
| `Redis operation was abandoned while writing its command.` | Outro comando da conexão foi abandonado enquanto era escrito — o prazo dele passou, ou ele foi cancelado ou retirado ([Cancelamento](#cancelamento), [Retirada](#retirada)) |
| `Redis connection failed: 127.0.0.1:6379 refused the connection (ECONNREFUSED).` | Nada escuta em `host`:`port`; as outras falhas de conexão estão em **[Falhas](/manual/ADI/Database/overview/#falhas)** |
| `Database connection failed: php_network_getaddresses: getaddrinfo for redis.invalid failed: Name or service not known` | O `host` não resolve |
| `WRONGPASS invalid username-password pair or user is disabled.` | A `password` está errada |
| `NOAUTH Authentication required.` | O Redis exige uma senha e a config não tem nenhuma |
| `ERR AUTH <password> called without any password configured for the default user. Are you sure your configuration is correct?` | A config tem uma `password` e o Redis não exige nenhuma |
| `ERR DB index is out of range` | O `database` passa do número de bancos que o Redis tem |
| `Redis TLS handshake timed out: the peer did not answer the TLS handshake within 1s — set secure.mode => 'disable' for a plaintext Redis.` | `prefer`, o modo padrão, contra um Redis plaintext |
| `Database operation timed out after 30 seconds.` | `require`, `verify-ca` ou `verify-full` contra um Redis plaintext: o handshake espera o `timeout` inteiro |
| `Redis TLS handshake failed: …` | Um certificado não confiável, um nome que não confere ou um alerta TLS, seguido do diagnóstico do OpenSSL (veja a página do **[Redis](/manual/ADI/Databases/KV/Drivers/Redis/overview/)**) |
| `Database driver does not support cancellation.` | `cancel()` num comando depois de `Queued` ([Cancelamento](#cancelamento)) |
| `Database operation was cancelled before reaching the server.` | `cancel()` num comando ainda não avançado |
| `Database operation has no protocol to cancel.` | `cancel()` num comando estacionado em `pending` |
| `Database operation was withdrawn: its caller stopped waiting.` | `withdraw()` num comando não terminado ([Retirada](#retirada)) |
| `Database pool has no capacity for the operation.` | `await()` num comando ainda estacionado em `pending` |
| `Database driver is not registered: pgsql.` | Lançada pelo `command()`, por enquanto nas primeiras `pool.max` chamadas: a config não tem `driver` |

Um `AUTH` ou `SELECT` recusado falha o comando à frente do qual foi enviado e fecha a conexão, como
uma conexão perdida; o `NOAUTH` é uma resposta de erro comum. As falhas do próprio pool estão em
**[Erros do pool](/manual/ADI/Database/Pool/overview/#erros)**.

## Configure a partir do escopo kv

Comandos de console, workers e scripts que rodam dentro de um projeto criam a fachada a partir do
escopo de config `kv` do projeto — o mesmo escopo que o resource de rota lê — com a linha de
[Abra um banco KV](#abra-um-banco-kv). O `KVConfig` transforma o escopo,
`configs/kv/kv.Config.php` (há um completo em
**[Registrar o resource KV](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/overview/#registrar-o-resource-kv)**),
no `Database\Config` que a fachada recebe. O `configure()` lê os nós abaixo e deixa de fora os não
vinculados, que então assumem os padrões de
**[Chaves e padrões](/manual/ADI/Database/Config/overview/#chaves-e-padrões)**:

| Nó | Chave | Quando não vinculado |
|---|---|---|
| `Driver` | `driver` | `'redis'` |
| `Host` | `host` | `'127.0.0.1'` |
| `Port` | `port` | `5432` |
| `Database` | `database` | `'bootgly'`, que não seleciona nada: banco `0` |
| `Password` | `password` | `''`: sem `AUTH` |
| `Timeout` | `timeout` | `30.0` |
| `Secure->Mode` | `secure.mode` | `'prefer'` |
| `Secure->Verify` | `secure.verify` | Derivado do modo |
| `Secure->Peer` | `secure.peer` | O `host` |
| `Secure->CAFile` | `secure.cafile` | `''` |
| `Pool->Min` | `pool.min` | `0` |
| `Pool->Max` | `pool.max` | `8` |

- Vincule `Port` e `Secure->Mode`: sem vínculo, o KV do projeto conecta na `5432` com `prefer`. O
  escopo de exemplo vincula `Port` a `KV_PORT`, padrão `6379`, e `Secure->Mode` a `KV_SSLMODE`,
  padrão `disable`.
- O `Driver` assume `'redis'` aqui, e não aceita nenhum outro nome — `Redis` incluído.
- O adaptador não lê nenhum nó `Enabled`, `Username`, `Secure->Name` ou `Secure->Key`. O `Enabled`
  (`KV_ENABLED`) controla só o resource de rota, então um comando de console conecta mesmo quando
  ele é `false`; e o `name` segue o `verify`, então `KV_SSLVERIFY=true` também confere o nome do
  certificado contra o `peer`.
- O carregador do projeto lê os arquivos `.env` do escopo sem allowlist, enquanto o
  `KV::provide()` aceita só as chaves `KV_*` que lista e recusa o escopo inteiro por qualquer outra
  — um `KV_TYPO=1` desconhecido carrega num comando de console, e faz o resource de rota lançar
  `Enable KV_ENABLED=true in the kv config scope and set KV_HOST and KV_PORT as needed.` Mantenha o
  `configs/kv/.env` nas chaves que o resource lista.

O `KVConfig` lança `InvalidArgumentException`:

| Mensagem | Lançada por | Causa |
|---|---|---|
| `KV config adapter expects the kv scope.` | `new KVConfig()` | Um escopo que não é `kv` |
| `Unsupported KV driver: memcached.` | `configure()` | O `Driver` não é `redis` |
| `KV driver config value must be scalar.` | `configure()` | O `Driver` está vinculado a um array ou a um objeto |
| `Unsupported database TLS mode: verify_full.` | `configure()` | O `Secure->Mode` não é um dos cinco modos |
| ``Database TLS `verify` must be a boolean.`` | `configure()` | O `Secure->Verify` não se parece com um booleano |
| ``Database TLS cafile requires certificate verification: use mode `verify-ca` or `verify-full`, or set `verify` to true.`` | `configure()` | Um `Secure->CAFile` sob `prefer` ou `require` sem `Secure->Verify` |

As três últimas vêm do `Database\Config`, que o `configure()` monta (veja
**[TLS](/manual/ADI/Database/Config/overview/#tls)**). A linha precisa do escopo: sem
`configs/kv/kv.Config.php`, o `get('kv')` retorna `null` e o `KVConfig` o rejeita com um `TypeError`;
um projeto sem diretório `configs/` falha um passo antes, como
**[A partir da config do projeto](/manual/ADI/Database/Config/overview/#a-partir-da-config-do-projeto)**
descreve.

## Limitações

O pool entrega a cada comando a conexão que puder. Os comandos não ficam presos a uma conexão, e cada
conexão atende a todos os outros comandos da fachada — por trás do `$Response->KV`, a todos os
comandos do worker. Um comando que muda o estado da conexão dele, ou a segura, quebra isso.

### Transações

`MULTI` … `EXEC` precisa de todos os comandos numa conexão, e nada os mantém ali. Num pool de várias
conexões:

```php
$Multi = $KV->command('MULTI');
$Set = $KV->command('SET', ['balance', '10']);
$Exec = $KV->command('EXEC');

foreach ([$Multi, $Set, $Exec] as $Operation) {
   $KV->advance($Operation);
}

$KV->await($Multi)->response; // 'OK'
$KV->await($Set)->response;   // 'OK': it ran at once, outside any transaction
$KV->await($Exec);            // throws: ERR EXEC without MULTI
```

Os três comandos caíram em três conexões. A conexão do `MULTI` fica então dentro de uma transação, e
o próximo comando que o pool entrega a ela recebe `'QUEUED'` em vez de rodar. O `WATCH` tem o mesmo
problema: as chaves que ele observa pertencem à conexão em que ele caiu. Um pool de uma conexão
mantém os comandos juntos, desde que nada mais use a fachada entre eles. Escreva uma mudança de
vários passos como um script Lua — o `EVAL` o roda de forma atômica:

```php
$KV->await($KV->command('EVAL', [
   "redis.call('SET', KEYS[1], ARGV[1]); return redis.call('INCR', KEYS[2])",
   2,
   'profile:42',
   'visits:42',
   'Ada',
]))->response; // 1
```

### Estado da conexão

`SELECT`, `HELLO`, `AUTH`, `CLIENT SETNAME` e `CLIENT TRACKING` enviados pelo `command()` mudam só a
conexão em que caem, que depois atende a outros comandos nesse estado, enquanto as outras conexões
mantêm o delas. Num pool de duas conexões, um `SELECT 5` seguido de duas escritas pôs uma delas no
banco `5` e a outra no banco `0`; depois de `HELLO 3`, o mesmo `HGETALL` respondeu um map naquela
conexão e uma lista plana na outra. Defina `database` e `password` na config: o driver envia `SELECT`
e `AUTH` em toda conexão que abre. O `AUTH` dele leva só a senha, então o `username` não escolhe um
usuário de ACL do Redis: toda conexão se autentica como `default`.

### Comandos bloqueantes

`BLPOP`, `BRPOP`, `BLMOVE`, `BZPOPMIN`, `XREAD` com `BLOCK` e `WAIT` seguram a conexão até o Redis
responder, e os comandos em pipeline atrás deles esperam o mesmo tempo: um `GET` atrás de
`BLPOP jobs 1` resolveu depois de um segundo. Com `pool.max` `1` — o `KV_POOL_MAX` do escopo de
exemplo —, isso é todo comando key-value do worker. A espera conta contra o `timeout` como qualquer
resposta (veja [Timeouts](#timeouts)).

Num script ou num comando de console, dê às leituras bloqueantes uma fachada própria. Numa rota, uma
segunda fachada não ajuda: o `await()` dela bloqueia o worker durante toda a espera. Ali, mantenha as
leituras bloqueantes fora do `$Response->KV`, ou aumente o `KV_POOL_MAX`: os outros comandos então
pegam uma conexão própria enquanto o pool tem uma para dar — um `GET` ao lado de `BLPOP jobs 1`
resolveu na hora com `pool.max` `2` — e, quando ele está cheio, entram em pipeline na conexão que o
pool escolher, inclusive uma bloqueada.

### Pub/sub e MONITOR

Não envie `SUBSCRIBE`, `PSUBSCRIBE`, `SSUBSCRIBE` nem `MONITOR` pelo `command()`; o pub/sub ainda
não é suportado pela fachada. O `SUBSCRIBE` resolve com a confirmação dele —
`['subscribe', 'news', 1]` — e deixa a conexão inscrita, de volta ao pool como qualquer outra. Um
com vários canais é confirmado uma vez por canal, nos dois protocolos, e as confirmações extras
resolvem os comandos em pipeline atrás dele: depois de `SUBSCRIBE a b`, um `PING` atrás dele
resolveu com `['subscribe', 'b', 2]`. Em seguida:

- No RESP2 padrão, essa conexão recusa comandos comuns — um `GET` ali falha com
  `ERR Can't execute 'get': only (P|S)SUBSCRIBE / (P|S)UNSUBSCRIBE / PING / QUIT / RESET are allowed in this context`
  — e uma mensagem publicada no canal chega como um array simples, tomado como a resposta do próximo
  comando naquela conexão: um `PING` resolveu com `['message', 'news', 'hello']`, e a resposta dele
  foi para o comando seguinte.
- No RESP3, a conexão continua rodando comandos, e as mensagens publicadas são descartadas.

## Referência

### KV

`Bootgly\ADI\Databases\KV` estende `Bootgly\ADI\Database`. Os `Config`, `Pool`, `Pools`,
`Connection` e `drivers` herdados estão na Referência do
**[Núcleo do DBAL](/manual/ADI/Database/overview/#database)**. Os pools dele criam drivers a partir
de `Bootgly\ADI\Databases\KV\Drivers`, que registra um, `redis`; `Bootgly\ADI\Databases\KV\Driver`,
a base dos drivers key-value, define `LINGERING` como `false`.

```php
__construct (array|Config $config = [])
```

Monta a fachada a partir de um array nativo do ADI ou de um `Bootgly\ADI\Database\Config` — um
array vira um — e o pool do `driver`. Lança `InvalidArgumentException` para os erros da própria
config, como um `secure.mode` não suportado. Não abre conexão, e não confere o `driver`: um nome sob
o qual nenhum driver key-value está registrado lança a partir do `command()`.

```php
command (string $command, array $arguments = []): Operation
```

Cria uma operação key-value para `$command` e os `$arguments` dele (`array<int,mixed>`, convertidos
como [Argumentos](#argumentos) descreve), com o `timeout` do pool, e a atribui ao pool: uma conexão
ociosa, uma nova abaixo de `pool.max`, uma ocupada e pronta para entrar em pipeline, ou `pending`.
Nada é enviado até ela ser avançada. Lança `InvalidArgumentException` com
`Database driver is not registered: pgsql.` quando nenhum driver key-value está registrado sob o
`driver` — por enquanto, só até essas chamadas guardarem `pool.max` vagas (veja [Erros](#erros)).

```php
advance (Operation $Operation): Operation
```

Move a operação, pelo pool dono dela, até onde o socket permite — conexão, TLS, `AUTH`/`SELECT`,
escrita, leitura — e a retorna, sem esperar. Não lança para uma operação que falhou: leia o `error`
dela.

```php
await (Operation $Operation): Operation
```

Avança a operação, pelo pool dono dela, até ela terminar, e a retorna. Lança uma `RuntimeException`
com `$Operation->error` quando ela falha, e recusa uma operação estacionada em `pending`. Bloqueia o
processo e nunca suspende uma Fiber; veja
**[Aguarde de forma síncrona](/manual/ADI/Database/Pool/overview/#aguarde-de-forma-síncrona)**.

```php
cancel (Operation $Operation): Operation
```

Desiste da operação e a retorna, sem enviar nada ao Redis: uma operação estacionada falha com
`Database operation has no protocol to cancel.`, uma ainda não avançada com
`Database operation was cancelled before reaching the server.`, e qualquer outra não terminada com
`Database driver does not support cancellation.` — um comando escrito ainda roda, e um sendo escrito
fecha a conexão dele. Define `revoked`, nunca `cancelled`; uma operação terminada mantém a resposta.
Veja [Cancelamento](#cancelamento).

```php
withdraw (Operation ...$Operations): void
```

Herdado de `Database`: retira operações localmente, sem enviar nada. Veja a Referência do
**[Núcleo do DBAL](/manual/ADI/Database/overview/#database)** e [Retirada](#retirada).

### Operação KV

`Bootgly\ADI\Databases\KV\Operation` estende `Bootgly\ADI\Database\Operation`; os campos que ela
herda estão em **[Operação](/manual/ADI/Database/overview/#operação)**.

```php
__construct (null|Connection $Connection, string $command, array $arguments = [], float $timeout = 0.0)
```

Cria uma operação pendente para `$command` e os `$arguments` dele; um `$timeout` acima de `0.0`
define o prazo dela para daqui a esse número de segundos. O `command()` a monta para você.

```php
public string $command
```

O nome do comando, como foi passado.

```php
public array $arguments
```

Os argumentos (`array<int,mixed>`), como foram passados, antes da conversão.

```php
public mixed $response = null
```

A resposta decodificada (veja [Respostas](#respostas)): `null` até a operação resolver, depois de
uma falha, e para uma resposta nil.

```php
public string $write = ''
```

O comando codificado que ainda falta escrever — numa conexão nova, precedido pelo `AUTH` e pelo
`SELECT` que a abrem. É o buffer de trabalho do driver: leia-o, nunca o escreva.

### KVConfig

`Bootgly\API\Environment\Configs\KVConfig` — o adaptador do escopo de config `kv` para a config da
fachada.

```php
__construct (Config $Config)
```

Recebe o escopo, um `Bootgly\API\Environment\Configs\Config`. Lança `InvalidArgumentException` com
`KV config adapter expects the kv scope.` para qualquer outro escopo.

```php
configure (): ADIConfig
```

Retorna um novo `Bootgly\ADI\Database\Config` — importado como `ADIConfig` — montado a partir dos
nós vinculados, com `driver` `'redis'` quando o `Driver` não está vinculado. Lança
`InvalidArgumentException` para um driver que não é `redis`, um driver que não é escalar, e os erros
de TLS da própria config. Veja [Configure a partir do escopo kv](#configure-a-partir-do-escopo-kv).

```php
public Config $Config
```

O escopo que o adaptador lê.
