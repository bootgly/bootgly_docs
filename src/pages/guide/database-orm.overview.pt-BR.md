# ORM de banco

O ORM do Bootgly é uma camada Data Mapper sobre o DBAL SQL async nativo. Ele mapeia linhas de resultado para entidades simples, mas o I/O de banco continua passando por `Operation`: busque primeiro, aguarde pelo DBAL ou pelo response resource HTTP, depois hidrate explicitamente.

Use o ORM quando o código da aplicação precisa de dados em formato de entidade sem sair do pipeline SQL do Bootgly. Use o Query Builder direto quando uma rota precisa apenas de linhas ou projeções customizadas.

## Defina entidades

A metadata da entidade vem de attributes em `Bootgly\ADI\Databases\SQL\Model`.

```php
use DateTimeImmutable;

use Bootgly\ADI\Databases\SQL\Model\Auxiliaries\Relations;
use Bootgly\ADI\Databases\SQL\Model\Column;
use Bootgly\ADI\Databases\SQL\Model\Key;
use Bootgly\ADI\Databases\SQL\Model\Relation;
use Bootgly\ADI\Databases\SQL\Model\Table;

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

   #[Column('created_at', insert: false, update: false, generated: true, nullable: true)]
   public null|DateTimeImmutable $CreatedAt = null;

   /** @var array<int,Post> */
   #[Relation(Relations::HasMany, Post::class, 'id', 'user')]
   public array $Posts = [];
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
}
```

Timestamps do PostgreSQL são hidratados como `DateTimeImmutable`. Tipe as propriedades da entidade assim e formate ao serializar para JSON.

## Busque e hidrate

`SQL::map()` cria um contexto de repository para uma classe de entidade. O repository compila SQL e retorna `Operation`; ele não bloqueia sozinho.

Um repository criado diretamente por `SQL::map()` permanece em modo explícito/deferido para relações. Passe uma ponte `Awaiting`, use uma transaction, ou mapeie pelo Database Response Resource HTTP quando quiser eager ou lazy loading de relações.

```php
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Orders;
use Bootgly\ADI\Databases\SQL\Builder\Identifier;

$Users = $Database->map(User::class);

$Operation = $Users->fetch(
   $Users
      ->select()
      ->order(Orders::Asc, new Identifier('id'))
);

$Database->Pool->wait($Operation);
$Mapped = $Users->hydrate($Operation);

$Entities = $Mapped->entities;
$Entity = $Mapped->entity;
```

No `HTTP_Server_CLI`, use o Database Response Resource nativo para o event loop continuar tratando readiness enquanto a operação aguarda:

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response;

return $Response->defer(function (Response $Response): void {
   $Database = $Response->Database;
   $Users = $Database->map(User::class);

   $Operation = $Database->await($Users->find(1));
   $Mapped = $Users->hydrate($Operation);

   $Response->JSON->send([
      'status' => 'ok',
      'user' => $Mapped->entity,
   ]);
});
```

## Salve entidades

`save()` insere quando a primary key gerada está `null`; caso contrário, atualiza. PostgreSQL e SQLite retornam colunas mapeadas com `RETURNING` quando o dialeto suporta.

```php
$User = new User;
$User->name = 'Ada Lovelace';
$User->email = 'ada@example.test';
$User->active = true;

$Operation = $Database->await($Users->save($User));
$Mapped = $Users->hydrate($Operation);
```

## Carregue relações

Use carregamento explícito/deferido em lote quando o código da aplicação precisa controlar diretamente a fronteira async.

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

`Selection::load()` registra operações de relação deferidas no resultado mapeado quando o repository não tem uma ponte de await. Aguarde cada operação e chame `attach()` uma vez por relação.

```php
$MappedUsers = $Users->hydrate(
   $Database->await(
      $Users->fetch($Users->select()->load('Posts', 'Profile'))
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

Para eager loading, injete uma ponte ADI de await. `hydrate()` então aguarda e anexa automaticamente as relações pedidas, e `loads` fica vazio.

```php
$Users = $Database->map(User::class, Awaiting: $Database);

$MappedUsers = $Users->hydrate(
   $Database->await(
      $Users->fetch($Users->select()->load('Posts', 'Profile'))
   )
);
```

Dentro do `HTTP_Server_CLI`, `$Response->Database->map()` injeta automaticamente o scheduler da resposta como ponte de await.

Lazy loading é opt-in no attribute da relação:

```php
use Bootgly\ADI\Databases\SQL\Repository\LazyCollection;
use Bootgly\ADI\Databases\SQL\Repository\LazyReference;

/** @var LazyCollection<Post> */
#[Relation(Relations::HasMany, Post::class, 'id', 'user_id', lazy: true)]
public LazyCollection $Posts;

#[Relation(Relations::HasOne, Profile::class, 'id', 'user_id', lazy: true)]
public LazyReference $Profile;
```

O primeiro acesso a uma relação lazy em uma janela de resultado mapeado carrega essa relação em lote para todas as entidades dessa janela. `count($User->Posts)` carrega relações plurais por `LazyCollection`; `$User->Profile->fetch()` retorna o alvo singular ou `null` por `LazyReference`. Lazy loading exige ponte de await. Uma propriedade `array` simples é a forma plural materializada para explicit/deferred e eager loading, não a forma lazy.

Nomes de relação são single-level no v0.16. Caminhos aninhados como `posts.comments` ficam intencionalmente fora do escopo.

## Projeto demo

`projects/Demo/HTTP_Server_CLI/router/routes/Database.php` expõe exemplos ORM:

As classes de entidade usadas por essas rotas ficam em `projects/Demo/HTTP_Server_CLI/Models/`.

- `/deferred/database/orm/users`
- `/deferred/database/orm/user`
- `/deferred/database/orm/relations`
- `/deferred/database/orm/lazy-relations`
- `/deferred/database/orm/save`

Rode `/deferred/database/setup` primeiro. A coleção Postman em `projects/Demo/HTTP_Server_CLI/router/HTTP_Server_CLI-response-database.postman_collection.json` inclui as mesmas rotas.

## Referência

- **[ORM Model](/manual/ADI/Databases/SQL/Model/overview/)** - attributes e compilação de metadata.
- **[ORM Repository](/manual/ADI/Databases/SQL/Repository/overview/)** - selections, save, delete e hidratação.
- **[Relações ORM](/manual/ADI/Databases/SQL/Repository/Relations/overview/)** - carregamento explícito de relações em lote.
- **[DBAL de banco](/guide/database-dbal/overview/)** - database resource async em rotas HTTP.
