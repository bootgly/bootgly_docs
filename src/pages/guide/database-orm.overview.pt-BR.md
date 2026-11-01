# ORM de banco

O ORM do Bootgly é uma camada Data Mapper sobre o DBAL SQL async nativo. Ele mapeia linhas de resultado para entidades simples, mas o I/O de banco continua passando por `Operation`: busque primeiro, aguarde pelo DBAL ou pelo response resource HTTP, depois hidrate explicitamente.

Use o ORM quando o código da aplicação precisa de dados em formato de entidade sem sair do pipeline SQL do Bootgly. Use o Query Builder direto quando uma rota precisa apenas de linhas ou projeções customizadas.

## Que tipo de ORM é este?

Em termos de padrões, ele é um **Data Mapper**, com um **Repository** por classe de entidade e um **Identity Map** por repository, sem Unit of Work:

- **Data Mapper.** Uma entidade é uma classe PHP simples descrita por attributes: nenhuma classe base para estender, nenhum método de persistência para chamar. Ela nunca consulta o banco nem se salva — até uma relação lazy é carregada por um wrapper que o repository instala. O repository compila o SQL a partir do mapeamento da classe e move os dados entre linhas e objetos.
- **Repository.** Toda leitura e escrita passa pelo repository que o `map()` devolve para uma classe de entidade: `$Database->map()`, ou o `map()` de uma transaction ou do `$Response->Database` numa rota. Ele busca, lista, pagina, salva e exclui as entidades dessa classe.
- **Identity Map.** Um repository mantém um objeto por primary key: hidratar uma linha que ele já rastreia grava a linha nesse objeto. O map pertence a esse repository; outro `map()` tem o seu e hidrata a mesma linha em outro objeto.
- **Sem Unit of Work.** Nada registra suas mudanças e nada as descarrega. Cada `save()` ou `delete()` compõe uma instrução e a devolve como uma `Operation` assíncrona que você aguarda; uma mudança que você não salva nunca é gravada, nem quando uma transaction faz commit. O `UPDATE` de uma entidade hidratada grava toda coluna que as hidratações dela trouxeram, mudada ou não — nunca a chave, uma coluna `update: false` ou uma `generated` com `null` —, e o `UPDATE` de uma entidade que o repository nunca hidratou grava toda coluna que ele pode atualizar.

| Padrão | Quem salva | Onde fica o SQL | Rastreio de mudanças | Bootgly |
|---|---|---|---|---|
| Active Record | A entidade: `$User->save()` | A classe base da entidade | Muitas vezes, na entidade | Não: uma entidade não tem classe base nem métodos de persistência |
| Data Mapper | Um mapper: `$Users->save($User)` | O mapper, montado a partir do mapeamento | Não faz parte do padrão | Sim: o repository, montado a partir dos attributes |
| Unit of Work | Uma sessão que descarrega toda mudança pendente de uma vez | A sessão, no flush | Sim: ela compara as entidades rastreadas com o estado em que foram carregadas | Não: cada `save()` ou `delete()` é uma operação que você aguarda |

## Defina entidades

A metadata da entidade vem de attributes em `Bootgly\ADI\Databases\SQL\Model`.

