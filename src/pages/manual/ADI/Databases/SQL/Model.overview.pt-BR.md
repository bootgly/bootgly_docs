# ORM Model

`Bootgly\ADI\Databases\SQL\Model` é a metadata compilada de uma classe de entidade ORM. Ela é criada a partir de PHP attributes e cacheada por `Models` na fachada SQL.

O model armazena:

- nome da classe de entidade e nome da tabela
- coluna e propriedade da primary key
- mapeamentos de coluna para propriedade
- colunas inseríveis e atualizáveis
- definições de relação
- reflection handles usados pelo hydrator

Aplicações normalmente não instanciam `Model` diretamente. Chame `SQL::map(Entity::class)` ou `Transaction::map(Entity::class)` e o repository busca a metadata cacheada por `Models`.

```php
$Users = $Database->map(User::class);

$Model = $Users->Model;

echo $Model->table;
echo $Model->key;
```

## Reflection e cache

A primeira chamada para `Models::fetch()` reflete a classe de entidade. Chamadas posteriores reutilizam a metadata compilada na mesma instância de `SQL`.

```php
$Models = $Database->Models;

$UserModel = $Models->fetch(User::class);
$SameModel = $Models->fetch(User::class);
```

Somente metadata é cacheada. Repositories são contextos leves e devem ser criados por uso, request ou transaction.

## Construção de entidades

Durante a hidratação, `Model::create()` cria uma instância da entidade. Se a entidade não tem parâmetros obrigatórios no construtor, o construtor roda. Se tem parâmetros obrigatórios, o Bootgly cria a instância sem chamar o construtor e escreve as propriedades mapeadas por reflection.

Mantenha propriedades mapeadas explícitas e tipadas. Para colunas com valor de objeto, tipe a propriedade com o objeto realmente retornado pelo driver. Timestamps do PostgreSQL retornam como `DateTimeImmutable`.

## Referência

- **[Attributes](/manual/ADI/Databases/SQL/Model/Attributes/overview/)** - `Table`, `Key`, `Column` e `Relation`.
- **[ORM Repository](/manual/ADI/Databases/SQL/Repository/overview/)** - operações criadas a partir da metadata do model.
- **[ORM de banco](/guide/database-orm/overview/)** - uso ponta a ponta.
