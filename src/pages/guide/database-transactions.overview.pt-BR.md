# Transações de banco

Transações mantêm várias instruções SQL na mesma conexão do pool e finalizam tudo como uma
unidade. Use quando escritas posteriores dependem de escritas anteriores, ou quando uma
falha deve desfazer o grupo inteiro.

## O fluxo

```php
use Bootgly\ADI\Databases\SQL;
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Operators;
use Bootgly\ADI\Databases\SQL\Transaction;
use Bootgly\API\Environment\Configs\DatabaseConfig;

enum Tables: string { case Users = 'users'; case Profiles = 'profiles'; }
enum Columns: string { case Id = 'id'; case UserId = 'user_id'; case Active = 'active'; }

$Database = new SQL(new DatabaseConfig(BOOTGLY_PROJECT->Configs->get('database'))->configure());

$deactivated = $Database->transact(function (Transaction $Transaction): int {
   $Deactivate = $Transaction
      ->table(Tables::Users)
      ->update()
      ->set(Columns::Active, false)
      ->filter(Columns::Id, Operators::Equal, 7);

   return $Transaction->await($Transaction->query($Deactivate))->affected;
});
```

O `transact()` é uma chamada só para a unidade de trabalho inteira: ele inicia a transação,
espera o `BEGIN`, roda a sua closure com a `Transaction`, faz o commit e devolve o que a closure
devolveu. Quando a closure lança, a transação é desfeita e o mesmo throwable sai da chamada. Nos
dois casos, quando a chamada termina a transação acabou e a conexão dela já voltou para o pool.

Isso abre o `$Database` a partir do escopo de config `database` do projeto (veja
**[DBAL de banco](/guide/database-dbal/overview/)**), e o `transact()` bloqueia até a transação
terminar: é a forma para um comando, um job ou um script. Numa rota HTTP, use o resource por
worker
**[`$Response->Database`](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/overview/)**: o
`transact()` dele tem o mesmo contrato sem bloquear o worker, e o callback dele recebe dois
argumentos — a transação e o resource.

