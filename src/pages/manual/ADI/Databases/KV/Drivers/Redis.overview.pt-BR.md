# Driver Redis

`Bootgly\ADI\Databases\KV\Drivers\Redis` fala RESP de forma nativa sobre o pool assíncrono do DBAL —
uma discagem TCP não bloqueante, TLS implícito, o preâmbulo `AUTH`/`SELECT` e pipelining — pelo codec
compartilhado `Bootgly\ABI\Data\RESP`, com zero dependências: ele não usa o `ext-redis`, nem quando a
extensão está carregada. É o único driver da fachada KV, registrado como `redis`.

Esta página cobre o que é próprio do Redis. As chaves de conexão, os padrões delas e os modos de TLS
estão em **[Configuração do banco](/manual/ADI/Database/Config/overview/)**; executar um comando e
ler a resposta dele, em **[Banco KV](/manual/ADI/Databases/KV/overview/)**; esperas, prazos,
cancelamento e retirada, em **[Pool de conexões](/manual/ADI/Database/Pool/overview/)**; como o KV se
compara ao SQL, em **[Bancos de dados](/manual/ADI/Databases/overview/)**.

## Conectando

```php
use Bootgly\ADI\Databases\KV;

$KV = new KV([
   'driver' => 'redis',
   'host' => '127.0.0.1',
   'port' => 6379,
   'secure' => ['mode' => 'disable'], // a plaintext Redis is declared, never inferred
]);

$Operation = $KV->await($KV->command('PING'));
$Operation->response; // 'PONG'
$KV->Pool->created;   // 1
```

