# Transações de banco

Transações mantêm várias instruções SQL na mesma conexão do pool e finalizam tudo como uma
unidade. Use quando escritas posteriores dependem de escritas anteriores, ou quando uma
falha deve desfazer o grupo inteiro.

## O fluxo

```php
use Bootgly\ADI\Databases\SQL;
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Operators;
use Bootgly\API\Environment\Configs\DatabaseConfig;

enum Tables: string { case Users = 'users'; case Profiles = 'profiles'; }
enum Columns: string { case Id = 'id'; case UserId = 'user_id'; case Active = 'active'; }

$Database = new SQL(new DatabaseConfig(BOOTGLY_PROJECT->Configs->get('database'))->configure());

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

Isso abre o `$Database` a partir do escopo de config `database` do projeto (veja
**[DBAL de banco](/guide/database-dbal/overview/)**): é a forma para uma função de boot, um
comando ou um script que roda dentro de um projeto. Numa rota HTTP, use o resource por worker
**[`$Response->Database`](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/overview/)**: o
`transact()` dele inicia a transação, roda o seu callback e faz o commit, ou o rollback quando
o callback lança uma exceção.

`begin()` inicia imediatamente e guarda a operação `BEGIN` em `$Transaction->Operation`.
Espere essa operação antes de enviar a primeira instrução. Depois, espere cada operação
antes de enviar a próxima nessa transação.

## Commit ou rollback

`Pool::wait()` lança uma `RuntimeException` cuja mensagem é `$Operation->error` quando a
operação que ele espera falha (o `SQL::await()` faz o mesmo). Envolva o trabalho da aplicação
e o commit em `try/catch` e encerre a transação com `abort()` no `catch`:

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
   try {
      $Database->Pool->wait($Transaction->abort());
   }
   catch (Throwable) {
      // Recusado: o COMMIT já encerrou a transação, ou a sessão caiu e o servidor
      // desfez o trabalho. Mantenha o erro original.
   }

   throw $Throwable;
}
```

Depois de `commit()`, de um `rollback()` externo ou de `abort()`, a profundidade da transação
vira `0` e a conexão fixada volta para o pool. A receita faz o commit dentro do `try`, então o
`catch` também encerra uma transação que o `commit()` não conseguiu fechar: um listener de
`Commit` que lança (veja **[Eventos](/guide/events/overview/)**) ou uma instrução que o trabalho
deixou em andamento, o que faz o `commit()` devolver uma operação recusada. Quando o próprio
`COMMIT` falha (uma constraint deferida, por exemplo, que faz o PostgreSQL desfazer a transação
inteira), o `commit()` já fechou a transação, então o `abort()` do `catch` é recusado e o erro
relançado é o do próprio `COMMIT`.

O `catch` usa `abort()`, e não `rollback()`: ele compõe o `ROLLBACK` de nível superior em
qualquer profundidade, então também desfaz todos os níveis de savepoint que o trabalho abriu
(um `rollback()` sem nome só encerra o mais recente), e não emite evento `Rollback` — um
listener de `Rollback` não pode recusar esse teardown nem vê-lo.

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
}
catch (Throwable) {
   $Database->Pool->wait($Transaction->rollback('optional_profile'));
}

$Database->Pool->wait($Transaction->release('optional_profile'));
$Database->Pool->wait($Transaction->commit());
```

`save()` cria um nome automático de savepoint. `save('name')` cria um savepoint nomeado.
`release()` libera o savepoint mais recente, enquanto `release('name')` libera um nomeado.
`rollback()` desfaz o savepoint mais recente quando há aninhamento, ou a transação inteira
quando não há. `rollback('name')` volta para um savepoint nomeado, mas mantém esse savepoint,
e o nível dele, abertos: é por isso que a receita libera `optional_profile` depois do
`try/catch`, nos dois caminhos. Sem esse `release()`, o `commit()` final só liberaria o
savepoint e deixaria a transação externa aberta na conexão fixada.

Chamar `begin()` enquanto uma transação já está ativa também cria um savepoint. Chamar
`commit()` com profundidade maior que `1` libera o savepoint atual em vez de commitar a
transação externa.

## Notas por engine

- **PostgreSQL** — um statement que falha dentro de uma transação aborta o bloco inteiro.
  Todo statement seguinte é recusado, e o `COMMIT` final é respondido como rollback: a
  transação é descartada. Capturar o erro e seguir em frente, portanto, não salva o trabalho
  feito antes dele, e o `commit()` falha com
  `SQL transaction was rolled back by the server: a statement inside it had failed.` Use um
  savepoint em volta do statement que você espera falhar, faça `rollback('name')` nele e
  depois `release('name')`, como a receita de savepoints acima faz.
- **MySQL/MariaDB** — statements DDL (`CREATE`/`ALTER`/`DROP` ...) dentro de uma transação
  causam **commit implícito**: mantenha mudanças de schema fora de fluxos de negócio
  transacionais.
- **SQLite** — transações e savepoints funcionam no driver síncrono exatamente como nos
  assíncronos; até DDL é transacional. Por enquanto, mantenha as foreign keys imediatas (o
  padrão): quando um `COMMIT` falha numa chave `DEFERRABLE INITIALLY DEFERRED`, o SQLite mantém
  a transação aberta, mas o Bootgly devolve a conexão como se ela tivesse terminado, e as
  instruções seguintes nessa conexão rodam dentro da transação que sobrou.
- Identificadores de savepoint são quotados pelo dialeto ativo (`"bootgly_0"` no
  PostgreSQL/SQLite, `` `bootgly_0` `` no MySQL).

## Referência

- **[Transações](/manual/ADI/Databases/SQL/Transaction/overview/)** — API, estado e
  comportamento de savepoints.
- **[Query Builder](/manual/ADI/Databases/SQL/Builder/overview/)** — monte as instruções
  executadas por uma transação.
- **[Consultas de banco](/guide/database-queries/overview/)** — fluxo diário de leitura e
  escrita fora de transações explícitas.
