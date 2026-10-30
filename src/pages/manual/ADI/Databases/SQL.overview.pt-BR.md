# Banco SQL

`Bootgly\ADI\Databases\SQL` é a fachada pela qual uma aplicação conversa com um banco SQL —
PostgreSQL, MySQL/MariaDB ou SQLite. O `query()` dela transforma SQL raw, um Query Builder ou uma
query compilada em uma `Operation` SQL pendente no pool de conexões da fachada, e envia leituras
para réplicas de leitura quando você as configura; o `await()` conduz uma operação até o fim. A
fachada também abre o Query Builder (`table()`), o Schema Builder (`structure()`), transações
(`begin()`) e repositórios do ORM (`map()`).

As chaves de conexão e os padrões delas estão em
**[Configuração do banco](/manual/ADI/Database/Config/overview/)**, e o que o pool faz com uma
operação — esperas, prazos, cancelamento, retirada, saúde das réplicas — está em
**[Pool de conexões](/manual/ADI/Database/Pool/overview/)**.

## Abra um banco

Onde o código roda decide como ele abre o banco:

- **Em uma rota `HTTP_Server_CLI`**, não crie um. Use `$Response->Database`, o response resource
  que o projeto registra com `Database::provide()` (veja
  **[Registrar para rotas HTTP](/guide/database-dbal/overview/#registrar-para-rotas-http)**): ele
  envolve um `SQL` por worker e aguarda pela resposta em vez de bloquear o worker — veja
  **[Aguardar trabalho de banco](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/overview/#aguardar-trabalho-de-banco)**.
- **Em um projeto** — a função de boot dele, um comando, ou um script rodando dentro dele —, crie-o a
  partir do escopo de config `database` do projeto, como no primeiro bloco abaixo.
- **Fora de um projeto**, passe a conexão como array, como no segundo.

```php
use Bootgly\ADI\Databases\SQL;
use Bootgly\API\Environment\Configs\DatabaseConfig;

$Database = new SQL(new DatabaseConfig(BOOTGLY_PROJECT->Configs->get('database'))->configure());
```

O `configure()` retorna um `SQL\Config` pronto. A linha precisa desse escopo: veja
**[Usar em um script ou comando](/guide/database-dbal/overview/#usar-em-um-script-ou-comando)**
para saber com o que ela falha quando o escopo não existe, e como carregar você mesmo um diretório
de configs.

```php
use Bootgly\ADI\Databases\SQL;

$Database = new SQL([
   'driver' => 'pgsql',
   'host' => '127.0.0.1',
   'port' => 5432,
   'database' => 'app',
   'username' => 'app',
   'password' => 'secret',
]);
```

Toda chave é opcional, e a chave que você omite assume o padrão — o de um PostgreSQL local, seja
qual for o `driver`, então um `new SQL` sem argumentos conecta em `127.0.0.1:5432` como `postgres`
(veja **[Chaves e padrões](/manual/ADI/Database/Config/overview/#chaves-e-padrões)**). Criar a
fachada valida a config e não abre nada: a primeira operação abre a conexão. Cada fachada tem os
próprios pools — um para o primário, um por réplica de leitura —, então crie uma por processo e
reaproveite-a.

## Chaves de config

O `SQL` lê todas as chaves de **[Configuração do banco](/manual/ADI/Database/Config/overview/#chaves-e-padrões)**
mais quatro próprias, que `Bootgly\ADI\Databases\SQL\Config` adiciona:

| Chave | Padrão | O que define |
|---|---|---|
| `statements` | `256` | Quantos prepared statements cada conexão guarda em cache |
| `routing.sticky` | `5.0` | Por quantos segundos as leituras de um escopo ficam no primário depois que ele escreve |
| `migrations` | `'_bootgly_migrations'` | A tabela onde o runner de migrations registra as migrations aplicadas |
| `replicas` | `[]` | As réplicas de leitura, cada uma aberta como um pool próprio |

```php
use Bootgly\ADI\Databases\SQL\Config;

$Config = new Config([
   // ... connection keys
   'statements' => 64,
   'routing' => ['sticky' => 2.0],
   'migrations' => 'schema_history',
   'replicas' => [
      ['host' => '10.0.0.21'],
      ['host' => '10.0.0.22', 'statements' => 16],
   ],
]);

$Config->statements;                // 64
$Config->routing;                   // ['sticky' => 2.0]
$Config->replicas[0]['statements']; // 64
$Config->replicas[1]['statements']; // 16
```

O `new SQL($Config)` o aceita como está — um array passado ao `new SQL()` vira esta mesma classe —
e abre um pool por réplica, em `$Database->ReplicaPools`.

- `statements` é convertido para inteiro com piso em `0`, que desliga o cache: cada statement passa
  a ser preparado para a própria operação e fechado assim que ela termina. Passado o limite, o
  statement usado há mais tempo é descartado (veja Prepared statements nas páginas dos drivers
  **[PostgreSQL](/manual/ADI/Databases/SQL/Drivers/PostgreSQL/overview/#prepared-statements)** e
  **[MySQL](/manual/ADI/Databases/SQL/Drivers/MySQL/overview/#prepared-statements)**).
- `routing.sticky` é em segundos, convertido para float com piso em `0.0`, que desliga a janela:
  uma leitura então vai para uma réplica mesmo logo depois de uma escrita. Só importa com
  `replicas` — veja [Escopo de read-after-write](#escopo-de-read-after-write).
- `migrations` tem os espaços das pontas removidos, e um valor vazio assume o padrão. O adaptador de
  config do projeto não tem nó para ela, então o `bootgly project <name> migrate` sempre registra em
  `_bootgly_migrations` (veja
  **[Como o escopo vira uma conexão](/guide/database-dbal/overview/#como-o-escopo-vira-uma-conexão)**):
  defina-a numa config em array, ou passe um nome de tabela ao `Runner` de migrations (veja
  **[Migrations](/manual/ADI/Databases/SQL/Schema/Migrations/overview/)**).
- `replicas` é uma lista de endpoints, e uma entrada sem um `host` não vazio é descartada. Uma
  chave que a entrada omite vem do primário — `statements` também, a menos que a entrada defina o
  próprio —, e as flags de TLS dela seguem as regras de
  **[TLS](/manual/ADI/Database/Config/overview/#tls)**.
  **[Configurar réplicas](/guide/database-read-replicas/overview/#configurar-réplicas)** mostra
  como declará-las numa config de projeto.

Como nas chaves de conexão, uma string não numérica conta como `0` — o que desliga `statements` e
`routing.sticky` — e um valor que não é escalar, ou um `routing` que não é array, assume o padrão.
Na fachada, `$Database->SQLConfig` é este `SQL\Config`, e `$Database->Config` é o mesmo objeto,
tipado como o `Config` base.

## Execute uma query

O `query()` aceita SQL raw com os parâmetros dele, um Query Builder, ou uma `Query` compilada. Com
uma tabela `users` que tem as linhas `(1, 'Ada')` e `(2, 'Grace')`:

```php
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Operators;
use Bootgly\ADI\Databases\SQL\Builder\Query;

enum Tables: string { case Users = 'users'; }
enum Columns: string { case Id = 'id'; case Name = 'name'; }

$Raw = $Database->query('SELECT id, name FROM users WHERE id = $1', [1]);

$Built = $Database->query(
   $Database->table(Tables::Users)
      ->select(Columns::Id, Columns::Name)
      ->filter(Columns::Id, Operators::Equal, 1)
);

$Compiled = $Database->query(new Query('SELECT id, name FROM users WHERE id = $1', [1], reading: true));

$Database->await($Raw)->Result->row;      // ['id' => 1, 'name' => 'Ada']
$Database->await($Built)->Result->row;    // ['id' => 1, 'name' => 'Ada']
$Database->await($Compiled)->Result->row; // ['id' => 1, 'name' => 'Ada']
```

Cada forma retorna na hora uma `Operation` SQL (`Bootgly\ADI\Databases\SQL\Operation`). Ela já está
atribuída a um pool, mas nada é enviado até ela ser avançada; o `await()` a avança até o fim e a
retorna. O SQLite é a exceção: uma operação que consegue a conexão roda dentro de `query()`. Os
placeholders seguem o driver — `$1` no PostgreSQL, `?` no MySQL, `?1` ou `:name` no SQLite (veja
**[Parâmetros](/manual/ADI/Databases/SQL/Drivers/SQLite/overview/#parâmetros)**) — e um builder
escreve os certos. Um builder ou uma `Query` carregam os próprios parâmetros, então o segundo
argumento é ignorado para eles.

A forma também decide onde uma operação pode rodar quando há réplicas configuradas. Uma string raw
é classificada pela palavra-chave inicial e um builder pelo que ele compila (veja
**[Regras de roteamento](/guide/database-read-replicas/overview/#regras-de-roteamento)**); uma
`Query` compilada diz isso com `reading`, cujo padrão, `false`, a mantém no primário e a conta como
escrita. Sem réplicas, toda operação vai para o pool primário. O terceiro argumento, `$Scope`, é
tratado em [Escopo de read-after-write](#escopo-de-read-after-write).

### O que lança e o que falha

O `query()` só lança quando não consegue montar a instrução ou encontrar um driver para ela, e aí
não retorna nada:

- uma instrução vazia ou só com espaços lança `InvalidArgumentException` com `SQL cannot be empty.`;
- um builder que não compila lança a própria `InvalidArgumentException` — um `delete()` sem
  `filter()`, por exemplo, lança `SQL update/delete requires at least one filter.`;
- um `driver` sob o qual nenhum driver SQL está registrado lança
  `Database driver is not registered: postgres.` (veja
  **[Nomes de driver](/manual/ADI/Database/Config/overview/#nomes-de-driver)**).

Tudo o que o banco, a rede ou o pool respondem faz a operação falhar: o `query()` a retorna, e a
falha cai no `error` dela.

## Leia o resultado

```php
use RuntimeException;

$Select = $Database->await($Database->query('SELECT id, name FROM users ORDER BY id'));

$Select->SQL;             // SELECT id, name FROM users ORDER BY id
$Select->Result->columns; // ['id', 'name']
$Select->Result->rows;    // [['id' => 1, 'name' => 'Ada'], ['id' => 2, 'name' => 'Grace']]
$Select->Result->cell;    // 1

$Update = $Database->await($Database->query('UPDATE users SET name = $1 WHERE id = $2', ['Grace Hopper', 2]));

$Update->parameters;       // ['Grace Hopper', 2]
$Update->Result->status;   // UPDATE 1
$Update->Result->affected; // 1

$Insert = $Database->query('INSERT INTO users (id, name) VALUES ($1, $2)', [1, 'Ada']);

try {
   $Database->await($Insert);
}
catch (RuntimeException $Exception) {
   $Exception->getMessage(); // duplicate key value violates unique constraint "users_pkey"
   $Insert->code;            // 23505
   $Insert->Result;          // null
}
```

Uma operação resolvida tem um `Result`: as `rows`, indexadas pelo nome da coluna, com as views
`row` (a primeira linha), `cell` (o primeiro valor dela), `count` e `empty`; as `columns`; a tag
de comando em `status`; a contagem `affected` de linhas afetadas; e `inserted`, o id que um
`INSERT` gerou no MySQL e no SQLite. Os drivers preenchem `status`, `affected` e `inserted` de
formas um pouco diferentes — veja **[Resultado](/manual/ADI/Database/overview/#resultado)**. A
própria operação guarda a instrução que rodou, em `SQL`, e os `parameters` dela.

Uma operação que falhou não tem `Result`. O `error` dela guarda a mensagem, e o `code` o código de
falha do driver — SQLSTATE do PostgreSQL, errno do MySQL, extended result code do SQLite — como
string, ou `null` quando a falha não traz nenhum, como num prazo vencido ou numa recusa do pool. O
`await()` lança uma `RuntimeException` cuja mensagem é o `error`, e a operação mantém os dois.
Decida pelo `code`, não pela mensagem:

| Driver | `error` para uma chave duplicada | `code` |
| --- | --- | --- |
| PostgreSQL | `duplicate key value violates unique constraint "users_pkey"` | `23505` |
| MySQL | `1062: Duplicate entry '1' for key 'users.PRIMARY'` | `1062` |
| SQLite | `Unable to execute statement: UNIQUE constraint failed: users.id` | `1555` para uma chave primária, `2067` para uma coluna `UNIQUE` |

Uma operação SQL também tem `rows`, `columns`, `status` e `affected` próprios. Eles são as cópias
de trabalho do driver, preenchidas enquanto ele lê, então leia-os só quando o `error` for `null`:
um statement do PostgreSQL que falha no meio deixa ali as linhas que chegaram antes do erro, enquanto
o `Result` dele continua `null`. Todos os campos estão listados em
**[Operação](/manual/ADI/Database/overview/#operação)**.

## Conduza operações

O `await()`, o `advance()` e o `cancel()` da fachada trabalham pelo pool dono da operação
(`$Operation->Pool`): o pool primário, ou o de uma réplica, para uma leitura roteada para ela.

### Aguarde uma operação

O `await()` é o `Pool::wait()` desse pool: ele avança a operação até ela terminar, dormindo no
socket dela, e a retorna — ou lança uma `RuntimeException` com o `$Operation->error` quando ela
falha (veja **[Aguarde de forma síncrona](/manual/ADI/Database/Pool/overview/#aguarde-de-forma-síncrona)**).
Ele bloqueia o processo e conduz só a operação que recebe: uma operação em outra conexão não é
avançada enquanto isso. Aguardar várias operações uma depois da outra, portanto, as roda uma depois
da outra, e uma operação estacionada em `pending` que você aguarda antes das que seguram as conexões
é recusada com `Database pool has no capacity for the operation.` Aguarde as operações na ordem em
que você as criou.

### Rode operações lado a lado

```php
$Report = $Database->query('SELECT pg_sleep(0.3), 1 AS report');
$Audit = $Database->query('SELECT pg_sleep(0.3), 2 AS audit');

while ($Report->finished === false || $Audit->finished === false) {
   $Database->advance($Report);
   $Database->advance($Audit);
   usleep(1000);
}

$Report->error;               // null
$Audit->Result->row['audit']; // 2
```

O `advance()` move uma operação até onde o socket dela permite — conexão, TLS, autenticação,
escrita, leitura — e retorna sem esperar. Um laço sobre várias operações, portanto, as roda ao
mesmo tempo: as duas instruções acima rodam em duas conexões ao mesmo tempo, e o laço termina
depois de uns 0,3 segundo, onde `await($Report)` seguido de `await($Audit)` leva uns 0,6. O
`advance()` não lança para uma operação que falhou, então confira o `error` de cada uma quando o
laço terminar; ele faz falhar, sim, uma operação cujo prazo passou (veja
**[Defina um prazo](/manual/ADI/Database/Pool/overview/#defina-um-prazo)**). Como ele nunca espera,
faça uma pausa entre as passadas em vez de girar em vão.

### Cancele ou retire

O `cancel()` pede ao servidor que pare um statement em execução — `CancelRequest` no PostgreSQL,
`KILL QUERY` no MySQL — e é advisory: a operação ainda resolve, falha ou expira por conta própria.
O `withdraw()` herdado abandona operações localmente, quando quem as chamou para de esperar, e não
envia nada. Os dois estão descritos em
**[Cancele um statement em execução](/manual/ADI/Database/Pool/overview/#cancele-um-statement-em-execução)**
e **[Operações retiradas](/manual/ADI/Database/Pool/overview/#operações-retiradas)**.

## Pontos de entrada

```php
$Builder = $Database->table(Tables::Users);
$Schema = $Database->structure();

$Transaction = $Database->begin();
$Database->await($Transaction->Operation);
$Database->await($Transaction->query('UPDATE users SET name = $1 WHERE id = $2', ['Ada', 1]));
$Database->await($Transaction->commit());
```

- O `table()` inicia um Query Builder sobre uma tabela — ou sobre uma fonte derivada, um builder ou
  uma query compilada, com um alias — compilado com o dialeto da fachada; passe-o ao `query()`.
  Veja **[Query Builder](/manual/ADI/Databases/SQL/Builder/overview/)**.
- O `structure()` retorna o Schema Builder da fachada, criado na primeira chamada e reaproveitado
  depois — veja **[Schema Builder](/manual/ADI/Databases/SQL/Schema/overview/)**.
- O `begin()` inicia uma transação em uma conexão do pool primário. O `BEGIN` dela é atribuído na
  hora, como `$Transaction->Operation`: aguarde-o antes da primeira instrução. Commit, rollback,
  savepoints e recusas estão em **[Transações](/manual/ADI/Databases/SQL/Transaction/overview/)**.

### Repositórios

```php
use Bootgly\ADI\Databases\SQL\Model\Column;
use Bootgly\ADI\Databases\SQL\Model\Key;
use Bootgly\ADI\Databases\SQL\Model\Table;

#[Table('users')]
class User
{
   #[Key]
   public null|int $id = null;

   #[Column]
   public string $name = '';
}

$Users = $Database->map(User::class, Awaiting: $Database);

$User = $Users->hydrate($Database->await($Users->find(1)))->entity;
$User->name; // Ada
```

O `map()` retorna um repositório do ORM para uma classe de entidade. O repositório compõe
operações — `find()`, `fetch()`, `save()`, `delete()` — que você aguarda e depois entrega ao
`hydrate()`, que transforma as linhas delas em entidades (veja
**[ORM Repository](/manual/ADI/Databases/SQL/Repository/overview/)**). A metadata da entidade é
compilada uma vez por fachada. Os dois argumentos opcionais são:

- `$Scope` — o escopo de read-after-write das operações do repositório, como no `query()`;
- `$Awaiting` — a ponte de await. O `SQL` implementa `Awaiting`, então com `Awaiting: $Database` a
  hidratação carrega as relações que uma seleção nomeia, e as `lazy: true`, aguardando pela
  fachada. Sem ponte, uma relação nomeada volta como uma operação para você aguardar, e hidratar
  uma entidade com uma relação `lazy: true` que a seleção não carrega lança
  `ORM lazy loading requires an await bridge.` (veja
  **[ORM Repository Relations](/manual/ADI/Databases/SQL/Repository/Relations/overview/)**).

O `$Transaction->map()` usa a transação como ponte por padrão, e o `$Response->Database->map()`, o
resource, com o escopo da requisição.

## Escopo de read-after-write

Com réplicas configuradas, o `query()` envia cada leitura para a próxima réplica saudável e cada
escrita para o primário. Uma réplica pode ficar atrás do primário, então, depois de uma escrita, as
leituras do mesmo **escopo** ficam no primário por `routing.sticky` segundos (`5.0` por padrão).
Abaixo, um segundo banco faz o papel da réplica, então cada leitura mostra qual pool a respondeu:

```php
use stdClass;

use Bootgly\ADI\Databases\SQL;

$Database = new SQL([
   'driver' => 'pgsql',
   'host' => '127.0.0.1',
   'port' => 5432,
   'database' => 'app',
   'username' => 'app',
   'password' => 'secret',
   'replicas' => [
      ['host' => '127.0.0.1', 'database' => 'app_replica'],
   ],
]);

$Where = 'SELECT current_database()';

$Database->await($Database->query($Where))->Result->cell; // app_replica

$Database->await($Database->query('UPDATE users SET name = $1 WHERE id = $2', ['Ada', 1]));
$Database->await($Database->query($Where))->Result->cell; // app

$Job = new stdClass;
$Database->await($Database->query($Where, [], $Job))->Result->cell; // app_replica

$Database->touch($Job);
$Database->await($Database->query($Where, [], $Job))->Result->cell; // app
```

- O escopo é qualquer objeto. Por padrão é o `Fiber` atual — fora de um Fiber, a própria fachada —,
  então num script uma escrita mantém todas as leituras seguintes daquela fachada no primário
  durante a janela. Passe um objeto seu como terceiro argumento do `query()` para manter trabalhos
  sem relação separados: `$Job` não tinha escrito, então a leitura dele ainda foi para a réplica.
- O `touch()` marca um escopo como tendo acabado de escrever — o escopo padrão quando você não passa
  nenhum. Use-o para uma escrita que a fachada não viu, como uma feita por outro processo ou por
  outra instância de `SQL`: as leituras desse escopo então ficam no primário durante a janela.
- Uma escrita por `$Transaction->query()` também marca o escopo dela (veja
  **[Transações](/manual/ADI/Databases/SQL/Transaction/overview/)**), e em rotas `HTTP_Server_CLI`
  o `$Response->Database` dá a cada requisição um escopo próprio.
- Uma leitura que falha numa réplica é repetida uma vez no primário, e uma réplica que continua
  falhando ao conectar é pulada por um tempo — veja
  **[Saúde das réplicas](/manual/ADI/Database/Pool/overview/#saúde-das-réplicas)**.
- `routing.sticky` `0` desliga a janela. A janela é só de tempo, não uma espera para a réplica
  alcançar o primário:
  **[Escopo de read-after-write](/guide/database-read-replicas/overview/#escopo-de-read-after-write)**
  trata das leituras que precisam de frescor estrito.

## Eventos

```php
use Bootgly\ABI\Events\Emission;
use Bootgly\ABI\Events\Emitter;
use Bootgly\ADI\Databases\SQL\Events;

Emitter::$Instance->listen(Events::Failed, function (Emission $Emission): void {
   [$Operation] = $Emission->payload;

   error_log("SQL failed ({$Operation->code}): {$Operation->error} in {$Operation->SQL}");
});
```

`Bootgly\ADI\Databases\SQL\Events` anuncia o que acontece com conexões e operações SQL:

| Evento | Quando | Payload |
| --- | --- | --- |
| `Connected` | Uma conexão terminou de autenticar (PostgreSQL, MySQL), ou o SQLite abriu o banco dele | `Connection` |
| `Executed` | Uma operação resolveu — toda instrução, incluindo o `BEGIN`, o `COMMIT` e os savepoints de uma transação | `Operation` |
| `Slow` | Uma operação resolveu pelo menos `Operation::$slow` segundos depois de ser criada | `Operation`, `$elapsed` (float, segundos) |
| `Failed` | Uma operação falhou — anunciado uma vez, mesmo quando uma falha posterior substitui o `error` dela | `Operation` |

- `Failed` cobre toda falha: os erros do servidor, que trazem um `code`, e os do próprio framework
  — um prazo vencido, uma recusa do pool, uma retirada, uma recusa de transação como
  `SQL transaction operation is still active.` —, cujo `code` é `null`. O store de segurança
  `Users` do Bootgly também o anuncia para uma atualização de hash de senha que não foi gravada: essa
  operação resolveu, então o `error` dela é `null`.
- `Slow` fica desligado até você definir o estático `Operation::$slow`
  (`Bootgly\ADI\Databases\SQL\Operation`), em segundos; em `0.0`, o padrão, a verificação não custa
  nada. Ele vem depois do `Executed`, só para uma operação que resolveu, e o tempo decorrido conta a
  partir do `query()`, então inclui qualquer espera por uma conexão livre — veja
  **[Capture queries lentas](/guide/events/overview/#capture-queries-lentas)**.
- `Connected` dispara uma vez por conexão, incluindo as das réplicas; o `$Connection->Config` nomeia
  o endpoint.
- Esses eventos implementam `Bootgly\ABI\Events\Emitter\Observing`: o barramento de eventos isola
  cada listener, então um que lança é reportado por `Throwables::notify()` e nunca alcança a
  operação, o pool ou o listener seguinte. Os listeners rodam dentro do laço de leitura do driver,
  então mantenha-os curtos. Os eventos de transação — `Begin`, `Commit`, `Rollback` — mantêm, em
  vez disso, o contrato de direção (veja
  **[ADI — Banco SQL](/guide/events/overview/#adi--banco-sql)**).
- Cada processo worker tem o próprio `Emitter` e o próprio `Operation::$slow`: um listener
  registrado, ou um limite definido, em um processo não alcança os outros (veja
  **[Eventos](/guide/events/overview/)**).

## Erros

| Mensagem | Lançada por | Causa |
| --- | --- | --- |
| `SQL builder dialect is not registered: mariadb` | `new SQL()` | O `driver` não é um nome de driver SQL nem um alias de dialeto conhecido |
| `SQL cannot be empty.` | `query()` | A instrução está vazia ou só tem espaços |
| `SQL update/delete requires at least one filter.` | `query()` | Um builder que não compila — aqui, um `delete()` sem `filter()` |
| `Database driver is not registered: postgres.` | `query()` | Nenhum driver SQL está registrado sob o `driver` |
| `ORM entity requires one Table attribute: Note` | `map()` | A classe da entidade não tem o attribute `#[Table]` |
| `duplicate key value violates unique constraint "users_pkey"` | `await()` | O erro do servidor, guardado no `error` da operação |
| `Database operation timed out after 30 seconds.` | `await()` | O `timeout` da operação passou |
| `Database pool has no capacity for the operation.` | `await()` | A operação aguardada ainda está estacionada em `pending` |

O `new SQL()`, o `query()` e o `map()` lançam uma `InvalidArgumentException`; o `await()` lança uma
`RuntimeException` com o `error` da operação que falhou. Os erros das próprias chaves de conexão
estão em **[Configuração do banco](/manual/ADI/Database/Config/overview/#erros)**, os do pool em
**[Pool de conexões](/manual/ADI/Database/Pool/overview/#erros)**, e as falhas de conexão em
**[Falhas](/manual/ADI/Database/overview/#falhas)**.

## Referência

### SQL

`Bootgly\ADI\Databases\SQL` estende `Bootgly\ADI\Database` e implementa `Awaiting` (`await()`) e
`Querying` (`query()` e `pipelining`), os contratos sobre os quais os repositórios rodam. Os
herdados `Config`, `Pool`, `Pools`, `Connection` e `drivers` estão na Referência do
**[Núcleo do DBAL](/manual/ADI/Database/overview/#database)**.

```php
__construct (array|Config $config = [])
```

Cria a fachada a partir de um array nativo do ADI ou de um `SQL\Config` — um array vira um
`SQL\Config` —, depois o dialeto do `driver`, o pool primário e um pool por réplica. Lança
`InvalidArgumentException` para um `driver` sem dialeto e para os erros da própria config. Não abre
nenhuma conexão.

```php
query (string|Builder|Query $query, array $parameters = [], null|object $Scope = null): Operation
```

Cria uma operação SQL a partir de SQL raw e `$parameters`, de um Query Builder ou de uma `Query`
compilada — esses dois carregam os próprios parâmetros — e a atribui a um pool: o primário, ou, para
uma leitura com réplicas configuradas, a próxima réplica saudável (o primário quando nenhuma está)
a menos que `$Scope` tenha escrito dentro da janela `routing.sticky`. Uma escrita marca `$Scope`,
por padrão o Fiber atual, senão a fachada. Nada é enviado até a operação ser avançada, exceto no
SQLite. Lança `InvalidArgumentException` para uma instrução vazia, um builder que não compila ou um
driver que não está registrado; qualquer outra falha faz a operação falhar.

```php
await (Operation $Operation): Operation
```

Avança a operação pelo pool dono dela até ela terminar, e a retorna. Lança uma `RuntimeException`
com o `$Operation->error` quando ela falha, e recusa uma operação estacionada em `pending`.
Bloqueia o processo; veja
**[Aguarde de forma síncrona](/manual/ADI/Database/Pool/overview/#aguarde-de-forma-síncrona)**.

```php
advance (Operation $Operation): Operation
```

Move a operação um passo pelo pool dono dela e a retorna, sem esperar. Não lança para uma operação
que falhou: leia o `error` dela.

```php
cancel (Operation $Operation): Operation
```

Pede ao servidor, pelo pool dono da operação, que a pare, e a retorna; a operação ainda resolve,
falha ou expira por conta própria. Veja
**[Cancele um statement em execução](/manual/ADI/Database/Pool/overview/#cancele-um-statement-em-execução)**.

```php
touch (null|object $Scope = null): void
```

Marca `$Scope` — por padrão o Fiber atual, senão a fachada — como tendo escrito agora, então as
leituras dele ficam no primário por `routing.sticky` segundos.

```php
table (BackedEnum|Stringable|Builder|Query $Table, null|BackedEnum|Stringable $Alias = null): Builder
```

Inicia um Query Builder com o dialeto da fachada, sobre uma tabela ou sobre uma fonte derivada — um
builder ou uma query compilada, que precisa de um `$Alias`.

```php
structure (): Schema
```

Retorna o Schema Builder da fachada, criado na primeira chamada.

```php
begin (): Transaction
```

Inicia uma transação no pool primário. O `BEGIN` dela é atribuído na hora, em
`$Transaction->Operation`.

```php
map (string $Entity, null|object $Scope = null, null|Awaiting $Awaiting = null): Repository
```

Cria um repositório do ORM para a classe `$Entity`, rodando as operações dele pela fachada.
`$Scope` é o escopo de read-after-write dessas operações; `$Awaiting` é a ponte de await de que
relações eager e lazy precisam, nenhuma por padrão. Lança `InvalidArgumentException` quando a classe
não tem um mapeamento válido.

```php
withdraw (Operation ...$Operations): void
```

Herdado de `Database`: retira operações localmente, sem enviar nada ao servidor. Veja a Referência
do **[Núcleo do DBAL](/manual/ADI/Database/overview/#database)**.

```php
public Config $SQLConfig
```

O `SQL\Config` da fachada — o mesmo objeto que `$Config`, tipado com as chaves SQL. Configure pelo
construtor; **[Propriedades](/manual/ADI/Database/Config/overview/#propriedades)** diz o que uma
atribuição posterior alcança.

```php
public private(set) Dialect $Dialect
```

O dialeto do Query Builder para o `driver`, compartilhado por `table()`, `structure()`, `map()` e as
transações da fachada.

```php
public private(set) Models $Models
```

O cache da metadata de entidades compilada, compartilhado pelos repositórios da fachada e das
transações dela.

```php
public protected(set) bool $pipelining = true
```

`true`: a fachada aceita uma nova operação enquanto outras estão pendentes. Uma `Transaction`
informa `false`, e os repositórios o leem para decidir se a contagem total de uma página pode sair
junto com a página.

```php
public array $ReplicaPools
```

Um `Pool` por entrada de `replicas`, em ordem (`array<int,Pool>`). Leia a saúde de uma réplica por
ele — `healthy`, `failures` (veja
**[Saúde das réplicas](/manual/ADI/Database/Pool/overview/#saúde-das-réplicas)**) —, mas não o
escreva: o construtor o monta.

### Configuração SQL

`Bootgly\ADI\Databases\SQL\Config` estende `Bootgly\ADI\Database\Config` com as chaves SQL; o que
ela herda está na Referência de
**[Configuração do banco](/manual/ADI/Database/Config/overview/#referência)**.

```php
__construct (array $config = [])
```

Monta a config de conexão, depois lê `migrations`, `statements` e `routing`, dá a cada réplica o
`statements` dela, e reduz a uma conexão o pool de um banco SQLite `:memory:` ou de nome vazio —
primário ou réplica.

```php
public const string DEFAULT_MIGRATIONS = '_bootgly_migrations';
```

O padrão de `migrations`.

```php
public const int DEFAULT_STATEMENTS = 256;
```

O padrão de `statements`.

```php
public const float DEFAULT_ROUTING_STICKY = 5.0;
```

O padrão de `routing.sticky`, em segundos.

```php
public string $migrations
```

A tabela que registra as migrations aplicadas.

```php
public int $statements
```

O tamanho do cache de prepared statements de cada conexão; `0` desliga o cache.

```php
public array $routing
```

`array{sticky: float}`: a janela de read-after-write, em segundos; `0.0` a desliga.