Um array serve a um script fora de um projeto, e ele explicita `driver` e `port`, cujos padrões são
os de um PostgreSQL local (veja **[Chaves e padrões](/manual/ADI/Database/Config/overview/#chaves-e-padrões)**).
Em um projeto, crie a fachada a partir do escopo de config `kv`, e em uma rota `HTTP_Server_CLI` use
o `$Response->KV` — veja **[Abra um banco KV](/manual/ADI/Databases/KV/overview/#abra-um-banco-kv)**.
Criar a fachada não abre nada: o primeiro comando disca, e cada conexão do pool é um socket TCP para
`host`:`port`.

- A discagem TCP não bloqueia. O `advance()` a inicia e retorna, e o comando segue assim que o
  socket tem um peer. Uma discagem ainda em andamento quando o prazo do comando passa o falha com
  `Database operation timed out after 30 seconds.`, com o `timeout` configurado no lugar de `30`.
- Assim que o socket conecta — antes de qualquer handshake TLS — o driver desliga o algoritmo de
  Nagle (`TCP_NODELAY`), para que um comando pequeno saia na hora em vez de esperar o servidor
  confirmar o anterior. Isso exige o `ext-sockets`; sem ele, o socket mantém a configuração do
  sistema.
- Uma discagem que falha nomeia o endpoint e a causa, como em
  `Redis connection failed: 127.0.0.1:6379 refused the connection (ECONNREFUSED).`; os textos das
  outras causas — um reset, um host ou uma rede inalcançável, uma discagem que esgotou o tempo, um
  PHP sem o `ext-sockets` — estão em **[Falhas](/manual/ADI/Database/overview/#falhas)**. Uma
  discagem que falhou nunca é uma recusa de TLS, então o `prefer` não faz downgrade por uma porta
  fechada. Um nome de host que não resolve falha antes, com a mensagem do próprio PHP, cujo final vem
  do resolver do sistema e varia com ele:
  `Database connection failed: php_network_getaddresses: getaddrinfo for redis.invalid failed: Name or service not known`,
  e `… failed: No address associated with hostname` para um nome inexistente sob um domínio real.
- Resolver um nome de host bloqueia, sim: o `advance()` que inicia uma discagem espera o resolver do
  sistema — um round-trip de DNS, ou o quanto um resolver lento levar —, e num worker o event loop
  inteiro espera junto. E, por enquanto, a discagem tenta só o primeiro endereço para o qual o nome
  resolve: onde `localhost` resolve primeiro para `::1`, um Redis que escuta só em `127.0.0.1` o
  recusa. Escreva o endereço IP.
- Todo comando sai como um array RESP2 de bulk strings, que todo Redis aceita. O driver nunca envia
  `HELLO` — as respostas são RESP2 a menos que uma conexão seja trocada (veja
  [RESP3 e push frames](#resp3-e-push-frames)) — nem `CLIENT SETNAME`, então o `CLIENT LIST` mostra
  as conexões dele com o `name` vazio.

## Autenticação e seleção do banco

```php
use Bootgly\ADI\Databases\KV;

$KV = new KV([
   'driver' => 'redis',
   'host' => '127.0.0.1',
   'port' => 6379,
   'password' => 'secret',
   'database' => '3',
   'secure' => ['mode' => 'disable'],
]);

$Operation = $KV->await($KV->command('CLIENT', ['INFO']));
$Operation->response; // 'id=7 addr=127.0.0.1:41872 laddr=127.0.0.1:6379 fd=8 name= … db=3 … user=default redir=-1 resp=2 …'
```

O primeiro comando escrito numa conexão nova leva um preâmbulo na mesma escrita: `AUTH` com o
`password` quando ele não está vazio, depois `SELECT` com o `database` quando ele tem só dígitos e
não é `0`. As respostas deles são lidas e descartadas antes da do comando. Uma conexão envia o
próprio preâmbulo uma vez; toda conexão que o pool disca depois, ou disca de novo após uma sessão
derrubada, envia o seu.

- O `AUTH` leva só a senha, então a conexão se autentica como o usuário `default` do Redis. O driver
  não lê o `username`: por enquanto nenhuma chave de config autentica como outro usuário ACL.
- O `database` é o índice, como `'3'` ou `3`. Qualquer outro valor não envia `SELECT` e deixa a
  conexão no banco 0: `'0'`, uma string vazia e todo valor que não tem só dígitos — o padrão
  `'bootgly'`, `' 3'`, `'-1'`. Um índice com zero à esquerda, como `'03'`, tem só dígitos, então é
  enviado como está, e o Redis o recusa com `ERR value is not an integer or out of range`.
- Um preâmbulo recusado falha o comando com a resposta do servidor e derruba a sessão: todo comando
  em pipeline nessa conexão falha com a mesma mensagem, e o próximo comando disca de novo. Uma senha
  errada falha com `WRONGPASS invalid username-password pair or user is disabled.`, uma senha que um
  servidor sem senha recusa, com
  `ERR AUTH <password> called without any password configured for the default user. Are you sure your configuration is correct?`,
  e um índice que o servidor não tem — `'16'` com os 16 bancos padrão —, com
  `ERR DB index is out of range`.
- Com o `password` vazio e um servidor que exige um, nada sai à frente do comando, então cada comando
  falha sozinho com `NOAUTH Authentication required.`, e a conexão fica.
- `AUTH`, `SELECT` e `HELLO` enviados pelo `command()` mudam só a conexão que os executa, e uma
  conexão discada de novo volta com o preâmbulo configurado. Defina `password` e `database` na config
  em vez disso (veja **[Estado da conexão](/manual/ADI/Databases/KV/overview/#estado-da-conexão)**).

## TLS

```php
use Bootgly\ADI\Databases\KV;

$KV = new KV([
   'driver' => 'redis',
   'host' => '10.0.0.15',
   'port' => 6380,
   'password' => getenv('KV_PASS') ?: '',
   'secure' => [
      'mode' => 'verify-full',
      'cafile' => '/run/secrets/redis-ca.pem',
      'peer' => 'redis.internal',
   ],
]);

$KV->await($KV->command('PING'))->response; // 'PONG'
```

O TLS do Redis é implícito: uma porta TLS espera um ClientHello como primeiro byte, sem pedido no
protocolo antes dele — o PostgreSQL pergunta antes com um `SSLRequest`. O `verify-full` confere a
cadeia contra o `cafile` e o nome do certificado contra o `peer` — o nome que ele carrega, já que o
host é um endereço que ele não nomeia —, e nada chega ao servidor, `AUTH` inclusive, antes de o
handshake terminar. Os modos e as chaves `verify`, `name`, `peer` e `cafile` funcionam como
**[TLS](/manual/ADI/Database/Config/overview/#tls)** descreve. No Redis:

- `disable` envia plaintext, sem tentativa de handshake e sem budget a pagar. É o único modo que
  alcança um Redis plaintext; contra uma porta TLS, o primeiro comando falha com
  `Redis socket closed.`
- `require`, `verify-ca` e `verify-full` concluem o handshake antes de o preâmbulo e o primeiro
  comando saírem. Um peer que recusa o TLS falha o comando com
  `Redis TLS handshake failed: the peer closed the TLS handshake.` — ou `reset`, ou bytes que não são
  TLS —, e um silencioso é esperado até o prazo do comando, então um servidor TLS que responde tarde
  ainda conclui o handshake, e um que nunca responde falha com
  `Database operation timed out after 30 seconds.`
- `prefer`, o padrão, tenta TLS primeiro e só passa para plaintext quando o peer o recusa
  **explicitamente**: resetou (RST) ou fechou (FIN) a conexão durante o handshake — no ClientHello ou
  depois de parte de um ServerHello, tanto faz — ou respondeu com bytes que não são TLS. O driver
  então disca uma conexão nova em plaintext, para que nenhuma credencial atravesse a recusada, e
  registra a recusa (veja [Ler o downgrade](#ler-o-downgrade)). Por isso o `prefer` não garante
  criptografia: um peer que recusa o TLS — ou um atacante no caminho que reseta a primeira conexão —
  recebe o `AUTH` em plaintext na segunda. Onde plaintext não é aceitável, use `require`,
  `verify-ca` ou `verify-full`.
- Silêncio não é recusa. Um Redis plaintext nunca responde a um ClientHello — ele guarda os bytes no
  query buffer —, e um servidor TLS cuja resposta atrasa parece igual, então fazer downgrade no
  silêncio enviaria o `AUTH` em plaintext a um servidor que fala TLS. Sob `prefer`, um peer que não
  respondeu dentro do budget de handshake falha o comando com
  `Redis TLS handshake timed out: the peer did not answer the TLS handshake within 1s — set secure.mode => 'disable' for a plaintext Redis.`
  O budget, `Redis::HANDSHAKE_BUDGET`, é de um segundo, limitado à metade do `timeout`: `0.5s` com
  `timeout` `1.0`, e um segundo inteiro com `timeout` `0`, que não define prazo. Nenhum outro modo
  tem um.
- Nada mais faz downgrade. Um certificado não confiável, um nome que não bate com o `peer`, um alerta
  TLS ou um erro local — um `cafile` que o OpenSSL não consegue carregar — falha o comando com
  `Redis TLS handshake failed:` e o diagnóstico do OpenSSL, também sob `prefer`.
- Só `verify-ca` e `verify-full` conferem o certificado. `prefer` e `require` criptografam sem
  conferir quem responde — `'verify' => true` os liga —, então um atacante ativo no caminho que
  apresente qualquer certificado recebe o `AUTH`. Numa rede em que você não confia, use um modo
  `verify-*`.
- Com o `cafile` vazio, vale o trust store padrão do OpenSSL — `openssl.cafile` e `openssl.capath`,
  ou `SSL_CERT_FILE` e `SSL_CERT_DIR` quando definidos —, então uma CA privada precisa do `cafile`.
  Só um handshake que verifica o lê, então um `cafile` sob `prefer` ou `require` sem `verify` é
  recusado quando a config é criada. Um que não pode ser lido falha o comando antes de qualquer
  conexão abrir, com `Database TLS cafile is not a readable file: /run/secrets/redis-ca.pem.`, e um
  que não contém certificado — ou um `openssl.cafile` que não contém nenhum — falha o handshake com
  ``Redis TLS handshake failed: no valid certs found cafile stream: `/run/secrets/redis-ca.pem'``,
  seja o que for que o `error_reporting()` mascare. Nenhum dos dois cai no store padrão, nem em
  plaintext.
- O escopo de config `kv` define `mode`, `verify`, `peer` e `cafile` a partir de `KV_SSLMODE`,
  `KV_SSLVERIFY`, `KV_SSLPEER` e `KV_SSLCAFILE`. Ele não tem nó para o `name`, então
  `KV_SSLVERIFY=true` confere o nome também; para conferir só a cadeia, use `KV_SSLMODE=verify-ca`
  (veja **[Configure a partir do escopo kv](/manual/ADI/Databases/KV/overview/#configure-a-partir-do-escopo-kv)**).

> [!NOTE]
> Desde a 1.0.0, o `prefer` tenta TLS por padrão e nunca faz downgrade diante de um peer
> silencioso: um Redis plaintext não declarado — sem `'secure' => ['mode' => 'disable']` na config —
> custa o budget de handshake a cada nova conexão e falha todo comando até ser declarado, onde as
> releases anteriores caíam em plaintext. Desde a 1.0.3, `prefer` e `require` não verificam mais o
> certificado a menos que o `verify` esteja definido: uma conexão `require` que fixava um `cafile` é
> recusada quando a config dela é criada, até usar `verify-ca`, `verify-full` ou `'verify' => true`.

### Confiança presa a um socket

O driver registra o socket em que se acertou — o que o handshake dele criptografou, ou o plaintext
do `disable` ou de um downgrade do `prefer` — e o confere antes de toda escrita e de toda leitura. Um
socket trocado por baixo do driver falha o comando e derruba a sessão em vez de levar RESP adiante:
sob um modo strict com `Redis strict TLS mode rejected a changed connection generation.` — ou
`Redis strict TLS mode requires an encrypted connection.` para um socket que não está
criptografado — e sob `prefer` ou `disable` com `Redis connection generation changed during command I/O.`

Todo socket novo começa do zero: um handshake ou uma decisão de plaintext novos, um preâmbulo novo,
um decoder vazio. Um comando escrito pela metade no socket antigo nunca é terminado no novo, e
nenhuma resposta lida no novo resolve um comando escrito no antigo.

### Ler o downgrade

```php
use Bootgly\ADI\Databases\KV\Drivers\Redis;

$Operation = $KV->await($KV->command('PING'));

if ($Operation->Protocol instanceof Redis && $Operation->Protocol->downgrade !== '') {
   error_log("Redis connection is not encrypted: {$Operation->Protocol->downgrade}");
}
```

O `$Operation->Protocol` é o driver da conexão em que o comando rodou, e o `downgrade` dele registra
a recusa em que o `prefer` fez o downgrade dessa conexão:

| `downgrade` começa com | O peer |
|---|---|
| `the peer closed the TLS handshake` | Fechou a conexão durante o handshake (FIN) |
| `the peer reset the TLS handshake (` | A resetou (RST); os parênteses citam o erro do sistema, no idioma dele |
| `the peer answered the TLS handshake with non-TLS bytes (` | Respondeu com bytes que não são TLS; os parênteses citam o OpenSSL, como em `wrong version number` |

Ele fica vazio enquanto a conexão está criptografada, sob `disable` e antes de a conexão abrir, e é
limpo quando a sessão cai ou tenta TLS de novo. É o único rastro do downgrade: nada é logado, já que
a camada de banco não tem logger. Leia-o onde plaintext importa, ou use um modo strict, que nunca
faz downgrade.

Por enquanto, quando a discagem em plaintext que segue uma recusa é ela própria recusada, o comando
falha nomeando só essa discagem — `Redis connection failed: 127.0.0.1:6379 refused the connection (ECONNREFUSED).` —,
e a recusa de TLS anterior se perde com a sessão.

## RESP3 e push frames

```php
use Bootgly\ADI\Databases\KV;

$KV = new KV([
   'driver' => 'redis',
   'host' => '127.0.0.1',
   'port' => 6379,
   'secure' => ['mode' => 'disable'],
   'pool' => ['max' => 1],
]);

$KV->await($KV->command('HELLO', ['3']));

$KV->await($KV->command('SUBSCRIBE', ['news']))->response; // ['subscribe', 'news', 1]

// Another client publishes to news: the message arrives here and is dropped.

$KV->await($KV->command('PING'))->response; // 'PONG'
```

O `HELLO 3` troca para RESP3 só a conexão em que roda — aqui a única do pool —; qualquer outra
conexão, e uma discada de novo, fala RESP2. Em RESP3, o Redis também envia frames que nenhum comando
pediu, marcados como push frames: mensagens de pub/sub, invalidações do client-side caching. O driver
os mantém fora da fila de respostas, então um push nunca toma a resposta de outro comando:

- a confirmação de um comando de subscribe — `SUBSCRIBE`, `PSUBSCRIBE`, `SSUBSCRIBE` e os
  `UNSUBSCRIBE` correspondentes — responde a esse comando, como um array simples;
- todo outro push é descartado, e nada o entrega à aplicação.

O RESP3 também muda as respostas — um hash como array associativo, um score como `float` —, então o
mesmo comando responde em dois formatos, conforme a conexão que o pool lhe entrega (veja
**[Respostas](/manual/ADI/Databases/KV/overview/#respostas)**).

O roteamento tem duas lacunas por enquanto, um dos motivos de o pub/sub não ser suportado pelo
`command()` (veja **[Pub/sub e MONITOR](/manual/ADI/Databases/KV/overview/#pubsub-e-monitor)**):

- Uma confirmação responde a um comando, mas o Redis confirma um comando de subscribe uma vez por
  canal que ele nomeia: depois de `SUBSCRIBE a b c`, dois comandos em pipeline atrás dele resolvem
  com `['subscribe', 'b', 2]` e `['subscribe', 'c', 3]`.
- O roteamento lê o tipo push frame, que só o RESP3 tem. Em RESP2, o padrão, uma mensagem publicada
  é um array simples que o driver não distingue de uma resposta: numa conexão inscrita, ela resolve o
  próximo comando — um `PING` lê `['message', 'news', 'hello']` — e toda resposta seguinte ali chega
  um comando atrasada.

## Pipelining

Os comandos de uma conexão fazem pipeline: cada comando sai assim que a escrita anterior a ele está
inteira, sem esperar resposta alguma, e o Redis responde em ordem, então cada resposta resolve o
comando mais antigo ainda esperando nessa conexão. O pool decide quais comandos dividem uma conexão
(veja **[Saturação e co-localização](/manual/ADI/Database/Pool/overview/#saturação-e-co-localização)**),
e **[Comandos em pipeline](/manual/ADI/Databases/KV/overview/#comandos-em-pipeline)** mostra a
receita com a fachada.

- Uma resposta de erro falha só o próprio comando: a conexão fica, e a próxima resposta vai para o
  próximo comando.
- Um transporte perdido falha tudo na conexão. Um peer que fecha — um restart, um `CLIENT KILL`, o
  `timeout` de cliente ocioso do servidor — falha o comando em leitura e todo comando em pipeline
  atrás dele com `Redis socket closed.`, uma escrita que o socket recusa, com
  `Redis socket write failed.`, e a sessão é derrubada; o próximo comando disca de novo, com o
  handshake e o preâmbulo dele. Um frame que o decoder não consegue ler — atributos RESP3 (`|`)
  inclusive — faz o mesmo com a mensagem do decoder, como em `Unknown RESP type byte: Z`. Esses
  comandos podem ter rodado: repita só o que é seguro rodar duas vezes.
- Um comando composto nessa conexão mas ainda não escrito falha quando é avançado de novo, com
  `Redis connection was torn down before the command was sent.`, e nunca é escrito numa conexão
  discada depois.
- Um comando bloqueante segura todo comando em pipeline atrás dele até retornar: um `PING` atrás de
  `BLPOP jobs 1` responde depois de um segundo (veja
  **[Comandos bloqueantes](/manual/ADI/Databases/KV/overview/#comandos-bloqueantes)**).

### Comandos abandonados

Um comando escrito que o pool abandona — o prazo dele passou, ou ele foi cancelado ou retirado —
ainda tem uma resposta a caminho, e as respostas seguem em ordem: quando outro comando ainda lê na
conexão — um sendo escrito conta —, um stand-in que ninguém lê toma esse lugar, a resposta é
descartada quando chega, e os comandos atrás dele recebem as próprias. A conexão fica, e um comando
que o pool lhe entrega em seguida espera atrás dessa resposta.

Sem outro leitor, o driver derruba a sessão em vez disso, e o Redis encerra o trabalho de um cliente
que desconecta: um `BLPOP` bloqueado é liberado. Um comando abandonado enquanto está sendo escrito
sempre derruba a sessão — o resto do frame dele não tem como ser desfeito — e todo comando em
pipeline ali falha com `Redis operation was abandoned while writing its command.`

Uma sessão derrubada não retém vaga além de si mesma: o Redis não continua rodando o trabalho de um
cliente desconectado, então o `LINGERING` é `false` para drivers key-value (veja
**[Vagas retidas](/manual/ADI/Database/Pool/overview/#vagas-retidas)**). Por enquanto, retirar um
comando escrito enquanto outro ainda lê na conexão dele tira essa conexão da co-localização até ela
ficar ociosa: o pool a trata como uma sessão SQL que deve um reset (veja
**[Reset de sessão](/manual/ADI/Database/Pool/overview/#reset-de-sessão)**), embora o Redis não
tenha nenhum a escrever, então num pool cheio o próximo comando estaciona em `pending`: o `await()`
da fachada o faz falhar na hora com `Database pool has no capacity for the operation.`, enquanto o
`$Response->KV` segue esperando até o comando que ainda lê ali terminar.

## Cancelamento

```php
use RuntimeException;

use Bootgly\ADI\Database\Operation\OperationStates;
use Bootgly\ADI\Databases\KV;

$KV = new KV([
   'driver' => 'redis',
   'host' => '127.0.0.1',
   'port' => 6379,
   'secure' => ['mode' => 'disable'],
]);

$Waiting = $KV->command('BLPOP', ['jobs', 30]);

while ($Waiting->finished === false && $Waiting->state !== OperationStates::Reading) {
   $KV->advance($Waiting);
   usleep(1000);
}

$KV->cancel($Waiting);

try {
   $KV->await($Waiting);
}
catch (RuntimeException $Exception) {
   $Exception->getMessage(); // Database driver does not support cancellation.
}

$Waiting->cancelled; // false
$KV->Pool->created;  // 0
```

O driver não tem pedido de cancelamento — a maioria dos comandos do Redis termina assim que o Redis
os lê, e ele não envia nem `CLIENT UNBLOCK` nem `SCRIPT KILL` —, então mantém o `cancel()` herdado,
que não envia nada: ele falha o comando com `Database driver does not support cancellation.`, e o
`cancelled` fica `false`. O pool então abandona o comando como faria com um expirado (veja
[Comandos abandonados](#comandos-abandonados)). Aqui o `BLPOP` estava sozinho na conexão, então a
sessão foi derrubada, e o Redis liberou o cliente bloqueado.

O driver também mantém o `owe()` herdado, que conta todo comando depois de `Queued` como enviado,
então o pool só retira localmente um comando que nunca foi avançado: ele falha com
`Database operation was cancelled before reaching the server.`, e a conexão dele fica. Qualquer
comando além disso falha como acima, e a conexão dele segue conforme até onde ele chegou:

- ainda discando ou no handshake TLS — a conexão semiaberta é derrubada;
- esperando a escrita de outro comando terminar — nada dele foi enviado, e a conexão fica;
- sendo escrito, ou escrito — ele é abandonado como acima.

Por enquanto, essa mensagem não diz se o Redis rodou o comando: um cancelado enquanto discava, no
handshake ou atrás de outra escrita nunca chegou ao servidor, e ainda assim falha como um que o Redis
já recebeu. O lado da fachada do `cancel()` e do `withdraw()` está em
**[Cancelamento](/manual/ADI/Databases/KV/overview/#cancelamento)** e
**[Retirada](/manual/ADI/Databases/KV/overview/#retirada)**, e o do pool em
**[Cancele um statement em execução](/manual/ADI/Database/Pool/overview/#cancele-um-statement-em-execução)**.

## Erros

Uma resposta de erro do Redis guarda o texto dela no `error` da operação — `ERR …`, `WRONGTYPE …` — e
falha só o comando dela; prazos, cancelamento e as recusas do pool estão em
**[Erros](/manual/ADI/Databases/KV/overview/#erros)**. As falhas que vêm do driver, ou do preâmbulo
que ele envia:

| Mensagem | Causa |
| --- | --- |
| `Redis connection failed: 127.0.0.1:6379 refused the connection (ECONNREFUSED).` | Nada escuta em `host`:`port`; as outras falhas de discagem estão em **[Falhas](/manual/ADI/Database/overview/#falhas)** |
| `Database connection failed: php_network_getaddresses: getaddrinfo for redis.invalid failed: Name or service not known` | O `host` não resolve; o texto depois de `failed:` vem do resolver do sistema (veja [Conectando](#conectando)) |
| `WRONGPASS invalid username-password pair or user is disabled.` | O servidor recusou o preâmbulo `AUTH` |
| `ERR AUTH <password> called without any password configured for the default user. Are you sure your configuration is correct?` | O `password` está definido, e o servidor não tem senha |
| `ERR DB index is out of range` | O servidor recusou o preâmbulo `SELECT` |
| `NOAUTH Authentication required.` | O `password` está vazio, e o servidor exige um: uma resposta de erro, a conexão fica |
| `Redis TLS handshake timed out: the peer did not answer the TLS handshake within 1s — set secure.mode => 'disable' for a plaintext Redis.` | `prefer` contra um peer em silêncio além do budget de handshake, como um Redis plaintext |
| `Redis TLS handshake failed: the peer closed the TLS handshake.` | Um modo strict contra um peer que recusou o TLS; um reset ou bytes que não são TLS aparecem como em [Ler o downgrade](#ler-o-downgrade) |
| ``Redis plaintext fallback failed after the TLS refusal `the peer closed the TLS handshake`: …`` | O `prefer` discou de novo em plaintext depois de uma recusa de TLS, e essa discagem falhou antes de começar — o host deixou de resolver, por exemplo; a mensagem termina com o erro da própria discagem |
| ``Redis TLS handshake failed: stream_socket_enable_crypto(): Peer certificate subjectAltName did not match expected name `127.0.0.1'`` | O `name` está ligado, e o certificado não nomeia o `peer` |
| `Redis TLS handshake failed: stream_socket_enable_crypto(): SSL operation failed with code 1. OpenSSL Error messages: error:0A000086:SSL routines::certificate verify failed` | O `verify` está ligado, e a cadeia não leva a uma CA que o trust store tenha |
| ``Redis TLS handshake failed: no valid certs found cafile stream: `/run/secrets/redis-ca.pem'`` | O `cafile` não contém certificado |
| `Redis socket closed.` | O peer fechou a conexão — ou uma porta TLS recebeu uma conexão `disable` |
| `Redis socket write failed.` | O socket recusou uma escrita |
| `Unknown RESP type byte: Z` | Um frame que o decoder não consegue ler |
| `Redis operation was abandoned while writing its command.` | Outro comando da conexão foi abandonado enquanto era escrito, e a sessão junto |
| `Redis connection was torn down before the command was sent.` | O comando foi composto numa sessão que caiu antes de ele ser escrito |
| `Redis strict TLS mode rejected a changed connection generation.` | O socket de uma conexão em modo strict foi trocado |
| `Redis connection generation changed during command I/O.` | O socket de uma conexão `prefer` ou `disable` foi trocado |
| `Database driver does not support cancellation.` | `cancel()` de um comando além de `Queued` |

Cada uma dessas falhas encerra a sessão — todo comando em pipeline nela falha com a mesma mensagem, e
o próximo comando disca de novo —, e o mesmo fazem as mais raras `Redis socket read failed.`,
`Redis socket closed during write.` e `Redis socket is not available.` As exceções: `NOAUTH` é uma
resposta de erro simples, que deixa a conexão de pé; um host que não resolve, e um comando composto
numa sessão que já caiu, falham sozinhos, sem sessão a encerrar; e a conexão de um comando cancelado
segue como [Cancelamento](#cancelamento) descreve. Os diagnósticos do OpenSSL são citados como o PHP
os levanta, com uma quebra de linha antes de `error:`.

## Referência

O `$Operation->Protocol` é o driver da conexão em que um comando roda. O pool chama os métodos dele;
uma aplicação lê as propriedades. `DatabaseOperation`, e `Operation` nos métodos herdados de
`Bootgly\ADI\Database\Driver`, é `Bootgly\ADI\Database\Operation`: o driver trabalha com a subclasse
`Bootgly\ADI\Databases\KV\Operation` e falha qualquer outra com `Redis requires a KV operation.`

```php
public const float HANDSHAKE_BUDGET = 1.0;
```

Segundos que um peer tem para responder ao ClientHello sob `prefer`, limitados à metade do
`timeout` — um segundo inteiro quando o `timeout` é `0`. Passado ele, o comando falha nomeando o
`disable`; os modos strict nunca o usam.

```php
public const bool LINGERING = false;
```

Herdada de `Bootgly\ADI\Databases\KV\Driver`: o Redis descarta na hora o trabalho de um cliente
desconectado, então o pool não conta vaga além de uma sessão derrubada.

```php
__construct (Config $Config, Connection $Connection)
```

Cria o driver para uma conexão do pool, com encoder e decoder RESP próprios; quem o cria é o pool,
pelo registry de drivers KV. Dada uma conexão que já tem um socket, ele toma esse socket como o
atual — como criptografado quando ele carrega TLS.

```php
command (string $command, array $arguments = []): Operation
```

Cria uma `KV\Operation` na conexão do driver, com o `timeout` da config, e a prepara. O `command()`
da fachada não o chama: ele cria a operação por conta própria e a entrega ao pool, que a prepara na
conexão que atribui.

```php
prepare (DatabaseOperation $Operation): DatabaseOperation
```

Liga a operação a este driver e à conexão dele, codifica o comando e os argumentos dele como um
array RESP e a deixa em `Queued`. Um argumento `int` é escrito como está, qualquer outro escalar vira
string — um `float` com a configuração `precision` do PHP, 14 dígitos significativos por padrão, por
enquanto — e `null`, um array ou um objeto vira uma string vazia (veja
**[Argumentos](/manual/ADI/Databases/KV/overview/#argumentos)**). Falha uma operação que não é
`KV\Operation` com `Redis requires a KV operation.`

```php
advance (DatabaseOperation $Operation): DatabaseOperation
```

Conduz a máquina de estados da conexão: a discagem, o `TCP_NODELAY`, o handshake TLS e a discagem em
plaintext do `prefer`, o preâmbulo, a escrita do comando e a leitura da resposta. Retorna assim que o
socket não está pronto, com a prontidão a esperar registrada na operação.

```php
owe (Operation $Operation): bool
```

Padrão herdado: `true` para toda operação depois de `Queued`. O pool o consulta antes de um cancel e
só retira localmente o que dá `false` — no Redis, um comando nunca avançado.

```php
cancel (Operation $Operation): Operation
```

Padrão herdado: falha a operação com `Database driver does not support cancellation.` e não envia
nada. O pool então a abandona.

```php
abandon (DatabaseOperation $Operation): void
```

Reconcilia o wire quando o pool finaliza um comando de fora — um prazo vencido, um cancel, uma
retirada. Um comando fora da fila de respostas fica como está, a menos que seja o que está sendo
escrito, o que derruba a sessão. Um enfileirado passa o lugar dele a um stand-in que absorve a
resposta quando outro comando ainda lê na conexão, um sendo escrito inclusive; sem nenhum, a sessão é
derrubada.

```php
detach (Operation $Operation): void
```

Padrão herdado: chama o `abandon()`, então uma retirada reconcilia o wire como um comando expirado, e
um comando retirado sem outro leitor derruba a sessão dele.

```php
reset (): bool
```

Padrão herdado: retorna `true` e não escreve nada, então o reset de sessão do pool não envia nada ao
Redis.

```php
check (): bool
```

Se a conexão ainda deve trabalho a um chamador, de modo que o pool não pode emprestá-la ainda: um
comando ainda sendo escrito, ou um comando não finalizado na fila de respostas. Stand-ins não contam.

```php
drain (): array
```

Retorna as operações que terminaram enquanto o driver lia ou derrubava a sessão em nome de outra —
irmãs em pipeline resolvidas na mesma leitura, ou falhadas junto com a sessão — e as esquece, para que
o pool possa liberar as vagas delas.

```php
sever (DatabaseOperation $Operation, string $error): void
```

Encerra a sessão: falha a operação e todo comando que a sessão ainda deve com `$error`, e desconecta.
O pool o chama quando não pode deixar uma sessão como está.

```php
public Encoder $Encoder;
```

O `Bootgly\ABI\Data\RESP\Encoder` que escreve cada comando como um array RESP de bulk strings.

```php
public Decoder $Decoder;
```

O `Bootgly\ABI\Data\RESP\Decoder` que lê as respostas desta conexão, RESP2 e RESP3. Ele guarda um
frame incompleto até o resto chegar, e é esvaziado a cada socket novo.

```php
public private(set) string $downgrade = '';
```

A recusa de TLS em que esta conexão fez downgrade para plaintext sob `prefer`; vazio caso contrário
(veja [Ler o downgrade](#ler-o-downgrade)).

```php
public bool $detached { get; }
```

Se a sessão ainda deve respostas a stand-ins.
