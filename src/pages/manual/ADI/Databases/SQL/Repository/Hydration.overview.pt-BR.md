# Hidratação ORM

O `hydrate()` é onde linhas viram entidades. Um repositório compõe suas operações — `find()`,
`fetch()`, `paginate()`, `save()`, `delete()` — e nunca espera por elas: você aguarda uma operação
e a passa ao `hydrate()`. Ele converte cada linha nas propriedades tipadas da entidade, mantém um
objeto por chave primária, grava de volta na entidade que você salvou a chave que o banco gerou e
carrega as relações que a seleção nomeou. Compor operações está em
**[ORM Repository](/manual/ADI/Databases/SQL/Repository/overview/)**, o carregamento de relações em
**[Relações ORM](/manual/ADI/Databases/SQL/Repository/Relations/overview/)**, e o que cada driver
devolve para uma coluna em **[Mapeamento de tipos](/manual/ADI/Databases/SQL/Drivers/Types/overview/)**.

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
vale true por padrão. Ela começa com uma linha — `1`, `'Ada'`, `'ada@example.com'` — e os exemplos,
rodados em ordem, dão os resultados que seus comentários mostram.

## Hidrate uma operação

```php
$Operation = $Database->await($Users->find(1));
$Mapped = $Users->hydrate($Operation);

$User = $Mapped->entity;

$User->name;   // 'Ada'
$User->active; // true
```

O `$Database->await()` conduz a operação até o fim, e o `hydrate()` lê as linhas dela. Quando o
repositório compôs a operação, anotou o que ela representa — as relações que uma seleção nomeou, a
entidade que um `save()` grava, a página que um `paginate()` pediu — e o `hydrate()` usa essa
anotação uma vez. Hidrate cada operação uma única vez: hidratada de novo, a mesma operação devolve
suas linhas sem esse contexto, então nenhuma relação é carregada, nenhuma paginação é resolvida e
nenhuma chave gerada é gravada de volta.

O `hydrate()` também aceita o `Result` de uma operação terminada, então linhas que não vieram do
repositório também viram entidades, desde que carreguem todas as colunas mapeadas — as linhas de uma
query que você mesmo escreveu, ou o `Result` que `$Response->Database->fetch()` devolve numa rota do
`HTTP_Server_CLI`:

```php
$Operation = $Database->await($Database->query('SELECT id, name, email, active FROM users ORDER BY id'));

$Mapped = $Users->hydrate($Operation->Result);

$Mapped->entity === $User; // true: the same row hydrates into the same object
```

### Operações não terminadas e com falha

No PostgreSQL e no MySQL, uma operação que você não aguardou ainda não tem resultado, e o
`hydrate()` a recusa com `ORM hydration requires a completed SQL result.` O SQLite roda a instrução
dentro da chamada que a compõe, então lá a operação já terminou — aguarde mesmo assim, para que o
mesmo código rode em todo driver.

Uma operação com falha lança o `error` dela como `RuntimeException`. O `$Database->await()` já o
lançou antes disso; isso importa onde a espera não lança. Numa rota do `HTTP_Server_CLI`, o
`$Response->Database->await()` devolve a operação com falha como ela está, então o `hydrate()` é a
primeira chamada que lança. Verifique `error` antes quando a rota deve responder à falha ela mesma:

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response;

return $Response->defer(function (Response $Response): void {
   $Database = $Response->Database;
   $Users = $Database->map(User::class);

   $Operation = $Database->await($Users->find(1));

   if ($Operation->error !== null) {
      $Response->code(503)->JSON->send(['error' => 'The database is unavailable.']);

      return;
   }

   $Response->JSON->send(['user' => $Users->hydrate($Operation)->entity]);
});
```

## Leia o resultado mapeado

O `hydrate()` devolve um resultado mapeado, `Bootgly\ADI\Databases\SQL\Repository\Result`:

```php
$Mapped = $Users->hydrate($Database->await($Users->fetch()));

