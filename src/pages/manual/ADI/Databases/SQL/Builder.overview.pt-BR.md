# Query Builder

O Query Builder é como você lê e escreve linhas sem concatenar strings SQL. Ele monta
instruções DML — `SELECT`, `INSERT`, `UPDATE` e `DELETE` — a partir de nomes tipados e valores
vinculados, e as escreve no dialeto do seu banco: PostgreSQL, MySQL ou SQLite.

> Chegou agora? Siga primeiro o guia **[Consultas de banco](/guide/database-queries/overview/)**.
> Esta página explica o objeto builder: de onde ele vem, como compila e roda, seus modos e seus
> erros.

## O ciclo

Com uma tabela `users` em que Ada (id `1`) está ativa e Grace (id `2`) não — todo exemplo desta
página continua este script, com os imports, os enums e o `$Database` dele:

```php
use Bootgly\ADI\Databases\SQL;
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Operators;
use Bootgly\API\Environment\Configs\DatabaseConfig;

enum Tables: string { case Users = 'users'; }
enum Columns: string { case Id = 'id'; case Name = 'name'; case Active = 'active'; }

$Database = new SQL(new DatabaseConfig(BOOTGLY_PROJECT->Configs->get('database'))->configure());

$Builder = $Database
   ->table(Tables::Users)
   ->select(Columns::Id, Columns::Name)
   ->filter(Columns::Active, Operators::Equal, true);

$Query = $Builder->compile();
```

`$Query` é uma `Bootgly\ADI\Databases\SQL\Builder\Query`. No PostgreSQL — o engine de todo
comentário SQL desta página — ela guarda:

```php
$Query->SQL;        // SELECT "id", "name" FROM "users" WHERE "active" = $1
$Query->parameters; // [true]
$Query->reading;    // true
```

Para executar, passe o builder ou a query compilada para o banco e aguarde a operação:

```php
$Operation = $Database->query($Builder);
$Database->await($Operation);

$Operation->Result->rows; // [['id' => 1, 'name' => 'Ada']]
```

