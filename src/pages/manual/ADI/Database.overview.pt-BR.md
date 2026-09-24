# DBAL de banco

`Bootgly\ADI\Database` é o núcleo baixo nível do DBAL. Ele é agnóstico de transporte:
mantém configuração, conexão, pools e operações pendentes, enquanto paradigmas concretos
como `Bootgly\ADI\Databases\SQL` adicionam verbos como `query()`, `table()` e `begin()`.

## Camadas

- `Database` - núcleo compartilhado para config, conexão e pool.
- `Databases` - registry/factory de paradigmas como `sql`.
- `Databases\SQL` - fachada SQL que normaliza SQL cru, builders e `Query` compilada para
  operações SQL.
- `Config` - host, porta, credenciais, timeout, TLS e pool.
- `Connection` - stream não bloqueante e estado de protocolo.
- `Pool` / `Pools` - pools reutilizáveis por driver com filas idle, busy e pending.
- `Operation` / `Result` - trabalho pendente mais linhas, colunas, afetados, último id
  gerado (`inserted`) e views de resultado.
- `Driver` / `Drivers` - implementações de protocolo; PostgreSQL, MySQL/MariaDB e SQLite
  são os drivers nativos.

## Ciclo de uma operação

```php
$Operation = $Database->query('SELECT $1::int AS value', [42]);
$Database->Pool->wait($Operation);

$rows = $Operation->Result?->rows ?? [];
```

`query()` cria uma `Operation` e atribui ao pool. O pool escolhe ou abre uma conexão, conecta
o driver, deixa o driver preparar os bytes de protocolo e avança até a operação resolver com
`Result` ou falhar com `error`.

Uma `Operation->code` de uma operação falha carrega a identidade de falha legível por máquina
do driver — SQLSTATE do PostgreSQL, errno do MySQL ou o código de resultado estendido do
SQLite — pareada com `error` e limpa em `retry()`. É `null` quando a falha não carrega
nenhuma, como uma recusa do framework ou uma perda de transporte. Cada falha é anunciada uma
vez através de `SQL\Events::Failed` — veja
**[Events](/guide/events/overview/)**.

Uma conexão que não pode ser aberta falha a operação com um `error` que nomeia o endpoint e a
causa — `MySQL connection failed: 127.0.0.1:3306 refused the connection (ECONNREFUSED).`
(os drivers PostgreSQL e Redis usam o mesmo texto). A causa é lida do socket quando a
`ext-sockets` está carregada — recusada, inalcançável, resetada ou expirada; sem ela a mensagem
lista essas quatro. Uma discagem apenas lenta — o primeiro SYN descartado e retransmitido — é
aguardada, nunca relatada como recusada: o `timeout` limita a espera e, sem `timeout`, o limite
do próprio kernel a encerra como `timed out (ETIMEDOUT)`.

Um servidor MySQL ou PostgreSQL que aceita a conexão TCP e desliga antes de enviar um único byte
também é nomeado: `MySQL connection failed: 127.0.0.1:3306 closed the connection before sending
its greeting; the server may still be starting.` (o PostgreSQL diz `during SSL negotiation` ou
`during startup`). É o que uma porta publicada do Docker faz enquanto o banco dentro do container
ainda está inicializando: espere o servidor ficar pronto e inicie de novo. Um servidor que desliga
depois de ter respondido mantém a mensagem simples de transporte (`socket closed`,
`socket read failed`).

Em rotas HTTP, prefira
**[Response Resources](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/overview/)** e
`$Response->Database` em vez de chamar `Pool->wait()` ou `advance()` manualmente.

## Comportamento do pool

