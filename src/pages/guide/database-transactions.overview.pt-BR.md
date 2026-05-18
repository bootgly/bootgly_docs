# Transações de banco

Transações mantêm várias instruções SQL na mesma conexão do pool e finalizam tudo como uma
unidade. Use quando escritas posteriores dependem de escritas anteriores, ou quando uma
falha deve desfazer o grupo inteiro.

## O fluxo

```php
use Bootgly\ADI\Databases\SQL;
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Operators;

enum Tables: string { case Users = 'users'; case Profiles = 'profiles'; }
enum Columns: string { case Id = 'id'; case UserId = 'user_id'; case Active = 'active'; }

$Database = new SQL;

$Transaction = $Database->begin();
$Database->Pool->wait($Transaction->Operation);

$Deactivate = $Transaction
   ->table(Tables::Users)
   ->update()
   ->set(Columns::Active, false)
   ->filter(Columns::Id, Operators::Equal, 7);

$Database->Pool->wait($Transaction->query($Deactivate));
$Database->Pool->wait($Transaction->commit());
```

`begin()` inicia imediatamente e guarda a operação `BEGIN` em `$Transaction->Operation`.
Espere essa operação antes de enviar a primeira instrução. Depois, espere cada operação
antes de enviar a próxima nessa transação.

## Commit ou rollback

Envolva o trabalho da aplicação em `try/catch` e faça rollback quando qualquer operação
falhar:

```php
$Transaction = $Database->begin();
$Database->Pool->wait($Transaction->Operation);

try {
   $Create = $Transaction
      ->table(Tables::Users)
      ->insert()
      ->set(Columns::Active, true);

   $Database->Pool->wait($Transaction->query($Create));
   $Database->Pool->wait($Transaction->commit());
}
catch (Throwable $Throwable) {
   $Database->Pool->wait($Transaction->rollback());

   throw $Throwable;
}
```

Depois de `commit()` ou de um `rollback()` externo, a profundidade da transação vira `0` e
a conexão fixada volta para o pool.

## Builders, SQL cru e objetos Query

`Transaction::table()` inicia um Query Builder com o mesmo dialeto do banco.
`Transaction::query()` aceita as mesmas formas de query que `SQL::query()`:

```php
use Bootgly\ADI\Databases\SQL\Builder\Query;

$Database->Pool->wait($Transaction->query('SELECT 1'));
$Database->Pool->wait($Transaction->query(new Query('SELECT 2')));
$Database->Pool->wait($Transaction->query($Transaction->table(Tables::Users)->select()));
```

## Savepoints

Savepoints são checkpoints aninhados dentro da transação aberta:

```php
$Transaction = $Database->begin();
$Database->Pool->wait($Transaction->Operation);

$Database->Pool->wait($Transaction->save('optional_profile'));

try {
   $Profile = $Transaction
      ->table(Tables::Profiles)
      ->insert()
      ->set(Columns::UserId, 7);

   $Database->Pool->wait($Transaction->query($Profile));
   $Database->Pool->wait($Transaction->release('optional_profile'));
}
catch (Throwable) {
   $Database->Pool->wait($Transaction->rollback('optional_profile'));
}

$Database->Pool->wait($Transaction->commit());
```

`save()` cria um nome automático de savepoint. `save('name')` cria um savepoint nomeado.
`release()` libera o savepoint mais recente, enquanto `release('name')` libera um nomeado.
`rollback()` desfaz o savepoint mais recente quando há aninhamento, ou a transação inteira
quando não há. `rollback('name')` volta para um savepoint nomeado.

Chamar `begin()` enquanto uma transação já está ativa também cria um savepoint. Chamar
`commit()` com profundidade maior que `1` libera o savepoint atual em vez de commitar a
transação externa.

## Referência

- **[Transações](/manual/ADI/Databases/SQL/Transaction/overview/)** — API, estado e
  comportamento de savepoints.
- **[Query Builder](/manual/ADI/Databases/SQL/Builder/overview/)** — monte as instruções
  executadas por uma transação.
- **[Consultas de banco](/guide/database-queries/overview/)** — fluxo diário de leitura e
  escrita fora de transações explícitas.
