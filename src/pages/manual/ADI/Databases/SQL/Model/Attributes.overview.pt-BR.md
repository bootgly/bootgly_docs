# Attributes ORM

Quatro attributes em `Bootgly\ADI\Databases\SQL\Model` mapeiam uma entidade: `Table` na classe, `Key`
e `Column` nas propriedades que o banco guarda, e `Relation` nas propriedades que guardam entidades
relacionadas. `Model::reflect()` os lê quando uma classe é mapeada pela primeira vez. O que faz uma
classe ser mapeável, os erros que um mapeamento ruim lança e como tipar as propriedades estão em
**[ORM Model](/manual/ADI/Databases/SQL/Model/overview/)**.

As seções abaixo usam estas entidades:

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

   #[Column('created_at', insert: false, update: false)]
   public null|DateTimeImmutable|string $CreatedAt = null;

   /** @var array<int,Post> */
   #[Relation(Relations::HasMany, Post::class, 'id', 'user')]
   public array $Posts = [];

   #[Relation(Relations::HasOne, Profile::class, 'id', 'user')]
   public null|Profile $Profile = null;

   /** @var array<int,Team> */
   #[Relation(Relations::BelongsToMany, Team::class, 'id', 'id', table: 'memberships', pivotLocal: 'user_id', pivotForeign: 'team_id')]
   public array $Teams = [];
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

   #[Relation(Relations::BelongsTo, User::class, 'user', 'id', name: 'author')]
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

#[Table('teams')]
class Team
{
   #[Key]
   public null|int $id = null;

   #[Column]
   public string $name = '';
}
```

Elas mapeiam as tabelas `users (id, name, created_at)`, com `created_at` tendo como padrão a hora
atual, `posts (id, user_id, title)`, `profiles (id, user_id, bio)`, `teams (id, name)` e a tabela
pivot `memberships (user_id, team_id)`. Todo `id` é gerado pelo banco. Os exemplos rodam sobre o
`$Database`, a fachada SQL, aberta como **[Abra um banco](/manual/ADI/Databases/SQL/overview/#abra-um-banco)**
mostra.

## Table

```php
#[Table('users')]
class User
```

`Table` nomeia a tabela da entidade. Uma classe carrega exatamente um, e uma subclasse declara o seu
(veja **[Herança](/manual/ADI/Databases/SQL/Model/overview/#herança)**).

O nome vai entre aspas de identificador em toda instrução, então escreva-o exatamente como a tabela
se chama: o PostgreSQL compara um nome entre aspas diferenciando maiúsculas, e o MySQL também, por
padrão, no Linux, então `#[Table('Users')]` não encontra uma tabela criada como `users`. Um nome com
ponto vai entre aspas parte por parte: `#[Table('billing.invoices')]` mapeia a tabela `invoices` do
schema `billing` no PostgreSQL, ou do banco `billing` no MySQL. Um nome vazio lança
`ORM table name cannot be empty.`

## Key

```php
#[Key]
public null|int $id = null;
```