$Mapped->count;          // 1
$Mapped->empty;          // false
$Mapped->entity;         // the first entity: $User
$Mapped->entities;       // every entity, in row order
$Mapped->Result->status; // 'SELECT 1'
$Mapped->loads;          // []
$Mapped->Pagination;     // null
```

- `entities` guarda toda entidade hidratada na ordem das linhas, e `entity` a primeira, ou `null` —
  o jeito de ler um `find()`. `count` e `empty` dizem quantas há.
- `Result` é o resultado do DBAL de onde as linhas vieram, com seus `rows`, `status`, `affected` e
  `inserted` (veja **[Resultado](/manual/ADI/Database/overview/#resultado)**). Leia ali a contagem
  `affected` de um delete: um `delete()` não é hidratado em entidade nenhuma.
- `loads` guarda as operações de relação que uma seleção nomeou em `load()`, indexadas pelo nome da
  relação, quando o repositório não tem ponte de await — aguarde e faça `attach()` de cada uma (veja
  **[Relações ORM](/manual/ADI/Databases/SQL/Repository/Relations/overview/)**). Com uma ponte, o
  `hydrate()` as anexa ele mesmo e `loads` fica vazio.
- `Pagination` guarda o resultado resolvido de uma operação de `paginate()`, e `null` para qualquer
  outra (veja **[Paginação ORM](/manual/ADI/Databases/SQL/Repository/Pagination/overview/)**).

## Linhas em propriedades

O `hydrate()` grava cada coluna mapeada de uma linha na sua propriedade, pelo tipo declarado da
propriedade:

| Tipo da propriedade | O que ela recebe |
|---|---|
| `bool`, `int`, `float` ou `string`, com ou sem `null\|` | Um valor escalar convertido com o `(bool)`, `(int)`, `(float)` ou `(string)` do PHP; qualquer outro valor como o driver o decodificou |
| Uma classe — `DateTimeImmutable`, um value object | O valor como o driver o decodificou |
| Uma união de dois ou mais tipos, como `int\|string` | O valor como o driver o decodificou |
| `mixed`, `object`, ou sem tipo | O valor como o driver o decodificou |

As conversões são o que faz uma entidade ser lida igual em todo driver: o `true` de `$User->active`
acima é o `1` que MySQL e SQLite devolvem para um `BOOLEAN`, e uma propriedade `float` transforma o
`'19.90'` que PostgreSQL e MySQL devolvem para um `DECIMAL` em `19.9`. São os casts do PHP, não uma
validação: uma string de letras vira `0` numa propriedade `int`, e um float perde a parte
fracionária. O hidratador recusa dois valores em vez disso:

- `null` para uma propriedade cujo tipo único não o permite:
  `ORM cannot assign null to non-nullable property: name` — a mensagem nomeia a propriedade, não a
  classe.
- Uma string de dígitos além de `PHP_INT_MAX` para uma propriedade `int` — o MySQL devolve uma para
  um `BIGINT UNSIGNED` acima de 2^63:
  `ORM cannot hydrate a value beyond PHP_INT_MAX into an int property: User::$id (18446744073709551615) — declare it as null|int|string.`
  Declare essa propriedade como `null|int|string`, que guarda a string exata (veja
  **[Chaves maiores que um int do PHP](/manual/ADI/Databases/SQL/Drivers/overview/#chaves-maiores-que-um-int-do-php)**).

Um valor que a tabela deixa sem conversão chega à atribuição do próprio PHP, que o confere contra o
tipo da propriedade: um valor que não cabe lança um `TypeError`, que é um `Error` — um
`catch (Exception)` não o captura. Por enquanto é assim que estes casos falham:

- **Datas.** PostgreSQL e MySQL decodificam colunas `DATE` e `TIMESTAMP` em `DateTimeImmutable`,
  que uma propriedade `string` recusa, e o SQLite devolve o texto que guardou, que uma propriedade
  `DateTimeImmutable` recusa: tipe uma propriedade temporal para os drivers em que ela roda, como
  **[Datas e horas](/manual/ADI/Databases/SQL/Model/overview/#datas-e-horas)** mostra.
- **Enums e arrays.** Nenhum driver decodifica uma coluna num case de enum ou num array: uma
  propriedade enum, `array` ou `iterable` recebe o valor escalar da coluna, e o PHP o recusa. Mapeie o
  valor guardado no lugar (veja **[Tipos](/manual/ADI/Databases/SQL/Model/overview/#tipos)**).
- **`null` para uma união** que não inclui `null`, como `int|string`: o hidratador verifica `null`
  só para um tipo único, então é o PHP que o recusa.

### Colunas ausentes e extras

Uma linha precisa carregar todas as colunas mapeadas. Uma coluna que ela deixa de fora lança
`ORM result row is missing required column: <column>`, a menos que a coluna esteja marcada como
`nullable` ou `generated` (veja **[Attributes](/manual/ADI/Databases/SQL/Model/Attributes/overview/)**):
aí a propriedade fica como está — uma entidade nova mantém o default da classe, uma rastreada o valor
que tinha. Colunas que nenhuma propriedade mapeia são ignoradas.

```php
$Operation = $Database->await($Database->query('SELECT id, name FROM users'));