Dentro da closure, aguarde cada instrução antes de enviar a próxima: uma transação carrega uma
operação por vez, e uma chamada enviada enquanto a anterior ainda roda é recusada (veja
**[Recusas](/manual/ADI/Databases/SQL/Transaction/overview/#recusas)**). Envie todas as
instruções da unidade de trabalho pela `$Transaction`: um `$Database->query()` feito dentro da
closure roda em outra conexão, fora da transação.

### Passo a passo

O `transact()` é feito de chamadas que você também pode fazer por conta própria, quando uma
transação precisa durar mais que uma função:

```php
$Transaction = $Database->begin();
$Database->await($Transaction->Operation);

$Deactivate = $Transaction
   ->table(Tables::Users)
   ->update()
   ->set(Columns::Active, false)
   ->filter(Columns::Id, Operators::Equal, 7);

$Database->await($Transaction->query($Deactivate));
$Database->await($Transaction->commit());
```

`begin()` inicia imediatamente e guarda a operação `BEGIN` em `$Transaction->Operation`.
Aguarde essa operação antes de enviar a primeira instrução: um `begin()` chamado enquanto ela
ainda está em andamento é recusado com
`SQL transaction BEGIN is still in flight: await it before the next operation.`

## Commit ou rollback

```php
use RuntimeException;

try {
   $Database->transact(function (Transaction $Transaction): void {
      $Create = $Transaction
         ->table(Tables::Users)
         ->insert()
         ->set(Columns::Active, true);

      $Transaction->await($Transaction->query($Create));

      throw new RuntimeException('The profile could not be created.');
   });
}
catch (RuntimeException $Exception) {
   $Exception->getMessage(); // The profile could not be created.
   // Nada foi inserido, e a conexão já voltou para o pool.
}
```

O `$Transaction->await()` espera pelo pool da operação (veja
**[Aguarde de forma síncrona](/manual/ADI/Database/Pool/overview/#aguarde-de-forma-síncrona)**) e
lança uma `RuntimeException` cuja mensagem é `$Operation->error` quando a operação falha — uma
chamada recusada inclusive. Deixe a exceção sair da closure: o `transact()` encerra a transação
por você.

- **No retorno**, ele faz o commit da transação inteira, e não de um nível dela: cada nível de
  savepoint que a closure deixou aberto é liberado primeiro, e então o `COMMIT` é enviado.
- **Num throwable**, ele faz o rollback nível a nível — um `rollback()` para cada nível aberto,
  então os listeners de `Rollback` ouvem todos — e relança o mesmo throwable. Quando um nível
  não pode ser desfeito — um listener de `Rollback` que lança, uma instrução que a closure
  deixou em andamento num nível de savepoint, um rollback que o servidor recusa — ele encerra a
  transação inteira com `abort()`, que compõe o `ROLLBACK` de nível superior e não emite evento
  (veja
  **[Abortar ou fazer rollback](/manual/ADI/Databases/SQL/Transaction/overview/#abortar-ou-fazer-rollback)**).
  O throwable que você recebe continua sendo o da closure.
- **Um `BEGIN` que falha** é lançado antes de a closure rodar. **Um `COMMIT` que falha** também
  é lançado — uma constraint deferida, por exemplo, que faz o PostgreSQL desfazer a transação
  inteira: o `transact()` só retorna depois que o `COMMIT` mais externo deu certo.
- **Uma closure que retorna com uma instrução ainda em andamento** não é commitada: a transação
  é desfeita e o `transact()` lança `SQL transaction operation is still active.`
- **Uma closure que encerra o nível superior por conta própria** — com `commit()`, `rollback()`
  ou `abort()` — faz o `transact()` lançar `SQL transaction is not active.` O que a closure fez
  continua valendo: um `commit()` que ela enviou está commitado, e esse erro não o desfaz. Os
  savepoints são seus; o nível externo é do `transact()`.

Depois da chamada, a transação acabou e a conexão fixada voltou para o pool — ou foi derrubada,
quando o teardown precisou cortar uma instrução que já tinha chegado ao servidor, e a vaga dela
continua contada até o deadline dessa instrução (veja
**[Commit e rollback](/manual/ADI/Databases/SQL/Transaction/overview/#commit-e-rollback)**).
A `Transaction` fica com profundidade `0`, com uma exceção: quando a conexão com o servidor
caiu no meio do trabalho, o objeto mantém a profundidade que tinha. Nada fica reservado nesse
caso também, mas não use mais esse objeto.

Uma falha não é a resposta do servidor: a própria espera pode lançar, antes de a operação
terminar. O `transact()` então retira essa operação e derruba a sessão dela, e nada fica
reservado. Para um `BEGIN` ou um `ROLLBACK`, o servidor desfaz o trabalho. Para o `COMMIT`, o
resultado no servidor é desconhecido — ele pode ter sido aplicado —, então leia os dados de
volta antes de repetir a unidade de trabalho.

### Manualmente

Uma transação que você conduz por conta própria pede o mesmo cuidado. Envolva o trabalho e o
commit em `try/catch` e encerre a transação com `abort()` no `catch`:

```php
use Throwable;

$Transaction = $Database->begin();
$Database->await($Transaction->Operation);

try {
   $Create = $Transaction
      ->table(Tables::Users)
      ->insert()
      ->set(Columns::Active, true);

   $Database->await($Transaction->query($Create));

   $Database->await($Transaction->commit());
}
catch (Throwable $Throwable) {
   try {
      $Database->await($Transaction->abort());
   }
   catch (Throwable) {
      // Refused or failed: the COMMIT already ended the transaction, or the session
      // is gone and the server rolled the work back. Keep the original error.
   }

   throw $Throwable;
}
```

O `catch` usa `abort()`, e não `rollback()`: ele compõe o `ROLLBACK` de nível superior em
qualquer profundidade, então também desfaz todos os níveis de savepoint que o trabalho abriu
(um `rollback()` sem nome só encerra o mais recente), e não emite evento `Rollback`. A receita
faz o commit dentro do `try`, então o `catch` também encerra uma transação que o `commit()` não
conseguiu fechar: um listener de `Commit` que lança (veja
**[Eventos](/manual/ADI/Databases/SQL/Transaction/overview/#eventos)**) ou uma instrução que o
trabalho deixou em andamento. Quando o próprio `COMMIT` falha, o `commit()` já fechou a
transação, então o `abort()` é recusado e o erro relançado é o do próprio `COMMIT`.

## Builders, SQL raw e objetos Query

`Transaction::table()` inicia um Query Builder com o mesmo dialeto do banco.
`Transaction::query()` aceita as mesmas formas de query que `SQL::query()`:

```php
use Bootgly\ADI\Databases\SQL\Builder\Query;

$Database->await($Transaction->query('SELECT 1'));
$Database->await($Transaction->query(new Query('SELECT 2')));
$Database->await($Transaction->query($Transaction->table(Tables::Users)->select()));
```

As três rodam na conexão fixada da transação. A segunda é uma `Query` montada à mão, que conta
como escrita a menos que seja criada com `reading: true`, então ela também marca o escopo de
read-after-write — o que só importa quando há réplicas configuradas (veja
**[Escopo de read-after-write](/manual/ADI/Databases/SQL/Transaction/overview/#escopo-de-read-after-write)**);
o `transact()` marca o escopo de novo quando o `COMMIT` mais externo dele dá certo, então a
janela conta a partir do commit.
Para entidades, `$Transaction->map()` dá um repositório ORM cujas instruções rodam dentro da
transação (veja
**[Repositórios dentro de uma transação](/manual/ADI/Databases/SQL/Transaction/overview/#repositórios-dentro-de-uma-transação)**).

## Savepoints

Savepoints são checkpoints aninhados dentro da transação aberta:

```php
use Throwable;

$Transaction = $Database->begin();
$Database->await($Transaction->Operation);

$Database->await($Transaction->save('optional_profile'));

try {
   $Profile = $Transaction
      ->table(Tables::Profiles)
      ->insert()
      ->set(Columns::UserId, 7);

   $Database->await($Transaction->query($Profile));
}
catch (Throwable) {
   $Database->await($Transaction->rollback('optional_profile'));
}

$Database->await($Transaction->release('optional_profile'));
$Database->await($Transaction->commit());
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

### Unidades de trabalho aninhadas

```php
$Database->transact(function (Transaction $Transaction) use ($Database): void {
   $Transaction->await($Transaction->query('UPDATE users SET active = false WHERE id = 7'));

   try {
      $Database->transact(function (Transaction $Transaction): void {
         $Transaction->await($Transaction->query('INSERT INTO profiles (user_id) VALUES (7)'));
      });
   }
   catch (RuntimeException) {
      // O perfil é opcional: o UPDATE acima continua fazendo parte da transação.
   }
});
```

Um `transact()` chamado dentro da closure não abre uma segunda transação: ele se aninha na que
já está aberta, como um savepoint, e a closure dele recebe a mesma `Transaction`. Quando a
closure aninhada retorna, o savepoint dela é liberado; quando ela lança, só aquele nível é
desfeito e o throwable chega à closure externa, que pode capturá-lo e seguir em frente. Uma
função que envolve o próprio trabalho em `transact()` pode, portanto, ser chamada sozinha ou de
dentro de uma unidade de trabalho maior.

Quando o nível aninhado não pode ser fechado — o servidor recusa o rollback ou a liberação
dele, ou um dos casos acima —, a transação inteira é encerrada e o `transact()` externo avisa —
`SQL transaction is not active.` — em vez de commitar um trabalho pelo qual ele não pode mais
responder. Uma closure externa que captura a falha do nível aninhado não tem mais o que
continuar: deixe-a terminar, e não reabra a transação com `begin()`. Isso vale também para um
`rollback()` ou um `commit()` desse nível enviado por você: quando o servidor o recusa, o
`transact()` aninhado lança esse erro mesmo que a closure o tenha capturado e retornado. Só uma
closure que o captura e depois envia mais instruções o esconde — o `transact()` não tem mais
como saber que o nível está em dúvida. O aninhamento é por contexto: um `transact()` feito a partir de outra
Fiber abre a própria transação, na própria conexão.

## Notas por engine

- **PostgreSQL** — um statement que falha dentro de uma transação aborta o bloco inteiro.
  Todo statement seguinte falha no servidor (SQLSTATE `25P02`), e o `COMMIT` final é
  respondido como rollback: a transação é descartada. Capturar o erro e seguir em frente,
  portanto, não salva o trabalho feito antes dele, e o `commit()` falha com
  `SQL transaction was rolled back by the server: a statement inside it had failed.` Use um
  savepoint em volta do statement que você espera falhar, faça `rollback('name')` nele e
  depois `release('name')`, como a receita de savepoints acima faz.
- **MySQL/MariaDB** — statements DDL (`CREATE`/`ALTER`/`DROP` ...) dentro de uma transação
  causam **commit implícito**: mantenha mudanças de schema fora de fluxos de negócio
  transacionais.
- **SQLite** — transações e savepoints funcionam no driver síncrono exatamente como nos
  assíncronos; até DDL é transacional. Um `COMMIT` que falha — numa chave
  `DEFERRABLE INITIALLY DEFERRED`, ou com `database is locked` — é desfeito antes de a conexão
  servir mais alguém, como nos outros engines; o erro dele é a própria mensagem do engine
  (`FOREIGN KEY constraint failed`, `database is locked`), então repita a transação inteira.
- Identificadores de savepoint são quotados pelo dialeto ativo (`"bootgly_0"` no
  PostgreSQL/SQLite, `` `bootgly_0` `` no MySQL).

## Referência

- **[Banco SQL](/manual/ADI/Databases/SQL/overview/#referência)** — `transact()` e `begin()` na
  fachada.
- **[Transações](/manual/ADI/Databases/SQL/Transaction/overview/)** — API, recusas, eventos,
  repositórios e comportamento de savepoints.
- **[Query Builder](/manual/ADI/Databases/SQL/Builder/overview/)** — monte as instruções
  executadas por uma transação.
- **[Consultas de banco](/guide/database-queries/overview/)** — fluxo diário de leitura e
  escrita fora de transações explícitas.
