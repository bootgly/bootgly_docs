# ORM Repository

`Bootgly\ADI\Databases\SQL\Repository` é a superfície Data Mapper para uma classe de entidade mapeada. Ele possui um identity map local e um hydrator, mas não possui conexões de banco nem executa I/O escondido.

Crie repositories a partir de uma fachada SQL, uma transaction ou o database response resource HTTP:

```php
$Users = $Database->map(User::class);
$UsersInTransaction = $Transaction->map(User::class);
$UsersInResponse = $Response->Database->map(User::class);
```

`$Response->Database->map()` vincula o repository ao escopo read-after-write do response resource. Isso mantém roteamento para réplica consistente dentro de rotas `HTTP_Server_CLI`.

`SQL::map()` não define uma ponte de await por padrão. Repositories SQL diretos permanecem em modo explícito/deferido, a menos que você passe `Awaiting: $Database`. Transactions e o response resource HTTP já operam em contextos aguardáveis, então seus `map()` podem fornecer a ponte para relações eager e lazy.

## Operações

Métodos do repository retornam `Operation` para trabalho de banco:

```php
$Find = $Users->find(1);
$Fetch = $Users->fetch($Users->select());
$Save = $Users->save($User);
$Delete = $Users->delete($User);
```

Aguarde a operação pelo DBAL e hidrate quando linhas devem virar entidades:

```php
$Operation = $Database->await($Users->find(1));
$Mapped = $Users->hydrate($Operation);

$User = $Mapped->entity;
```

## Selection

`select()` cria uma `Selection`, compilada pelo SQL Query Builder.

```php
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Operators;
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Orders;
use Bootgly\ADI\Databases\SQL\Builder\Identifier;

$Selection = $Users
   ->select()
   ->filter(new Identifier('active'), Operators::Equal, true)
   ->order(Orders::Asc, new Identifier('id'))
   ->limit(10);

$Operation = $Users->fetch($Selection);
```

Scopes nomeados são locais ao repository:

```php
$Users->scope('active', function ($Selection): void {
   $Selection->filter(new Identifier('active'), Operators::Equal, true);
});

$Operation = $Users->fetch($Users->select()->scope('active'));
```

## Resultado da hidratação

`hydrate()` retorna `Repository\Result`:

- `entities` - todas as entidades hidratadas.
- `entity` - primeira entidade ou `null`.
- `count` - quantidade de entidades hidratadas.
- `empty` - se nenhuma entidade foi hidratada.
- `Result` - resultado DBAL original.
- `loads` - operações deferidas de relações single-level indexadas pelo nome da relação; vazio quando o eager loading as anexa durante a hidratação.

O identity map é local à instância do repository. Hidratar linhas repetidas com a mesma primary key reutiliza o mesmo objeto apenas dentro daquele repository.

Quando uma selection usa `load()` sem uma ponte de await, aguarde cada operação de `$Mapped->loads` e anexe explicitamente:

```php
$Mapped = $Users->hydrate(
   $Database->await(
      $Users->fetch($Users->select()->load('posts'))
   )
);

foreach ($Mapped->loads as $relation => $Operation) {
   $Users->attach($Mapped->entities, $relation, $Database->await($Operation));
}
```

Quando o repository tem uma ponte de await, `hydrate()` faz eager loading e retorna com as relações pedidas já anexadas:

```php
$Users = $Database->map(User::class, Awaiting: $Database);

$Mapped = $Users->hydrate(
   $Database->await(
      $Users->fetch($Users->select()->load('posts'))
   )
);
```

O database response resource HTTP injeta a si mesmo como essa ponte, então repositories criados por `$Response->Database->map()` carregam relações pedidas em modo eager sem orquestração extra.

Relações declaradas com `lazy: true` são instaladas como wrappers lazy durante a hidratação quando o repository tem uma ponte de await. Relações plurais usam `LazyCollection`; relações singulares usam `LazyReference`. O primeiro acesso carrega a relação uma vez para todas as entidades da janela de resultado mapeado.

## Hooks

`listen()` registra listeners locais de ciclo de vida para eventos do repository como `Selecting`, `Selected`, `Saving`, `Saved`, `Hydrating` e `Hydrated`.

```php
use Bootgly\ADI\Databases\SQL\Repository\Hooks;

$Users->listen(Hooks::Hydrated, function ($Mapped): void {
   // inspect mapped entities
});
```

## Referência

- **[ORM Model](/manual/ADI/Databases/SQL/Model/overview/)** - metadata compilada de entidades.
- **[Relações](/manual/ADI/Databases/SQL/Repository/Relations/overview/)** - carregamento explícito em lote.
- **[ORM de banco](/guide/database-orm/overview/)** - uso ponta a ponta.
