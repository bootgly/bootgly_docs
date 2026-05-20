# Attributes ORM

Os attributes do ORM ficam em `Bootgly\ADI\Databases\SQL\Model`.

## Table

`Table` mapeia uma classe para uma tabela SQL.

```php
use Bootgly\ADI\Databases\SQL\Model\Table;

#[Table('users')]
class User
{
}
```

Cada entidade deve ter exatamente um attribute `Table`.

## Key

`Key` mapeia a propriedade da primary key. Chaves geradas são o padrão.

```php
use Bootgly\ADI\Databases\SQL\Model\Key;

#[Key]
public null|int $id = null;
```

Para chaves atribuídas pela aplicação, desative geração:

```php
#[Key(generated: false)]
public string $id = '';
```

## Column

`Column` mapeia uma propriedade persistente. Quando nenhum nome é passado, o nome da propriedade é usado como coluna SQL.

```php
use DateTimeImmutable;

use Bootgly\ADI\Databases\SQL\Model\Column;

#[Column]
public string $email = '';

#[Column('created_at', insert: false, update: false, generated: true, nullable: true)]
public null|DateTimeImmutable $CreatedAt = null;
```

Opções:

- `name` - nome da coluna SQL, ou `null` para usar o nome da propriedade.
- `insert` - inclui a coluna em `INSERT`.
- `update` - inclui a coluna em `UPDATE`.
- `generated` - permite colunas ausentes na hidratação e pula valores gerados nulos no insert.
- `nullable` - permite valores ausentes ou nulos ao hidratar.

## Relation

`Relation` define metadata para carregamento explícito/deferido, eager e lazy de relações. Marque uma relação lazy com `lazy: true` quando a propriedade usa um wrapper lazy.

```php
use Bootgly\ADI\Databases\SQL\Model\Auxiliaries\Relations;
use Bootgly\ADI\Databases\SQL\Model\Relation;

/** @var array<int,Post> */
#[Relation(Relations::HasMany, Post::class, 'id', 'user')]
public array $Posts = [];

#[Relation(Relations::BelongsTo, User::class, 'user', 'id', name: 'author')]
public null|User $Author = null;
```

A relação armazena classe alvo, chave local, chave estrangeira e campos opcionais de pivot. `Repository::load()`, `Selection::load()` e wrappers lazy usam essa metadata para criar operações de relação em lote.