O pool acompanha conexões `idle`, `busy`, `pending` e `created`. Ele se esgota quando não há
conexão idle disponível e `created` mais as vagas ainda retidas por statements SQL retirados (cada
uma até o próprio deadline — veja [Operações retiradas](#operações-retiradas)) alcança o `max`. A
partir daí uma nova operação se junta a uma conexão busy pronta que nenhuma transação segura; um
`BEGIN`, ou uma operação sem uma conexão dessas para se juntar, aguarda em `pending`. Quando uma
conexão é liberada, o pool promove operações pendentes.

`created` é a contagem do próprio pool, e toda conexão que ele segura — idle, busy ou
reservada por uma transação — é uma que ele conta. Uma conexão que o pool descartou continua
descartada mesmo que um driver reconecte o mesmo objeto por conta própria: ela não é entregue
de novo nem serve de alvo para pipelining, porque o trabalho nela nunca contaria contra o
`max`. E uma operação que o pool estacionou sai da fila no instante em que termina, então nada
pode promover e re-despachar trabalho que o chamador já cancelou.

Cancelar é uma decisão, não uma mensagem. A desistência é registrada no momento em que você a
pede, antes de o driver ser consultado — então vale tanto se o driver envia o pedido, quanto se
ele recusa porque o protocolo não tem por onde, quanto se recusa porque não suporta
cancelamento, quanto se falha de vez na tentativa. Nenhum failover automático para um pool de
réplica revive depois uma operação desistida. Isso é separado de o cancel ter chegado ou não ao
servidor, que é o que decide se a conexão ainda tem resposta a reconciliar.

Se alguma coisa é de fato *enviada* depende de onde a operação está. Um pedido de cancel nomeia
um backend, não um statement, então um pedido enviado para trabalho que não está rodando
chegaria no que aquele backend estiver fazendo. Por isso uma operação que já terminou, e uma
ainda composta mas nunca escrita, são retiradas localmente e nada vai para o fio. As duas
diferem no que sobra para quem chamou: uma operação finda mantém seu estado e seu resultado,
enquanto uma que nunca chegou ao servidor é falhada, já que o trabalho dela não aconteceu. Só
uma operação de fato em voo gera um pedido.

Se o socket local tiver sido fechado enquanto esse pedido sai, a operação falha na hora em vez
de esperar uma resposta que não pode mais chegar, e a vaga dela volta para o pool. Um peer que
some sem o socket local perceber não é detectável aqui — essa conexão é descoberta pela próxima
operação que a usar.

Essa fila pertence ao caminho assíncrono, onde algo mais segue avançando as operações que
seguram as conexões. `Pool::wait()` — o que `SQL::await()` chama — é a API síncrona: enquanto
ela bloqueia, nada avança aquelas operações, e só elas podem liberar um slot. Então um
`await()` sobre pool saturado recusa a operação com
`Database pool has no capacity for the operation.` e a tira de `pending`, em vez de esperar
por uma capacidade que não pode chegar. Deixá-la enfileirada era pior que recusar: o chamador
era informado de que sua escrita falhou e compensava com um rollback, e o `promote()` colocava
o comando no wire mesmo assim quando a capacidade liberava — fora da transação, em autocommit.

Um sinal sem restart pode interromper o `stream_select()` usado pelo `wait()` síncrono. EINTR
não altera a operação nem sua readiness, então o pool reconhece o errno da syscall mesmo quando
a mensagem do sistema operacional está traduzida e repete a espera com a mesma operação. Outras
falhas de select continuam propagando, e o timeout configurado da operação ainda pode expirá-la
normalmente; uma espera interrompida não é convertida em resultado de banco.

Uma conexão volta para o pool só quando nada mais é devido no socket dela. Enquanto o driver
ainda tem uma operação esperando resposta, a conexão continua `busy` — entregá-la daria as
linhas de um chamador para outro. "Devido" significa uma operação que não terminou: uma que
falhou ou expirou não deve nada ao chamador, mesmo que o driver mantenha o slot dela na FIFO
mais um pouco para absorver a mensagem que a encerra. Backends nem sempre respondem em uma
única leitura TCP, então uma query recusada com erro de sintaxe pode deixar uma entrada
terminada parada ali; o pool não lê mais isso como trabalho em andamento, o que antes custava
o slot permanentemente — e transações, que nunca compartilham conexão, eram então recusadas
por falta de uma capacidade que existia.

Um socket que não consegue mais entregar é descartado em vez de retido, não importa o que o
driver ainda tenha enfileirado nele: ele deve uma resposta que nunca poderá trazer, e tudo o
que libera o slot acontece depois dessa checagem.

Transações fixam uma conexão com `lock` e liberam com `unlock` depois de commit ou rollback.
A reserva é liberada pela operação que carrega o `unlock`, mesmo quando o driver ainda tem um
irmão co-localizado para terminar — a intenção vive naquela operação, então adiar a liberação
a perderia junto com ela e deixaria a conexão reservada para sempre.

Um caso leva a conexão junto: um commit ou rollback que o pool retira *antes de ele chegar ao
servidor*, seja porque você cancelou, seja porque o prazo dele venceu. Aquele statement não
encerrou nada, e a essa altura ninguém mais consegue — a transação abriu mão da profundidade e
da conexão no momento em que o statement foi composto. Passar essa conexão adiante rodaria o
trabalho do próximo caller dentro de uma transação aberta que ele não pediu, e mantê-la
reservada perderia a vaga para sempre com a sessão aberta do mesmo jeito. Então a conexão é
derrubada: o servidor faz rollback da transação, que é o que um commit que nunca rodou
significa, e a vaga volta para o pool.

Encerrar uma sessão também aposenta o driver que era dono dela. Um statement composto naquela
sessão mas nunca escrito não está na fila do driver nem no buffer de escrita, então o teardown não
consegue enxergá-lo e ele sobrevive à sessão segurando um driver cujo socket já morreu. Avançá-lo
depois disso o faz falhar — `PostgreSQL connection was torn down before the query was sent.`, ou a
mensagem equivalente do MySQL — e o comando que estava no buffer vai junto, em vez de ser escrito
na conexão que o pool reconstruiu no meio tempo. Uma reserva remanescente daquela sessão fica
inerte pelo mesmo motivo.

Uma operação presa a uma conexão que o pool não consegue mais fornecer — restart do servidor,
reciclagem de load balancer, socket derrubado — falha na hora em vez de esperar em `pending`.
Nenhuma capacidade satisfaz um pin, então enfileirá-la a manteria ali para sempre enquanto
cada passe de promoção a reconsiderasse.

Quando o `timeout` de uma operação vence, o pool a finaliza e pede ao driver dela para
reconciliar o wire (`Driver::abandon()`) antes de liberar a conexão. O servidor em geral
ainda está respondendo ao comando que recebeu: um driver que tem uma irmã co-localizada
para ler o socket drena a resposta abandonada e mantém a conexão; sem ninguém para lê-la, a
conexão é derrubada. Nos dois casos o slot volta para o pool, e a operação que expirou
nunca é revivida pela própria resposta atrasada.

Um cancelamento que nunca chega ao servidor segue o mesmo caminho: `cancel()` é advisory,
então quando o side channel não pode ser estabelecido a operação é finalizada localmente
enquanto o servidor continua respondendo ao comando original, e o pool reconcilia esse wire
antes de retomar a conexão.

### Operações retiradas

Quando quem chamou simplesmente para de esperar — uma resposta deferred cuja espera foi recusada
ou interrompida, ou cuja Fiber foi destruída — a contraparte local do `cancel()` é o
`withdraw()`, e nada é enviado ao servidor. `Pool::withdraw()` falha uma operação não terminada
com `Database operation was withdrawn: its caller stopped waiting.`, marca-a como `revoked` para
que nenhum pool de fallback a re-despache, deixa o driver reconciliar o wire e retoma a vaga; uma
conexão ainda conectando ou autenticando é descartada. Uma operação que já terminou mantém seu
resultado, é marcada como `revoked` e é apenas esquecida. Ele é síncrono e nunca suspende, então
é seguro no `finally` de uma Fiber sendo destruída. `Database::withdraw()` — nas fachadas SQL e KV — recebe várias
operações e as retira numa ordem segura (primeiro as estacionadas, depois as que ainda não estão
lendo, por fim os leitores em pipeline), tenta todas e relança a primeira falha.

Uma retirada não interrompe um statement que o servidor já recebeu. Isso vale para os drivers SQL
(`Driver::LINGERING`): quando a operação retirada já tinha chegado ao servidor (estado `Querying`
ou `Reading`) e a sessão dela é derrubada, um servidor SQL em geral termina — ou desfaz com
rollback — o que lhe foi pedido antes de perceber que o cliente saiu, então o pool mantém essa
vaga contada contra o `max` até o deadline da própria operação. A contrapartida é que a vaga fica
indisponível até esse deadline passar. Quando a sessão sobrevive — uma irmã co-localizada ainda lê
nela — a própria conexão continua contando e nada extra fica retido. Um servidor key-value como o
Redis descarta na hora o trabalho de um cliente desconectado, então um comando KV retirado nunca
retém a vaga além da sessão derrubada.

Essa retenção impede que uma rajada de desconexões de clientes inunde o banco com queries
abandonadas, mas o teto de `pool.max` statements rodando no servidor só vale enquanto esses
statements terminam dentro do próprio deadline, e só quando a operação tem um deadline. Uma
operação com `timeout` `0` não tem nenhum, então a retirada não retém vaga alguma. Um statement que
continua rodando depois que o deadline passa — retirado ou expirado — deixa de ser contado, e aí o
servidor pode executar mais de `pool.max` statements ao mesmo tempo. Combine o `timeout` do pool com
um timeout de statement no servidor igual ou menor (o `statement_timeout` do PostgreSQL, por
exemplo), para que o servidor interrompa o que o pool deixou de contar.

Um teardown de transação retirado — o `COMMIT` ou `ROLLBACK` de nível superior — sempre conta
como nunca enviado, então a sessão dele é cortada em vez de confiar numa resposta que ninguém vai
ler. O que isso deixa no servidor depende de até onde o teardown chegou. Um `ROLLBACK`, ou um
`COMMIT` que nunca chegou ao servidor, termina num rollback feito pelo servidor quando a sessão é
cortada. Um `COMMIT` que já chegou ao servidor (`Querying` ou `Reading`) pode ter sido commitado: o
servidor em geral processa o statement que já leu antes de perceber a desconexão. Quem chamou só
sabe que a operação falhou como retirada, então o resultado dela é desconhecido — verifique se as
escritas dela foram gravadas, ou torne a unidade de trabalho idempotente, antes de repeti-la.
`Transaction::abort()` compõe esse teardown para um chamador que não pode mais esperar: o
`ROLLBACK` de nível superior em qualquer profundidade de savepoint, descartando o statement
pendente e sem emitir eventos de transação. Uma transação também passa a ler como inativa assim
que a sessão em que o `BEGIN` rodou deixa de existir — a conexão caiu, ou foi reconstruída para
outro chamador —, então o próximo statement dela falha com `SQL transaction is not active.` em
vez de rodar dentro da sessão de outra pessoa.

## Drivers nativos

Três wire drivers nativos executam operações SQL — veja
**[Drivers SQL](/manual/ADI/Databases/SQL/Drivers/overview/)** para a matriz de capacidades:

- **PostgreSQL** — Protocol 3.0 com TLS, autenticação cleartext/MD5/SCRAM, extended query,
  cache de prepared statements, pipelining e CancelRequest.
- **MySQL/MariaDB** — handshake v10 com TLS, `mysql_native_password` e
  `caching_sha2_password` (full auth via TLS ou chave RSA pinada), prepared statements binários e `KILL QUERY`.
- **SQLite** — driver síncrono sobre `ext-sqlite3` para bancos em arquivo e `:memory:`.

Precisão de `numeric`/`decimal` é preservada como string em todos os drivers.

## Views de resultado

`Result` expõe dados diretos e views convenientes:

- `rows` - todas as linhas decodificadas.
- `row` - primeira linha ou array vazio.
- `cell` - primeira célula da primeira linha ou `null`.
- `count` - quantidade de linhas.
- `empty` - se nenhuma linha foi retornada.
