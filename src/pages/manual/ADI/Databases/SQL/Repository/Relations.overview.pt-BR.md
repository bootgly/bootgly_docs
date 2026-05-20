# Relações ORM

Relações ORM são explícitas. O Bootgly armazena metadata de relação no model. Relações podem ser materializadas explicitamente/em modo eager, ou marcadas como lazy com `lazy: true`.

Os tipos suportados ficam em `Bootgly\ADI\Databases\SQL\Model\Auxiliaries\Relations`:

- `HasOne`
- `HasMany`
- `BelongsTo`
- `BelongsToMany`

## Mapeie relações

```php
use Bootgly\ADI\Databases\SQL\Model\Auxiliaries\Relations;
use Bootgly\ADI\Databases\SQL\Model\Relation;
use Bootgly\ADI\Databases\SQL\Repository\LazyCollection;
use Bootgly\ADI\Databases\SQL\Repository\LazyReference;

/** @var array<int,Post> */
#[Relation(Relations::HasMany, Post::class, 'id', 'user')]
public array $Posts = [];

#[Relation(Relations::BelongsTo, User::class, 'user', 'id', name: 'author')]
public null|User $Author = null;

/** @var array<int,Group> */
#[Relation(Relations::BelongsToMany, Group::class, 'id', 'id', table: 'memberships', pivotLocal: 'user_id', pivotForeign: 'group_id')]
public array $Groups = [];

/** @var LazyCollection<Post> */
#[Relation(Relations::HasMany, Post::class, 'id', 'user', lazy: true)]
public LazyCollection $LazyPosts;

#[Relation(Relations::HasOne, Profile::class, 'id', 'user', lazy: true)]
public LazyReference $LazyProfile;
```

Os argumentos são tipo de relação, classe alvo, chave local e chave estrangeira. Relações many-to-many também precisam de tabela pivot e chaves pivot.

## Carregue em lotes

Chame `load()` depois de hidratar entidades raiz. Ele retorna operações indexadas pelo nome da relação.

```php
$Users = $Database->map(User::class);

$MappedUsers = $Users->hydrate($Database->await($Users->fetch()));

$Operations = $Users->load($MappedUsers->entities, ['Posts']);
$Users->attach(
   $MappedUsers->entities,
   'Posts',
   $Database->await($Operations['Posts'])
);
```

Isso mantém a contagem de queries visível e evita consultas de relação ad hoc por entidade pai.

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

Para eager loading, crie o repository com uma ponte de await. `hydrate()` então aguarda e anexa cada relação pedida antes de retornar:

```php
$Users = $Database->map(User::class, Awaiting: $Database);

$MappedUsers = $Users->hydrate(
   $Database->await(
      $Users->fetch($Users->select()->load('Posts', 'Groups'))
   )
);
```

## Política lazy

Lazy loading é opt-in com `lazy: true` e exige uma ponte de await. Repositories SQL diretos precisam de `Awaiting: $Database`; repositories de transaction e database resources HTTP podem fornecer a ponte a partir do próprio contexto aguardável.

```php
$Users = $Database->map(User::class, Awaiting: $Database);

$MappedUsers = $Users->hydrate(
   $Database->await($Users->fetch())
);

$count = count($MappedUsers->entities[0]->LazyPosts);
$Profile = $MappedUsers->entities[0]->LazyProfile->fetch();
```

O primeiro acesso a uma relação lazy em uma janela de resultado mapeado carrega essa relação para todas as entidades pai dessa mesma janela com uma operação de relação. Acessos posteriores usam o estado de relação já anexado e não consultam de novo.

Uma entidade isolada é um lote de tamanho um. Essa fronteira é explícita para que o código da aplicação evite N+1 hidratando pais relacionados em uma única selection antes de tocar relações lazy.

Relações lazy plurais usam `LazyCollection`. Relações lazy singulares usam `LazyReference`, cujo método `fetch()` retorna a entidade relacionada ou `null`. Uma propriedade `array` simples não consegue armazenar um placeholder lazy em PHP, então propriedades de relação `array` existentes continuam sendo a forma materializada usada por explicit/deferred e eager loading. Da mesma forma, `null|Target` é a forma singular materializada, não a forma lazy.

Nomes de relação são single-level no v0.16. Caminhos com ponto, como `posts.comments`, não são interpretados.

## Rotas HTTP

Dentro do `HTTP_Server_CLI`, repositories criados por `$Response->Database` recebem o resource de resposta como ponte de await:

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

- **[Attributes](/manual/ADI/Databases/SQL/Model/Attributes/overview/)** - argumentos do attribute de relação.
- **[ORM Repository](/manual/ADI/Databases/SQL/Repository/overview/)** - operações e hidratação do repository.
