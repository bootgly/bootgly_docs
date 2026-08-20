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

Em rotas HTTP, prefira
**[Response Resources](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/overview/)** e
`$Response->Database` em vez de chamar `Pool->wait()` ou `advance()` manualmente.

## Comportamento do pool

O pool acompanha conexões `idle`, `busy`, `pending` e `created`. Quando todas as conexões
estão ocupadas e `created >= max`, novas operações aguardam em `pending`. Quando uma conexão
é liberada, o pool promove operações pendentes.

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
