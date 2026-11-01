# Hooks ORM

Um repositório anuncia cada passo do seu trabalho aos listeners que você registra nele: antes e
depois de compor uma seleção, um save ou um delete, e antes e depois de hidratar. Um listener lê o
que o repositório está para fazer, muda isso — normaliza uma entidade antes que ela seja gravada,
restringe uma seleção — ou recusa lançando uma exceção. Hooks pertencem a um repositório; os eventos
do próprio banco, como queries com falha e lentas, passam pelo barramento global de eventos (veja
**[Eventos do banco SQL](/manual/ADI/Databases/SQL/overview/#eventos)**).

Os exemplos desta página compartilham esta entidade e um `$Database` aberto a partir do escopo de
config `database` do projeto. Numa rota do `HTTP_Server_CLI`, use `$Response->Database`, e fora de
um projeto passe a conexão como array — veja
**[Abra um banco](/manual/ADI/Databases/SQL/overview/#abra-um-banco)**.

```php
use Bootgly\ADI\Databases\SQL;
use Bootgly\ADI\Databases\SQL\Model\Column;
use Bootgly\ADI\Databases\SQL\Model\Key;
use Bootgly\ADI\Databases\SQL\Model\Table;
use Bootgly\API\Environment\Configs\DatabaseConfig;

#[Table('users')]
class User
{
   #[Key]
   public null|int $id = null;

   #[Column]
   public string $name = '';

   #[Column]
   public string $email = '';

   #[Column]
   public bool $active = true;
}

$Database = new SQL(new DatabaseConfig(BOOTGLY_PROJECT->Configs->get('database'))->configure());
$Users = $Database->map(User::class);
```

`users` tem uma chave que o banco gera (`id`), `name` e `email` obrigatórios e uma flag `active` que
vale true por padrão. Rodados em ordem numa tabela vazia, os exemplos dão os resultados que seus
comentários mostram.

## Escute um hook

```php
use Bootgly\ADI\Databases\SQL\Repository\Hooks;

$Users->listen(Hooks::Saving, function (User $User): void {
   $User->email = strtolower(trim($User->email));
});

$User = new User;
$User->name = 'Ada';
$User->email = ' Ada@Example.com ';

$Users->hydrate($Database->await($Users->save($User)));

$User->email; // 'ada@example.com'
```

O `listen()` recebe um case de `Hooks` e uma `Closure`, e devolve o repositório, então os registros
encadeiam. Um hook chama seus listeners na ordem em que foram registrados, com os argumentos do
hook. O listener de `Saving` acima roda antes que o repositório componha o `INSERT`, então a linha
guarda o email normalizado.

## Hooks e seus argumentos

| Hook | Emitido por | Argumentos do listener | Roda |
|---|---|---|---|
| `Selecting` | `find()`, `fetch()`, `paginate()` | `Selection $Selection` | Depois que os escopos nomeados se aplicam, antes que a seleção compile |
| `Selected` | `find()`, `fetch()`, `paginate()` | `Operation $Operation, Selection $Selection` | Assim que a query é enfileirada — no SQLite, assim que ela rodou |
| `Saving` | `save()` | `object $Entity` | Antes que a chave seja lida e o `INSERT` ou `UPDATE` composto |
| `Saved` | `save()` | `Operation $Operation, object $Entity` | Assim que a instrução é enfileirada — no SQLite, assim que ela rodou |
| `Deleting` | `delete()` | `mixed $Entity`: a entidade ou a chave que você passou | Depois que a chave é lida, antes que o `DELETE` seja composto |
| `Deleted` | `delete()` | `Operation $Operation, mixed $Entity` | Assim que a instrução é enfileirada — no SQLite, assim que ela rodou |
| `Hydrating` | `hydrate()` | `DatabaseResult $Result` | Antes que qualquer linha seja lida |
| `Hydrated` | `hydrate()` | `Result $Mapped` | Por último, com entidades, relações e paginação no lugar |

`Operation` é `Bootgly\ADI\Databases\SQL\Operation`, `DatabaseResult` é
`Bootgly\ADI\Database\Operation\Result`, e `Result` é o resultado mapeado,
`Bootgly\ADI\Databases\SQL\Repository\Result` (veja
**[Hidratação ORM](/manual/ADI/Databases/SQL/Repository/Hydration/overview/)**). O `find()` emite o
`Selecting` e o `Selected` da seleção que ele monta: o filtro pela chave e `LIMIT 1`.

Nada mais emite hook. `load()` e `attach()`, as relações que o `hydrate()` carrega em modo eager, o
primeiro acesso a uma relação lazy e o `COUNT(*)` de um `paginate()` em modo página rodam todos sem
nenhum.

## Despacho não é conclusão

`Selected`, `Saved` e `Deleted` rodam assim que o repositório enfileira a instrução, não quando o
banco responde. No PostgreSQL e no MySQL o banco ainda não a recebeu: a operação que um listener
recebe está na fila, a linha não foi gravada, e a instrução só vai para o banco quando você aguarda a
operação — e ainda pode falhar então. O SQLite roda a instrução dentro da chamada que a compõe, então
lá a operação já terminou — e pode ter falhado.

```php
use Bootgly\ADI\Databases\SQL\Operation;

$Users->listen(Hooks::Saved, function (Operation $Operation, User $User): void {
   $Operation->finished; // false on PostgreSQL and MySQL: nothing is written yet
});
```

Um efeito colateral que precisa vir depois de uma escrita confirmada — uma notificação, uma limpeza
de cache, uma mensagem para outro sistema — não pertence ao `Saved`. Rode-o depois da espera, que
lança quando a escrita falha:

```php
$User->name = 'Ada Lovelace';

$Operation = $Database->await($Users->save($User)); // throws when the write fails
$Users->hydrate($Operation);

// The row is written here: run the side effects of the save.
```

O `Hydrated` roda depois que o banco respondeu, mas em toda hidratação: leituras e escritas.

## Conduza o repositório

Os hooks que rodam antes do trabalho podem mudá-lo ou interrompê-lo:

- **`Selecting`** recebe a seleção prestes a compilar, depois dos escopos nomeados: um predicado que
  o listener adiciona restringe a query — inclusive a do `find()`.
- **`Saving`** recebe a entidade antes que o repositório leia a chave dela e componha a instrução,
  então o que o listener muda é gravado. Para uma chave gerada, uma chave que ele define numa
  entidade nova transforma o `INSERT` num `UPDATE`.
- **`Deleting`** recebe a entidade ou a chave depois que o repositório leu a chave: mudar a entidade
  ali não muda qual linha é excluída.

Um listener em `Selecting` mantém usuários inativos fora de toda seleção do repositório:

```php
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Operators;
use Bootgly\ADI\Databases\SQL\Builder\Identifier;
use Bootgly\ADI\Databases\SQL\Repository\Selection;

$Linus = new User;
$Linus->name = 'Linus';
$Linus->email = 'linus@example.com';
$Linus->active = false;

$Users->hydrate($Database->await($Users->save($Linus)));

$Users->listen(Hooks::Selecting, function (Selection $Selection): void {
   $Selection->filter(new Identifier('active'), Operators::Equal, true);
});

$Users->hydrate($Database->await($Users->fetch()))->count;   // 1: Linus is filtered out
$Users->hydrate($Database->await($Users->find(2)))->entity; // null: find() is restricted too
```

### Recuse lançando uma exceção

Uma exceção que um listener lança sai da chamada que emitiu o hook, e os listeners registrados
depois dele não rodam. Lançada em `Selecting`, `Saving` ou `Deleting`, ela interrompe a chamada antes
que qualquer instrução exista, então nada chega ao banco:

```php
use InvalidArgumentException;

$Users->listen(Hooks::Saving, function (User $User): void {
   if ($User->email === '') {
      throw new InvalidArgumentException('A user needs an email.');
   }
});

$Nobody = new User;
$Nobody->name = 'Nobody';

$Users->save($Nobody); // InvalidArgumentException: A user needs an email.
```

Lançada em `Selected`, `Saved` ou `Deleted`, ela sai da chamada depois que a instrução foi
enfileirada, antes que você tenha a operação dela. No SQLite a instrução já rodou. No PostgreSQL e no
MySQL ela fica na fila sem ninguém para aguardá-la: nada garante que ela chegue a rodar, e quando ela
esperava uma conexão nova abrir, fica com essa vaga do pool. Nunca lance nesses hooks; recuse no hook
que roda antes do trabalho.

Lançada em `Hydrating` ou `Hydrated`, ela sai do `hydrate()`. Nesse ponto o repositório já gastou o
que tinha anotado sobre a operação, então hidratar a operação de novo não carrega relação nenhuma e
não grava chave gerada de volta; e quando o `Hydrated` lança, as entidades já estão gravadas e
rastreadas.

### Seleções reutilizadas

O `fetch()` entrega ao `Selecting` o objeto de seleção que você passou, não uma cópia, então um
predicado que um listener adiciona fica nele. Busque a mesma seleção duas vezes e o listener acima
adiciona o predicado dele duas vezes:

```php
$Selection = $Users->select();

$Database->await($Users->fetch($Selection));
$Database->await($Users->fetch($Selection))->SQL; // ... WHERE "active" = $1 AND "active" = $2 on PostgreSQL
```

Um listener cujo predicado lê estado que muda — o tenant atual, o usuário autenticado — acumula
então predicados conflitantes na seleção reutilizada. Por enquanto, monte uma seleção nova para cada
`fetch()`; o `paginate()` já trabalha sobre uma cópia. Escopos nomeados se comportam do mesmo jeito
(veja **[Reutilizar uma seleção](/manual/ADI/Databases/SQL/Repository/Selection/overview/#reutilizar-uma-seleção)**).

## Listeners pertencem a um repositório

Listeners vivem no repositório em que você os registrou. Outro `map()` da mesma classe começa sem
nenhum — e `$Response->Database->map()` mapeia um repositório novo a cada chamada — então registre-os
onde você mapeia o repositório.

### Encaminhe hooks ao barramento de eventos

Os cases de `Hooks` implementam o marcador `Bootgly\ABI\Event`, mas um repositório nunca os emite no
barramento global de eventos. Quando um observador precisa ouvir um hook de todo repositório,
encaminhe-o a partir de cada repositório que você mapeia:

```php
use Bootgly\ABI\Events\Emission;
use Bootgly\ABI\Events\Emitter;
use Bootgly\ADI\Databases\SQL\Repository\Result;

Emitter::$Instance->listen(Hooks::Hydrated, function (Emission $Emission): void {
   [$Mapped] = $Emission->payload;
});

$Users->listen(Hooks::Hydrated, function (Result $Mapped): void {
   Emitter::$Instance->emit(Hooks::Hydrated, $Mapped);
});
```

O barramento entrega a própria `Emission`, e os argumentos do hook são o `payload` dela. Veja
**[Events](/guide/events/overview/)** para prioridades e propagação.

## Referência

### Repository

```php
listen (Hooks $Hook, Closure $Listener): static
```

Registra um listener neste repositório para um hook e devolve o repositório. Os listeners de um hook
rodam na ordem de registro, com os argumentos do hook, e uma exceção que um deles lança sai da
chamada que emitiu o hook. Um listener não pode ser removido: mapeie um repositório novo.

### Cases de hook

`Bootgly\ADI\Databases\SQL\Repository\Hooks`, um enum puro que implementa `Bootgly\ABI\Event`.

```php
case Selecting;
```

Emitido por `find()`, `fetch()` e `paginate()` depois que os escopos nomeados se aplicam, antes que a
seleção compile. O listener recebe `(Selection $Selection)`: a seleção que o `fetch()` recebeu, a que
o `find()` monta, ou a cópia sobre a qual o `paginate()` trabalha.

```php
case Selected;
```

Emitido por `find()`, `fetch()` e `paginate()` assim que a query é enfileirada. O listener recebe
`(Operation $Operation, Selection $Selection)`; no PostgreSQL e no MySQL o banco ainda não recebeu a
query, e no SQLite ela já rodou.

```php
case Saving;
```

Emitido por `save()` antes de ler a chave e compor o `INSERT` ou `UPDATE`. O listener recebe
`(object $Entity)`, e o que ele muda é gravado.

```php
case Saved;
```

Emitido por `save()` assim que a instrução é enfileirada. O listener recebe
`(Operation $Operation, object $Entity)`; no PostgreSQL e no MySQL o banco ainda não a recebeu, então
a linha ainda não foi gravada.

```php
case Deleting;
```

Emitido por `delete()` depois de ler a chave, antes de compor o `DELETE`. O listener recebe
`(mixed $Entity)`: a entidade ou a chave passada ao `delete()`.

```php
case Deleted;
```

Emitido por `delete()` assim que a instrução é enfileirada. O listener recebe
`(Operation $Operation, mixed $Entity)`; no PostgreSQL e no MySQL o banco ainda não a recebeu.

```php
case Hydrating;
```

Emitido por `hydrate()` antes de ler qualquer linha. O listener recebe `(DatabaseResult $Result)`.

```php
case Hydrated;
```

Emitido por `hydrate()` como último passo, com entidades, relações e paginação no lugar. O listener
recebe `(Result $Mapped)`, o resultado mapeado que o `hydrate()` devolve.
