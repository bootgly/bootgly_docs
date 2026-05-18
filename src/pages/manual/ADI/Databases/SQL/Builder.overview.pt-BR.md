# Query Builder

O Query Builder é como você lê e escreve linhas sem concatenar strings SQL. Ele monta
instruções DML: `SELECT`, `INSERT`, `UPDATE` e `DELETE`.

> Chegou agora? Siga primeiro o guia **[Consultas de banco](/guide/database-queries/overview/)**.
> Esta página explica o objeto builder, compilação e execução.

## O ciclo

```php
use Bootgly\ADI\Databases\SQL;
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Operators;

enum Tables: string { case Users = 'users'; }
enum Columns: string { case Id = 'id'; case Name = 'name'; case Active = 'active'; }

$Database = new SQL;

$Builder = $Database
   ->table(Tables::Users)
   ->select(Columns::Id, Columns::Name)
   ->filter(Columns::Active, Operators::Equal, true);

$Query = $Builder->compile();
```

`$Query` é um `Bootgly\ADI\Databases\SQL\Builder\Query`:

```php
$Query->sql;        // SELECT "id", "name" FROM "users" WHERE "active" = $1
$Query->parameters; // [true]
```

Para executar, passe o builder ou a query compilada para o banco:

```php
$Operation = $Database->query($Builder);
$Database->Pool->wait($Operation);

$rows = $Operation->rows;
```

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
query (string|Builder|Query $query, array $parameters = []): Operation
```
Cria uma operação SQL assíncrona a partir de SQL cru, um builder ou uma query compilada.

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

### Objetos de apoio

```php
new Query(string $sql, array $parameters = [])
```
Texto SQL compilado mais parâmetros ordenados. `__toString()` retorna a string SQL.

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