$Users->hydrate($Operation); // RuntimeException: ORM result row is missing required column: email
```

O repositório também anota quais colunas cada hidratação carregou, e um `save()` posterior da
entidade grava de volta só essas — veja
**[Salvar entidades](/manual/ADI/Databases/SQL/Repository/overview/#salvar-entidades)**.

### Propriedades readonly

Uma propriedade `readonly` é gravada uma vez. Hidratar a entidade de novo com um valor igual — para
um objeto, um equivalente, como o mesmo instante decodificado de novo — deixa a propriedade como
está. Um valor diferente é recusado antes que qualquer coluna da linha seja gravada:
`ORM cannot overwrite a readonly property: User::$email`. O mesmo vale para um valor que o
construtor definiu, quando ele roda (veja
**[Construção e valores padrão](/manual/ADI/Databases/SQL/Model/overview/#construção-e-valores-padrão)**).
No PostgreSQL, a linha que o INSERT de uma entidade nova devolve pode contradizer um valor que o
banco normalizou, como `'ab'` completado para `'ab  '` por uma coluna `char(4)`: essa linha é então
hidratada num objeto novo (veja
**[Salvar entidades](/manual/ADI/Databases/SQL/Repository/overview/#salvar-entidades)**).

## Identity map

Um repositório mantém um objeto por chave primária. Toda linha cuja chave ele já viu é hidratada no
objeto que ele já guarda:

```php
$User->name = 'Ada (unsaved)';

$Again = $Users->hydrate($Database->await($Users->find(1)))->entity;

$Again === $User; // true
$User->name;      // 'Ada': the row overwrote the unsaved change
```

- **A linha mais nova vence.** A hidratação grava toda coluna que a linha carrega por cima do objeto
  rastreado, então uma mudança que você não salvou se perde.
- **O map pertence a um repositório.** Um segundo `$Database->map(User::class)` tem o próprio map e
  hidrata a mesma linha em outro objeto.
- **Entidades relacionadas o compartilham.** As entidades que um repositório carrega por uma relação
  — com `attach()`, em modo eager ou lazy — são rastreadas no map dele, um objeto por chave e classe.
- **Uma linha sem a coluna da chave nunca é rastreada.** Ela é hidratada num objeto novo toda vez.
- **Um objeto reutilizado não é construído de novo.** O construtor roda só para um objeto novo, e
  só quando não tem parâmetros obrigatórios (veja
  **[ORM Model](/manual/ADI/Databases/SQL/Model/overview/)**).

O map cresce a cada chave que o repositório hidrata, enquanto o repositório viver. Mapeie um
repositório por request, job ou transação — `$Response->Database->map()` mapeia um novo a cada
chamada — em vez de um por worker.

### Recomece

O `reset()` esquece toda entidade rastreada, e as colunas que cada hidratação carregou:

```php
$Users->reset();

$Fresh = $Users->hydrate($Database->await($Users->find(1)))->entity;

