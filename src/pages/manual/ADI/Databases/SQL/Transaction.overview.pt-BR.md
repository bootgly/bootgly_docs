# Transações

`Bootgly\ADI\Databases\SQL\Transaction` prende operações SQL a uma conexão do pool, para que várias
instruções façam commit ou rollback juntas. Abra uma com `$Database->begin()`. Em rotas do
`HTTP_Server_CLI`, use `$Response->Database->transact()` em vez disso: ele inicia a transação, roda
o seu callback, faz o commit e faz o rollback quando o callback lança uma exceção (veja
**[Métodos do Database](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/overview/#métodos-do-database)**).

> Quer o fluxo prático primeiro? Comece pelo guia
> **[Transações de banco](/guide/database-transactions/overview/)**.

## Ciclo de vida

```php
use Bootgly\ADI\Databases\SQL;
use Bootgly\API\Environment\Configs\DatabaseConfig;

$Database = new SQL(new DatabaseConfig(BOOTGLY_PROJECT->Configs->get('database'))->configure());

$Transaction = $Database->begin();
$Database->await($Transaction->Operation);

$Database->await($Transaction->query('UPDATE accounts SET balance = balance - 100 WHERE id = 1'));
$Database->await($Transaction->query('UPDATE accounts SET balance = balance + 100 WHERE id = 2'));

$Database->await($Transaction->commit());
```

`$Database->begin()` constrói a transação e compõe o `BEGIN` dela na hora. Um `BEGIN` é um pedido
exclusivo: o pool reserva uma conexão para ele e não a compartilha com ninguém até a transação
terminar. `$Transaction->Operation` guarda o `BEGIN`: aguarde-o antes da primeira instrução e
depois aguarde cada instrução antes de enviar a próxima (veja
[Executar instruções](#executar-instruções)). O `commit()` encerra a transação, e o pool pega a
conexão de volta quando o `COMMIT` termina.

O `await()` devolve a operação terminada e lança uma `RuntimeException` com o `error` dela quando
ela falha. Coloque o trabalho e o commit num `try` e encerre a transação no `catch`, como faz a
receita **[Commit ou rollback](/guide/database-transactions/overview/#commit-ou-rollback)** do
guia. O exemplo abre o `$Database` a partir do escopo de config `database` do projeto, a forma para
uma função de boot, um comando ou um script dentro de um projeto; fora de um projeto, passe as
chaves de conexão como array (veja **[Configuração](/manual/ADI/Database/Config/overview/)**).

Essa espera pelo `BEGIN` não é formalidade. `depth` vira `1` no momento em que o `BEGIN` é composto,
muito antes de qualquer servidor vê-lo, e continua `1` se a instrução falhar. Uma transação cujo
`BEGIN` falhou está morta e avisa: `query()`, `commit()`, `rollback()`, `abort()` e `save()`
devolvem uma operação com falha dizendo `SQL transaction is not active.`, e `release()` uma
dizendo `SQL transaction savepoint is not active.` Sem isso, o seu trabalho rodaria numa conexão
onde nenhuma transação foi aberta — commitado por autocommit e sobrevivendo ao rollback que você
pediu.

Uma transação também passa a ler como inativa assim que a sessão em que o `BEGIN` rodou deixa de
existir — a conexão caiu, ou o pool reconstruiu o mesmo objeto de conexão para outro caller. As
chamadas dela então devolvem as mesmas recusas sem tocar o pool, em vez de compor uma instrução
que rodaria dentro da sessão de outro caller e cujo teardown a encerraria.

## Executar instruções

`query()` aceita o mesmo que `$Database->query()` — SQL raw com seus parâmetros, um Query Builder
ou uma `Query` compilada — e o executa na conexão fixada. `table()` inicia um builder com o dialeto
do banco (veja **[Query Builder](/manual/ADI/Databases/SQL/Builder/overview/)**). Um builder ou uma
`Query` carrega os próprios parâmetros, então o segundo argumento de `query()` é ignorado para
eles.

Uma transação é uma superfície serial — o `pipelining` dela é `false` — e por isso carrega uma
operação por vez:

```php
$Debit = $Transaction->query('UPDATE accounts SET balance = balance - 100 WHERE id = 1');
$Balance = $Transaction->query('SELECT balance FROM accounts WHERE id = 1');

$Balance->error; // SQL transaction operation is still active.

$Database->await($Debit);
$Balance = $Database->await($Transaction->query('SELECT balance FROM accounts WHERE id = 1'));
```

Uma chamada feita enquanto a operação anterior ainda roda é recusada. A operação recusada já falhou
quando a chamada retorna, nada no pool foi tocado, e ela nunca vira `$Transaction->Operation` —
então a recusa é durável: toda chamada é recusada até a instrução em voo terminar. Aguardar uma
operação recusada lança a mensagem dela como `RuntimeException`, como qualquer operação com falha.
O SQLite roda a instrução dentro do `query()`, então lá o `UPDATE` já terminou e o primeiro
`SELECT` é aceito.

Duas entradas lançam uma `InvalidArgumentException` em vez disso, antes de qualquer uma dessas
verificações: uma instrução vazia ou em branco (`SQL cannot be empty.`) e um builder que não
compila, como um `update()` sem nada para definir
(`SQL insert/update requires at least one set value.`).

Uma instrução que o servidor rejeita — uma constraint, um erro de sintaxe — e uma conexão perdida
não são recusas: chegam ao `error` e ao `code` da operação quando ela termina, e o `await()` os
lança. No PostgreSQL uma falha dessas também aborta a transação inteira (veja
**[Notas por engine](/guide/database-transactions/overview/#notas-por-engine)**). Todas as recusas
estão em [Recusas](#recusas).

## Repositórios dentro de uma transação

```php
$Transaction = $Database->begin();
$Database->await($Transaction->Operation);

$Users = $Transaction->map(User::class);

$Mapped = $Users->hydrate(
   $Database->await($Users->fetch($Users->select()->load('Posts')))
);

foreach ($Mapped->entities as $User) {
   $User->active = $User->Posts !== [];

   $Database->await($Users->save($User));
}

$Database->await($Transaction->commit());
```

`User` e `Post` são as entidades de
**[ORM de banco](/guide/database-orm/overview/#defina-entidades)**. `$Transaction->map()` cria um
repositório cujas instruções rodam pela transação, na conexão fixada dela, e cuja ponte de await é
a própria transação. Assim o `hydrate()` carrega os `Posts` que a seleção nomeia em `load()` antes
de retornar, e relações `lazy: true` resolvem no primeiro acesso. `$Database->map()` não tem ponte a
menos que você passe uma: lá o mesmo código devolve a relação em `$Mapped->loads`, deixa todo
`Posts` vazio — e desativa todos os usuários.

O `await()` da transação é essa ponte. Ele chama `$Database->await()`, então espera do mesmo jeito
e lança a mesma `RuntimeException`; no seu próprio código, continue chamando `$Database->await()`.

O repositório segue a superfície serial. Um carregamento eager envia uma relação por vez e aguarda
cada uma antes da próxima, e um `paginate()` em modo página cuja query de itens ainda está rodando
deixa o `COUNT(*)` para o `hydrate()` enviar (veja
**[Paginação](/manual/ADI/Databases/SQL/Repository/Pagination/overview/)**). Passe `Scope:` ao
`map()` para escolher o escopo de read-after-write que as escritas do repositório marcam (veja
[Escopo de read-after-write](#escopo-de-read-after-write)).

## Commit e rollback

O `commit()` em profundidade `1` compõe o `COMMIT` e fecha a transação na hora: `depth` cai para `0`
e `Connection` para `null` antes de o servidor responder, e a reserva é devolvida quando o `COMMIT`
termina. Num nível de savepoint (`depth > 1`) ele libera o savepoint atual. O `commit()` é recusado
enquanto uma instrução ainda estiver em voo: commitar atrás de uma escrita não aguardada reportaria
sucesso para um trabalho que o servidor pode ter rejeitado ou descartado, então aguarde a escrita
antes.

O próprio `COMMIT` pode falhar, e a essa altura a transação já está fechada. O PostgreSQL responde
o `COMMIT` de uma transação em que uma instrução tinha falhado com um rollback, que o Bootgly
transforma em `SQL transaction was rolled back by the server: a statement inside it had failed.`, e
uma constraint deferida que falha no commit também faz o `COMMIT` falhar. Nos dois casos, um
`rollback()` ou `abort()` em seguida é recusado com `SQL transaction is not active.`, e é por isso
que a receita do guia protege o `abort()` no `catch` (no SQLite, mantenha as foreign keys imediatas
por enquanto: veja **[Notas por engine](/guide/database-transactions/overview/#notas-por-engine)**).

O `rollback()` sem nome encerra o nível atual: a transação inteira em profundidade `1`, o savepoint
atual acima dela. Com nome, ele volta para aquele savepoint e o mantém (veja
[Savepoints](#savepoints)).

Desfazer a transação externa roda mesmo com uma instrução pendente — um teardown que recusasse
deixaria a conexão fixada presa e a sessão do servidor aberta dentro da transação. A instrução
pendente é descartada: ela é retirada pelo pool dela, do jeito que quem para de esperar retira uma
(veja **[Operações retiradas](/manual/ADI/Database/Pool/overview/#operações-retiradas)**), então
ela falha com `Database operation was withdrawn: its caller stopped waiting.` e o comando que
estava no buffer vai junto. Ele nunca alcança o fio depois nem roda fora da transação que deveria
contê-lo.

Uma instrução que já tinha chegado ao servidor é outra história: ninguém sobra para ler a resposta
dela na conexão reservada, então o pool derruba essa sessão. O servidor faz rollback da transação
quando a sessão fecha, o `ROLLBACK` composto logo depois falha com
`Database operation lost the connection it was pinned to.`, e a instrução mantém a vaga contada até
o próprio deadline, porque o servidor ainda a executa (veja
**[Vagas retidas](/manual/ADI/Database/Pool/overview/#vagas-retidas)**). Um rollback de savepoint é
uma instrução comum e é recusado como qualquer outra.

### Abortar ou fazer rollback

O `abort()` é o teardown sem condições. Ele compõe o `ROLLBACK` de nível superior em qualquer
profundidade, o que encerra todos os savepoints junto, descarta uma instrução pendente como o
`rollback()` externo faz e devolve a reserva do pool. A única recusa dele é
`SQL transaction is not active.` Um `rollback()` externo é um evento `Rollback` seguido exatamente
desse `abort()`.

| | `rollback()` | `rollback('name')` | `abort()` |
| --- | --- | --- | --- |
| Encerra | O nível atual: a transação em profundidade `1`, o savepoint atual acima dela | O trabalho depois do savepoint e todo savepoint posterior; o nomeado continua aberto | A transação inteira, em qualquer profundidade |
| Uma instrução ainda em voo | Descartada em profundidade `1`, recusada acima disso | Recusada | Descartada |
| Evento `Rollback` | Emitido | Emitido | Nenhum |

Use `abort()` onde a transação precisa terminar seja qual for o estado dela: no `catch` de uma
unidade de trabalho, onde um `rollback()` sem nome encerraria só o savepoint mais interno que o
trabalho deixou aberto, e num caller que não pode mais esperar, como uma resposta deferred cujo
Fiber está sendo destruído, onde um listener não conseguiria suspender. Use `rollback()` para
desfazer um nível, ou para voltar a um savepoint e seguir em frente.

## Savepoints

```php
$Database->await($Transaction->save('outer'));
$Database->await($Transaction->save('inner'));
$Database->await($Transaction->rollback('outer'));

$Transaction->depth;                   // 2
$Transaction->release('inner')->error; // SQL transaction savepoint is not available.
```

O `save()` cria um savepoint e soma um nível a `depth`; sem nome, o Bootgly gera `bootgly_0`,
`bootgly_1` e assim por diante. O `begin()` numa transação aberta faz o mesmo, e o `commit()` acima
da profundidade `1` libera o savepoint atual. O `release()` libera o savepoint atual, ou um nomeado,
e o `rollback()` sem nome desfaz o savepoint atual e encerra o nível dele.

Um teardown **nomeado** alcança mais de um nível, porque é isso que o servidor faz.
`ROLLBACK TO SAVEPOINT x` destrói todo savepoint criado depois de `x` e mantém o próprio `x`;
`RELEASE SAVEPOINT x` destrói `x` junto com eles. Então depois de `save('outer')`, `save('inner')` e
`rollback('outer')`, só `outer` continua aberto, `depth` é o nível dele, e não um a menos que antes,
e `inner` não pode mais ser nomeado. Nomear um savepoint abaixo do topo é justamente o caso de usar
essa forma — as formas sem nome já cuidam do topo da pilha.

Se um nome aparece duas vezes, os servidores resolvem para o mais recente, e o Bootgly também. Um
nome ausente — nunca criado, ou destruído por um teardown nomeado anterior — falha com
`SQL transaction savepoint is not available.` Identificadores de savepoint são quotados pelo
dialeto ativo (veja **[Dialetos de query](/manual/ADI/Databases/SQL/Builder/Dialects/overview/)**).

Reusar o objeto depois de um commit ou rollback pede ao pool uma **nova** reserva exclusiva: o
`begin()` em profundidade `0` compõe um `BEGIN` novo. A conexão que o último teardown carregava é
histórico, não reserva, então o `BEGIN` nunca retoma uma conexão que outro caller está usando. Num
pool saturado ele espera como qualquer outro pedido exclusivo — estacionado em `pending` no caminho
assíncrono, recusado pelo `await()` com `Database pool has no capacity for the operation.` — e só
reserva uma conexão quando a capacidade libera.

## Recusas

Uma recusa é uma operação que já falhou quando a chamada retorna. A chamada não lança exceção e o
pool não é tocado. O `code` da operação é `null`, e o `SQL` dela é a sua query ou a palavra-chave da
instrução que a chamada teria composto: `BEGIN`, `SAVEPOINT`, `RELEASE SAVEPOINT`, `COMMIT` ou
`ROLLBACK`. O `await()` lança a mensagem como `RuntimeException`, e listeners de
`SQL\Events::Failed` a veem como qualquer outra falha.

| Mensagem | Devolvida por | Quando |
| --- | --- | --- |
| `SQL transaction operation is still active.` | `begin()`, `query()`, `commit()`, `save()`, `release()`, e `rollback()` num nível de savepoint ou com nome | A instrução anterior ainda não terminou |
| `SQL transaction is not active.` | `query()`, `commit()`, `rollback()`, `abort()`, `save()`, e `begin()` enquanto `depth` é `1` ou mais | Um `COMMIT` ou `ROLLBACK` de nível superior já fechou a transação, o `BEGIN` dela falhou, ou a sessão em que o `BEGIN` rodou deixou de existir |
| `SQL transaction savepoint is not active.` | `release()` | Nenhum savepoint está aberto, ou a transação não está ativa |
| `SQL transaction savepoint is not available.` | `release('name')`, `rollback('name')` | O nome não está aberto: nunca foi criado, ou um teardown nomeado anterior o destruiu |

As verificações rodam numa ordem fixa, e uma chamada que duas delas recusariam informa a primeira:
uma instrução em voo vem antes de uma transação inativa. Um `query()` enviado logo depois do
`commit()`, antes de o `COMMIT` terminar, portanto diz `SQL transaction operation is still active.`

Outros erros que uma transação encontra vêm de outros lugares:

| Mensagem | Surge | Quando |
| --- | --- | --- |
| `SQL cannot be empty.` | Lançada pelo `query()` (`InvalidArgumentException`) | A instrução está vazia ou em branco |
| `Database operation was withdrawn: its caller stopped waiting.` | O `error` da operação | Um `rollback()` externo ou um `abort()` descartou a instrução |
| `Database operation lost the connection it was pinned to.` | O `error` da operação | A sessão fixada caiu, como para o `ROLLBACK` que segue uma instrução descartada que já estava no servidor |
| `Database pool has no capacity for the operation.` | Lançada pelo `await()` | O `BEGIN` aguardado ainda está estacionado em `pending` |
| `SQL transaction was rolled back by the server: a statement inside it had failed.` | O `error` do `COMMIT` | PostgreSQL: uma instrução dentro da transação tinha falhado |

## Escopo de read-after-write

```php
$Transaction = $Database->begin();
$Database->await($Transaction->Operation);

$Database->await($Transaction->query('UPDATE users SET active = false WHERE id = 7'));
$Database->await($Transaction->commit());

$Read = $Database->await($Database->query('SELECT active FROM users WHERE id = 7'));
$Read->Pool === $Database->Pool; // true
```

Quando há réplicas de leitura configuradas, uma escrita por `$Transaction->query()` marca um escopo
de read-after-write, exatamente como uma escrita por `$Database->query()`: o `$Scope` que você
passa, ou por padrão o Fiber atual, senão a fachada `SQL`. Enquanto a marca for mais nova que
`routing.sticky` (5 segundos por padrão), leituras do `$Database->query()` no mesmo escopo vão para
o primário em vez de uma réplica que talvez ainda não tenha reproduzido o commit. Este script roda
fora de qualquer Fiber, então o `UPDATE` marcou a própria fachada e a leitura depois do commit fica
no primário.

A marca é feita quando a escrita é composta, antes do commit da transação. Toda instrução pela
transação é classificada, inclusive uma string raw, e uma `Query` montada à mão conta como escrita a
menos que tenha sido criada com `reading: true`. Instruções pela própria transação sempre rodam na
conexão primária fixada dela, sejam o que forem. Sem réplicas, a marca não muda nada. Veja
**[Réplicas de leitura de banco](/guide/database-read-replicas/overview/#escopo-de-read-after-write)**.

## Eventos

`Bootgly\ADI\Databases\SQL\Transaction\Events` anuncia as chamadas da transação por
`Emitter::$Instance`, com a `Transaction` como payload:

| Evento | Emitido por | Payload |
| --- | --- | --- |
| `Begin` | `$Transaction->begin()`: ele reabre uma transação fechada ou abre um savepoint aninhado (o `$Database->begin()` não emite `Begin`) | `Transaction` |
| `Commit` | `$Transaction->commit()`, em qualquer profundidade (num nível de savepoint ele libera o savepoint) | `Transaction` |
| `Rollback` | `$Transaction->rollback()`, em qualquer profundidade — mesmo quando o savepoint nomeado não está disponível e a chamada é recusada | `Transaction` |

Cada um é emitido depois das verificações da própria chamada e antes de ela compor a sua instrução.
Uma chamada que essas verificações recusam não emite nada: qualquer chamada feita enquanto a
instrução anterior ainda está em voo (exceto o `rollback()` externo, que atropela essa instrução), e
um `commit()` ou `rollback()` numa transação que não está ativa. Um listener vê, sim, chamadas cuja
instrução depois falha, e as duas recusas que vêm depois das verificações: um `rollback('name')`
cujo savepoint não está disponível, e um `begin()` que abriria um savepoint numa transação que não
está ativa. `save()`, `release()` e `abort()` não emitem nada. O listener lê a transação como ela
estava antes da chamada: `depth` ainda é o nível que está sendo commitado ou desfeito, e `Operation`
a instrução anterior.

```php
use RuntimeException;

use Bootgly\ABI\Events\Emission;
use Bootgly\ABI\Events\Emitter;
use Bootgly\ADI\Databases\SQL\Transaction\Events;

Emitter::$Instance->listen(Events::Commit, function (Emission $Emission): void {
   [$Transaction] = $Emission->payload;

   if ($Transaction->depth === 1) {
      throw new RuntimeException('Commits are paused.');
   }
});

try {
   $Database->await($Transaction->commit());
}
catch (RuntimeException $Exception) {
   $Exception->getMessage(); // Commits are paused.
   $Transaction->depth;      // 1

   $Database->await($Transaction->abort());
}
```

Diferente dos eventos SQL, que são só observados, estes eventos mantêm o contrato de controle: um
listener que lança faz `begin()`, `commit()` ou `rollback()` lançar antes de qualquer instrução ser
composta. O listener acima recusa todo commit de nível superior, um interruptor de manutenção por
exemplo; a transação continua aberta na conexão reservada dela, e o `abort()`, que não emite nada,
ainda a encerra. Veja
**[Prioridade e propagação](/guide/events/overview/#prioridade-e-propagação)**.

## Referência

`Bootgly\ADI\Databases\SQL\Transaction` implementa `Awaiting` e `Querying`, as superfícies sobre as
quais um repositório roda.

### Construtor

```php
__construct (SQL $Database)
```

Constrói a transação e compõe o `BEGIN` dela na hora: `Operation` o guarda e `depth` é `1`. O
`$Database->begin()` o chama. Não emite evento.

### Métodos

```php
begin (): Operation
```

Em profundidade `0`, reabre a transação com um `BEGIN` novo, uma nova reserva exclusiva no pool.
Caso contrário abre um savepoint aninhado, como o `save()`. Emite `Begin` antes. Recusado enquanto
uma instrução está em voo.

```php
query (string|Builder|Query $query, array $parameters = [], null|object $Scope = null): Operation
```

Compõe uma instrução na conexão fixada: SQL raw com `$parameters`, um Query Builder ou uma `Query`
compilada, que carregam os próprios parâmetros. Uma escrita marca `$Scope` como escrito — por
padrão o Fiber atual, senão a fachada. Lança `InvalidArgumentException` para uma instrução vazia ou
um builder que não compila; recusado enquanto uma instrução está em voo ou quando a transação não
está ativa.

```php
table (BackedEnum|Stringable|Builder|Query $Table, null|BackedEnum|Stringable $Alias = null): Builder
```

Inicia um Query Builder com o dialeto do banco. Passe a instrução montada para `query()`.

```php
map (string $Entity, null|object $Scope = null, null|Awaiting $Awaiting = null): Repository
```

Cria um repositório ORM para uma classe de entidade mapeada cujas instruções rodam por esta
transação. `$Awaiting` tem a transação como padrão, então relações eager e lazy resolvem durante o
`hydrate()`; `$Scope` é o escopo de read-after-write que as escritas dele marcam.

```php
await (Operation $Operation): Operation
```

Espera uma operação pelo `$Database->await()` e a devolve; lança uma `RuntimeException` com o
`error` da operação quando ela falha. É a ponte de await que o `map()` dá aos repositórios.

```php
commit (): Operation
```

Em profundidade `1`, compõe o `COMMIT`: `depth` cai para `0` e `Connection` para `null` na hora.
Acima da profundidade `1`, libera o savepoint atual. Emite `Commit` antes. Recusado enquanto uma
instrução está em voo ou quando a transação não está ativa.

```php
rollback (null|string $name = null): Operation
```

Sem nome: em profundidade `1`, o `ROLLBACK` de nível superior, como o `abort()` o compõe; acima,
desfaz o savepoint atual e encerra o nível dele. Com nome: volta para aquele savepoint e o mantém.
Emite `Rollback` antes. Só a forma de nível superior roda com uma instrução em voo.

```php
abort (): Operation
```

Compõe o `ROLLBACK` de nível superior em qualquer profundidade: descarta uma instrução pendente,
encerra todos os savepoints e devolve a reserva do pool. Não emite evento, e só é recusado quando a
transação não está ativa. Desde a 1.0.5.

```php
save (null|string $name = null): Operation
```

Cria um savepoint e soma um nível a `depth`; sem nome, ele é `bootgly_0`, `bootgly_1` e assim por
diante. Não emite evento.

```php
release (null|string $name = null): Operation
```

Libera o savepoint atual, ou um nomeado junto com todo savepoint posterior. Não emite evento.
Recusado com `SQL transaction savepoint is not active.` quando nenhum savepoint está aberto.

### Propriedades

```php
public SQL $Database
```

A fachada que criou a transação. O pool, o dialeto, a config e os models dela são os que a
transação usa.

```php
public private(set) null|Operation $Operation
```

A operação mais recente que a transação compôs: o `BEGIN`, uma instrução, um savepoint, o `COMMIT`
ou o `ROLLBACK`. Uma chamada recusada nunca a substitui.

```php
public private(set) null|Connection $Connection
```

A conexão do pool em que a transação está fixada, ou `null`: antes de o `BEGIN` ganhar uma conexão
— um `BEGIN` promovido de `pending` é pego pela próxima chamada da transação — e a partir do momento
em que `commit()`, um `rollback()` externo ou `abort()` compõe o seu teardown.

```php
public private(set) int $depth
```

Os níveis compostos: `1` para a transação externa e mais um por savepoint, `0` quando um teardown a
fecha. Ela conta o que foi composto, não o que o servidor abriu: depois de um `BEGIN` que falhou ela
ainda diz `1`.

```php
public protected(set) bool $pipelining
```

Sempre `false`: a transação é uma superfície serial. Repositórios a leem para adiar o `COUNT(*)` de
uma paginação até a hidratação.

### Casos de evento

`Bootgly\ADI\Databases\SQL\Transaction\Events`, despachado por `Emitter::$Instance` com a
`Transaction` como payload.

```php
case Begin;
```

O `$Transaction->begin()` reabriu a transação ou abriu um savepoint aninhado.

```php
case Commit;
```

O `$Transaction->commit()` foi chamado, em qualquer profundidade.

```php
case Rollback;
```

O `$Transaction->rollback()` foi chamado, em qualquer profundidade, com nome ou sem.