```php
namespace Demo\HTTP_Server_CLI\Models;

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
   public null|DateTimeImmutable|string $CreatedAt = null;

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

PostgreSQL e MySQL hidratam colunas de data e timestamp como `DateTimeImmutable` e o SQLite como o texto que guardou, e por enquanto o `save()` do PostgreSQL recusa um `DateTimeImmutable` — então `CreatedAt` aceita os dois tipos e fica somente leitura; **[Datas e horas](/manual/ADI/Databases/SQL/Model/overview/#datas-e-horas)** tem as regras, e **[Hidratação ORM](/manual/ADI/Databases/SQL/Repository/Hydration/overview/)** como cada tipo de propriedade é preenchido. Formate o valor ao serializar para JSON.

## Busque e hidrate

`SQL::map()` cria um contexto de repository para uma classe de entidade. O repository compila SQL e retorna `Operation`; ele não bloqueia sozinho.

Um repository criado diretamente por `SQL::map()` não tem ponte de await, a menos que você passe `Awaiting:`, então por padrão permanece em modo explícito/deferido para relações: se a entidade tiver uma relação `lazy: true` que a selection não nomeia em `load()`, o `hydrate()` lança `ORM lazy loading requires an await bridge.` Hidratar um `save()` ou um `delete()` nunca exige ponte. Passe uma ponte `Awaiting`, use uma transaction (veja **[Repositórios dentro de uma transação](/manual/ADI/Databases/SQL/Transaction/overview/#repositórios-dentro-de-uma-transação)**), ou mapeie pelo Database Response Resource HTTP quando quiser eager ou lazy loading de relações.

Numa função de boot, num comando ou num script dentro de um projeto, abra o `$Database` a partir do escopo de config `database` do projeto; fora de um projeto, passe a conexão como array (veja **[Abra um banco](/manual/ADI/Databases/SQL/overview/#abra-um-banco)**):

```php
use Bootgly\ADI\Databases\SQL;
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Orders;
use Bootgly\ADI\Databases\SQL\Builder\Identifier;
use Bootgly\API\Environment\Configs\DatabaseConfig;

$Database = new SQL(new DatabaseConfig(BOOTGLY_PROJECT->Configs->get('database'))->configure());
$Users = $Database->map(User::class);

$Operation = $Database->await($Users->fetch(
   $Users
      ->select()
      ->order(Orders::Asc, new Identifier('id'))
));
$Mapped = $Users->hydrate($Operation);

$Entities = $Mapped->entities;
$Entity = $Mapped->entity;
```

O `$Database->await()` conduz a operação até o fim e lança quando ela falha; o `hydrate()` então transforma as linhas dela em entidades. Numa rota, o `$Response->Database->await()` devolve uma operação com falha no lugar, e é o `hydrate()` que lança (veja **[Operações não terminadas e com falha](/manual/ADI/Databases/SQL/Repository/Hydration/overview/#operações-não-terminadas-e-com-falha)**). Os métodos de selection — filtros, buscas de texto, ordem, limites, locks de linha e escopos nomeados — estão em **[Seleções ORM](/manual/ADI/Databases/SQL/Repository/Selection/overview/)**, e o resultado mapeado, as regras de conversão e o identity map em **[Hidratação ORM](/manual/ADI/Databases/SQL/Repository/Hydration/overview/)**.

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

`save()` insere quando a primary key gerada está `null`; caso contrário, atualiza. Hidrate o save e continue com `$Mapped->entity ?? $User`: o `hydrate()` grava o id gerado no objeto que você passou, e o `??` mantém o seu objeto quando o save não é hidratado em entidade nenhuma, como um UPDATE no MySQL e no SQLite. O roteamento, o que cada driver devolve e os casos que o identity map ainda não cobre estão em **[Salvar entidades](/manual/ADI/Databases/SQL/Repository/overview/#salvar-entidades)**.

```php
$User = new User;
$User->name = 'Ada Lovelace';
$User->email = 'ada@example.test';
$User->active = true;

$Operation = $Database->await($Users->save($User));
$Mapped = $Users->hydrate($Operation);
$User = $Mapped->entity ?? $User;
```

Salvar `$User` de novo atualiza a linha dele. Uma relação que você definiu nele antes do save mantém o valor.

## Carregue relações

Use carregamento explícito/deferido em lote quando o código da aplicação precisa controlar diretamente a fronteira async.

```php
$Users = $Database->map(User::class);

$MappedUsers = $Users->hydrate($Database->await($Users->fetch()));
$Operations = $Users->load($MappedUsers->entities, ['Posts']);
$Operation = $Operations['Posts'] ?? null;

