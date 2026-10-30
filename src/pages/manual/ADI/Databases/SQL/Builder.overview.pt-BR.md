# Query Builder

O Query Builder é como você lê e escreve linhas sem concatenar strings SQL. Ele monta
instruções DML: `SELECT`, `INSERT`, `UPDATE` e `DELETE`.

> Chegou agora? Siga primeiro o guia **[Consultas de banco](/guide/database-queries/overview/)**.
> Esta página explica o objeto builder, compilação e execução.

## O ciclo

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

`$Query` é um `Bootgly\ADI\Databases\SQL\Builder\Query`:

```php
$Query->SQL;        // SELECT "id", "name" FROM "users" WHERE "active" = $1
$Query->parameters; // [true]
```

Para executar, passe o builder ou a query compilada para o banco:

```php
$Operation = $Database->query($Builder);
$Database->Pool->wait($Operation);

$rows = $Operation->rows;
```

> **Abrindo o banco.** A linha do `DatabaseConfig` lê o escopo de config `database` do
> projeto, então roda na função de boot de um projeto, em um comando ou em um script dentro do
> projeto (sem um diretório `configs/`, `BOOTGLY_PROJECT->Configs` é `null`). Em uma rota
> `HTTP_Server_CLI`, use no lugar o resource por worker
> **[`$Response->Database`](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/overview/)**.
> Fora de um projeto, passe a conexão como array:
> `new SQL(['driver' => 'pgsql', 'host' => '127.0.0.1', 'port' => 5432, 'database' => 'app', 'username' => 'app', 'password' => 'secret'])`.
> Um `new SQL` sem argumentos não lê config nenhuma: ele usa os defaults locais embutidos
> (PostgreSQL em `127.0.0.1:5432`, banco `bootgly`, usuário `postgres`).

## Nomes são tipados

Identificadores do builder não são strings cruas. Use um enum backed por string para nomes
estáveis da aplicação, ou `Identifier` para nomes dinâmicos:

```php
use Bootgly\ADI\Databases\SQL\Builder\Identifier;

$Database
   ->table(new Identifier('public.users'))
   ->select(new Identifier('id'));
```

`Identifier` ainda faz quote pelo dialeto ativo. Use `Expression` apenas para fragmentos SQL
confiáveis que não devem receber quote:

```php
use Bootgly\ADI\Databases\SQL\Builder\Expression;

$Database
   ->table(Tables::Users)
   ->select(new Expression('NOW()'));
```

## Modelo de execução

`SQL::query()` aceita três formas:

```php
$Database->query('SELECT 1');
$Database->query($Builder);
$Database->query($Builder->compile());
```

Todas retornam um `Operation` SQL. A operação guarda texto SQL, parâmetros, linhas afetadas,
colunas do resultado e linhas do resultado. Em scripts e testes, `Pool->wait()` leva a
operação até o fim. Em código HTTP, use o fluxo do scheduler da resposta já usado pela rota.

## Transações

Use `SQL::begin()` quando várias instruções precisam rodar na mesma conexão e commitar ou
fazer rollback juntas. `Transaction::table()` inicia a mesma superfície de Query Builder
com o dialeto do banco, e `Transaction::query()` aceita SQL cru, `Builder` e `Query`, como
`SQL::query()`.

Veja **[Transações](/manual/ADI/Databases/SQL/Transaction/overview/)** para commit,
rollback e savepoints.

## Referência

### Fachada SQL

```php
table (BackedEnum|Stringable|Builder|Query $Table, null|BackedEnum|Stringable $Alias = null): Builder
```
Inicia um query builder para uma tabela ou fonte derivada.

```php
query (string|Builder|Query $query, array $parameters = [], null|object $Scope = null): Operation
```
Cria uma operação SQL assíncrona a partir de SQL cru, um builder ou uma query compilada.
`$Scope` nomeia o escopo de read-after-write da operação (por padrão, o Fiber atual, senão a
fachada): depois de uma escrita por um escopo, as leituras por esse escopo ficam no primário
durante a janela sticky. Isso só importa quando há réplicas configuradas; veja
**[Réplicas de leitura](/guide/database-read-replicas/overview/#escopo-de-read-after-write)**.

```php
begin (): Transaction
```
Inicia uma transação presa a uma conexão do pool. Veja
**[Transações](/manual/ADI/Databases/SQL/Transaction/overview/)**.

### Ciclo do Builder

```php
compile (null|Dialect $Dialect = null): Query
```
Compila o builder para SQL e parâmetros ordenados. Passar um dialeto reexecuta as ações
fluentes por esse dialeto e memoriza o resultado pela classe do dialeto.

```php
public private(set) array $assignments
```
Os valores que cada `set()` atribuiu, indexados pela coluna compilada — o identificador entre
aspas do dialeto, ou o SQL raw de uma `Expression` — com um valor por linha. Somente leitura
fora do builder; o Runner de seeders o lê para mover sequências de identidade no PostgreSQL.

### Objetos de apoio

```php
new Query(string $sql, array $parameters = [], bool $reading = false)
```
Texto SQL compilado mais parâmetros ordenados. `__toString()` retorna a string SQL. `$reading`
decide o roteamento para **[réplicas de leitura](/guide/database-read-replicas/overview/)** e só
importa quando há réplicas configuradas: `true` deixa o `SQL::query()` enviar a query para uma
réplica, enquanto o padrão `false` a mantém no primário e a conta como escrita para o
read-after-write.

```php
new Identifier(string $name)
```
Nome dinâmico de tabela ou coluna. O dialeto ativo faz quote de cada segmento pontilhado.

```php
new Expression(string $sql)
```
Fragmento SQL cru e confiável. Ele entra como está e não carrega bindings de parâmetro.

Próximo: **[Lendo linhas](/manual/ADI/Databases/SQL/Builder/Reading/overview/)** e
**[Escrevendo linhas](/manual/ADI/Databases/SQL/Builder/Writing/overview/)**.