O `query()` e o `await()` pertencem à fachada SQL: o que aceitam, o que lançam e o que uma operação
terminada guarda estão em **[Execute uma query](/manual/ADI/Databases/SQL/overview/#execute-uma-query)**
e **[Leia o resultado](/manual/ADI/Databases/SQL/overview/#leia-o-resultado)**.

> **Abrindo o banco.** A linha do `DatabaseConfig` monta a fachada a partir do escopo de config
> `database` do projeto, então roda na função de boot de um projeto, em um comando ou em um script
> dentro do projeto. Em uma rota `HTTP_Server_CLI`, use no lugar o resource por worker
> **[`$Response->Database`](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/overview/)**, e fora
> de um projeto passe a conexão como array — veja
> **[Abra um banco](/manual/ADI/Databases/SQL/overview/#abra-um-banco)**.

## Pontos de entrada

Um builder compila com um dialeto, que decide as aspas, os placeholders e o SQL de alguns
recursos. Onde você inicia o builder decide qual dialeto ele recebe. `Tables` é o enum de
[O ciclo](#o-ciclo):

```php
use Bootgly\ADI\Databases\SQL\Builder;

$Database->table(Tables::Users)->Dialect === $Database->Dialect;   // true
(new Builder($Database->Dialect))->Dialect === $Database->Dialect; // true
(new Builder)->Dialect::class; // Bootgly\ADI\Databases\SQL\Builder\Dialects\PostgreSQL
```

- **`$Database->table()`** inicia um builder com o dialeto da fachada, `$Database->Dialect`, que a
  chave `driver` escolheu quando a fachada foi montada — veja
  **[Escolhendo o dialeto](/manual/ADI/Databases/SQL/Builder/Dialects/overview/#escolhendo-o-dialeto)**.
  Este é o início comum.
- **`$Transaction->table()`** inicia um com o mesmo dialeto, para uma instrução que você roda com
  `$Transaction->query()` na conexão da transação — veja
  **[Executar instruções](/manual/ADI/Databases/SQL/Transaction/overview/#executar-instruções)**.
- **`$Response->Database->table()`** faz o mesmo em uma rota `HTTP_Server_CLI`, pelo resource por
  worker.
- **`new Builder($Dialect)`** inicia um builder sem fachada, para código que não tem uma à mão ou
  que compila para outro engine. Sem argumento ele compila PostgreSQL, qualquer que seja o seu
  banco, então passe `$Database->Dialect`.

O `table()` recebe um nome de tabela e um alias opcional. Um builder ou uma query compilada
passados no lugar do nome formam uma tabela derivada, que exige o alias — veja
**[Tabelas derivadas](/manual/ADI/Databases/SQL/Builder/Composing/overview/#tabelas-derivadas)**.

## Nomes são tipados

Identificadores do builder não são strings raw: a checagem de tipos do PHP recusa uma `string`
simples onde vai um nome. Use um enum backed por string para os nomes que sua aplicação conhece,
`Identifier` para um nome que só existe em runtime, e `Expression` para um fragmento SQL confiável
escrito como está:

```php
use Bootgly\ADI\Databases\SQL\Builder\Expression;
use Bootgly\ADI\Databases\SQL\Builder\Identifier;

$Query = $Database
   ->table(new Identifier('public.users'))
   ->select(Columns::Id, new Expression('NOW()'))
   ->compile();

$Query->SQL; // SELECT "id", NOW() FROM "public"."users"
```

O dialeto faz quote de um `Identifier`, segmento por segmento; ele nunca faz quote nem binding de
uma `Expression`. Valores são o contrário: o que você passa como valor para `filter()`,
`having()`, `match()` ou `set()` é enviado como parâmetro. As regras de identificador, e onde uma
`Expression` é aceita, estão em
**[Compondo queries](/manual/ADI/Databases/SQL/Builder/Composing/overview/)**.

## Compile e execute

Toda chamada fluente altera o builder e retorna o mesmo objeto, então um encadeamento e instruções
separadas sobre uma variável montam a mesma query. O `compile()` transforma o builder em uma
`Query`:

- `SQL` — a instrução, escrita no dialeto do builder;
- `parameters` — os valores vinculados, na ordem dos seus placeholders no texto, então os valores
  de uma subquery ficam onde a subquery fica;
- `reading` — `true` para um `SELECT` sem `lock()`, as instruções que o `query()` pode enviar a
  uma réplica de leitura (veja
  **[Regras de roteamento](/guide/database-read-replicas/overview/#regras-de-roteamento)**).

O `compile()` é memorizado: ele retorna o mesmo objeto `Query` até a próxima chamada fluente. O
`query()` e o `Transaction::query()` compilam o builder que você passa, por essa memória, e a
operação guarda a instrução compilada, então uma mudança posterior no builder não alcança uma
operação já criada. Cada `query()` de um mesmo builder cria uma nova operação que roda a mesma
instrução.

```php
use Bootgly\ADI\Databases\SQL\Builder\Dialects\MySQL;
use Bootgly\ADI\Databases\SQL\Builder\Dialects\SQLite;

$Builder = $Database
   ->table(Tables::Users)
   ->select(Columns::Id)
   ->filter(Columns::Name, Operators::Equal, 'Ada');

$Query = $Builder->compile();
$Query === $Builder->compile();     // true

$Builder->compile(new MySQL)->SQL;  // SELECT `id` FROM `users` WHERE `name` = ?
$Builder->compile(new SQLite)->SQL; // SELECT "id" FROM "users" WHERE "name" = ?1

$Builder->filter(Columns::Active, Operators::IsTrue);

$Builder->compile()->SQL; // SELECT "id" FROM "users" WHERE "name" = $1 AND "active" IS TRUE
$Query->SQL;              // SELECT "id" FROM "users" WHERE "name" = $1
```

O `compile($Dialect)` com um dialeto de outra classe reexecuta toda chamada que o builder gravou
em um novo builder desse dialeto, o compila e guarda o resultado por classe de dialeto até a
próxima chamada fluente; um dialeto da mesma classe do builder compila como o `compile()`. A
reexecução roda de novo cada closure de `nest()`, então mantenha essas closures sem efeitos
colaterais. Uma chamada que o outro dialeto recusa lança a partir do `compile()` — um `output()`
reexecutado no MySQL ou no SQLite, por exemplo (veja [Erros](#erros)).

Por enquanto, a memória segue só as chamadas do próprio builder. Um builder embutido nele — uma
subquery, uma tabela derivada, uma CTE — que você altera depois que o builder externo compilou não
é visto: o builder externo continua retornando o SQL e os parâmetros anteriores. Compile um
`DELETE` para pré-visualizá-lo, altere o builder da subquery dele, e o `DELETE` que roda ainda
remove as linhas que a subquery antiga selecionava. Termine o builder interno antes de compilar ou
executar o externo, ou monte a instrução externa de novo.

### Reaproveite um builder

Como um builder é mutável, duas instruções iniciadas a partir de uma variável compartilham toda
chamada feita nela. Para compartilhar uma forma, monte cada instrução a partir de uma função:

```php
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Orders;

$Active = fn (): Builder => $Database
   ->table(Tables::Users)
   ->select(Columns::Id, Columns::Name)
   ->filter(Columns::Active, Operators::IsTrue);

$Ada = $Active()->filter(Columns::Name, Operators::Equal, 'Ada');
$Latest = $Active()->order(Orders::Desc, Columns::Id)->limit(10);

$Ada->compile()->SQL;    // SELECT "id", "name" FROM "users" WHERE "active" IS TRUE AND "name" = $1
$Latest->compile()->SQL; // SELECT "id", "name" FROM "users" WHERE "active" IS TRUE ORDER BY "id" DESC LIMIT 10
```

## Modos

Um builder está em um de quatro modos e compila a instrução do seu modo. O modo é
`$Builder->Mode`, um case de `Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Modes`, e vale a
última chamada que define um:

| Modo | Definido por | Compila | Montado a partir de |
| --- | --- | --- | --- |
| `Modes::Select` (o padrão) | `select()`, `distinct()`, `count()`, `aggregate()` | `SELECT` | colunas, joins, filtros, `group()`, `having()`, `order()`, `limit()`, `skip()`, `lock()` |
| `Modes::Insert` | `insert()`, `upsert()` | `INSERT` | valores de `set()`, colunas de conflito do `upsert()`, `output()` |
| `Modes::Update` | `update()` | `UPDATE` | valores de `set()`, filtros, `output()` |
| `Modes::Delete` | `delete()` | `DELETE` | filtros, `output()` |

O `set()` não define modo. Um builder que você esquece de trocar com `insert()` ou `update()`
continua um `SELECT` — marcado como `reading`, então com réplicas configuradas o `query()` pode
até enviá-lo a uma:

```php
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Modes;

$Builder = $Database->table(Tables::Users)->set(Columns::Name, 'Ada');

$Builder->Mode === Modes::Select; // true
$Builder->compile()->SQL;         // SELECT * FROM "users"

$Builder->insert();

$Builder->Mode === Modes::Insert; // true
$Builder->compile()->SQL;         // INSERT INTO "users" ("name") VALUES ($1)
```

Uma chamada de outro modo mantém tudo o que foi gravado antes dela, e cada instrução pega só o que
a tabela lista para ela; o resto fica de fora sem erro. `insert()->set(...)->count()` compila
`SELECT COUNT(*) FROM "users"`, e `limit()`, `order()` ou `join()` em um `update()` não chegam ao
`UPDATE`. Uma CTE de `define()` vai antes da instrução em todo modo.

## Erros

Todo erro que o builder levanta é uma `InvalidArgumentException`, levantada antes de qualquer
coisa ser enviada. Uma chamada lança para uma entrada que consegue checar sozinha; o `compile()`
lança para uma instrução incompleta como um todo. O `query()` e o `Transaction::query()` compilam o
builder que você passa, então os erros de compilação aparecem ali:

```php
use InvalidArgumentException;

try {
   $Database->query($Database->table(Tables::Users)->delete());
}
catch (InvalidArgumentException $Exception) {
   $Exception->getMessage(); // SQL update/delete requires at least one filter.
}
```

A guarda de filtro não tem chave, e um filtro escrito para casar com toda linha só esconderia a
intenção. Para mudar ou remover toda linha de propósito, envie a instrução como SQL raw, que o
builder nunca confere: `$Database->query('DELETE FROM users')`.

Lançados pelo `compile()`:

| Mensagem | Causa |
| --- | --- |
| `SQL builder requires a table.` | Nenhuma chamada a `table()` — só um builder criado com `new Builder` pode não ter uma |
| `SQL derived tables are only valid for SELECT.` | Uma tabela derivada com `insert()`, `update()`, `delete()` ou `upsert()` |
| `SQL insert/update requires at least one set value.` | `insert()`, `upsert()` ou `update()` sem `set()` |
| `SQL update/delete requires at least one filter.` | `update()` ou `delete()` sem `filter()`, `match()` ou `nest()` |
| `SQL insert set columns must have the same value count.` | Chamadas de `set()` com quantidades diferentes de valores, feitas antes de o `upsert()` trocar o builder para `INSERT`; depois de `insert()`, o `set()` a lança na hora |
| `SQL subquery placeholders could not be rewritten.` | O motor de expressões regulares do PHP falhou ao renumerar os placeholders `$n` ou `?n` de uma subquery embutida — não esperado na prática |

O `compile($Dialect)` também reexecuta toda chamada por esse dialeto, então uma chamada que ele
recusa lança a partir do `compile()` com a mensagem da própria chamada.

Lançados pela chamada:

| Mensagem | Lançada por | Causa |
| --- | --- | --- |
| `SQL derived table requires an alias.` | `table()` | Um builder ou uma query compilada como fonte, sem `$Alias` |
| `SQL update set values must be singular.` | `set()`, `update()` | Vários valores para uma coluna no modo UPDATE — vários valores são para um `insert()` de várias linhas |
| `SQL insert set columns must have the same value count.` | `set()`, `insert()` | Colunas com quantidades diferentes de valores no modo INSERT |
| `SQL expression alias conflicts with an existing column alias.` | `alias()` | Uma `Expression` cujo texto já tem um alias de coluna |
| `SQL column alias conflicts with an existing expression alias.` | `alias()` | Uma coluna cujo nome com aspas já tem um alias de `Expression` |
| `SQL aggregate cannot take *: use count() for COUNT(*).` | `aggregate()` | `*` como coluna |
| `SQL BETWEEN filter requires exactly two values.` | `filter()`, `having()` | `Operators::Between` sem um array de dois valores |
| `SQL IN filter requires a non-empty array value.` | `filter()`, `having()` | `Operators::In` sem um array não vazio nem um builder ou query compilada |
| `SQL literal filters do not accept values.` | `filter()`, `having()` | Um valor com `Operators::IsNull`, `IsNotNull`, `IsTrue` ou `IsFalse` |
| `SQL nested filter requires at least one filter.` | `nest()` | A closure não adicionou `filter()`, `match()` nem `nest()` |
| `SQL text match value must be a string.` | `match()` | Um valor que não é `string` — uma `Expression` inclusive |
| `SQL order requires a column identifier.` | `order()` | Um case de `Nulls` como coluna: `order(Orders::Asc, Nulls::Last)` em vez de `order(Orders::Asc, $Column, Nulls::Last)` |
| `SQL limit and offset must be non-negative integers.` | `limit()` | Uma quantidade ou um offset negativos |
| `SQL offset must be a non-negative integer.` | `skip()` | Um offset negativo |
| `SQL dialect does not support RETURNING output.` | `output()` | Um builder MySQL ou SQLite |
| `SQL dialect does not support upsert handling.` | `upsert()` | Um dialeto cujo `check(Capabilities::Upsert)` é `false` — nenhum dos três que vêm com o framework |
| `SQL upsert requires at least one conflict column.` | `upsert()` | Nenhuma coluna |
| `SQL identifier cannot be empty.` | `new Identifier()` | Um nome vazio |
| `SQL identifier segment cannot be empty.` | A chamada que recebe o nome | Um nome pontilhado com uma parte vazia, como `'public.'` ou `'a..b'` |
| `SQL enum identifiers must be non-empty strings.` | A chamada que recebe o case | Um case de enum backed por int, ou um case backed por string cujo valor é `''` |
| `SQL object identifiers must render to non-empty strings.` | A chamada que recebe o objeto | Um `Stringable` cuja string é `''` |
| `SQL expression cannot be empty.` | `new Expression()` | Um fragmento vazio |
| `SQL builder dialect is not registered: mariadb` | `new SQL()`, `Dialects::fetch()` | Um `driver` sem dialeto |

Uma `string` simples, ou um case de enum sem valores, onde vai um nome falha na própria checagem de
tipos do PHP com um `TypeError`.

## Referência

Os métodos da fachada SQL que iniciam e executam um builder — `table()`, `query()`, `begin()` —
estão na Referência de **[Banco SQL](/manual/ADI/Databases/SQL/overview/#referência)**. Os verbos
fluentes do builder estão nas Referências de
**[Lendo linhas](/manual/ADI/Databases/SQL/Builder/Reading/overview/)**,
**[Escrevendo linhas](/manual/ADI/Databases/SQL/Builder/Writing/overview/)** e
**[Compondo queries](/manual/ADI/Databases/SQL/Builder/Composing/overview/)**.

### Builder

```php
__construct (Dialect $Dialect = new PostgreSQL)
```

Cria um builder vazio que compila com `$Dialect` — PostgreSQL quando omitido. O `SQL::table()` e o
`Transaction::table()` o chamam com o dialeto da fachada, e depois chamam `table()`.

```php
compile (null|Dialect $Dialect = null): Query
```

Compila o builder em uma `Query`: a instrução no dialeto do builder, os parâmetros na ordem dos
placeholders e o flag `reading`. O resultado fica memorizado até a próxima chamada fluente. Um
`$Dialect` de outra classe reexecuta as chamadas gravadas por ele, memorizado por classe de
dialeto. Lança `InvalidArgumentException` para os erros de compilação de [Erros](#erros) e, ao
reexecutar, para uma chamada que o dialeto de destino recusa.

```php
public private(set) Dialect $Dialect
```

O dialeto com que o builder compila, definido pelo construtor. Leia-o para ramificar pelo que o
engine suporta: `$Builder->Dialect->check(Capabilities::Output)` diz se o `output()` é aceito
(veja **[Dialetos de query](/manual/ADI/Databases/SQL/Builder/Dialects/overview/)**).

```php
public private(set) Modes $Mode = Modes::Select
```

O modo para o qual o `compile()` monta a instrução — veja [Modos](#modos).

```php
public private(set) null|string $table = null
```

A tabela que o `table()` definiu, com as aspas do dialeto do builder — `"users"` no PostgreSQL —,
ou `null` para uma tabela derivada e antes do `table()`.

```php
public private(set) null|string $sourceAlias = null
```

O alias com aspas de uma tabela derivada — o `$Alias` que o `table()` recebeu junto com um builder
ou uma query compilada —, ou `null`.

```php
public private(set) bool $distinct = false
```

Se o `distinct()` foi chamado, de modo que a instrução começa com `SELECT DISTINCT`.

```php
public private(set) array $columns = []
```

A lista do select na ordem das chamadas, como texto com aspas: as colunas do `select()` e as
expressões que o `count()` e o `aggregate()` escreveram, com o alias passado a eles. O `alias()` e
os aliases de tabela são aplicados quando o builder compila.

```php
public private(set) array $joins = []
```

Uma entrada por `join()`: os nomes `table`, `left` e `right` dele, com aspas, o `operator` dele (um
case de `Operators`) e o `join` dele (um case de `Joins`).

```php
public private(set) array $groups = []
```

As colunas do `GROUP BY`, com aspas, na ordem das chamadas.

```php
public private(set) array $orders = []
```

Uma entrada por `order()`: a `column` dele, com aspas, o `order` dele (um case de `Orders`) e o
`nulls` dele (um case de `Nulls` ou `null`).

```php
public private(set) null|int $limited = null
```

A quantidade de linhas que o `limit()` definiu, ou `null` sem um.

```php
public private(set) int $offset = 0
```

O offset que a última chamada a `limit()` ou `skip()` definiu; `0` significa nenhum.

```php
public private(set) null|Locks $Lock = null
```

O case de `Locks` que o `lock()` definiu, ou `null`. Um builder com um compila uma `Query` cujo
`reading` é `false`.

```php
public private(set) array $assignments = []
```

Os valores que cada `set()` atribuiu, indexados pela coluna compilada — o identificador entre
aspas do dialeto, ou o SQL raw de uma `Expression` — com um valor por linha. Somente leitura fora
do builder; o Runner de seeders o lê para mover sequências de identidade no PostgreSQL.

```php
public Conjunction $and
```

Retorna uma nova `Bootgly\ADI\Databases\SQL\Builder\Conjunction` cujos `filter()`, `nest()`,
`match()` e `having()` adicionam o próximo predicado unido com `AND`, e retornam o builder. Ler a
propriedade não altera nada.

```php
public Conjunction $or
```

O mesmo com `OR`: `->filter($A)->or->filter($B)` compila `A OR B`. A junção vale só para o
predicado adicionado por ela. No primeiro predicado do `WHERE` ou do `HAVING` não há o que unir, e
ela é descartada.

### Query

```php
__construct (string $sql, array $parameters = [], bool $reading = false)
```

Uma instrução compilada: o `compile()` monta uma, e você pode montar uma em volta de SQL raw para o
`query()`. `$parameters` são os valores vinculados, na ordem dos placeholders. `$reading` decide o
roteamento para **[réplicas de leitura](/guide/database-read-replicas/overview/)** e só importa
quando há réplicas configuradas: `true` deixa o `query()` enviar a instrução para uma réplica,
enquanto o padrão `false` a mantém no primário e a conta como escrita para o read-after-write.

```php
public private(set) string $SQL
```

O texto da instrução. O `__toString()` o retorna.

```php
public private(set) array $parameters
```

Os valores vinculados, na ordem dos seus placeholders.

```php
public private(set) bool $reading
```

Se a instrução só lê. O `compile()` o define para um `SELECT` sem `lock()`, e o `query()` o lê
para rotear a instrução.

### Enums desta página

Namespace `Bootgly\ADI\Databases\SQL\Builder\Auxiliaries`. Todo case de todo enum do builder, e o
SQL para o qual ele compila, está em
**[Enums auxiliares](/manual/ADI/Databases/SQL/Builder/Dialects/overview/#enums-auxiliares)**.

| Enum | Cases usados aqui |
| --- | --- |
| `Capabilities` | `Output`, `Upsert` |
| `Modes` | `Delete`, `Insert`, `Select`, `Update` |
| `Nulls` | `Last` |
| `Operators` | `Between`, `Equal`, `In`, `IsFalse`, `IsNotNull`, `IsNull`, `IsTrue` |
| `Orders` | `Asc`, `Desc` |

Próximo: **[Lendo linhas](/manual/ADI/Databases/SQL/Builder/Reading/overview/)**,
**[Escrevendo linhas](/manual/ADI/Databases/SQL/Builder/Writing/overview/)**,
**[Compondo queries](/manual/ADI/Databases/SQL/Builder/Composing/overview/)** e
**[Dialetos de query](/manual/ADI/Databases/SQL/Builder/Dialects/overview/)**.