if ($Operation !== null) {
   $Users->attach(
      $MappedUsers->entities,
      'Posts',
      $Database->await($Operation)
   );
}
```

O `load()` deixa uma relação fora do resultado quando não há nada para buscar (nenhuma entidade, ou nenhum pai com a chave local), então proteja a leitura em vez de indexar direto.

`Selection::load()` registra operações de relação deferidas no resultado mapeado quando o repository não tem uma ponte de await. Aguarde cada operação e chame `attach()` uma vez por relação.

```php
$MappedUsers = $Users->hydrate(
   $Database->await(
      $Users->fetch($Users->select()->load('Posts'))
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
      $Users->fetch($Users->select()->load('Posts'))
   )
);
```

Dentro do `HTTP_Server_CLI`, `$Response->Database->map()` injeta automaticamente o scheduler da resposta como ponte de await.

Lazy loading é opt-in no attribute da relação. Para tornar `User::$Posts` lazy, declare-a com `lazy: true` e tipe-a como `LazyCollection`:

```php
use Bootgly\ADI\Databases\SQL\Repository\LazyCollection;

/** @var LazyCollection<Post> */
#[Relation(Relations::HasMany, Post::class, 'id', 'user', lazy: true)]
public LazyCollection $Posts;
```

O primeiro acesso a uma relação lazy em uma janela de resultado mapeado carrega essa relação em lote para todas as entidades dessa janela: `count($User->Posts)` envia uma única query para todos os usuários que a hidratação devolveu. Uma relação singular (`HasOne`, `BelongsTo`) é lazy como uma `LazyReference`, cujo `fetch()` retorna a entidade relacionada ou `null`. Os wrappers, os tipos de propriedade que eles aceitam e os limites atuais deles estão em **[Relações ORM](/manual/ADI/Databases/SQL/Repository/Relations/overview/#política-lazy)**.

Chaves de relação podem nomear a propriedade ou a coluna: `'user'` acima e `'user_id'` nomeiam ambas a coluna `user_id` que `Post` mapeia para `$user`. Nomes de relação são de um nível só: um caminho com ponto como `Posts.Comments` não é interpretado — carregue o nível seguinte pelo repository da classe relacionada.

## Pagine

Repositories paginam em modo página (`LIMIT`/`OFFSET` mais um total `COUNT(*)`) ou modo cursor (predicado keyset + token opaco, sem contagem). Em rotas HTTP, uma chamada lê `?page`, `?limit` e `?cursor`, emite os headers `X-Total-Count`/`Link` e retorna um body negociável:

```php
return $Response->Negotiation->send(
   $Response->Database->paginate(User::class)
);
```

Veja **[Paginação ORM](/manual/ADI/Databases/SQL/Repository/Pagination/overview/)** para selections filtradas, caminhadas com cursor e a API na camada ADI.

## Projeto demo

`projects/Demo/HTTP_Server_CLI/router/routes/Database.routes.php` expõe exemplos ORM:

- `/deferred/database/orm/users`
- `/deferred/database/orm/user`
- `/deferred/database/orm/relations`
- `/deferred/database/orm/lazy-relations`
- `/deferred/database/orm/save`

As classes de entidade usadas por essas rotas ficam em `projects/Demo/HTTP_Server_CLI/Models/`. Rode `/deferred/database/setup` primeiro: ele cria e popula as tabelas do demo no PostgreSQL. A coleção Postman em `projects/Demo/HTTP_Server_CLI/router/HTTP_Server_CLI-response-database.postman_collection.json` inclui as mesmas rotas.

## Referência

- **[ORM Model](/manual/ADI/Databases/SQL/Model/overview/)** - attributes e compilação de metadata.
- **[ORM Repository](/manual/ADI/Databases/SQL/Repository/overview/)** - operações, save, delete e repositories.
- **[Seleções ORM](/manual/ADI/Databases/SQL/Repository/Selection/overview/)** - filtros, buscas, ordem, limites, locks e escopos nomeados.
- **[Hidratação ORM](/manual/ADI/Databases/SQL/Repository/Hydration/overview/)** - o resultado mapeado, regras de conversão, identity map e entidades salvas.
- **[Hooks ORM](/manual/ADI/Databases/SQL/Repository/Hooks/overview/)** - listeners do ciclo de vida e quando cada um roda.
- **[Relações ORM](/manual/ADI/Databases/SQL/Repository/Relations/overview/)** - carregamento de relações em lote, eager e lazy.
- **[Paginação ORM](/manual/ADI/Databases/SQL/Repository/Pagination/overview/)** - paginação página/cursor e headers REST.
- **[DBAL de banco](/guide/database-dbal/overview/)** - database resource async em rotas HTTP.
