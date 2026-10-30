# Consultas de banco

Depois que suas migrations criam as tabelas, o fluxo diário é simples: monte uma query,
rode contra o banco que o seu projeto configura em `configs/database` e leia o `Operation`
resultante.

Use o **[Query Builder](/manual/ADI/Databases/SQL/Builder/overview/)** quando a forma da
query vem do código da aplicação. Use SQL cru só quando o builder não for o encaixe certo.

Em rotas `HTTP_Server_CLI`, não monte o `SQL` você mesmo: use o
**[Response Resource](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/overview/)**
`$Response->Database`, um por worker. O guia
**[DBAL de banco](/guide/database-dbal/overview/)** mostra como aguardar operações por ele em
vez de chamar `Pool->wait()` diretamente.

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
$Database->Pool->wait($Operation);

$rows = $Operation->rows;
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
`SQL::query()` compila SQL e parâmetros ordenados antes de atribuir a operação ao pool.

## Ler linhas

```php
$Users = $Database
   ->table(Tables::Users)
   ->select(Columns::Id, Columns::Name)
   ->filter(Columns::Name, Operators::Equal, 'Ada')
   ->limit(10);

$Operation = $Database->query($Users);
$Database->Pool->wait($Operation);
```

Compilado para PostgreSQL:

```sql
SELECT "id", "name" FROM "users" WHERE "name" = $1 LIMIT 10
```

Parâmetros:

```php
['Ada']
```

Quando réplicas de leitura estão configuradas, builders de leitura como esse podem ser roteados
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
$Database->Pool->wait($Operation);
```

Só o PostgreSQL suporta `output()`, que compila para `RETURNING`; as colunas retornadas
chegam em `$Operation->rows`. MySQL e SQLite o rejeitam (`output()` lança
`InvalidArgumentException` com `SQL dialect does not support RETURNING output.`), então omita-o
ali e leia a chave gerada em `$Operation->Result->inserted` depois de aguardar a operação; o
PostgreSQL deixa esse campo em `0`. Veja
**[Retornar output](/manual/ADI/Databases/SQL/Builder/Writing/overview/#retornar-output)**
e
**[Chaves geradas sem RETURNING](/manual/ADI/Databases/SQL/Drivers/overview/#chaves-geradas-sem-returning)**.

## Use transação quando escritas precisam ficar juntas

Quando várias instruções precisam compartilhar uma conexão e fazer commit ou rollback como
uma unidade, use `SQL::begin()` e rode builders por `Transaction::query()`. Veja
**[Transações de banco](/guide/database-transactions/overview/)** para o fluxo completo,
padrão de rollback e savepoints.

`update()` e `delete()` exigem pelo menos um `filter()`. O builder bloqueia queries globais
de mutação antes que elas possam rodar.

## Nomes dinâmicos e expressões cruas

Prefira enums backed para nomes de tabela e coluna. Quando o nome só existe em runtime,
envolva com `Identifier` para o dialeto fazer quote com segurança:

```php
use Bootgly\ADI\Databases\SQL\Builder\Identifier;

$Users = $Database
   ->table(new Identifier('public.users'))
   ->select(new Identifier('id'));
```

Use `Expression` apenas para fragmentos SQL confiáveis:

```php
use Bootgly\ADI\Databases\SQL\Builder\Expression;

$Now = new Expression('NOW()');

$Query = $Database
   ->table(Tables::Users)
   ->select($Now);
```

`Expression` não carrega bindings. Valores que vêm de usuários devem passar por `filter()`
ou `set()` para virarem parâmetros.

## Próximas referências

- **[Query Builder](/manual/ADI/Databases/SQL/Builder/overview/)** - ciclo, compile e execução.
- **[DBAL de banco](/guide/database-dbal/overview/)** - uso async do DBAL em respostas HTTP.
- **[ORM de banco](/guide/database-orm/overview/)** - entidades Data Mapper sobre operações SQL.
- **[Réplicas de leitura de banco](/guide/database-read-replicas/overview/)** - roteie leituras seguras para réplicas e mantenha escritas no primário.
- **[Lendo linhas](/manual/ADI/Databases/SQL/Builder/Reading/overview/)** - select, filtros, joins, agrupamento e limites.
- **[Escrevendo linhas](/manual/ADI/Databases/SQL/Builder/Writing/overview/)** - insert, update, delete, output e upsert.
- **[Compondo queries](/manual/ADI/Databases/SQL/Builder/Composing/overview/)** - identifiers, expressions, subqueries e CTEs.
- **[Dialetos de query](/manual/ADI/Databases/SQL/Builder/Dialects/overview/)** - diferenças entre PostgreSQL, MySQL e SQLite.
- **[Transações](/manual/ADI/Databases/SQL/Transaction/overview/)** - commit, rollback e savepoints.
