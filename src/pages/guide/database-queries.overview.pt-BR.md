# Consultas de banco

Depois que suas migrations criam as tabelas, o fluxo diário é simples: monte uma query,
rode contra o banco que o seu projeto configura em `configs/database` e leia o `Operation`
resultante.

Use o **[Query Builder](/manual/ADI/Databases/SQL/Builder/overview/)** quando a forma da
query vem do código da aplicação. Use SQL raw só quando o builder não for o encaixe certo.

Em rotas `HTTP_Server_CLI`, não monte o `SQL` você mesmo: use o
**[Response Resource](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/overview/)**
`$Response->Database`, um por worker. O guia
**[DBAL de banco](/guide/database-dbal/overview/)** mostra como ele aguarda operações pela
resposta em vez de bloquear o worker.

## O fluxo

```php
use Bootgly\ADI\Databases\SQL;
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Operators;
use Bootgly\API\Environment\Configs\DatabaseConfig;

enum Tables: string { case Users = 'users'; }
enum Columns: string { case Id = 'id'; case Name = 'name'; case Active = 'active'; }

$Database = new SQL(new DatabaseConfig(BOOTGLY_PROJECT->Configs->get('database'))->configure());

$Users = $Database
   ->table(Tables::Users)
   ->select(Columns::Id, Columns::Name)
   ->filter(Columns::Active, Operators::Equal, true);

$Operation = $Database->query($Users);
$Database->await($Operation);

$rows = $Operation->Result->rows;
```

