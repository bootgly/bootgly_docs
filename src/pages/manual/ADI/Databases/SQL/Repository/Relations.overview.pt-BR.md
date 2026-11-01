# Relações ORM

Relações ORM são explícitas. O Bootgly armazena metadata de relação no model, e um repositório só
carrega uma relação quando você pede: como operações deferidas que você mesmo aguarda e anexa, em
modo eager durante o `hydrate()`, ou em modo lazy no primeiro acesso, com `lazy: true`.

Os tipos suportados ficam em `Bootgly\ADI\Databases\SQL\Model\Auxiliaries\Relations`:

- `HasOne`
- `HasMany`
- `BelongsTo`
- `BelongsToMany`

## Mapeie relações

Os exemplos desta página compartilham estas entidades e um `$Database` aberto a partir do escopo de
config `database` do projeto. Numa rota do `HTTP_Server_CLI`, use `$Response->Database` (veja
[Rotas HTTP](#rotas-http)), e fora de um projeto passe a conexão como array — veja
**[Abra um banco](/manual/ADI/Databases/SQL/overview/#abra-um-banco)**.

```php
use Bootgly\ADI\Databases\SQL;
use Bootgly\ADI\Databases\SQL\Model\Auxiliaries\Relations;
use Bootgly\ADI\Databases\SQL\Model\Column;
use Bootgly\ADI\Databases\SQL\Model\Key;
use Bootgly\ADI\Databases\SQL\Model\Relation;
use Bootgly\ADI\Databases\SQL\Model\Table;
use Bootgly\API\Environment\Configs\DatabaseConfig;

#[Table('users')]
class User
{
   #[Key]
   public null|int $id = null;

   #[Column]
   public string $name = '';

   /** @var array<int,Post> */
   #[Relation(Relations::HasMany, Post::class, 'id', 'user')]
   public array $Posts = [];

   #[Relation(Relations::HasOne, Profile::class, 'id', 'user')]
   public null|Profile $Profile = null;

   /** @var array<int,Group> */
   #[Relation(Relations::BelongsToMany, Group::class, 'id', 'id', table: 'memberships', pivotLocal: 'user_id', pivotForeign: 'group_id')]
   public array $Groups = [];
}

#[Table('posts')]
class Post
{
   #[Key]
   public null|int $id = null;

   #[Column('user_id')]
   public int $user = 0;

   #[Column]
   public string $title = '';

   #[Relation(Relations::BelongsTo, User::class, 'user', 'id')]
   public null|User $Author = null;
}

#[Table('profiles')]
class Profile
{
   #[Key]
   public null|int $id = null;

   #[Column('user_id')]
   public int $user = 0;

   #[Column]
   public string $bio = '';
}

#[Table('groups')]
class Group
{
   #[Key]
   public null|int $id = null;

   #[Column]
   public string $name = '';
}

$Database = new SQL(new DatabaseConfig(BOOTGLY_PROJECT->Configs->get('database'))->configure());
```

As tabelas guardam três usuários — `1` Ada, `2` Grace, `3` Linus — e os dois posts de Ada,
`'Notes'` e `'Engine'`, o `'Compilers'` de Grace, o perfil de Ada, `'First programmer'`, e dois
grupos, `'Computing'` e `'Mathematics'`: Ada pertence aos dois, Grace a `'Computing'`. Rodados em
ordem, os exemplos dão os resultados que seus comentários mostram.

Os argumentos são tipo de relação, classe alvo, chave local e chave estrangeira. O que as duas
chaves nomeiam depende do tipo:

| Tipo | Chave local | Chave estrangeira | A propriedade guarda |
|---|---|---|---|
| `HasMany` | A chave do pai | A coluna do alvo que aponta para o pai | Um array de alvos |
| `HasOne` | A chave do pai | A coluna do alvo que aponta para o pai | Um alvo, ou `null` |
| `BelongsTo` | A coluna do pai que aponta para o alvo | A chave do alvo | Um alvo, ou `null` |
| `BelongsToMany` | A chave do pai | A chave do alvo | Um array de alvos |

Uma chave pode nomear a propriedade ou a coluna: `Post` mapeia a coluna `user_id` para `$user`,
então `'user'` e `'user_id'` nomeiam a mesma chave. Uma relação many-to-many também precisa da
tabela pivot (`table`), da coluna pivot que aponta para o pai (`pivotLocal`) e da que aponta para o
alvo (`pivotForeign`); sem elas, é recusada quando carrega, com
`ORM belongsToMany relation requires pivot table and keys.`

Uma relação recebe o nome da sua propriedade — `Posts`, `Profile`, `Groups`, `Author` — a menos que
`name:` lhe dê outro nome (veja **[Attributes](/manual/ADI/Databases/SQL/Model/Attributes/overview/)**).
Esse nome, sensível a maiúsculas, é o que `load()`, `attach()` e `Selection::load()` recebem.

## Carregue em lotes

Chame `load()` depois de hidratar entidades raiz. Ele retorna operações indexadas pelo nome da relação.

```php
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Orders;
use Bootgly\ADI\Databases\SQL\Builder\Identifier;

$Users = $Database->map(User::class);

$MappedUsers = $Users->hydrate($Database->await(
   $Users->fetch($Users->select()->order(Orders::Asc, new Identifier('id')))
));

$Operations = $Users->load($MappedUsers->entities, ['Posts']);
$Operation = $Operations['Posts'] ?? null;

if ($Operation !== null) {
   $Users->attach($MappedUsers->entities, 'Posts', $Database->await($Operation));
}

count($MappedUsers->entities[0]->Posts); // 2
```

Isso mantém a contagem de queries visível e evita consultas de relação ad hoc por entidade pai: o
`load()` compõe uma query por relação para o lote inteiro, filtrada pelas chaves dos pais, e deixa
para você aguardá-la. O `attach()` hidrata as linhas dela como entidades da classe alvo, grava a
parte de cada pai na propriedade da relação — um array, a entidade ou `null` — e devolve esses alvos
como um resultado mapeado. Os alvos entram no identity map do repositório, então um post carregado
duas vezes é o mesmo objeto. A query não tem `ORDER BY`: ordene as entidades carregadas no PHP
quando a ordem delas importa.

A chave não existe quando nenhum pai do lote carrega a chave local da relação — não há o que
buscar, então o `load()` não emite query. Guarde o acesso em vez de indexar direto. O
`hydrate()` não precisa desse cuidado: uma relação que ele não consegue buscar é escrita na
forma vazia, então a propriedade nunca fica com um resultado de uma janela anterior.

Um nome que o model não mapeia lança `ORM relation is not mapped: <name>`, então `['posts']` falha
para a relação `Posts`. O `load()` retorna antes de ler os nomes quando o lote está vazio, então um
resultado vazio esconde um nome errado.

Para múltiplas relações deferidas, aguarde e anexe uma operação por relação:

```php
$MappedUsers = $Users->hydrate(
   $Database->await(
      $Users->fetch($Users->select()->load('Posts', 'Groups'))
   )
);

foreach ($MappedUsers->loads as $relation => $Operation) {
   $Users->attach(
      $MappedUsers->entities,
      $relation,
      $Database->await($Operation)
   );
}
```

Para eager loading, crie o repositório com uma ponte de await. `hydrate()` então aguarda e anexa cada relação pedida antes de retornar:

```php
$Users = $Database->map(User::class, Awaiting: $Database);

$MappedUsers = $Users->hydrate(
   $Database->await(
      $Users->fetch($Users->select()->load('Posts', 'Groups'))
   )
);
```

Nomes de relação são de um nível só: um caminho com ponto como `Posts.Author` não é interpretado, e
lança como um nome não mapeado. Carregue o nível seguinte pelo repositório da classe relacionada:
passe os posts que um primeiro carregamento anexou a `$Database->map(Post::class)->load()`, e então
aguarde e faça `attach()` por esse repositório.

## Política lazy

Lazy loading é opt-in com `lazy: true` e exige uma ponte de await. Repositórios SQL diretos precisam
de `Awaiting: $Database`; repositórios de transação e database resources HTTP podem fornecer a ponte a
partir do próprio contexto aguardável. Uma entidade declara cada relação de um jeito só, então os
exemplos lazy mapeiam a mesma tabela `users` para uma segunda classe, `Member`:

```php
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Orders;
use Bootgly\ADI\Databases\SQL\Builder\Identifier;
use Bootgly\ADI\Databases\SQL\Model\Auxiliaries\Relations;
use Bootgly\ADI\Databases\SQL\Model\Column;
use Bootgly\ADI\Databases\SQL\Model\Key;
use Bootgly\ADI\Databases\SQL\Model\Relation;
use Bootgly\ADI\Databases\SQL\Model\Table;
use Bootgly\ADI\Databases\SQL\Repository\LazyCollection;
use Bootgly\ADI\Databases\SQL\Repository\LazyReference;

#[Table('users')]
class Member
{
   #[Key]
   public null|int $id = null;

   #[Column]
   public string $name = '';

   /** @var LazyCollection<Post> */
   #[Relation(Relations::HasMany, Post::class, 'id', 'user', lazy: true)]
   public LazyCollection $Posts;

   #[Relation(Relations::HasOne, Profile::class, 'id', 'user', lazy: true)]
   public LazyReference $Profile;
}

$Members = $Database->map(Member::class, Awaiting: $Database);

$MappedMembers = $Members->hydrate($Database->await(
   $Members->fetch($Members->select()->order(Orders::Asc, new Identifier('id')))
));
[$Ada, $Grace] = $MappedMembers->entities;

count($Ada->Posts);   // 2: one query loads the posts of every member in the result
count($Grace->Posts); // 1: no new query
```

O primeiro acesso a uma relação lazy em uma janela de resultado mapeado carrega essa relação para
todas as entidades pai dessa mesma janela com uma operação de relação. Acessos posteriores usam o
estado de relação já anexado e não consultam de novo.

Uma entidade isolada é um lote de tamanho um. Essa fronteira é explícita para que o código da
aplicação evite N+1 hidratando pais relacionados em uma única seleção antes de tocar relações lazy.

### Coleções lazy

Uma relação lazy plural é uma `LazyCollection`. Ela carrega no primeiro uso e depois é lida como a
lista das entidades relacionadas, na ordem em que o banco as devolveu — aqui, a ordem de inserção,
já que a query da relação não tem `ORDER BY`:

```php
foreach ($Ada->Posts as $Post) {
   $Post->title; // 'Notes', then 'Engine'
}

$Ada->Posts[0]->title;      // 'Notes'
$Ada->Posts[9];             // null: a missing index reads as null
isset($Ada->Posts[1]);      // true
$Ada->Posts->fetch(1)->id;  // 2
count($Ada->Posts->load()); // 2: the loaded posts as an array
```

Escritas ficam na memória. `$Ada->Posts[] = $Post` acrescenta um objeto à lista carregada, e
qualquer outra coisa lança `ORM lazy collection accepts only objects.`; `unset($Ada->Posts[0])`
remove um, e `set()` substitui a lista. O `reset()` descarta essas mudanças e lê de novo os posts
carregados, sem query nova. Nenhum deles grava no banco (veja
[Gravando relações](#gravando-relações)). Não acrescente nem remova itens enquanto percorre a coleção:
cada mudança volta a posição dela ao início, então o laço pula ou repete itens — junte as mudanças e
aplique-as depois do laço, com `set()`.

### Referências lazy

Uma relação lazy singular é uma `LazyReference`. O `fetch()` a carrega e devolve a entidade
relacionada ou `null`, e `empty` diz se há uma. Todo o resto é repassado à entidade que ela
carrega — leituras e escritas de propriedade, `isset()` e chamadas de método —, exceto os membros do
próprio wrapper: as propriedades `key`, `Batch` e `empty` e os métodos `fetch()`, `set()` e `reset()`
respondem pelo wrapper, então alcance um membro da entidade relacionada com um desses nomes pelo
`fetch()`:

```php
$Ada->Profile->bio;          // 'First programmer'
$Ada->Profile->empty;        // false
$Grace->Profile->fetch();    // null
isset($Grace->Profile->bio); // false
$Grace->Profile->bio;        // RuntimeException: ORM lazy reference is empty.
```

Uma leitura, uma escrita ou uma chamada repassada a uma entidade ausente lança
`ORM lazy reference is empty.`, enquanto o `isset()` responde `false` e nunca lança. Proteja uma
relação opcional com `fetch()`, `empty` ou `isset()`. Uma escrita pela referência muda a entidade
carregada só na memória.

### Tipos de propriedade

A propriedade de uma relação lazy precisa conseguir guardar o wrapper dela:

| Relação | A propriedade pode ser tipada como |
|---|---|
| `HasMany`, `BelongsToMany` | `LazyCollection`, `object`, `mixed`, uma união que inclua `LazyCollection` ou `object`, `iterable` sozinho, ou sem tipo |
| `HasOne`, `BelongsTo` | `LazyReference`, `object`, `mixed`, uma união que inclua `LazyReference` ou `object`, ou sem tipo |

Qualquer outro tipo lança quando o wrapper é instalado, nomeando o wrapper e a propriedade — para um
`Posts` lazy tipado como `array`:
`ORM lazy relation property must accept Bootgly\ADI\Databases\SQL\Repository\LazyCollection: User::$Posts`.
Por enquanto `iterable` só funciona sozinho: `null|iterable`, que o PHP lê como
`Traversable|array|null`, é recusado, e também as interfaces que a `LazyCollection` implementa, como
`Traversable`, `Iterator` e `Countable` — tipe uma propriedade lazy plural que pode guardar `null`
como `null|LazyCollection`. Uma propriedade `array` simples não consegue armazenar um placeholder
lazy em PHP, então `array` continua sendo a forma plural materializada do carregamento deferido e
eager, e `null|Target` a forma singular materializada.

Uma propriedade tipada sem default, como `Member::$Posts`, fica não inicializada até que um
repositório instale o wrapper dela: numa entidade que você mesmo montou, lê-la lança o `Error` do
PHP. Hidratar o `save()` que insere uma entidade assim com chave gerada, por um repositório com ponte
de await, instala os wrappers que faltam às relações lazy sem valor; outros saves os deixam sem
valor, e uma relação que você mesmo definiu mantém o valor. Declare
`null|LazyReference $Profile = null` quando a propriedade deve ser lida como `null` até lá.

A `LazyCollection` não declara tipo template. O PHPStan lê `@var LazyCollection<Post>` como
`LazyCollection&iterable<Post>`, então o `foreach` produz `Post`; `fetch()`, `load()` e um índice
ainda devolvem `null|object`, `array<int,object>` e `mixed` — estreite esses com `instanceof`.

### Pontes e falhas

Sem ponte de await, hidratar uma entidade que declara uma relação `lazy: true` que a seleção não
nomeia em `load()` lança `ORM lazy loading requires an await bridge.` Uma relação lazy nomeada em
`load()` é carregada como qualquer outra relação: em modo eager para dentro do wrapper quando o
repositório tem ponte, então o primeiro acesso não envia query, ou como uma operação deferida em
`loads` quando não tem — o `attach()` então instala o wrapper preenchido. Hidratar um `save()` ou um
`delete()` nunca exige ponte.

Um carregamento que falha lança o erro da operação a partir do acesso que o iniciou, e não é
guardado: o próximo acesso consulta de novo. Uma relação lazy tocada enquanto o próprio carregamento
dela ainda está esperando — a partir de outra Fiber que compartilha a entidade, ou de dentro de uma
ponte de await customizada — lança `ORM lazy relation is already loading.`

Por enquanto, as entidades que uma relação carrega não ganham wrappers próprios. Um `Post` que
declara uma relação `lazy: true` própria, carregado por `$Ada->Posts`, volta com essa propriedade
sem valor, e lê-la lança o `Error` do PHP (`must not be accessed before initialization`), não uma
`RuntimeException`. Dê um default a essa propriedade — `null|LazyReference $Author = null` é lido
como `null` — e carregue essa relação explicitamente pelo repositório de `Post`, cujo `attach()`
instala o wrapper preenchido.

## Gravando relações

O `save()` grava as colunas mapeadas da entidade que você passa, e nada mais: propriedades de relação
nunca são persistidas, e nada é cascateado. Para ligar um post a um usuário, defina a coluna de
chave do post e salve o post pelo repositório dele. Para colocar um usuário num grupo, insira a
linha pivot com o Query Builder:

```php
use Bootgly\ADI\Databases\SQL\Builder\Identifier;

$Posts = $Database->map(Post::class);

$Post = new Post;
$Post->user = 3;
$Post->title = 'Kernels';

$Posts->hydrate($Database->await($Posts->save($Post)));

$Database->await($Database->query(
   $Database->table(new Identifier('memberships'))
      ->insert()
      ->set(new Identifier('user_id'), 3)
      ->set(new Identifier('group_id'), 1)
));
```

Acrescentar um post a `$User->Posts`, ou a uma coleção lazy, só muda a lista na memória: carregue a
relação de novo para ler o que o banco guarda. Excluir uma entidade exclui só a linha dela; as
linhas que apontam para ela ficam a cargo do banco manter, cascatear ou recusar.

## Rotas HTTP

Dentro do `HTTP_Server_CLI`, repositórios criados por `$Response->Database` recebem o resource de resposta como ponte de await:

```php
return $Response->defer(function ($Response): void {
   $Database = $Response->Database;
   $Users = $Database->map(User::class);

   $MappedUsers = $Users->hydrate(
      $Database->await(
         $Users->fetch($Users->select()->load('Posts'))
      )
   );
});
```

## Referência

Os argumentos do attribute de relação estão em
**[Attributes](/manual/ADI/Databases/SQL/Model/Attributes/overview/)**, e as demais operações do
repositório em **[ORM Repository](/manual/ADI/Databases/SQL/Repository/overview/)**. Nas
assinaturas abaixo, `DatabaseResult` é `Bootgly\ADI\Database\Operation\Result`, e `MappedResult` é
`Bootgly\ADI\Databases\SQL\Repository\Result`.

### Repository

```php
load (object|array $Entities, array $relations = [], null|object $Scope = null): array
```

Compõe uma query em lote por relação nomeada para os pais dados e devolve as operações indexadas
pelo nome da relação, sem aguardá-las. Uma relação cujos pais não carregam chave local não ganha
operação. Lança `InvalidArgumentException` para um nome não mapeado. `$Scope` é o escopo de
read-after-write das queries; por padrão, o do repositório.

```php
attach (object|array $Entities, string $relation, Operation|DatabaseResult $Source): MappedResult
```

Hidrata a operação de relação terminada, ou um resultado, como entidades alvo, grava a parte de cada
pai na propriedade da relação e devolve os alvos. Lança `InvalidArgumentException` para um nome não
mapeado, e uma `RuntimeException` com o `error` da operação quando ela falhou,
`ORM relation attachment requires a completed SQL result.` quando ela não terminou, ou
`ORM relation attachment result is missing key column: <column>` quando as linhas dela não têm a
chave que as liga aos pais.

### Selection

```php
load (string ...$relations): static
```

Nomeia relações para o `hydrate()` carregar com o resultado da query raiz: anexadas antes de ele
retornar quando o repositório tem ponte de await, e devolvidas como operações em `loads` quando não
tem.

### LazyCollection

`Bootgly\ADI\Databases\SQL\Repository\LazyCollection` implementa `ArrayAccess`, `Countable` e
`Iterator`: `foreach`, `count()`, `[$index]`, `isset()`, `[] =` e `unset()` funcionam sobre a lista
carregada. Cada leitura dela carrega o lote no primeiro uso.

```php
count (): int
```

O número de entidades relacionadas.

```php
fetch (int $index): null|object
```

A entidade relacionada em `$index`, ou `null`.

```php
load (): array
```

As entidades relacionadas, como uma lista.

```php
offsetGet (mixed $offset): mixed
```

A entidade num índice, ou `null` — o que `$Collection[$index]` lê.

```php
offsetExists (mixed $offset): bool
```

Se o índice existe — o que `isset($Collection[$index])` pergunta.

```php
offsetSet (mixed $offset, mixed $value): void
```

Define ou acrescenta uma entidade na lista carregada, só na memória, e volta a iteração ao início.
Lança `InvalidArgumentException` com `ORM lazy collection accepts only objects.` para qualquer coisa
que não seja um objeto.

```php
offsetUnset (mixed $offset): void
```

Remove uma entidade da lista carregada, só na memória, e volta a iteração ao início.

```php
set (array $items): void
```

Substitui a lista carregada, só na memória, e volta a iteração ao início.

```php
reset (): void
```

Descarta as mudanças da lista; a próxima leitura toma o lote carregado de novo, sem query nova.

```php
__construct (LazyBatch $Batch, null|string $key)
```

Montado pelo repositório quando ele instala o wrapper; aplicações não montam wrappers.

```php
public private(set) LazyBatch $Batch
```

O lote de onde o wrapper carrega, um `Bootgly\ADI\Databases\SQL\Repository\LazyBatch`: um por
relação e hidratação, compartilhado pelos wrappers de todo pai nela.

```php
public private(set) null|string $key
```

O valor `local` do pai como o lote o indexa, ou `null` quando o pai não tem um.

### LazyReference

`Bootgly\ADI\Databases\SQL\Repository\LazyReference` repassa à entidade relacionada todo membro
que não seja um membro público do próprio wrapper.

```php
fetch (): null|object
```

A entidade relacionada, ou `null` quando não há nenhuma.

```php
public bool $empty { get; }
```

`true` quando não há entidade relacionada.

```php
__get (string $property): mixed
```

Lê uma propriedade da entidade relacionada. Lança `RuntimeException` com
`ORM lazy reference is empty.` quando não há nenhuma — assim como `__set()` e `__call()`.

```php
__set (string $property, mixed $value): void
```

Grava uma propriedade da entidade relacionada, na memória.

```php
__isset (string $property): bool
```

Se a entidade relacionada tem a propriedade definida; `false`, nunca uma exceção, quando não há
entidade.

```php
__call (string $method, array $arguments): mixed
```

Chama um método da entidade relacionada.

```php
set (null|object $Entity): void
```

Substitui a entidade relacionada, só na memória.

```php
reset (): void
```

Esquece a entidade que a referência leu; a próxima leitura a toma do lote carregado de novo.

```php
__construct (LazyBatch $Batch, null|string $key)
```

Montado pelo repositório quando ele instala o wrapper; aplicações não montam wrappers.

```php
public private(set) LazyBatch $Batch
```

O lote de onde o wrapper carrega, um `Bootgly\ADI\Databases\SQL\Repository\LazyBatch`: um por
relação e hidratação, compartilhado pelos wrappers de todo pai nela.

```php
public private(set) null|string $key
```

O valor `local` do pai como o lote o indexa, ou `null` quando o pai não tem um. Ele é do próprio
wrapper: leia uma propriedade `key` da entidade relacionada pelo `fetch()`.
