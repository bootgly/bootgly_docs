# ORM Model

`Bootgly\ADI\Databases\SQL\Model` é o mapeamento compilado de uma classe de entidade: a tabela
dela, a chave primária, a coluna por trás de cada propriedade guardada e as relações, lidos dos
attributes da classe. Um repositório compila o SQL dele a partir desse mapeamento e hidrata linhas
por ele: a entidade em si nunca lê nem escreve no banco, e é isso que faz do ORM um Data Mapper
(veja **[Que tipo de ORM é este?](/guide/database-orm/overview/#que-tipo-de-orm-é-este)**). Esta
página cobre o que faz de uma classe uma entidade, como a metadata dela é compilada e cacheada, os
erros que um mapeamento ruim lança e como as propriedades da entidade são tipadas, construídas e
herdadas. Os attributes em si estão em
**[Attributes ORM](/manual/ADI/Databases/SQL/Model/Attributes/overview/)**, e rodar queries com uma
entidade em **[ORM Repository](/manual/ADI/Databases/SQL/Repository/overview/)**.

> Procurando primeiro o fluxo prático? Comece pelo guia
> **[ORM de banco](/guide/database-orm/overview/)**.

## Mapeie uma entidade

Uma entidade é uma classe PHP simples, sem classe base para estender e sem interface para
implementar. `#[Table]` nomeia a tabela dela, `#[Key]` marca a chave primária, e `#[Column]` marca
toda outra propriedade que o banco guarda:

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

   #[Column('email')]
   public string $mail = '';

   public string $greeting = 'Hello';
}

$Database = new SQL(new DatabaseConfig(BOOTGLY_PROJECT->Configs->get('database'))->configure());

$Users = $Database->map(User::class);

$Users->Model->table;   // 'users'
$Users->Model->columns; // ['id' => 'id', 'name' => 'name', 'email' => 'mail']
```

O `map()` compila a classe em um `Model` na primeira vez que a encontra, e devolve um repositório
que carrega o model como `$Model`; ele não abre conexão. `$mail` é guardada na coluna `email`.
`$greeting` não carrega attribute, então não é mapeada: o ORM nunca a lê nem a escreve, e um `User`
hidratado mantém o padrão dela. O exemplo abre o `$Database` a partir do escopo de config
`database` do projeto; em uma rota do `HTTP_Server_CLI`, chame `$Response->Database->map()` no
lugar, e fora de um projeto passe a conexão como array (veja
**[Abra um banco](/manual/ADI/Databases/SQL/overview/#abra-um-banco)**).

Uma classe é mapeada quando:

- carrega exatamente um `#[Table]`;
- exatamente uma propriedade carrega `#[Key]`. A chave primária é uma coluna: chaves compostas não
  são suportadas;
- cada propriedade guardada carrega um `#[Column]`, ou o `#[Key]`, e duas propriedades nunca
  nomeiam a mesma coluna;
- cada propriedade de relação carrega um `#[Relation]`, com um nome que nenhuma outra relação da
  classe usa.

Propriedades mapeadas podem ser `public`, `protected` ou `private`: o ORM as lê e escreve por
reflection. Nunca mapeie uma propriedade `static`: o ORM a mapeia como qualquer outra, então cada
entidade que ele hidrata escreve o único valor que todas compartilham.
[Erros de mapeamento](#erros-de-mapeamento) lista o que quebrar uma regra lança.

## Leia a metadata

O model compilado é dado simples. Com o `User` acima:

```php
$Model = $Users->Model;

$Model->table;       // 'users'
$Model->key;         // 'id': the primary key column
$Model->keyProperty; // 'id': the property that holds it
$Model->generated;   // true: the database assigns the key
$Model->columns;     // ['id' => 'id', 'name' => 'name', 'email' => 'mail']
$Model->properties;  // ['id' => 'id', 'name' => 'name', 'mail' => 'email']
$Model->insertions;  // ['name' => 'name', 'email' => 'mail']
$Model->updates;     // ['name' => 'name', 'email' => 'mail']

$Model->identify('mail');  // 'email'
$Model->resolve('email');  // 'mail'
```

`columns` mapeia cada coluna para a propriedade dela e `properties` o caminho inverso, a chave
incluída. `insertions` e `updates` guardam as colunas que um INSERT e um UPDATE escrevem: uma chave
gerada não está em nenhum dos dois, e as flags `insert:` e `update:` de
**[Column](/manual/ADI/Databases/SQL/Model/Attributes/overview/#column)** tiram uma coluna de um ou
do outro. `identify()` transforma um nome de propriedade na coluna dela e `resolve()` uma coluna na
propriedade dela; os dois devolvem inalterado um nome que não mapeiam. Toda propriedade e todo
método do model estão na [Referência](#referência).

## Compilação e cache

```php
use Bootgly\ADI\Databases\SQL\Model;

$Cached = $Database->Models->fetch(User::class);
$Cached === $Users->Model;               // true

$Compiled = Model::reflect(User::class);
$Compiled === $Cached;                   // false
$Compiled->columns === $Cached->columns; // true
```

- `Models::fetch()` compila uma classe na primeira chamada e devolve o mesmo `Model` depois. Cada
  fachada `SQL` tem um `Models`, `$Database->Models`, que o `map()` dela, o `map()` das transações
  dela e o `$Response->Database->map()` em uma rota compartilham. Outra instância de `SQL` compila
  a própria cópia.
- `Model::reflect()` compila a classe em toda chamada, não cacheia nada e não precisa de banco. Use-o
  para conferir um mapeamento em um teste, sem conexão para abrir.
- Um erro de mapeamento é lançado pelo primeiro `map()` da classe, ou pelo primeiro carregamento de
  uma relação que aponta para ela. Uma compilação que falhou não é cacheada, então toda chamada
  seguinte lança de novo.

Só a metadata é cacheada. Cada chamada de `map()` devolve um repositório novo, com um identity map
próprio, então crie repositórios por request, job ou transação.

## Erros de mapeamento

`map()`, `Models::fetch()` e `Model::reflect()` lançam uma `InvalidArgumentException` para uma
classe que quebra uma regra de mapeamento. `<class>` representa o nome da classe, `<property>` a
propriedade, `<column>` a coluna e `<name>` o nome da relação:

| Mapeamento | Mensagem |
|---|---|
| Nenhum `#[Table]`, ou dois | `ORM entity requires one Table attribute: <class>` |
| `#[Table('')]` | `ORM table name cannot be empty.` |
| Nenhum `#[Key]` | `ORM entity requires one primary key: <class>` |
| `#[Key]` em duas propriedades | `ORM entity accepts one primary key: <class>` |
| `#[Key]` e `#[Column]` em uma propriedade | `ORM property cannot have both Key and Column attributes: <class>::$<property>` |
| Dois `#[Column]`, ou dois `#[Key]`, em uma propriedade | `ORM property accepts one mapping attribute: <class>::$<property>` |
| Duas propriedades em uma coluna, a da chave incluída | `ORM column is mapped twice: <column>` |
| `#[Column('')]` ou `#[Key('')]` | `ORM column name cannot be empty.` |
| Duas relações com um mesmo nome | `ORM relation is mapped twice: <name>` |
| Uma chave `local` ou `foreign` vazia em `#[Relation]` | `ORM relation keys cannot be empty.` |
| `name: ''` em `#[Relation]` | `ORM relation name cannot be empty.` |

A tabela é conferida primeiro, depois cada propriedade, depois a presença da chave, e o primeiro
problema encontrado é lançado. Mais duas falhas vêm do próprio PHP: uma classe que não existe lança
uma `ReflectionException` (`Class "<class>" does not exist`), e dois `#[Relation]` em uma
propriedade lançam um `Error` (`Attribute "Bootgly\ADI\Databases\SQL\Model\Relation" must not be repeated`).

A compilação não confere o que só pode falhar depois:

- a classe `target` de uma relação, as chaves `local` e `foreign` dela e o pivot de um
  `BelongsToMany` são conferidos quando a relação é carregada pela primeira vez (veja
  **[Relation](/manual/ADI/Databases/SQL/Model/Attributes/overview/#relation)**);
- a tabela e as colunas dela são conferidas pelo banco, que recusa a primeira query que nomeia uma
  errada;
- os tipos das propriedades encontram os valores quando linhas são hidratadas e entidades salvas,
  como [Propriedades da entidade](#propriedades-da-entidade) explica.

## Propriedades da entidade

### Tipos

A hidratação converte um valor escalar para uma propriedade `bool`, `int`, `float` ou `string` e
deixa qualquer outro valor para a checagem de tipo do próprio PHP, então tipe `null|T` toda
propriedade cuja coluna pode guardar `NULL`: as regras, os erros que elas lançam e os casos que
falham por enquanto estão em
**[Linhas em propriedades](/manual/ADI/Databases/SQL/Repository/Hydration/overview/#linhas-em-propriedades)**.

Uma propriedade enum ou `array` não consegue guardar uma coluna: nenhum driver decodifica uma coluna
em uma delas, e todo driver recusa uma delas como parâmetro do `save()`. Mapeie o valor guardado,
como a `string` de um documento JSON ou do valor de um enum, e converta-o no seu próprio código.

O que cada driver devolve para cada tipo de coluna está em
**[Tipos SQL](/manual/ADI/Databases/SQL/Drivers/Types/overview/#resultados)**, e datas e horas têm
uma seção própria abaixo.

### Construção e valores padrão

- Cada entidade nova de que uma hidratação precisa vem de `Model::create()`. Ele roda o construtor
  quando o construtor não tem parâmetro obrigatório, uma vez por objeto novo e nunca para um objeto
  que o identity map devolve. Senão, ele cria o objeto sem chamar o construtor: as propriedades
  mantêm os padrões declarados, e uma propriedade sem padrão fica não inicializada até uma linha
  preenchê-la.
- Propriedades promovidas no construtor são mapeadas como as declaradas, porque os attributes em um
  parâmetro promovido valem para a propriedade dele.
- O ORM lê como `null` uma propriedade que não está inicializada. Uma chave gerada deixada sem
  inicializar é, portanto, salva como uma linha nova, e qualquer outra coluna que ele insere como
  `NULL`, exceto uma `generated`, que o banco preenche.
- Uma chave gerada precisa ler `null` em uma entidade nova: declare-a `null|int $id = null`, ou
  deixe-a sem inicializar. Com `int $id = 0`, o `save()` de uma entidade nova é um `UPDATE` da linha
  cuja chave é `0`, não um `INSERT` (veja
  **[Salvar entidades](/manual/ADI/Databases/SQL/Repository/overview/#salvar-entidades)**).

### Propriedades readonly

```php
use Bootgly\ADI\Databases\SQL\Model\Column;
use Bootgly\ADI\Databases\SQL\Model\Key;
use Bootgly\ADI\Databases\SQL\Model\Table;

#[Table('codes')]
class Code
{
   #[Key]
   public null|int $id = null;

   #[Column]
   public readonly string $code;

   public function __construct (string $code)
   {
      $this->code = $code;
   }
}

$Codes = $Database->map(Code::class);

$Code = $Codes->hydrate($Database->await($Codes->save(new Code('A-17'))))->entity;

$Code->code; // 'A-17'
```

- A hidratação preenche uma propriedade `readonly` que ainda não está inicializada. Aqui o parâmetro
  obrigatório do construtor faz o `create()` pular o construtor, então um `Code` hidratado a partir
  de uma linha recebe o `code` dessa linha.
- Quando a propriedade já guarda um valor — de uma linha, ou de um construtor sem parâmetros
  obrigatórios —, uma linha seguinte precisa concordar com ele: o que a hidratação mantém, recusa e
  lança está em
  **[Propriedades readonly](/manual/ADI/Databases/SQL/Repository/Hydration/overview/#propriedades-readonly)**.

### Herança

Uma classe não herda `#[Table]`: uma entidade que estende outra declara o seu, ou o `map()` lança
`ORM entity requires one Table attribute: <class>`. Ela então mapeia as próprias propriedades e as
propriedades mapeadas `public` e `protected` das classes-pai; as propriedades `private` de uma
classe-pai não são mapeadas. Um repositório aceita um objeto da classe da entidade dele ou de uma
subclasse, e escreve só as colunas que o próprio model mapeia.

## Datas e horas

Cada driver devolve colunas temporais do seu jeito, e o PostgreSQL só as aceita de volta como
strings, por enquanto:

| Driver | Um `date` ou `timestamp` é hidratado como | O `save()` aceita |
|---|---|---|
| PostgreSQL | `DateTimeImmutable` | Uma string. Um `DateTimeInterface` faz a operação falhar com `PostgreSQL parameter must be scalar or null.` |
| MySQL | `DateTimeImmutable`; uma data zero continua string | Uma string ou um `DateTimeInterface` |
| SQLite | A string que foi guardada | Uma string ou um `DateTimeInterface` |

Tipe uma propriedade temporal para os drivers em que ela roda: `null|DateTimeImmutable` no
PostgreSQL e no MySQL, `null|string` no SQLite, e `null|DateTimeImmutable|string` para código que
roda nos três. No PostgreSQL, toda coluna temporal que o `save()` escreve precisa guardar uma
string, também depois que o `hydrate()` pôs um `DateTimeImmutable` nela, já que um UPDATE escreve
toda coluna com que a entidade foi hidratada. Uma coluna que o banco preenche, como uma data de
criação, fica fora das escritas com `insert: false, update: false`. Com uma tabela cujo
`created_at` tem como padrão a hora atual:

```php
use DateTimeImmutable;

use Bootgly\ADI\Databases\SQL\Model\Column;
use Bootgly\ADI\Databases\SQL\Model\Key;
use Bootgly\ADI\Databases\SQL\Model\Table;

#[Table('events')]
class Event
{
   #[Key]
   public null|int $id = null;

   #[Column]
   public string $title = '';

   #[Column('starts_at')]
   public null|DateTimeImmutable|string $StartsAt = null;

   #[Column('created_at', insert: false, update: false)]
   public null|DateTimeImmutable|string $CreatedAt = null;
}

$Events = $Database->map(Event::class);

$Event = new Event;
$Event->title = 'Launch';
$Event->StartsAt = new DateTimeImmutable('2026-11-05 09:30:00')->format('Y-m-d H:i:s');

$Event = $Events->hydrate($Database->await($Events->save($Event)))->entity ?? $Event;

$StartsAt = $Event->StartsAt instanceof DateTimeImmutable
   ? $Event->StartsAt
   : new DateTimeImmutable($Event->StartsAt);

$Event->title = 'Launch day';
$Event->StartsAt = $StartsAt->modify('+1 day')->format('Y-m-d H:i:s');

$Database->await($Events->save($Event));
```

No PostgreSQL, a linha que o INSERT devolve já põe objetos `DateTimeImmutable` em `StartsAt` e
`CreatedAt`. No MySQL e no SQLite, `StartsAt` mantém a string que você atribuiu, e `CreatedAt` fica
`null` até o próximo `find()`. De todo jeito, `StartsAt` é normalizado para um objeto com que
trabalhar, e formatado de volta para string antes do próximo `save()`. Mantenha as datas em um
mesmo fuso de ponta a ponta, como
**[Escreva código portável](/manual/ADI/Databases/SQL/Drivers/Types/overview/#escreva-código-portável)**
recomenda, e veja **[Datas no PostgreSQL](/manual/ADI/Databases/SQL/Drivers/Types/overview/#datas-no-postgresql)**
para o formato que cada tipo de data e hora do PostgreSQL guarda.

## Referência

### Model

```php
__construct (
   string $class,
   string $table,
   string $key,
   string $keyProperty,
   bool $generated,
   array $columns,
   array $properties,
   array $definitions,
   array $insertions,
   array $updates,
   array $relations,
   array $relationProperties,
   array $Reflections,
   ReflectionClass $Class
)
```

Monta um model a partir de partes compiladas. `Model::reflect()` o chama; aplicações não.

```php
static reflect (string $class): self
```

Compila o mapeamento de `$class` a partir dos attributes dela, em toda chamada, sem cache e sem
banco. Lança `InvalidArgumentException` para uma classe que quebra uma regra de mapeamento (veja
[Erros de mapeamento](#erros-de-mapeamento)) e `ReflectionException` para uma classe que não
existe.

```php
create (): object
```

Cria uma entidade para uma hidratação: pelo construtor quando ele não tem parâmetro obrigatório,
sem chamá-lo caso contrário.

```php
validate (object $Entity): void
```

Lança `InvalidArgumentException` com `ORM entity does not match model: <class>` a menos que
`$Entity` seja uma instância da classe mapeada ou de uma subclasse dela. `save()`, `delete()`,
`load()` e `attach()` o chamam.

```php
identify (string $name): string
```

Devolve a coluna da propriedade `$name`, ou `$name` inalterado quando nenhuma propriedade com esse
nome está mapeada.

```php
resolve (string $column): string
```

Devolve a propriedade de `$column`, ou `$column` inalterado quando nenhuma coluna com esse nome
está mapeada.

```php
read (object $Entity, string $property): mixed
```

Lê uma propriedade mapeada, uma coluna ou uma propriedade de relação, por reflection, qualquer que
seja a visibilidade dela; `null` enquanto a propriedade não está inicializada. Lança
`InvalidArgumentException` com `ORM property is not mapped: <property>` para qualquer outro nome.

```php
write (object $Entity, string $property, mixed $value): void
```

Escreve uma propriedade mapeada por reflection, sem conversão do ORM: a coerção do próprio PHP
ainda vale — `'5'` escrito em uma propriedade `int` vira `5` — e um valor que o PHP recusa lança o
`TypeError` dele. Lança a mesma `InvalidArgumentException` que `read()` para um nome que não está
mapeado.

```php
public private(set) string $class
```

A classe de entidade mapeada.

```php
public private(set) string $table
```

A tabela, como `#[Table]` a nomeia.

```php
public private(set) string $key
```

A coluna da chave primária.

```php
public private(set) string $keyProperty
```

A propriedade que guarda a chave primária.

```php
public private(set) bool $generated
```

Se o banco gera a chave: `true` para `#[Key]`, `false` para `#[Key(generated: false)]`. O `save()`
decide a partir dela.

```php
public private(set) array $columns
```

Nome de coluna → nome de propriedade, para toda coluna mapeada, a chave incluída, na ordem em que
as propriedades foram encontradas.

```php
public private(set) array $properties
```

Nome de propriedade → nome de coluna: `$columns` no caminho inverso.

```php
public private(set) array $definitions
```

Nome de coluna → o attribute que a mapeia: um `Key` para a chave, um `Column` para toda outra
coluna.

```php
public private(set) array $insertions
```

Nome de coluna → nome de propriedade, para as colunas que um INSERT escreve.

```php
public private(set) array $updates
```

Nome de coluna → nome de propriedade, para as colunas que um UPDATE escreve. A chave nunca está
entre elas.

```php
public private(set) array $relations
```

Nome da relação → o attribute `Relation` dela.

```php
public private(set) array $relationProperties
```

Nome da relação → a propriedade que guarda as entidades relacionadas.

```php
public private(set) array $Reflections
```

Nome de propriedade → a `ReflectionProperty` dela, para toda propriedade de coluna e de relação.

### Models

`Bootgly\ADI\Databases\SQL\Models` é o cache que uma fachada `SQL` mantém em `$Database->Models`.
Ele não tem construtor próprio.

```php
fetch (string $class): Model
```

Devolve o `Model` compilado de `$class`, compilando-o com `Model::reflect()` na primeira chamada.
Uma compilação que falhou não é guardada, então a chamada seguinte compila de novo e lança de novo.
