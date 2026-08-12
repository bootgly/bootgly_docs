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
