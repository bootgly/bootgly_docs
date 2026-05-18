# Transações

`Bootgly\ADI\Databases\SQL\Transaction` prende operações SQL a uma conexão do pool. Use
por meio de `SQL::begin()` quando várias instruções precisam commitar ou fazer rollback
juntas.

> Quer o fluxo prático primeiro? Comece pelo guia
> **[Transações de banco](/guide/database-transactions/overview/)**.

## Ciclo de vida

```php
use Bootgly\ADI\Databases\SQL;

$Database = new SQL;

$Transaction = $Database->begin();
$Database->Pool->wait($Transaction->Operation);

$Database->Pool->wait($Transaction->query('SELECT 1'));
$Database->Pool->wait($Transaction->commit());
```

`SQL::begin()` constrói a transação e atribui imediatamente uma operação `BEGIN` ao pool.
Espere `$Transaction->Operation` antes de enviar a primeira query transacional.

## Estado

- `Database` — a fachada SQL que criou a transação.
- `Operation` — a operação mais recente da transação (`BEGIN`, query, savepoint, commit ou
  rollback).
- `Connection` — a conexão do pool presa à transação depois que `BEGIN` é atribuído.
- `depth` — profundidade atual de aninhamento; `0` significa que a transação externa está
  fechada.

A transação só aceita uma nova operação quando a anterior terminou. Se outra operação ainda
está ativa, os métodos retornam um `Operation` com falha em vez de tocar o pool.

## Queries

`Transaction` implementa a mesma superfície de query usada pela fachada SQL:

```php
query (string|Builder|Query $query, array $parameters = []): Operation
```

Roda SQL cru, um Query Builder ou uma `Query` compilada na conexão fixada.

```php
table (BackedEnum|Stringable|Builder|Query $Table, null|BackedEnum|Stringable $Alias = null): Builder
```

Inicia um Query Builder com o dialeto do banco. Passe a instrução montada de volta para
`query()`.

## Commit e rollback

```php
commit (): Operation
```

Commita a transação externa quando `depth === 1`. Quando `depth > 1`, libera o savepoint
atual.

```php
rollback (null|string $name = null): Operation
```

Sem nome, desfaz o savepoint atual quando há aninhamento, ou a transação externa quando
não há. Com nome, volta para aquele savepoint.

Os dois métodos falham sem tocar o pool quando a transação está inativa.

## Savepoints

```php
begin (): Operation
```

Inicia a transação externa de novo quando `depth <= 0`; caso contrário cria um savepoint
aninhado.

```php
save (null|string $name = null): Operation
```

Cria um savepoint e incrementa `depth`. Sem nome, o Bootgly gera `bootgly_0`, `bootgly_1`
e assim por diante.

```php
release (null|string $name = null): Operation
```

Libera o savepoint atual ou um savepoint nomeado e decrementa `depth`.

Identificadores de savepoint são quotados pelo dialeto SQL ativo. Savepoints ausentes e
transações inativas retornam operações com falha.

## Referência

- **[Transações de banco](/guide/database-transactions/overview/)** — fluxo prático,
  padrão de rollback e exemplos de savepoint.
- **[Query Builder](/manual/ADI/Databases/SQL/Builder/overview/)** — instruções aceitas por
  `Transaction::query()`.
- **[Dialetos de query](/manual/ADI/Databases/SQL/Builder/Dialects/overview/)** —
  diferenças de placeholders e quotes para instruções compiladas.