Isso monta o `SQL` a partir do escopo de config `database` do projeto, então roda dentro de um
projeto (na função de boot, em um comando ou em um script) cujo `configs/database` define esse
escopo; veja **[Configurar o banco](/guide/database-dbal/overview/#configurar-o-banco)**. Em
um projeto sem diretório `configs/`, `BOOTGLY_PROJECT->Configs` é `null`. Fora de um projeto,
passe as configurações de conexão como array, por exemplo
`new SQL(['driver' => 'pgsql', 'host' => '127.0.0.1', 'port' => 5432, 'database' => 'app', 'username' => 'app', 'password' => 'secret'])`.
Um `new SQL` sem argumentos nunca lê o config do projeto: ele usa os padrões locais embutidos
(PostgreSQL em `127.0.0.1:5432`, banco `bootgly`, usuário `postgres`, senha vazia), e um array
recorre a eles para toda chave que omitir, qualquer que seja o seu `driver`, então um array de
MySQL precisa definir `port` e `username` também.

`SQL::table()` inicia o builder com o dialeto do banco já selecionado. Passar o builder para
`SQL::query()` compila SQL e parâmetros ordenados antes de atribuir a operação ao pool. O
`await()` leva a operação até o fim e a retorna; as linhas ficam em `$Operation->Result->rows`,
indexadas pelo nome da coluna. Todo o resto que uma operação terminada guarda está em
**[Leia o resultado](/manual/ADI/Databases/SQL/overview/#leia-o-resultado)**.

## Ler linhas

```php
$Users = $Database
   ->table(Tables::Users)
   ->select(Columns::Id, Columns::Name)
   ->filter(Columns::Name, Operators::Equal, 'Ada')
   ->limit(10);

$Operation = $Database->query($Users);
$Database->await($Operation);
```

Compilado para PostgreSQL:

```sql
SELECT "id", "name" FROM "users" WHERE "name" = $1 LIMIT 10
```

Parâmetros:

```php
['Ada']
```

Cada `filter()` é unido ao anterior com `AND`. Escreva `->or` antes de um `filter()` para uni-lo
com `OR`:

```php
$Users = $Database
   ->table(Tables::Users)
   ->select(Columns::Id, Columns::Name)
   ->filter(Columns::Name, Operators::Equal, 'Ada')
   ->or
   ->filter(Columns::Name, Operators::Equal, 'Grace');
```

Compilado para PostgreSQL:

```sql
SELECT "id", "name" FROM "users" WHERE "name" = $1 OR "name" = $2
```

O `->or` vale só para o próximo filtro. Para agrupar condições, como em `A AND (B OR C)`, use o
`nest()` — veja **[OR e AND](/manual/ADI/Databases/SQL/Builder/Reading/overview/#or-e-and)**.

Quando réplicas de leitura estão configuradas, builders de leitura como esses podem ser roteados
para uma réplica, exceto quando o escopo atual está sticky depois de uma escrita. Veja
**[Réplicas de leitura de banco](/guide/database-read-replicas/overview/)** para as regras de
roteamento.

## Escrever linhas

```php
$Insert = $Database
   ->table(Tables::Users)
   ->insert()
   ->set(Columns::Name, 'Ada')
   ->set(Columns::Active, true)
   ->output(Columns::Id);

$Operation = $Database->query($Insert);
$Database->await($Operation);
```

Só o PostgreSQL suporta `output()`, que compila para `RETURNING`; as colunas retornadas
chegam em `$Operation->Result->rows`. MySQL e SQLite o rejeitam (`output()` lança
`InvalidArgumentException` com `SQL dialect does not support RETURNING output.`), então omita-o
ali e leia a chave gerada em `$Operation->Result->inserted` depois de aguardar a operação; o
PostgreSQL deixa esse campo em `0`. Veja
**[Retornar output](/manual/ADI/Databases/SQL/Builder/Writing/overview/#retornar-output)**
e
**[Chaves geradas sem RETURNING](/manual/ADI/Databases/SQL/Drivers/overview/#chaves-geradas-sem-returning)**.

`update()` e `delete()` exigem pelo menos um `filter()`. O builder bloqueia queries globais
de mutação antes que elas possam rodar: o `query()` lança em vez de enviá-las.

## Use transação quando escritas precisam ficar juntas

Quando várias instruções precisam compartilhar uma conexão e fazer commit ou rollback como
uma unidade, use `SQL::begin()` e rode builders por `Transaction::query()`. Veja
**[Transações de banco](/guide/database-transactions/overview/)** para o fluxo completo,
padrão de rollback e savepoints.

## Nomes dinâmicos e expressões raw

Prefira enums backed para nomes de tabela e coluna. Quando o nome só existe em runtime,
envolva com `Identifier` para o dialeto fazer quote dele, segmento por segmento —
`SELECT "users"."id" FROM "users"` no PostgreSQL:

```php
use Bootgly\ADI\Databases\SQL\Builder\Identifier;

$Users = $Database
   ->table(new Identifier('users'))
   ->select(new Identifier('users.id'));
```

Aspas impedem injeção, não acesso: confira antes um nome que vem de uma requisição contra os nomes
que você permite — veja
**[Identificadores dinâmicos](/manual/ADI/Databases/SQL/Builder/Composing/overview/#identificadores-dinâmicos)**.

Use `Expression` apenas para fragmentos SQL confiáveis:

```php
use Bootgly\ADI\Databases\SQL\Builder\Expression;

$Now = new Expression('CURRENT_TIMESTAMP');

$Query = $Database
   ->table(Tables::Users)
   ->select($Now);
```

`Expression` não carrega bindings. Valores que vêm de usuários devem passar por `filter()`
ou `set()` para virarem parâmetros. Os dois wrappers, e as subqueries e CTEs que você monta com
eles, estão em **[Compondo queries](/manual/ADI/Databases/SQL/Builder/Composing/overview/)**.

## Quando uma query lança

Uma query pode falhar em dois lugares. Um builder que não consegue virar uma instrução válida lança
`InvalidArgumentException` antes de qualquer coisa ser enviada: uma chamada do builder lança na hora
para uma entrada inválida, e o `query()` lança para uma instrução que não consegue compilar, como
abaixo. Uma instrução que o banco recusa faz a operação falhar: o `await()` lança
`RuntimeException` com a mensagem do servidor, e o código de erro do driver fica em
`$Operation->code`.

```php
use InvalidArgumentException;
use RuntimeException;

try {
   $Operation = $Database->query($Users);
   $Database->await($Operation);
}
catch (InvalidArgumentException $Exception) {
   echo "Invalid query: {$Exception->getMessage()}\n";
}
catch (RuntimeException $Exception) {
   echo "Query failed ({$Operation->code}): {$Exception->getMessage()}\n";
}
```

Um `delete()` sem filtro imprime `Invalid query: SQL update/delete requires at least one filter.`;
um insert de um id que já existe imprime, no PostgreSQL,
`Query failed (23505): duplicate key value violates unique constraint "users_pkey"`. Todo erro do
builder, e quando ele é lançado, está listado em
**[Erros](/manual/ADI/Databases/SQL/Builder/overview/#erros)**; os campos de falha de uma operação
estão em **[Leia o resultado](/manual/ADI/Databases/SQL/overview/#leia-o-resultado)**.

## Próximas referências

- **[Query Builder](/manual/ADI/Databases/SQL/Builder/overview/)** - pontos de entrada, compile e execução, modos e erros.
- **[DBAL de banco](/guide/database-dbal/overview/)** - uso async do DBAL em respostas HTTP.
- **[ORM de banco](/guide/database-orm/overview/)** - entidades Data Mapper sobre operações SQL.
- **[Réplicas de leitura de banco](/guide/database-read-replicas/overview/)** - roteie leituras seguras para réplicas e mantenha escritas no primário.
- **[Lendo linhas](/manual/ADI/Databases/SQL/Builder/Reading/overview/)** - select, filtros, joins, agrupamento e limites.
- **[Escrevendo linhas](/manual/ADI/Databases/SQL/Builder/Writing/overview/)** - insert, update, delete, output e upsert.
- **[Compondo queries](/manual/ADI/Databases/SQL/Builder/Composing/overview/)** - identifiers, expressions, subqueries e CTEs.
- **[Dialetos de query](/manual/ADI/Databases/SQL/Builder/Dialects/overview/)** - diferenças entre PostgreSQL, MySQL e SQLite.
- **[Transações](/manual/ADI/Databases/SQL/Transaction/overview/)** - commit, rollback e savepoints.