$Fresh === $User; // false
```

Uma entidade que você ainda guarda passa a ser nova para o repositório, e o `save()` a roteia como
uma que você mesmo montou (veja
**[Salvar entidades](/manual/ADI/Databases/SQL/Repository/overview/#salvar-entidades)**).

## Entidades salvas

Hidratar um `save()` grava a chave que o banco gerou de volta na entidade que você passou, em
qualquer driver — o PostgreSQL a partir da linha que o `RETURNING` devolve, MySQL e SQLite a partir
do id que informam em `Result->inserted` —, então continue com `$Mapped->entity ?? $Entity`. O que
mais cada driver devolve, as relações da entidade salva e os casos que o identity map ainda não
cobre estão em **[Salvar entidades](/manual/ADI/Databases/SQL/Repository/overview/#salvar-entidades)**.

## Referência

As assinaturas nomeiam as classes como o `Repository.php` as importa: `DatabaseResult` é
`Bootgly\ADI\Database\Operation\Result`, e `MappedResult` é
`Bootgly\ADI\Databases\SQL\Repository\Result`.

### Repository

```php
hydrate (Operation|DatabaseResult $Source): MappedResult
```

Transforma as linhas de uma operação terminada, ou de um resultado, em entidades, anexa ou adia as
relações que a seleção dela nomeou, e devolve o resultado mapeado. Lança uma `RuntimeException` com
o `error` da operação quando ela falhou; `ORM hydration requires a completed SQL result.` quando ela
ainda não tem resultado; `ORM lazy loading requires an await bridge.` quando a entidade declara uma
relação `lazy: true` que a seleção não nomeou e o repositório não tem ponte;
`ORM pagination count requires an await bridge.` para uma contagem de página que não consegue
aguardar; e o erro de uma linha que ele não consegue receber — uma coluna ausente, `null` para uma
propriedade não anulável, um conflito de readonly, um inteiro além de `PHP_INT_MAX` (veja
[Linhas em propriedades](#linhas-em-propriedades)). Lança uma `InvalidArgumentException` para um nome
de relação que a seleção carrega e que não está mapeado, e para uma página de cursor que termina num
valor de ordenação `NULL`. Emite `Hydrating` e `Hydrated` (veja
**[Hooks ORM](/manual/ADI/Databases/SQL/Repository/Hooks/overview/)**).

```php
reset (): static
```

Esquece toda entidade rastreada e as colunas que cada hidratação carregou, e devolve o repositório.

```php
public private(set) Identity $Identity
```

O identity map do repositório, `Bootgly\ADI\Databases\SQL\Repository\Identity`.

### Identity

`Bootgly\ADI\Databases\SQL\Repository\Identity`. Leia-o com `fetch()` e limpe-o com o `reset()` do
repositório; o repositório chama os outros métodos enquanto hidrata.

```php
__construct ()
```

Começa um map vazio. Cada repositório monta o seu.

```php
fetch (string $class, mixed $key): null|object
```

Devolve o objeto rastreado para `$key`, ou `null`: `$Users->Identity->fetch(User::class, 1)`.

```php
store (string $class, mixed $key, object $Entity): object
```

Rastreia `$Entity` como o objeto de `$key`, e o devolve.

```php
record (object $Entity, array $columns): void
```

Soma as colunas que uma hidratação carregou para `$Entity`, cada nome de coluna mapeado para `true`,
às que já estão registradas.

```php
carried (object $Entity): null|array
```

As colunas registradas para `$Entity`, que um `UPDATE` dela grava de volta; `null` quando nenhuma
hidratação registrou colunas, e o `UPDATE` então grava toda coluna mapeada que pode.

```php
reset (): void
```

Esquece todo objeto rastreado e toda coluna registrada. O `reset()` do repositório o chama.

### Resultado mapeado

`Bootgly\ADI\Databases\SQL\Repository\Result`.

```php
__construct (DatabaseResult $Result, array $entities, array $loads = [], null|Pagination $Pagination = null)
```

Monta um resultado mapeado. O `hydrate()` e o `attach()` o criam.

```php
public private(set) DatabaseResult $Result
```

O resultado do DBAL de onde as linhas vieram.

```php
public private(set) array $entities
```

As entidades hidratadas, na ordem das linhas.

```php
public private(set) array $loads
```

As operações de relação adiadas, indexadas pelo nome da relação; vazio quando o repositório tem
ponte de await ou a seleção não nomeou relação nenhuma.

```php
public private(set) null|Pagination $Pagination
```

O resultado resolvido da paginação de uma operação de `paginate()`, ou `null`.

```php
public null|object $entity { get; }
```

A primeira entidade, ou `null` quando não há nenhuma.

```php
public int $count { get; }
```

O número de entidades.

```php
public bool $empty { get; }
```

`true` quando nenhuma entidade foi hidratada.