`Key` marca a chave primária: uma propriedade por entidade, uma coluna. A coluna é o nome da
propriedade, ou o nome que você passa, como em `#[Key('user_id')]`. Um UPDATE nunca escreve a
chave, que é o `WHERE` da instrução. Quem atribui a chave decide como o `save()` escolhe entre
`INSERT` e `UPDATE`, como os dois casos abaixo resumem; o roteamento completo, com os casos que o
identity map ainda não cobre, está em
**[Salvar entidades](/manual/ADI/Databases/SQL/Repository/overview/#salvar-entidades)**.

### Chaves geradas

`#[Key]` sozinho significa `generated: true`: o banco atribui a chave, com `serial` ou uma coluna
identity no PostgreSQL, `AUTO_INCREMENT` no MySQL e `INTEGER PRIMARY KEY` no SQLite. O INSERT deixa
a coluna da chave de fora, e hidratar o `save()` escreve a chave gerada no objeto que você salvou. O
`save()` insere enquanto a chave lê `null` e atualiza a linha com essa chave nos outros casos, então
declare a chave `null|int $id = null`, ou deixe-a sem inicializar (veja
**[Construção e valores padrão](/manual/ADI/Databases/SQL/Model/overview/#construção-e-valores-padrão)**).

### Chaves atribuídas pela aplicação

```php
use Bootgly\ADI\Databases\SQL\Model\Column;
use Bootgly\ADI\Databases\SQL\Model\Key;
use Bootgly\ADI\Databases\SQL\Model\Table;

#[Table('settings')]
class Setting
{
   #[Key(generated: false)]
   public null|string $name = null;

   #[Column]
   public string $value = '';
}

$Settings = $Database->map(Setting::class);

$Setting = new Setting;
$Setting->name = 'theme';
$Setting->value = 'dark';

$Database->await($Settings->save($Setting));

$Setting = $Settings->hydrate($Database->await($Settings->find('theme')))->entity;
$Setting->value = 'light';

$Database->await($Settings->save($Setting));
```

`#[Key(generated: false)]` deixa a chave para a aplicação: o INSERT a escreve, e um UPDATE nunca. Uma
chave que já está definida não diz ao `save()` se a linha dela existe, então o `save()` pergunta ao
identity map do repositório: uma chave que o repositório rastreia, porque hidratou a linha, significa
um UPDATE, e qualquer outra chave um INSERT — daí o `find()` antes da mudança acima. O que isso
significa para uma entidade que você montou, um segundo save, uma chave `null` ou uma excluída está
em **[Salvar entidades](/manual/ADI/Databases/SQL/Repository/overview/#salvar-entidades)**.

## Column

```php
#[Column]
public string $name = '';

#[Column('created_at', insert: false, update: false)]
public null|DateTimeImmutable|string $CreatedAt = null;
```

`Column` mapeia uma propriedade guardada. As opções dele:

| Opção | Padrão | Efeito |
|---|---|---|
| `name` | `null` | A coluna. `null` usa o nome da propriedade. Um nome vazio lança `ORM column name cannot be empty.` |
| `insert` | `true` | `false` deixa a coluna fora de todo INSERT, então o padrão do banco a preenche. |
| `update` | `true` | `false` deixa a coluna fora de todo UPDATE. |
| `generated` | `false` | `true` deixa a coluna fora de um INSERT ou de um UPDATE enquanto a propriedade guarda `null`, e deixa uma linha omitir a coluna. Um valor é escrito como qualquer outro. |
| `nullable` | `false` | `true` deixa uma linha omitir a coluna. Não faz a propriedade aceitar `null`: quem decide isso é o tipo da propriedade. |

Cada flag age sozinha. Em uma tabela que dá a `score` o padrão `10` e a `created_at` a hora atual:

```php
use DateTimeImmutable;

use Bootgly\ADI\Databases\SQL\Model\Column;
use Bootgly\ADI\Databases\SQL\Model\Key;
use Bootgly\ADI\Databases\SQL\Model\Table;

#[Table('accounts')]
class Account
{
   #[Key]
   public null|int $id = null;

   #[Column]
   public string $email = '';

   #[Column(update: false)]
   public string $plan = 'free';

   #[Column(generated: true)]
   public null|int $score = null;

   #[Column(nullable: true)]
   public null|string $nick = null;

   #[Column('created_at', insert: false, update: false)]
   public null|DateTimeImmutable|string $CreatedAt = null;
}

$Accounts = $Database->map(Account::class);

$Account = new Account;
$Account->email = 'ada@example.test';
$Account->plan = 'pro';

$Account = $Accounts->hydrate($Database->await($Accounts->save($Account)))->entity ?? $Account;

$Account->email = 'ada@lovelace.test';
$Account->plan = 'team';
$Database->await($Accounts->save($Account));

$Account = $Accounts->hydrate($Database->await($Accounts->find($Account->id)))->entity;

$Account->email; // 'ada@lovelace.test'
$Account->plan;  // 'pro': update: false kept the inserted value
$Account->score; // 10: the INSERT left the null out, so the column default applied
```

### Colunas que o banco preenche

```php
use Bootgly\ADI\Databases\SQL\Model\Column;
use Bootgly\ADI\Databases\SQL\Model\Key;
use Bootgly\ADI\Databases\SQL\Model\Table;

#[Table('lines')]
class Line
{
   #[Key]
   public null|int $id = null;

   #[Column]
   public int $quantity = 0;

   #[Column]
   public int $price = 0;

   #[Column(insert: false, update: false)]
   public null|int $total = null;
}
```

- Uma coluna que o banco sempre calcula ou carimba, como o `total` acima, declarado
  `GENERATED ALWAYS AS (quantity * price) STORED`, ou uma data de criação, recebe
  `insert: false, update: false`. `generated: true` não basta para ela: depois que uma hidratação
  preenche a propriedade, o UPDATE seguinte escreve o valor de volta, e o banco o recusa. O
  PostgreSQL responde `column "total" can only be updated to DEFAULT`, o MySQL
  `3105: The value specified for generated column 'total' in table 'lines' is not allowed.` e o
  SQLite `Unable to prepare statement: cannot UPDATE generated column "total"`.
- `generated: true` serve para uma coluna que o banco preenche só quando você não dá valor, um padrão
  que você pode sobrescrever, como `score` em `Account`.
- Com `insert: false` sozinho, a coluna continua gravável por um UPDATE, e por enquanto, no MySQL e
  no SQLite, o próximo `save()` depois do INSERT escreve o padrão da classe sobre o valor do banco,
  como **[Salvar entidades](/manual/ADI/Databases/SQL/Repository/overview/#salvar-entidades)**
  explica: faça `find()` da entidade antes de mudá-la, ou acrescente `update: false`.

Colunas temporais têm mais uma restrição no PostgreSQL, que recusa um `DateTimeImmutable` no
`save()` por enquanto: veja **[Datas e horas](/manual/ADI/Databases/SQL/Model/overview/#datas-e-horas)**.

### Linhas sem uma coluna

Um repositório seleciona toda coluna mapeada, então uma linha só deixa de trazer uma quando você
hidrata uma query sua: uma coluna `nullable` ou `generated` pode então faltar, e qualquer outra
lança, como
**[Colunas ausentes e extras](/manual/ADI/Databases/SQL/Repository/Hydration/overview/#colunas-ausentes-e-extras)**
mostra. A paginação por cursor se recusa a ordenar por uma coluna `nullable` (veja
**[Paginação ORM](/manual/ADI/Databases/SQL/Repository/Pagination/overview/#ordenar-uma-caminhada-por-cursor)**).

## Relation

```php
#[Relation(Relations::HasMany, Post::class, 'id', 'user')]
public array $Posts = [];
```

`Relation` mapeia uma propriedade que guarda entidades relacionadas. Os parâmetros dele, em ordem:

- `Type`: o tipo de relação, um case de `Relations`: `HasOne`, `HasMany`, `BelongsTo` ou
  `BelongsToMany`.
- `target`: a classe da entidade relacionada, que também precisa ser mapeada. Ela é compilada quando
  a relação é carregada pela primeira vez, então uma classe errada falha nessa hora, com o erro de
  mapeamento dela.
- `local`: a coluna desta entidade em que a relação casa, nomeada pela propriedade ou pela coluna.
- `foreign`: a coluna do alvo com que ela casa, nomeada pela propriedade ou pela coluna.
- `table`, `pivotLocal`, `pivotForeign`: só para `BelongsToMany`. A tabela pivot, a coluna dela que
  guarda o valor `local` desta entidade, e a coluna dela que guarda o valor `foreign` do alvo. O
  pivot não tem entidade, então esses são nomes de coluna. Um `BelongsToMany` sem os três lança
  `ORM belongsToMany relation requires pivot table and keys.` quando é carregado.
- `name`: o nome da relação em `load()`, `Selection::load()`, `attach()` e nas chaves de
  `$Mapped->loads`. O padrão é o nome da propriedade, e ele diferencia maiúsculas: `$Posts` é
  carregada como `'Posts'`, nunca como `'posts'`. Um nome vazio lança
  `ORM relation name cannot be empty.`
- `lazy`: `true` põe um wrapper lazy na propriedade na hidratação, que carrega a relação no primeiro
  acesso (veja **[Relações ORM](/manual/ADI/Databases/SQL/Repository/Relations/overview/)**).

Um `local` ou `foreign` vazio lança `ORM relation keys cannot be empty.` Com as entidades do topo da
página, as relações são carregadas pelo nome:

```php
$Users = $Database->map(User::class, Awaiting: $Database);

$Mapped = $Users->hydrate($Database->await(
   $Users->fetch($Users->select()->load('Posts', 'Profile', 'Teams'))
));

foreach ($Mapped->entities as $User) {
   $User->Posts;   // the user's posts, an array of Post
   $User->Profile; // a Profile, or null
   $User->Teams;   // the user's teams, through memberships
}

$Posts = $Database->map(Post::class, Awaiting: $Database);

$Mapped = $Posts->hydrate($Database->await(
   $Posts->fetch($Posts->select()->load('author'))
));

$Mapped->entities[0]->Author; // the User who wrote the post
```

`Awaiting: $Database` faz o `hydrate()` carregar e anexar as relações sozinho; sem ele elas voltam
como operações para aguardar, como
**[Relações ORM](/manual/ADI/Databases/SQL/Repository/Relations/overview/)** mostra.

### Chaves por tipo

Uma entidade relacionada pertence a uma entidade-pai quando o valor `foreign` dela é igual ao valor
`local` da pai. Para `BelongsToMany`, uma linha do pivot as liga no lugar: ela guarda o valor `local`
da pai em `pivotLocal` e o valor `foreign` do alvo em `pivotForeign`.

| Tipo | `local`, nesta entidade | `foreign`, no alvo | Propriedade | Propriedade lazy |
|---|---|---|---|---|
| `HasOne` | A chave para a qual o alvo aponta, em geral a chave primária | A coluna do alvo que aponta de volta | `null\|Target` | `LazyReference` |
| `HasMany` | A chave para a qual os alvos apontam | A coluna dos alvos que aponta de volta | `array` | `LazyCollection` |
| `BelongsTo` | A coluna que aponta para o alvo | A chave para a qual ela aponta, em geral a chave primária | `null\|Target` | `LazyReference` |
| `BelongsToMany` | A chave para a qual o pivot aponta | A chave do alvo para a qual o pivot aponta | `array` | `LazyCollection` |

As duas chaves são conferidas quando a relação é carregada. Um `local` que não é uma coluna mapeada
desta entidade lança `ORM property is not mapped: <local>`. Um `foreign` que não é uma coluna do alvo
falha no PostgreSQL e no MySQL com o erro de coluna desconhecida do banco, mas no SQLite a relação é
carregada vazia, sem erro.

### Propriedades de relação

- Uma relação singular escreve `null` quando nada casa, então tipe a propriedade dela `null|Target`.
  Uma propriedade tipada só `Target` lança o `TypeError` do PHP:
  `Cannot assign null to property User::$Profile of type Profile`.
- Uma relação plural escreve um array, vazio quando nada casa.
- Uma propriedade `lazy: true` precisa conseguir guardar o wrapper dela, um `LazyCollection` ou um
  `LazyReference`: os tipos que ela aceita, o padrão a dar a ela e as entidades que ficam sem
  wrapper por enquanto estão em
  **[Política lazy](/manual/ADI/Databases/SQL/Repository/Relations/overview/#política-lazy)**.
- O `save()` nunca escreve uma propriedade de relação: acrescentar um `Post` a `$User->Posts` muda
  só o objeto. Salve entidades relacionadas pelo repositório delas, e escreva linhas do pivot com o
  **[Query Builder](/manual/ADI/Databases/SQL/Builder/Writing/overview/)**.

## Referência

### Table

`#[Attribute(Attribute::TARGET_CLASS)]`

```php
__construct (string $name)
```

Mapeia a classe para a tabela `$name`. Lança `InvalidArgumentException` com
`ORM table name cannot be empty.` para um nome vazio.

```php
public private(set) string $name
```

O nome da tabela.

### Key

`#[Attribute(Attribute::TARGET_PROPERTY)]`. `Key` estende `Column`, então uma chave é uma coluna com
flags fixas, e as propriedades dela são as de [Column](#column-1).

```php
__construct (null|string $name = null, bool $generated = true)
```

Mapeia a chave primária. `$name` é a coluna, `null` para o nome da propriedade. `$generated` é
copiado para `generated`, e `insert` é o oposto dele: uma chave gerada nunca é inserida, uma
atribuída pela aplicação é. `update` e `nullable` são sempre `false`. Lança a
`InvalidArgumentException` de `Column` para um nome vazio.

### Column

`#[Attribute(Attribute::TARGET_PROPERTY)]`

```php
__construct (
   null|string $name = null,
   bool $insert = true,
   bool $update = true,
   bool $generated = false,
   bool $nullable = false
)
```

Mapeia uma propriedade guardada. Lança `InvalidArgumentException` com
`ORM column name cannot be empty.` para um nome vazio.

```php
public private(set) null|string $name
```

A coluna, ou `null` quando o nome da propriedade é a coluna.

```php
public private(set) bool $insert
```

Se um INSERT escreve a coluna.

```php
public private(set) bool $update
```

Se um UPDATE escreve a coluna.

```php
public private(set) bool $generated
```

Se o banco preenche a coluna quando a propriedade guarda `null`: INSERT e UPDATE a deixam de fora, e
uma linha pode omiti-la.

```php
public private(set) bool $nullable
```

Se uma linha pode omitir a coluna. A paginação por cursor se recusa a ordenar por uma coluna
`nullable`.

### Relation

`#[Attribute(Attribute::TARGET_PROPERTY)]`, uma vez por propriedade.

```php
__construct (
   Relations $Type,
   string $target,
   string $local,
   string $foreign,
   null|string $table = null,
   null|string $pivotLocal = null,
   null|string $pivotForeign = null,
   null|string $name = null,
   bool $lazy = false
)
```

Mapeia uma propriedade de relação. Lança `InvalidArgumentException` com
`ORM relation keys cannot be empty.` para um `$local` ou `$foreign` vazio, e com
`ORM relation name cannot be empty.` para um `$name` vazio.

```php
public private(set) Relations $Type
```

O tipo de relação.

```php
public private(set) string $target
```

A classe da entidade relacionada.

```php
public private(set) string $local
```

A chave nesta entidade, por nome de propriedade ou de coluna.

```php
public private(set) string $foreign
```

A chave no alvo, por nome de propriedade ou de coluna.

```php
public private(set) null|string $table
```

A tabela pivot de um `BelongsToMany`.

```php
public private(set) null|string $pivotLocal
```

A coluna do pivot que guarda o valor `local` desta entidade.

```php
public private(set) null|string $pivotForeign
```

A coluna do pivot que guarda o valor `foreign` do alvo.

```php
public private(set) null|string $name
```

O nome passado ao attribute, ou `null`: o model então nomeia a relação pela propriedade dela.

```php
public private(set) bool $lazy
```

Se a hidratação instala um wrapper lazy em vez de deixar a relação para o `load()`.

### Relations

`Bootgly\ADI\Databases\SQL\Model\Auxiliaries\Relations`, um enum sem valores de backing.

```php
case BelongsTo;
```

Esta entidade guarda a chave de um alvo.

```php
case BelongsToMany;
```

Muitos alvos, ligados a esta entidade por uma tabela pivot.

```php
case HasMany;
```

Muitos alvos guardam a chave desta entidade.

```php
case HasOne;
```

Um alvo guarda a chave desta entidade.

### Auxiliaries

`Bootgly\ADI\Databases\SQL\Model\Auxiliaries`, o registro dos enums auxiliares do model.

```php
static check (string $class): bool
```

Se `$class` é um dos enums auxiliares do model.

```php
const array ENUMS
```

As classes de enum auxiliares: `Relations`.
