# Lendo linhas

Comece com `$Database->table(...)`, escolha colunas e então adicione filtros e dê forma ao
resultado. `$Database` é a fachada SQL. Em uma rota `HTTP_Server_CLI`, ela é o
`$Response->Database`; na função de boot, em um comando ou em um script de um projeto,
`new SQL(new DatabaseConfig(BOOTGLY_PROJECT->Configs->get('database'))->configure())`; fora de um
projeto, `new SQL([...])` com as chaves de conexão — veja
**[Abra um banco](/manual/ADI/Databases/SQL/overview/#abra-um-banco)**. A execução de uma instrução,
o resultado e os erros dela estão em **[Banco SQL](/manual/ADI/Databases/SQL/overview/)**.

## Nomes usados nesta página

Identificadores do builder são cases de enums com valor string, ou objetos `Identifier` para nomes
conhecidos só em runtime (veja **[Identificadores dinâmicos](/manual/ADI/Databases/SQL/Builder/Composing/overview/#identificadores-dinâmicos)**).
Os exemplos abaixo usam estes enums:

```php
enum Tables: string
{
   case Posts = 'posts';
   case Users = 'users';
}

enum Columns: string
{
   case Active = 'active';
   case Bio = 'bio';
   case City = 'city';
   case Id = 'id';
   case Name = 'name';
   case PostsId = 'posts.id';
   case PostsTitle = 'posts.title';
   case PostsUser = 'posts.user_id';
   case UsersId = 'users.id';
   case UsersName = 'users.name';
}

enum Aliases: string
{
   case Cities = 'cities';
   case Initial = 'initial';
   case P = 'p';
   case Posts = 'posts';
   case Total = 'total';
   case Town = 'town';
   case U = 'u';
}
```

O dialeto faz quote de um valor pontilhado segmento por segmento: `Columns::UsersId` compila para
`"users"."id"`. Qualifique uma coluna como `tabela.coluna` quando a query faz join de tabelas ou dá
alias a elas — um alias de tabela reescreve só as referências que começam pelo nome da tabela dele
(veja [Aliases](#aliases)).

## Uma primeira query

```php
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Operators;
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Orders;

$Builder = $Database
   ->table(Tables::Users)
   ->select(Columns::Id, Columns::Name)
   ->filter(Columns::Active, Operators::Equal, true)
   ->order(Orders::Asc, Columns::Name)
   ->limit(10, 5);

$Query = $Builder->compile();
$Query->SQL;        // SELECT "id", "name" FROM "users" WHERE "active" = $1 ORDER BY "name" ASC LIMIT 10 OFFSET 5
$Query->parameters; // [true]

$rows = $Database->await($Database->query($Builder))->Result->rows;
```

O `compile()` mostra a instrução que o builder envia, aqui para PostgreSQL. O MySQL faz quote com
crases e escreve placeholders `?`, e o SQLite escreve `?1` (veja
**[Dialetos de query](/manual/ADI/Databases/SQL/Builder/Dialects/overview/)**). Todo valor pelo qual
você filtra vira um parâmetro, nunca entra no texto SQL — uma `Expression` é a única exceção (veja
[Filtros](#filtros)). O `query()` aceita o builder, ou a `Query` compilada, e o `await()` retorna a
operação terminada, cujo `Result->rows` guarda as linhas indexadas pelo nome da coluna (veja
**[Leia o resultado](/manual/ADI/Databases/SQL/overview/#leia-o-resultado)**). Com réplicas de
leitura configuradas, um `SELECT` sem [lock de linha](#locks-de-linha) pode rodar em uma réplica
(veja **[Regras de roteamento](/guide/database-read-replicas/overview/#regras-de-roteamento)**).

## Select e distinct

```php
$Database->table(Tables::Users);                                     // SELECT * FROM "users"
$Database->table(Tables::Users)->select();                           // SELECT * FROM "users"
$Database->table(Tables::Users)->select(Columns::Id, Columns::Name); // SELECT "id", "name" FROM "users"
$Database->table(Tables::Users)->distinct()->select(Columns::City);  // SELECT DISTINCT "city" FROM "users"
```

Um builder lê por padrão: sem colunas, ele seleciona `*`. O `distinct()` remove linhas duplicadas
do resultado.

`select()`, `count()` e `aggregate()` adicionam projeções na ordem das chamadas:

```php
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Aggregates;

$Database
   ->table(Tables::Users)
   ->aggregate(Aggregates::Maximum, Columns::Id, Aliases::Total)
   ->select(Columns::Name)
   ->group(Columns::Name);
```

Compila para:

```sql
SELECT MAX("id") AS "total", "name" FROM "users" GROUP BY "name"
```

## Filtros

```php
$Database
   ->table(Tables::Users)
   ->select(Columns::Id)
   ->filter(Columns::Id, Operators::Between, [1, 10])
   ->filter(Columns::City, Operators::In, ['London', 'Paris'])
   ->filter(Columns::Name, Operators::IsNotNull);
```

Compila para:

```sql
SELECT "id" FROM "users" WHERE "id" BETWEEN $1 AND $2 AND "city" IN ($3, $4) AND "name" IS NOT NULL
```

Os parâmetros são `[1, 10, 'London', 'Paris']`. Cada `filter()` adiciona um predicado ao `WHERE`,
ligado ao anterior com `AND` — para `OR`, veja [OR e AND](#or-e-and). O operador decide o valor:

- `Equal`, `Unequal`, `Greater`, `GreaterOrEqual`, `Less` e `LessOrEqual` fazem bind de um valor.
- `Between` recebe um array de exatamente dois valores.
- `In` recebe um array não vazio, ou um builder ou query compilada, que vira uma subquery (veja
  **[Subqueries em IN](/manual/ADI/Databases/SQL/Builder/Composing/overview/#subqueries-em-in)**).
- `IsNull`, `IsNotNull`, `IsTrue` e `IsFalse` não recebem valor.

Para `Between`, `In` e os operadores `Is*`, um valor que não serve lança
`InvalidArgumentException` no próprio `filter()`, antes de qualquer compilação:
`SQL BETWEEN filter requires exactly two values.`, `SQL IN filter requires a non-empty array value.`
ou `SQL literal filters do not accept values.` Os operadores de valor único aceitam qualquer valor,
então um que o driver não consegue vincular — um array, ou um objeto para o qual ele não tem
mapeamento, como um builder — só falha quando a operação roda: o `await()` lança `RuntimeException`
(`PostgreSQL parameter must be scalar or null.` no PostgreSQL). O que cada driver vincula está em
**[Mapeamento de tipos](/manual/ADI/Databases/SQL/Drivers/Types/overview/)**, e todos os operadores e o SQL
para o qual compilam estão em
**[Enums auxiliares](/manual/ADI/Databases/SQL/Builder/Dialects/overview/#enums-auxiliares)**.

`NULL` não é igual nem diferente de nada: `filter(Columns::City, Operators::Equal, null)` não
encontra nenhuma linha, e `Operators::Unequal` pula as linhas cujo valor é `NULL`. Teste-o com
`IsNull` ou `IsNotNull`.

Um valor `Expression` não recebe bind: o texto dele ocupa o lugar do placeholder, e é assim que se
compara uma coluna com outra. O texto chega ao banco como foi escrito, então mantenha entrada de
usuário fora dele e escreva os nomes do jeito que a sua engine os lê — o MySQL, por padrão, lê
`"city"` como a string `'city'`, enquanto um nome em minúsculas sem quote, como `city`, funciona nas
três. Veja
**[Expressões confiáveis](/manual/ADI/Databases/SQL/Builder/Composing/overview/#expressões-confiáveis)**.

## OR e AND

```php
$Database
   ->table(Tables::Users)
   ->select(Columns::Id)
   ->filter(Columns::Active, Operators::IsTrue)
   ->or->filter(Columns::Name, Operators::Equal, 'Ada');
```

Compila para:

```sql
SELECT "id" FROM "users" WHERE "active" IS TRUE OR "name" = $1
```

O `->or` liga com `OR` o predicado que vem depois dele, e só esse: o próximo predicado volta a ser
ligado com `AND`. O `->and` escreve o padrão por extenso. Os dois são propriedades somente leitura
que retornam um proxy com quatro métodos — `filter()`, `match()`, `having()` e `nest()` —, então
`->or->match(...)` e `->or->having(...)` funcionam do mesmo jeito. O `WHERE` e o `HAVING` têm cada
um o seu primeiro predicado, que não tem nada a que se ligar: um `->or` antes dele é ignorado, e
`->filter(...)->or->having(...)` começa o `HAVING` sem `OR`.

O builder escreve os predicados na ordem das chamadas, sem parênteses, e o SQL avalia `AND` antes
de `OR`:

```php
$Database
   ->table(Tables::Users)
   ->select(Columns::Id)
   ->filter(Columns::Active, Operators::IsTrue)
   ->filter(Columns::Name, Operators::Equal, 'Ada')
   ->or->filter(Columns::City, Operators::Equal, 'London');
```

Isso compila para `WHERE "active" IS TRUE AND "name" = $1 OR "city" = $2`, que se lê
`("active" IS TRUE AND "name" = $1) OR "city" = $2`: um usuário inativo em London passa. Agrupe
predicados com `nest()`. O closure dele recebe um builder novo, e o que ele filtra vira um único
predicado entre parênteses:

```php
use Bootgly\ADI\Databases\SQL\Builder;

$Database
   ->table(Tables::Users)
   ->select(Columns::Id)
   ->filter(Columns::Active, Operators::IsTrue)
   ->nest(function (Builder $Group): void {
      $Group
         ->filter(Columns::Name, Operators::Equal, 'Ada')
         ->or->filter(Columns::City, Operators::Equal, 'London');
   });
```

```sql
SELECT "id" FROM "users" WHERE "active" IS TRUE AND ("name" = $1 OR "city" = $2)
```

O `->or->nest(...)` liga um grupo inteiro com `OR`:

```php
$Database
   ->table(Tables::Users)
   ->select(Columns::Id)
   ->filter(Columns::Name, Operators::Equal, 'Ada')
   ->or->nest(function (Builder $Group): void {
      $Group
         ->filter(Columns::Active, Operators::IsTrue)
         ->filter(Columns::City, Operators::Equal, 'London');
   });
```

```sql
SELECT "id" FROM "users" WHERE "name" = $1 OR ("active" IS TRUE AND "city" = $2)
```

Um grupo guarda só predicados do `WHERE`: as chamadas a `filter()`, `match()` e `nest()` do closure
entram nele, e qualquer outra coisa que ele chama — `having()`, `select()`, `order()`, `limit()` — é
descartada sem erro, então não existe `HAVING` agrupado. Um closure que não adiciona nenhum
predicado faz o `nest()` lançar `SQL nested filter requires at least one filter.` O `compile()`
chama o closure de novo sempre que reexecuta o builder para outro dialeto (veja
**[Compile e execute](/manual/ADI/Databases/SQL/Builder/overview/#compile-e-execute)**), então
mantenha-o sem efeitos colaterais.

`filter()`, `match()`, `having()` e `nest()` terminam com um parâmetro
`Junctions $Junction = Junctions::And`. É ele que `->or` e `->and` passam por você, então escreva a
forma com o proxy em vez de passá-lo.

## Busca textual

```php
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Matches;

$Query = $Database
   ->table(Tables::Users)
   ->select(Columns::Id)
   ->match(Columns::Name, 'ada%', Matches::Insensitive)
   ->compile();
```

```sql
-- PostgreSQL
SELECT "id" FROM "users" WHERE "name" ILIKE $1
-- MySQL
SELECT `id` FROM `users` WHERE LOWER(`name`) LIKE LOWER(?)
-- SQLite
SELECT "id" FROM "users" WHERE "name" LIKE ?1 COLLATE NOCASE
```

O `match()` adiciona um predicado textual ao `WHERE`, ligado como um `filter()`. O valor dele recebe
bind como qualquer outro e precisa ser string — qualquer outra coisa lança
`SQL text match value must be a string.` O que cada modo encontra depende da engine:

| Modo | PostgreSQL | MySQL | SQLite |
| --- | --- | --- | --- |
| `Matches::Like`, o padrão | diferencia maiúsculas | segue a collation da coluna: o padrão do MySQL 8, `utf8mb4_0900_ai_ci`, ignora maiúsculas e acentos | ignora maiúsculas só em letras ASCII |
| `Matches::Insensitive` | ignora maiúsculas como a collation da coluna as define — só letras ASCII sob `C` | ignora maiúsculas, mesmo numa collation que as diferencia | ignora maiúsculas só em letras ASCII: `é%` não encontra `Élise` |

Nos dois modos o valor é um padrão `LIKE`: `%` casa qualquer sequência de caracteres e `_` um
caractere, e o `match()` faz bind do valor como veio, então um `%` ou `_` na entrada do usuário
continua sendo curinga. PostgreSQL e MySQL casam um deles literalmente depois de uma barra
invertida, por padrão — `'50\%%'` encontra `50% off`, mas não `50 dollars`. O SQLite não tem
caractere de escape a menos que a instrução declare um, e o `match()` não declara nenhum, então lá
`%` e `_` sempre agem como curingas.

O `Matches::Text` roda a busca full-text da engine:

```php
$Query = $Database
   ->table(Tables::Users)
   ->select(Columns::Id)
   ->match(Columns::Bio, 'first database', Matches::Text)
   ->compile();
```

```sql
-- PostgreSQL
SELECT "id" FROM "users" WHERE to_tsvector('simple', "bio") @@ plainto_tsquery('simple', $1)
-- MySQL
SELECT `id` FROM `users` WHERE MATCH (`bio`) AGAINST (? IN NATURAL LANGUAGE MODE)
-- SQLite
SELECT "id" FROM "users" WHERE "bio" MATCH ?1
```

Cada engine precisa do próprio preparo e lê o valor do seu jeito:

| | PostgreSQL | MySQL | SQLite |
| --- | --- | --- | --- |
| Precisa de | nada: qualquer coluna de texto | um índice `FULLTEXT` na coluna, senão a instrução falha com `1191: Can't find FULLTEXT index matching the column list` | uma coluna de uma tabela virtual FTS5, senão a instrução falha com `unable to use function MATCH in the requested context` |
| `'first database'` encontra | linhas com as duas palavras | linhas com qualquer uma das palavras | linhas com as duas palavras |
| Palavras | palavras inteiras, sem diferenciar maiúsculas, sem stemming: `database` não encontra `Databases` | palavras inteiras, sem stemming; stopwords como `the`, e palavras com menos de três caracteres, não encontram nada | palavras inteiras, sem diferenciar maiúsculas, sem stemming |

No SQLite o valor é uma query FTS5: `OR`, `NOT` e um `*` no fim são operadores, e um `'`, `-` ou `:`
nele faz a instrução falhar. Para buscar entrada de usuário como uma frase lá, envolva-a em aspas
duplas e duplique cada `"` dentro dela.

O PostgreSQL busca pela configuração `simple`, que é o que deixa as palavras sem stemming; um
dialeto próprio pode buscar por outra, como mostra
**[Escrevendo um dialeto próprio](/manual/ADI/Databases/SQL/Builder/Dialects/overview/#escrevendo-um-dialeto-próprio)**.

## Joins

```php
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Joins;

$Query = $Database
   ->table(Tables::Users)
   ->select(Columns::UsersName, Columns::PostsTitle)
   ->join(Tables::Posts, Columns::PostsUser, Operators::Equal, Columns::UsersId, Joins::Left)
   ->compile();
```

```sql
SELECT "users"."name", "posts"."title" FROM "users" LEFT JOIN "posts" ON "posts"."user_id" = "users"."id"
```

O `join()` adiciona uma tabela e uma comparação `ON` entre duas colunas. Nenhum dos lados é um
valor, então nada recebe bind. Use um operador de comparação — `Equal`, `Unequal`, `Greater`,
`GreaterOrEqual`, `Less` ou `LessOrEqual`: o `join()` aceita qualquer case de `Operators`, e os
outros compilam para um SQL que nenhuma engine aceita. O último argumento escolhe o join:
`Joins::Inner`, o padrão, mantém as linhas com correspondência dos dois lados; `Joins::Left` mantém
todas as linhas da tabela base, `Joins::Right` todas as da tabela do join, e `Joins::Full` todas as
das duas tabelas.

As linhas são indexadas pelo nome da coluna, então duas colunas selecionadas com o mesmo nome —
`users.id` e `posts.id`, por exemplo — voltam como uma chave só, com o valor da coluna que vem
depois. Dê alias a uma delas (veja [Aliases](#aliases)).

Nem toda engine roda todo join. O PostgreSQL roda os quatro. O SQLite roda `RIGHT JOIN` e
`FULL JOIN` a partir da versão 3.39.0, e um SQLite mais antigo os rejeita.

> [!WARNING]
> O MySQL não tem `FULL JOIN`, e o builder não barra o `Joins::Full`. O MySQL lê `FULL` como alias
> da tabela antes dele. Quando a instrução cita essa tabela de novo, ela falha — com
> `1054: Unknown column`, ou com um erro de sintaxe `1064` quando a tabela tem alias. Quando não
> cita, a instrução roda como um inner join e descarta as linhas sem correspondência das duas
> tabelas, sem erro. Não use `Joins::Full` no MySQL.

## Aliases

```php
$Query = $Database
   ->table(Tables::Users, Aliases::U)
   ->select(Columns::UsersName, Columns::PostsTitle)
   ->join(Tables::Posts, Columns::PostsUser, Operators::Equal, Columns::UsersId)
   ->alias(Tables::Posts, Aliases::P)
   ->filter(Columns::UsersId, Operators::Equal, 1)
   ->order(Orders::Asc, Columns::PostsTitle)
   ->compile();
```

```sql
SELECT "u"."name", "p"."title" FROM "users" AS "u" JOIN "posts" AS "p" ON "p"."user_id" = "u"."id" WHERE "u"."id" = $1 ORDER BY "p"."title" ASC
```

Uma tabela recebe o alias do segundo argumento de `table()`, ou de um `alias()` sobre a tabela base
ou uma tabela do join. O alias renderiza `"users" AS "u"` e reescreve toda referência que começa
pelo nome da tabela — `"users"."id"` vira `"u"."id"` — na lista do select, no `ON`, no `WHERE`, no
`GROUP BY`, no `HAVING`, no `ORDER BY` e nas colunas agregadas. Uma coluna não qualificada, como
`Columns::Id`, fica como está, e o texto de uma `Expression` também: escreva o alias dentro dele. O
`alias()` pode vir antes ou depois do `join()` que adiciona a tabela dele — um alias para uma tabela
que o builder ainda não tem espera por ela.

Colunas e expressões também recebem aliases:

```php
use Bootgly\ADI\Databases\SQL\Builder\Expression;

$Initial = new Expression('UPPER(SUBSTR(name, 1, 1))');

$Query = $Database
   ->table(Tables::Users)
   ->select(Columns::City, $Initial)
   ->alias(Columns::City, Aliases::Town)
   ->alias($Initial, Aliases::Initial)
   ->group(Columns::City, $Initial)
   ->order(Orders::Asc, Columns::City)
   ->compile();
```

```sql
SELECT "city" AS "town", UPPER(SUBSTR(name, 1, 1)) AS "initial" FROM "users" GROUP BY "town", "initial" ORDER BY "town" ASC
```

A lista do select renderiza `AS`, e `GROUP BY`, `HAVING` e `ORDER BY` citam o alias no lugar da
coluna ou da expressão. `WHERE` e `ON` mantêm a coluna, porque o SQL os avalia antes da lista do
select. Um alias de expressão pertence ao texto SQL, então qualquer `Expression` com o mesmo texto
o recebe.

Por enquanto eles citam o alias mesmo quando a coluna ou a expressão não está na lista do select,
onde nenhuma coluna de saída tem esse nome, então dê alias só ao que você seleciona. Senão o
PostgreSQL e o MySQL rejeitam a instrução — `column "town" does not exist`,
`1054: Unknown column 'town'` — e o SQLite lê `"town"` como string e a roda sem erro: a ordenação
se perde, e um agrupamento só por ele junta todas as linhas em um único grupo.

O `HAVING` também cita o alias:

```php
$Database
   ->table(Tables::Users)
   ->select(Columns::City)
   ->alias(Columns::City, Aliases::Town)
   ->group(Columns::City)
   ->having(Columns::City, Operators::IsNotNull);
```

```sql
SELECT "city" AS "town" FROM "users" GROUP BY "town" HAVING "town" IS NOT NULL
```

> [!WARNING]
> Por enquanto, o PostgreSQL rejeita essa instrução com `column "town" does not exist`: o `HAVING`
> dele não enxerga nomes de saída. MySQL e SQLite a rodam. Até o builder mudar, não filtre com
> `having()` uma coluna ou expressão que tem alias. Filtre uma coluna agrupada com `filter()` —
> `WHERE "city" IS NOT NULL` mantém os mesmos grupos — e dê a uma agregação o alias dela pelo
> `aggregate()` ou pelo `count()`, filtrando-a depois com uma `Expression` do SQL dela, como em
> [Agrupamento, having e order](#agrupamento-having-e-order).

## Agrupamento, having e order

```php
$Query = $Database
   ->table(Tables::Users)
   ->select(Columns::City)
   ->count(Aliases::Total)
   ->filter(Columns::Active, Operators::IsTrue)
   ->group(Columns::City)
   ->having(new Expression('COUNT(*)'), Operators::Greater, 1)
   ->order(Orders::Desc, Aliases::Total)
   ->compile();
```

```sql
SELECT "city", COUNT(*) AS "total" FROM "users" WHERE "active" IS TRUE GROUP BY "city" HAVING COUNT(*) > $1 ORDER BY "total" DESC
```

Isso lista as cidades com mais de um usuário ativo, as mais cheias primeiro. O `group()` adiciona
colunas ao `GROUP BY`. O `having()` filtra os grupos, com os operadores, valores e verificações do
`filter()`, e o `->or->having(...)` liga um predicado com `OR`. O `order()` recebe uma direção e uma
coluna — ou um nome de saída, como `Aliases::Total` aqui —, e cada chamada adiciona um termo ao
`ORDER BY`.

A ordenação pode posicionar os valores `NULL`:

```php
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Nulls;

$Database
   ->table(Tables::Users)
   ->select(Columns::Id)
   ->order(Orders::Asc, Columns::City, Nulls::Last)
   ->order(Orders::Asc, Columns::Name);
```

```sql
-- PostgreSQL, SQLite
SELECT "id" FROM "users" ORDER BY "city" ASC NULLS LAST, "name" ASC
-- MySQL
SELECT `id` FROM `users` ORDER BY `city` IS NULL ASC, `city` ASC, `name` ASC
```

Sem `Nulls`, as engines discordam: o PostgreSQL ordena `NULL` depois de todos os valores na ordem
`ASC` e antes deles na ordem `DESC`, e MySQL e SQLite fazem o contrário. Passe `Nulls::First` ou
`Nulls::Last` quando a posição importa. O MySQL não tem a cláusula `NULLS`, então o dialeto dele
ordena primeiro por `IS NULL`.

## Contagem e agregações

Conte por grupo com `Aggregates::Count` — aqui, quantos posts cada usuário escreveu:

```php
$Query = $Database
   ->table(Tables::Users)
   ->alias(Tables::Users, Aliases::U)
   ->select(Columns::UsersId)
   ->aggregate(Aggregates::Count, Columns::PostsId, Aliases::Posts)
   ->join(Tables::Posts, Columns::PostsUser, Operators::Equal, Columns::UsersId, Joins::Left)
   ->alias(Tables::Posts, Aliases::P)
   ->group(Columns::UsersId)
   ->compile();
```

PostgreSQL:

```sql
SELECT "u"."id", COUNT("p"."id") AS "posts" FROM "users" AS "u" LEFT JOIN "posts" AS "p" ON "p"."user_id" = "u"."id" GROUP BY "u"."id"
```

Conte a coluna da junção, não as linhas. Um usuário sem posts ainda recebe uma linha do
`LEFT JOIN`, com todas as colunas de `posts` em `NULL`: `count()` compila `COUNT(*)` e
mostra esse usuário com 1 post, enquanto `COUNT("p"."id")` ignora o `NULL` e mostra 0. A
coluna agregada segue os aliases de tabela como qualquer outra referência, com o alias
registrado antes ou depois de `aggregate()`.

Para filtrar pela contagem, passe uma `Expression` ao `having()`. O texto dela chega ao banco como
foi escrito, então escreva o alias da tabela nele:

```php
$Query = $Database
   ->table(Tables::Users)
   ->alias(Tables::Users, Aliases::U)
   ->select(Columns::UsersId)
   ->aggregate(Aggregates::Count, Columns::PostsId, Aliases::Posts)
   ->join(Tables::Posts, Columns::PostsUser, Operators::Equal, Columns::UsersId, Joins::Left)
   ->alias(Tables::Posts, Aliases::P)
   ->group(Columns::UsersId)
   ->having(new Expression('COUNT(p.id)'), Operators::Greater, 1)
   ->compile();
```

A instrução termina em `GROUP BY "u"."id" HAVING COUNT(p.id) > $1`.

`distinct: true` agrega cada valor distinto uma vez:

```php
$Database
   ->table(Tables::Users)
   ->aggregate(Aggregates::Count, Columns::City, Aliases::Cities, distinct: true);
```

Compila para:

```sql
SELECT COUNT(DISTINCT "city") AS "cities" FROM "users"
```

Funciona com qualquer agregação. Não é o `distinct()`, que remove linhas duplicadas do
resultado (`SELECT DISTINCT`) e nunca entra na agregação.

> Desde a 1.0.3 — antes, `Aggregates` não tinha `Count`, `aggregate()` não tinha o argumento
> `distinct` e aceitava uma coluna `*`, e a coluna agregada ignorava os aliases de tabela.

## Limit e offset

```php
$Database
   ->table(Tables::Users)
   ->select(Columns::Id)
   ->order(Orders::Asc, Columns::Id)
   ->limit(25)
   ->skip(50);
```

Compila para:

```sql
SELECT "id" FROM "users" ORDER BY "id" ASC LIMIT 25 OFFSET 50
```

`limit($count, $offset)` define a contagem de linhas e o offset; `skip($offset)` define só o offset.
Ordene as linhas antes de fatiá-las: sem `ORDER BY`, a engine as retorna em qualquer ordem, e as
páginas podem se sobrepor. `limit(0)` não retorna nenhuma linha, e `skip(0)` zera o offset. Um
número negativo lança `SQL limit and offset must be non-negative integers.` no `limit()` e
`SQL offset must be a non-negative integer.` no `skip()`.

> [!WARNING]
> Por enquanto, `limit($count)` também zera o offset, então um `skip()` chamado antes dele se perde:
> `->skip(50)->limit(25)` compila `LIMIT 25` e retorna a primeira página, sem erro. Chame o `skip()`
> depois do `limit()`, ou passe os dois para `limit(25, 50)`.

Pular sem limite se escreve de um jeito em cada dialeto, e o builder resolve isso para você.
Só a gramática do PostgreSQL aceita um `OFFSET n` sozinho; MySQL e SQLite exigem uma contagem
de linhas antes dele, então o builder fornece a que cada um lê como "sem limite" —
`18446744073709551615` no MySQL, `-1` no SQLite. As duas não são intercambiáveis: cada engine
rejeita a do outro. Escreva `skip(50)` e a mesma query roda em qualquer lugar.

Para paginar entidades por número de página ou cursor, veja
**[Paginação ORM](/manual/ADI/Databases/SQL/Repository/Pagination/overview/)**.

## Locks de linha

```php
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Locks;

$Transaction = $Database->begin();
$Database->await($Transaction->Operation);

$row = $Database->await($Transaction->query(
   $Transaction
      ->table(Tables::Users)
      ->select(Columns::Id, Columns::Name)
      ->filter(Columns::Id, Operators::Equal, 1)
      ->lock(Locks::Update)
))->Result->row;

$Database->await($Transaction->query(
   $Transaction
      ->table(Tables::Users)
      ->update()
      ->set(Columns::Name, "{$row['name']} Lovelace")
      ->filter(Columns::Id, Operators::Equal, 1)
));

$Database->await($Transaction->commit());
```

O `SELECT` compila para `SELECT "id", "name" FROM "users" WHERE "id" = $1 FOR UPDATE`.
`Locks::Update` adiciona `FOR UPDATE`: até a transação terminar, outras transações não podem nem
alterar as linhas selecionadas nem travá-las, então ninguém altera a linha entre a leitura e o
`UPDATE`. `Locks::Share` adiciona `FOR SHARE`, que impede outras transações de alterar as linhas,
mas as deixa obter um lock compartilhado também. PostgreSQL e MySQL suportam os dois.

- Pegue o lock dentro de uma transação, como acima: fora dela, cada instrução faz commit sozinha, e
  o lock termina com ela (veja **[Transações](/manual/ADI/Databases/SQL/Transaction/overview/)**).
  Coloque as instruções em um `try` e encerre a transação no `catch`, como
  **[Commit ou rollback](/guide/database-transactions/overview/#commit-ou-rollback)** mostra.
- Um `SELECT` com lock sempre roda no primário, mesmo com réplicas de leitura configuradas.
- O SQLite não tem locks de linha. O builder adiciona a cláusula mesmo assim, e o SQLite rejeita a
  instrução com `Unable to prepare statement: near "FOR": syntax error`. Código que também roda no
  SQLite pula o `lock()` lá:

```php
use Bootgly\ADI\Databases\SQL\Builder\Dialects\SQLite;

$Builder = $Transaction
   ->table(Tables::Users)
   ->select(Columns::Id, Columns::Name)
   ->filter(Columns::Id, Operators::Equal, 1);

if ($Builder->Dialect instanceof SQLite === false) {
   $Builder->lock(Locks::Update);
}
```

## Referência

O `table()` do builder está na Referência de
**[Compondo queries](/manual/ADI/Databases/SQL/Builder/Composing/overview/#referência)**; o
`compile()` e as propriedades `$and` e `$or`, na do
**[Query Builder](/manual/ADI/Databases/SQL/Builder/overview/#referência)**; e o `table()`, o
`query()` e o `await()` da fachada, na do **[Banco SQL](/manual/ADI/Databases/SQL/overview/#referência)**.

### Métodos do builder

```php
select (BackedEnum|Stringable ...$Columns): static
```

Muda para o modo SELECT e adiciona as colunas à lista do select, depois das projeções já
adicionadas. Um builder sem colunas seleciona `*`.

```php
distinct (): static
```

Muda para o modo SELECT e emite `SELECT DISTINCT`, que remove linhas duplicadas do resultado.

```php
filter (BackedEnum|Stringable $Column, Operators $Operator, mixed $value = null, Junctions $Junction = Junctions::And): static
```

Adiciona um predicado ao `WHERE`. O valor recebe bind, a menos que seja uma `Expression`, e é
verificado na hora: `Between` precisa de um array de dois valores, `In` de um array não vazio ou de
um builder ou query compilada, e os operadores `Is*` de nenhum valor — senão lança
`InvalidArgumentException`. `$Junction` liga o predicado ao anterior e é ignorado no primeiro:
deixe-o com `->or` e `->and`.

```php
nest (Closure $Group, Junctions $Junction = Junctions::And): static
```

Chama `$Group` com um builder novo do mesmo dialeto e adiciona os predicados de `filter()`,
`match()` e `nest()` que o closure criou como um único predicado entre parênteses; as outras
chamadas do closure são descartadas. Um closure que não adiciona nenhum lança
`SQL nested filter requires at least one filter.` O `compile($Dialect)` chama o closure de novo
quando reexecuta o builder, então mantenha-o sem efeitos colaterais. `$Junction` liga o grupo ao
predicado anterior e é ignorado no primeiro: deixe-o com `->or` e `->and`.

```php
match (BackedEnum|Stringable $Column, mixed $value, Matches $Match = Matches::Like, Junctions $Junction = Junctions::And): static
```

Adiciona um predicado textual ao `WHERE`, compilado pelo dialeto conforme `$Match`. O valor recebe
bind e precisa ser string; qualquer outra coisa lança `SQL text match value must be a string.`

```php
join (BackedEnum|Stringable $Table, BackedEnum|Stringable $Left, Operators $Operator, BackedEnum|Stringable $Right, Joins $Join = Joins::Inner): static
```

Adiciona um join de `$Table` em `$Left $Operator $Right`, dois identificadores. Nem o operador nem o
suporte do dialeto a `$Join` são verificados.

```php
alias (BackedEnum|Stringable $Identifier, BackedEnum|Stringable $Alias): static
```

Dá um alias a `$Identifier`: um alias de tabela para a tabela base ou uma tabela do join, um alias
de expressão para uma `Expression`, e um alias de coluna para qualquer outro nome — que vira alias
de tabela se `table()` ou `join()` adicionar depois uma tabela com esse nome. Lança
`SQL expression alias conflicts with an existing column alias.` ou
`SQL column alias conflicts with an existing expression alias.` quando um mesmo texto SQL receberia
os dois tipos.

```php
aggregate (Aggregates $Aggregate, BackedEnum|Stringable $Column, null|BackedEnum|Stringable $Alias = null, bool $distinct = false): static
```

Muda para o modo SELECT e adiciona `AVG`, `COUNT`, `MAX`, `MIN` ou `SUM` sobre uma coluna. A
coluna é resolvida pelos aliases de tabela na compilação. `distinct: true` compila
`FUNC(DISTINCT coluna)`. Uma coluna `*` pura é recusada com
`SQL aggregate cannot take *: use count() for COUNT(*).` Desde a 1.0.3 para `Count`, `distinct`, a
resolução de aliases e a recusa do `*`.

```php
count (null|BackedEnum|Stringable $Alias = null): static
```

Muda para o modo SELECT e adiciona `COUNT(*)`, que conta linhas — inclusive a linha preenchida com
`NULL` que um `LEFT JOIN` produz para um pai sem correspondência. Para contar os valores não `NULL`
de uma coluna, use `aggregate(Aggregates::Count, ...)`.

```php
group (BackedEnum|Stringable ...$Columns): static
```

Adiciona colunas ao `GROUP BY`. Uma coluna ou expressão com alias é citada pelo alias — por enquanto
mesmo quando não é selecionada (veja [Aliases](#aliases)).

```php
having (BackedEnum|Stringable $Column, Operators $Operator, mixed $value = null, Junctions $Junction = Junctions::And): static
```

Adiciona um predicado ao `HAVING`, com os valores e verificações do `filter()`. Por enquanto uma
coluna ou expressão com alias é citada pelo alias, o que o PostgreSQL rejeita (veja
[Aliases](#aliases)).

```php
order (Orders $Order, BackedEnum|Stringable $Column, null|Nulls $Nulls = null): static
```

Adiciona um termo ao `ORDER BY`; uma coluna ou expressão com alias é citada pelo alias, por enquanto
mesmo quando não é selecionada (veja [Aliases](#aliases)). `$Nulls` posiciona os valores `NULL` — de
forma nativa no PostgreSQL e no SQLite, por uma ordenação por `IS NULL` no MySQL. Um case de `Nulls`
passado como coluna lança `SQL order requires a column identifier.`

```php
limit (int $count, int $offset = 0): static
```

Define o `LIMIT` e o offset. Por enquanto ele sempre define o offset, então uma chamada com um
argumento zera um `skip()` anterior. Um valor negativo lança
`SQL limit and offset must be non-negative integers.`

```php
skip (int $offset): static
```

Define só o offset. Sem um `limit()`, o PostgreSQL escreve o `OFFSET` sozinho, e o MySQL e o SQLite
acrescentam a contagem de linhas que leem como "sem limite". Um valor negativo lança
`SQL offset must be a non-negative integer.`

```php
lock (Locks $Lock): static
```

Adiciona `FOR UPDATE` ou `FOR SHARE` a um `SELECT` e mantém a instrução no primário. O dialeto não é
verificado: o SQLite rejeita a cláusula.

### Enums desta página

Namespace `Bootgly\ADI\Databases\SQL\Builder\Auxiliaries`. Todo case de todo enum do builder, e o
SQL para o qual ele compila, está em
**[Enums auxiliares](/manual/ADI/Databases/SQL/Builder/Dialects/overview/#enums-auxiliares)**.

| Enum | Cases usados aqui |
| --- | --- |
| `Aggregates` | `Count`, `Maximum` |
| `Joins` | `Full`, `Inner`, `Left`, `Right` |
| `Junctions` | `And`, `Or` |
| `Locks` | `Share`, `Update` |
| `Matches` | `Insensitive`, `Like`, `Text` |
| `Nulls` | `First`, `Last` |
| `Operators` | `Between`, `Equal`, `Greater`, `GreaterOrEqual`, `In`, `IsFalse`, `IsNotNull`, `IsNull`, `IsTrue`, `Less`, `LessOrEqual`, `Unequal` |
| `Orders` | `Asc`, `Desc` |
