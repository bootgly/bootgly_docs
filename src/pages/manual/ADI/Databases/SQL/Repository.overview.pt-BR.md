# ORM Repository

`Bootgly\ADI\Databases\SQL\Repository` é a superfície Data Mapper de uma classe de entidade mapeada.
Ele compõe o trabalho de banco dessa classe — `find()`, `fetch()`, `paginate()`, `save()` e
`delete()` — como `Operation`s SQL, e o `hydrate()` transforma uma operação finalizada em entidades.
Ele possui um identity map e um hydrator, mas nenhuma conexão: você aguarda cada operação que ele
compõe, e só um repositório com ponte de await espera por conta própria — o `hydrate()` então também
aguarda as queries de relação que uma seleção nomeia e o `COUNT(*)` de uma página, e uma relação
lazy faz a query no primeiro acesso. Entidades só chegam ao banco por um repositório, uma operação
explícita por `save()` ou `delete()`, sem unit of work por trás (veja
**[Que tipo de ORM é este?](/guide/database-orm/overview/#que-tipo-de-orm-é-este)**).

Os exemplos usam `$Database`, a fachada SQL: na função de boot, num comando ou num script de um
projeto, `new SQL(new DatabaseConfig(BOOTGLY_PROJECT->Configs->get('database'))->configure())`; fora
de um projeto, `new SQL([...])` com as chaves de conexão — veja
**[Abra um banco](/manual/ADI/Databases/SQL/overview/#abra-um-banco)**. Numa rota `HTTP_Server_CLI`,
mapeie por `$Response->Database` (veja [Criar um repositório](#criar-um-repositório)).

## Entidades desta página

```php
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

   #[Column('email')]
   public string $mail = '';

   #[Column]
   public bool $active = true;

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

#[Table('settings')]
class Setting
{
   #[Key(generated: false)]
   public string $name = '';

   #[Column]
   public string $value = '';
}
```

`User` e `Post` têm como chave um id que o banco gera (`#[Key]`); `Setting`, um nome que a aplicação
escolhe (`#[Key(generated: false)]`). Os attributes estão em
**[Attributes ORM](/manual/ADI/Databases/SQL/Model/Attributes/overview/)**. A tabela `users` começa
com Ada (id 1), Grace (2) e Linus (3) — Linus inativo —, Ada tem dois posts e Grace um, e
`settings` guarda `theme` com o valor `dark`.

## Criar um repositório

```php
$Users = $Database->map(User::class);
```

O `map()` retorna um repositório para uma classe de entidade. A metadata da classe — tabela, chave,
colunas, relações — é compilada dos attributes no primeiro `map()` e fica em cache na fachada (veja
**[ORM Model](/manual/ADI/Databases/SQL/Model/overview/)**); o repositório em si é um objeto leve,
então crie um por unidade de trabalho. O que ele guarda — o identity map, os escopos nomeados e os
listeners de hook — pertence a esse objeto: um segundo `map()` da mesma classe começa vazio.

Onde você mapeia decide como o repositório roda:

- `$Database->map()` roda no pool da fachada e não tem **ponte de await** por padrão: as relações que
  uma seleção nomeia em `load()` voltam como operações para você aguardar, e uma entidade com uma
  relação `lazy: true` não pode ser hidratada (veja [Carregar relações](#carregar-relações)). Passe
  `Awaiting: $Database` e o `hydrate()` aguarda essas relações por conta própria. O `Scope:` está em
  [Escopo de read-after-write](#escopo-de-read-after-write).
- `$Transaction->map()` roda na conexão fixada da transação, com a transação como ponte — veja
  [Dentro de uma transação](#dentro-de-uma-transação).
- Numa rota `HTTP_Server_CLI`, `$Response->Database->map(User::class)` recebe só a classe. O
  repositório ganha o resource de response como ponte, que aguarda sem bloquear o worker, e o escopo
  de read-after-write do request; dentro do callback de `$Response->Database->transact()`, ele roda
  pela transação aberta. Veja
  **[Métodos do Database](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/overview/#métodos-do-database)**.

## Find e fetch

```php
$User = $Users->hydrate($Database->await($Users->find(1)))->entity;

$User->name; // Ada
$User->mail; // ada@example.test
```

O `find()` compõe um `SELECT` de toda coluna mapeada, filtrado pela chave e limitado a uma linha, e
retorna a `Operation` na hora. O `$Database->await()` a conduz até o fim e lança uma
`RuntimeException` com o erro dela quando ela falha; o `hydrate()` então transforma as linhas em
entidades. Quando nenhuma linha tem aquela chave, `entity` é `null`.

O `fetch()` lê as linhas que uma seleção descreve, e todas as linhas sem uma:

```php
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Operators;
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Orders;
use Bootgly\ADI\Databases\SQL\Builder\Identifier;

$Selection = $Users->select()
   ->filter(new Identifier('active'), Operators::Equal, true)
   ->order(Orders::Asc, new Identifier('name'));

$Active = $Users->hydrate($Database->await($Users->fetch($Selection)));

$Active->count;        // 2
$Active->entity->name; // Ada
```

O `select()` inicia uma seleção para a entidade do repositório. Os predicados, a busca textual, a
ordem, a fatia, os locks de linha e os escopos nomeados dela estão em
**[Seleções ORM](/manual/ADI/Databases/SQL/Repository/Selection/overview/)**.

O `hydrate()` também recebe um `Result` do banco, então linhas lidas por uma query sua também viram
entidades, desde que tragam as colunas mapeadas:

```php
$Query = $Database->table(new Identifier('users'))
   ->select(new Identifier('id'), new Identifier('name'), new Identifier('email'), new Identifier('active'))
   ->filter(new Identifier('id'), Operators::Equal, 2);

$Grace = $Users->hydrate($Database->await($Database->query($Query))->Result)->entity;
```

O `hydrate()` lança uma `RuntimeException` para uma operação que falhou — o mesmo erro que o
`await()` lança — e `ORM hydration requires a completed SQL result.` para uma que ainda não terminou.

## Ler o resultado

O `hydrate()` retorna um `Repository\Result`:

| Propriedade | Guarda |
| --- | --- |
| `entities` | toda entidade hidratada, na ordem das linhas |
| `entity` | a primeira entidade, ou `null` |
| `count` | o número de entidades hidratadas |
| `empty` | `true` quando não há nenhuma |
| `Result` | o `Result` do banco de onde as entidades vieram: `rows`, `status`, `affected`, `inserted` |
| `loads` | operações de relação deixadas para você aguardar, indexadas pelo nome da relação (veja [Carregar relações](#carregar-relações)) |
| `Pagination` | a página resolvida de uma operação de `paginate()`, `null` para qualquer outra |

Cada coluna é convertida para o tipo da sua propriedade, e uma linha que não traz uma coluna sem
`nullable` nem `generated`, ou traz `null` onde a propriedade o recusa, é recusada, como
**[Linhas em propriedades](/manual/ADI/Databases/SQL/Repository/Hydration/overview/#linhas-em-propriedades)**
detalha. O repositório também mantém um objeto por chave, o **identity map** dele: hidratar uma
linha cuja chave ele já rastreia grava a linha nesse mesmo objeto, então mapeie um repositório por
request ou job, ou chame `reset()` (veja
**[Identity map](/manual/ADI/Databases/SQL/Repository/Hydration/overview/#identity-map)**).

## Carregar relações

```php
$Selection = $Users->select()->order(Orders::Asc, new Identifier('id'))->load('Posts');

$Mapped = $Users->hydrate($Database->await($Users->fetch($Selection)));

foreach ($Mapped->loads as $relation => $Operation) {
   $Users->attach($Mapped->entities, $relation, $Database->await($Operation));
}

count($Mapped->entity->Posts); // 2, Ada's
```

O `load()` nomeia relações — o nome da relação é o nome da propriedade, a menos que o attribute
defina `name:` — e o `hydrate()` compõe uma query por relação para o resultado inteiro. Sem ponte de
await, ele deixa essas queries em `$Mapped->loads`: aguarde cada uma e passe-a ao `attach()`, que
grava as entidades relacionadas nos pais. Com uma ponte, o `hydrate()` faz isso sozinho e `loads`
fica vazio:

```php
$Bridged = $Database->map(User::class, Awaiting: $Database);

$Mapped = $Bridged->hydrate($Database->await($Bridged->fetch($Selection)));

count($Mapped->entity->Posts); // 2
```

Nomes de relação diferenciam maiúsculas de minúsculas: `load('posts')` lança
`ORM relation is not mapped: posts` a partir do `hydrate()` — quando vieram linhas. Carregamento em
lote com `load()` e `attach()`, e relações lazy, estão em
**[Relações ORM](/manual/ADI/Databases/SQL/Repository/Relations/overview/)**.

> **Relações lazy precisam de ponte.** Uma entidade com uma relação `lazy: true` que a seleção não
> nomeia em `load()` só pode ser hidratada por um repositório com ponte de await; sem ela, o
> `hydrate()` lança `ORM lazy loading requires an await bridge.` Nomear a relação em `load()` a
> devolve como uma operação deferida em `loads`. Hidratar um `save()` ou um `delete()` nunca exige
> ponte.

## Salvar entidades

```php
$User = new User;
$User->name = 'Edsger';
$User->mail = 'edsger@example.test';

$Mapped = $Users->hydrate($Database->await($Users->save($User)));
$User = $Mapped->entity ?? $User;

$User->id; // 4

$User->name = 'Edsger Dijkstra';
$Database->await($Users->save($User));
```

O `save()` compõe um `INSERT` ou um `UPDATE`, e a chave decide qual:

- Uma chave **gerada** (`#[Key]`) que é `null` significa uma linha nova: `INSERT`. Qualquer outro
  valor significa um `UPDATE` da linha com aquela chave, tenha o repositório visto a entidade ou
  não — o segundo `save()` acima é um `UPDATE`.
- Uma chave **atribuída pela aplicação** (`#[Key(generated: false)]`) já vem preenchida numa
  entidade nova, então o repositório consulta o identity map: uma chave que ele rastreia — a entidade
  foi hidratada por este repositório — significa `UPDATE`, qualquer outra `INSERT`. Uma chave `null`
  faz o `save()` lançar `ORM update requires a primary key value.`

```php
$Settings = $Database->map(Setting::class);

$Locale = new Setting;
$Locale->name = 'locale';
$Locale->value = 'en';
$Database->await($Settings->save($Locale)); // INSERT: 'locale' is not tracked

$Theme = $Settings->hydrate($Database->await($Settings->find('theme')))->entity;
$Theme->value = 'light';
$Database->await($Settings->save($Theme));  // UPDATE: 'theme' is tracked
```

Uma chave passa a ser rastreada quando o repositório hidrata uma linha que a traz, como o
`find('theme')` faz acima; o `save()` sozinho não rastreia nada. Então salve uma entidade de chave
atribuída pela aplicação sempre pelo repositório que a hidratou: outro repositório — outro `map()`,
o de uma transação — não rastreia a chave, envia um `INSERT` e falha na chave duplicada.

Hidrate também os saves sobre os quais você continua: é o `hydrate()` que grava um id gerado na
entidade e registra o que o repositório sabe dela. Uma entidade nova cujo `save()` você não hidratou
mantém o id `null`, então salvá-la de novo insere uma segunda linha.

O `INSERT` grava toda coluna mapeada para inserção — cada `#[Column]` sem `insert: false`, e uma
chave atribuída pela aplicação; uma chave gerada nunca — e deixa de fora uma coluna `generated` que
guarda `null`, para o banco preenchê-la. No PostgreSQL, as duas instruções terminam com `RETURNING` e
toda coluna mapeada; MySQL e SQLite informam o id gerado no lugar (veja
**[Chaves geradas sem RETURNING](/manual/ADI/Databases/SQL/Drivers/overview/#chaves-geradas-sem-returning)**).

O `save()` numa entidade hidratada grava de volta as colunas que a hidratação realmente
trouxe, e só elas. Uma projeção que omite uma coluna mapeada deixa a propriedade com o default
da classe, que se lê exatamente como um valor que você escolheu — gravá-lo de volta trocaria
dado armazenado por um default plausível e reportaria sucesso. Hidrate uma projeção mais larga
depois e as colunas que ela trouxe entram no conjunto. Uma coluna marcada `generated` com
`null` nunca é gravada, do mesmo jeito que um INSERT sempre a pulou.

Uma entidade que você mesmo construiu não foi hidratada, então nada se sabe sobre ela: o
`save()` grava toda coluna mapeada para atualização, que é o que você pediu. E uma entidade
hidratada sem nenhuma coluna gravável é recusada com `ORM update has no column carrying a value to write.`
em vez de compilar um `UPDATE` com `SET` vazio. Uma classe de entidade sem nenhuma coluna para
inserir ou atualizar é recusada do mesmo jeito, pelo próprio `save()`:
`ORM insert requires at least one writable column.` ou `ORM update requires at least one writable column.`

> **Fique com a instância salva.** Hidratar o `save()` de uma entidade nova grava o id gerado de
> volta no objeto que você passou, em qualquer driver: o PostgreSQL o preenche a partir da linha do
> `RETURNING`, MySQL e SQLite a partir de `Result->inserted`. O PostgreSQL devolve a linha de todo
> `save()`, então o `hydrate()` também atualiza a entidade a partir dela, inclusive um valor que o
> banco preencheu. No MySQL e no SQLite só esse INSERT de chave gerada é hidratado como entidade: um
> UPDATE, ou um INSERT com chave atribuída pela aplicação, não retorna linha, então
> `$Mapped->entity` é `null` — fique com o objeto que você salvou. `$User = $Mapped->entity ?? $User;`
> mantém o objeto certo em qualquer driver. Uma relação já definida nesse objeto mantém o valor;
> quais relações lazy sem valor recebem o wrapper está em
> **[Tipos de propriedade](/manual/ADI/Databases/SQL/Repository/Relations/overview/#tipos-de-propriedade)**.
> Uma exceção: quando uma propriedade `readonly` guarda um valor que a linha do `RETURNING` do INSERT
> contradiz (o banco o normalizou), a linha é hidratada numa nova instância em `$Mapped->entity` e o
> seu objeto fica intacto.

Por enquanto, cinco caminhos ainda dependem do driver ou deixam o identity map para trás:

- Um `INSERT` com chave atribuída pela aplicação só é rastreado no PostgreSQL, e só quando você o
  hidrata. Fora disso, salvar o mesmo objeto de novo — o `$Locale` acima — o insere uma segunda vez
  e falha na chave duplicada: faça `find()` da entidade pelo repositório antes de salvá-la de novo.
- No PostgreSQL, salvar uma entidade que este repositório nunca hidratou — um `UPDATE` de um objeto
  que você mesmo construiu, ou um `INSERT` com chave atribuída pela aplicação — hidrata a linha do
  `RETURNING` no objeto que o map já guarda para essa chave, ou senão num objeto novo:
  `$Mapped->entity` não é o objeto que você passou, e um `find()` posterior retorna esse outro
  objeto.
- No MySQL e no SQLite, a entidade de um `INSERT` de chave gerada não é registrada como hidratada,
  então o próximo `save()` dela grava toda coluna mapeada — inclusive uma coluna `insert: false`,
  cuja propriedade ainda guarda o default da classe enquanto a linha guarda o do banco. Faça `find()`
  da entidade antes de alterá-la, ou marque essa coluna também como `update: false`.
- Pôr `null` na chave de uma entidade rastreada e salvá-la insere uma linha nova, mas o repositório
  mantém o objeto sob a chave antiga também: um `find()` posterior da chave antiga retorna esse
  objeto e grava a linha antiga de volta nele. Construa um objeto novo para uma linha nova.
- Uma chave que você exclui pelo repositório continua rastreada: veja
  [Excluir entidades](#excluir-entidades).

## Excluir entidades

```php
$Database->await($Users->delete($User)); // Edsger, by entity
$Database->await($Users->delete(3));     // Linus, by key
```

O `delete()` recebe a entidade — a classe dela é conferida, `ORM entity does not match model: User`
caso contrário — ou a própria chave, e compõe um `DELETE` da linha com aquela chave. Aguarde-o:
`->Result->affected` é o número de linhas excluídas, `0` quando nenhuma linha tem a chave, como
para uma entidade cuja chave ainda é `null`. Hidratar um delete não retorna entidade e nunca exige
ponte. O `delete()` remove só essa linha, e o `save()` nunca grava propriedades de relação: salve ou
exclua entidades relacionadas pelo repositório delas, e deixe as linhas que referenciam uma excluída a
cargo das foreign keys do banco.

O objeto excluído mantém a chave, então um `save()` posterior dele é um `UPDATE` que não casa com
nenhuma linha. Por enquanto, o repositório continua rastreando uma chave excluída, o que importa
para uma chave atribuída pela aplicação: uma entidade nova salva com essa chave pelo mesmo
repositório é enviada como `UPDATE`, que não casa com nenhuma linha, então nada é gravado e nenhum
erro é lançado. Salve-a por um repositório novo, que não rastreia a chave:

```php
$Theme = $Settings->hydrate($Database->await($Settings->find('theme')))->entity;
$Database->await($Settings->delete($Theme));

$Theme = new Setting;
$Theme->name = 'theme';
$Theme->value = 'light';
$Database->await($Database->map(Setting::class)->save($Theme)); // INSERT
```

## Escopo de read-after-write

```php
use stdClass;

$Job = new stdClass;
$Users = $Database->map(User::class, Scope: $Job);

$Grace = $Users->hydrate($Database->await($Users->find(2)))->entity;
$Grace->name = 'Grace Hopper';
$Database->await($Users->save($Grace));

$Grace = $Users->hydrate($Database->await($Users->find(2)))->entity;
$Grace->name; // Grace Hopper
```

Com réplicas de leitura configuradas, a fachada envia cada leitura a uma réplica e cada escrita ao
primário, e depois de uma escrita as leituras do mesmo **escopo** ficam no primário por
`routing.sticky` segundos (veja
**[Escopo de read-after-write](/manual/ADI/Databases/SQL/overview/#escopo-de-read-after-write)**).
Toda operação que um repositório compõe roda num escopo: o argumento `$Scope` daquela chamada —
`find()`, `fetch()`, `paginate()`, `save()`, `delete()` e `load()` aceitam um —, senão o `Scope:`
dado ao `map()`, senão o padrão da fachada, a Fiber atual ou, fora de uma, a própria fachada.

Então o `save()` acima marca `$Job`, e o `find()` depois dele lê Grace de volta do primário,
enquanto uma leitura que recebe outro objeto de escopo — `$Users->find(2, $Report)` — ainda pode
chegar a uma réplica que não reproduziu a escrita. As queries de relação que o `hydrate()` envia,
eager ou lazy, e o `COUNT(*)` de uma página rodam no escopo da operação hidratada. Sem réplicas, o
escopo não muda nada. O `$Response->Database->map()` dá ao repositório o escopo do request.

## Dentro de uma transação

```php
$Transaction = $Database->begin();
$Database->await($Transaction->Operation);

$Settings = $Transaction->map(Setting::class);

$Theme = $Settings->hydrate($Database->await($Settings->find('theme')))->entity;
$Theme->value = 'dark';
$Database->await($Settings->save($Theme));

$Database->await($Transaction->commit());
```

O `$Transaction->map()` retorna um repositório cujas instruções rodam na conexão fixada da
transação, com a transação como ponte de await. Ponha o trabalho e o commit num `try` e encerre a
transação no `catch`, como
**[Commit ou rollback](/guide/database-transactions/overview/#commit-ou-rollback)** faz; como os
carregamentos eager e as páginas se comportam ali está em
**[Repositórios dentro de uma transação](/manual/ADI/Databases/SQL/Transaction/overview/#repositórios-dentro-de-uma-transação)**.
Quanto às entidades:

- Uma transação roda uma instrução por vez: aguarde cada operação antes de compor a próxima. Um
  `find()` composto enquanto outra instrução ainda roda falha com
  `SQL transaction operation is still active.` (o SQLite roda cada instrução dentro da chamada, então
  nunca tem uma rodando).
- O repositório é novo, então o identity map dele está vazio. Leia por ele as entidades que você
  altera, como acima: uma entidade hidratada por outro repositório é uma que ele nunca viu, e com
  chave atribuída pela aplicação o `save()` dela é um `INSERT` que falha na chave duplicada. Para
  manter outras transações longe dessas linhas até o commit, trave-as ao lê-las (veja
  **[Travar linhas](/manual/ADI/Databases/SQL/Repository/Selection/overview/#travar-linhas)**).
- O repositório dura o mesmo que a transação: depois que ela faz commit ou rollback, as operações do
  repositório falham com `SQL transaction is not active.`

## Escopos nomeados

```php
use Bootgly\ADI\Databases\SQL\Repository;
use Bootgly\ADI\Databases\SQL\Repository\Selection;

$Users->scope('active', function (Selection $Selection): void {
   $Selection->filter(new Identifier('active'), Operators::Equal, true);
});

$Latest = function (Selection $Selection, Repository $Repository): void {
   $Selection->order(Orders::Desc, new Identifier($Repository->Model->key));
};
$Users->scope('latest', $Latest);

$Mapped = $Users->hydrate($Database->await(
   $Users->fetch($Users->select()->scope('active')->scope('latest'))
));

$Mapped->entity->name; // Grace Hopper
```

O `scope()` registra um pedaço nomeado de seleção neste repositório, e o `scope()` da seleção o pede
pelo nome. A closure recebe a seleção e o repositório que a aplica, então uma closure só — `$Latest`
ordena pela chave da entidade, seja ela qual for — serve a todo repositório. O `fetch()` e o
`paginate()` rodam as closures nomeadas na ordem em que foram nomeadas, depois dos predicados que
você escreveu — cada uma como um grupo ligado com `AND` depois dos seus, então um `OR` seu não a
contorna. Um nome que este repositório não registrou faz os dois lançarem
`InvalidArgumentException`: `ORM scope is not registered: active` — um segundo `map()` de `User` não
tem nenhum.

O `compile()` e o `count()` da seleção não rodam escopos, e por enquanto o `fetch()` os roda na
seleção que você passa: leia
**[Reutilizar uma seleção](/manual/ADI/Databases/SQL/Repository/Selection/overview/#reutilizar-uma-seleção)**
antes de buscar duas vezes uma seleção com escopos.

## Hooks de ciclo de vida

```php
use Bootgly\ADI\Databases\SQL\Repository\Hooks;
use Bootgly\ADI\Databases\SQL\Repository\Result;

$Users->listen(Hooks::Hydrated, function (Result $Mapped): void {
   // $Mapped->entities are hydrated here
});
```

O `find()`, o `fetch()` e o `paginate()` emitem `Selecting` e `Selected`, o `save()` emite `Saving` e
`Saved`, o `delete()` `Deleting` e `Deleted`, e o `hydrate()` `Hydrating` e `Hydrated`, para os
listeners registrados naquele repositório; o `listen()` retorna o repositório, então os registros
encadeiam. `Selected`, `Saved` e `Deleted` rodam antes de o PostgreSQL e o MySQL receberem a
instrução, então faça o trabalho que depende da escrita depois do `await()`: o que cada listener
recebe, e quando roda, está em **[Hooks ORM](/manual/ADI/Databases/SQL/Repository/Hooks/overview/)**.

## Paginar

O `paginate()` lê uma página de uma seleção — por número de página com um total, ou por cursor — e
o `hydrate()` resolve a página em `$Mapped->Pagination`. Numa rota, o
`$Response->Database->paginate()` também lê a página do request e grava os headers REST. Veja
**[Paginação ORM](/manual/ADI/Databases/SQL/Repository/Pagination/overview/)**.

## Referência

`MappedResult` nas assinaturas é `Bootgly\ADI\Databases\SQL\Repository\Result` e `DatabaseResult` é
`Bootgly\ADI\Database\Operation\Result`, como o código-fonte os importa.

### Métodos

```php
__construct (Querying $Querying, Dialect $Dialect, Model $Model, Models $Models, null|object $Scope = null, null|Awaiting $Awaiting = null)
```

Monta um repositório sobre um model compilado. Aplicações chamam `$Database->map()`,
`$Transaction->map()` ou `$Response->Database->map()` no lugar; o `create()` monta um para uma
superfície `Querying` própria.

```php
static create (Querying $Querying, Dialect $Dialect, Models $Models, string $Entity, null|object $Scope = null, null|Awaiting $Awaiting = null): self
```

Busca o model da entidade em `$Models` — compilando-o no primeiro uso — e monta o repositório.
`$Querying` roda as instruções dele, `$Scope` é o escopo de read-after-write padrão e `$Awaiting` a
ponte de await. Os dois `map()` o chamam.

```php
find (mixed $id, null|object $Scope = null): Operation
```

Compõe um `SELECT` de toda coluna mapeada da linha cuja chave é `$id`, limitado a uma linha. Emite
`Selecting` e `Selected`.

```php
fetch (null|Selection $Selection = null, null|object $Scope = null): Operation
```

Roda os escopos nomeados da seleção nela, a compila e compõe o `SELECT`; sem seleção, toda linha.
Registra as relações que ela nomeia em `load()` para o `hydrate()`. Lança
`InvalidArgumentException` para um escopo que este repositório não registrou. Emite `Selecting` e
`Selected`.

```php
hydrate (Operation|DatabaseResult $Source): MappedResult
```

Transforma uma operação finalizada, ou um resultado do banco, em entidades: converte cada coluna para
a propriedade, reaproveita o objeto rastreado de uma chave, grava uma chave gerada numa entidade
salva, resolve uma paginação e carrega relações — aguardando-as pela ponte, ou deixando-as em
`loads`. Lança `RuntimeException` para uma operação que falhou, para uma não finalizada
(`ORM hydration requires a completed SQL result.`), para uma linha que não consegue hidratar, para
uma entidade com relação `lazy: true` quando não há ponte e para uma contagem de página que não
consegue aguardar (`ORM pagination count requires an await bridge.`); e `InvalidArgumentException`
para um nome de relação que a seleção carrega e que não está mapeado, e para uma página de cursor
cuja última linha guarda `NULL` numa coluna de ordenação
(`ORM pagination cursor requires scalar, non-null order values.`). Emite `Hydrating` e `Hydrated`.

```php
save (object $Entity, null|object $Scope = null): Operation
```

Compõe um `INSERT` ou um `UPDATE` da entidade, escolhido pela chave (veja
[Salvar entidades](#salvar-entidades)), com `RETURNING` no PostgreSQL. Lança
`InvalidArgumentException` para uma entidade de outra classe e `RuntimeException` quando a instrução
não pode ser montada: uma chave atribuída pela aplicação `null`, ou nenhuma coluna para gravar. Emite
`Saving` e `Saved`.

```php
delete (mixed $Entity, null|object $Scope = null): Operation
```

Compõe um `DELETE` da linha cuja chave é a da entidade, ou o próprio `$Entity` quando ele não é um
objeto. Lança `InvalidArgumentException` para uma entidade de outra classe. Emite `Deleting` e
`Deleted`.

```php
paginate (null|Selection $Selection = null, null|Pagination $Pagination = null, null|object $Scope = null): Operation
```

Compõe uma página de uma cópia da seleção e retorna a operação de itens; o `hydrate()` resolve o
resultado. Veja a Referência de
**[Paginação ORM](/manual/ADI/Databases/SQL/Repository/Pagination/overview/#referência)**.

```php
select (): Selection
```

Inicia uma seleção vazia para a entidade do repositório, compilada com o dialeto dele.

```php
scope (string $name, Closure $Scope): static
```

Registra um escopo nomeado neste repositório, substituindo um de mesmo nome. O `fetch()` e o
`paginate()` chamam `$Scope($Selection, $Repository)` para cada nome que a seleção traz.

```php
load (object|array $Entities, array $relations = [], null|object $Scope = null): array
```

Compõe uma query por relação para as entidades dadas e retorna as operações indexadas pelo nome da
relação, sem aguardá-las. Uma relação fica de fora quando nenhuma entidade traz a chave local dela,
e uma lista vazia de entidades retorna `[]`. Lança `InvalidArgumentException` para um nome de relação
que não está mapeado e para uma entidade de outra classe.

```php
attach (object|array $Entities, string $relation, Operation|DatabaseResult $Source): MappedResult
```

Hidrata as entidades relacionadas de uma query de relação finalizada e as grava nas entidades
dadas, depois as retorna como um resultado. Lança `InvalidArgumentException` para uma relação que
não está mapeada e para um pai de outra classe (`ORM entity does not match model: <class>`), e
`RuntimeException` para uma operação que falhou ou não terminou e para linhas sem a chave que as
associa aos pais (`ORM relation attachment result is missing key column: <column>`).

```php
listen (Hooks $Hook, Closure $Listener): static
```

Registra um listener para um hook neste repositório.

```php
reset (): static
```

Esquece toda entidade que o identity map rastreia e as colunas que as hidratações delas trouxeram.
Entidades hidratadas antes disso são salvas como se você as tivesse construído: toda coluna mapeada
é gravada, e uma chave atribuída pela aplicação é enviada como `INSERT`.

### Propriedades

```php
public private(set) Querying $Querying
```

A superfície em que as instruções do repositório rodam: a fachada `SQL` ou uma `Transaction`.

```php
public private(set) Dialect $Dialect
```

O dialeto do Query Builder com que seleções e instruções são compiladas.

```php
public private(set) Model $Model
```

A metadata compilada da classe de entidade (veja
**[ORM Model](/manual/ADI/Databases/SQL/Model/overview/)**).

```php
public private(set) Models $Models
```

O cache de metadata de onde vêm os models das entidades relacionadas: o da fachada.

```php
public private(set) null|Awaiting $Awaiting
```

A ponte de await, ou `null`. `SQL`, `Transaction` e o resource de banco HTTP implementam
`Awaiting`.

```php
public private(set) Identity $Identity
```

O identity map. `$Users->Identity->fetch(User::class, 1)` retorna a entidade rastreada de uma chave,
ou `null`.

### Result

`Bootgly\ADI\Databases\SQL\Repository\Result`, retornado por `hydrate()` e `attach()`.

```php
__construct (DatabaseResult $Result, array $entities, array $loads = [], null|Pagination $Pagination = null)
```

Montado pelo repositório.

```php
public private(set) DatabaseResult $Result
```

O resultado do banco de onde as entidades vieram.

```php
public private(set) array $entities
```

As entidades hidratadas, na ordem das linhas.

```php
public private(set) array $loads
```

As operações de relação deixadas para você aguardar, indexadas pelo nome da relação; vazio com ponte
de await.

```php
public private(set) null|Pagination $Pagination
```

A paginação de uma operação de `paginate()`, resolvida; `null` para qualquer outra operação.

```php
public null|object $entity { get; }
```

A primeira entidade, ou `null`.

```php
public int $count { get; }
```

O número de entidades.

```php
public bool $empty { get; }
```

Se não há nenhuma entidade.
