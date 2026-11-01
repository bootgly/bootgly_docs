# Seeders

Seeders são scripts SQL de dados reexecutáveis. Use depois das migrations quando um projeto
precisa de dados de demo, linhas de lookup ou defaults locais.

> O passo a passo completo da CLI está no guia
> **[Seeders de banco](/guide/database-seeders/overview/)**. Esta página explica os objetos
> por trás do arquivo.

## O fluxo

```bash
bootgly project <name> seed create "Demo Users"  # 1. make a file
# edit the file
bootgly project <name> seed list                 # 2. see available seeders
bootgly project <name> seed run --dry-run        # 3. preview SQL
bootgly project <name> seed run                  # 4. run all
bootgly project <name> seed run demo_users       # or one
```

`seed` sem ação lista os seeders. `create` e `list` trabalham só com os arquivos. `run`, com ou
sem `--dry-run`, abre o banco pelo escopo `configs/database/` do projeto e para com
`Project has no configs directory: <name>` ou `Project has no database config scope: <name>`
quando o projeto não o tem. **[Projetos](/manual/Bootgly/essential/projects/overview/)** lista
cada ação com a sua saída.

## O arquivo que você edita

`create` escreve um slug estável em `<project>/database/seeders/`, por exemplo
`demo_users.php`. Ele retorna um `Seeder` com uma closure `Run`:

```php
use Bootgly\ADI\Databases\SQL;
use Bootgly\ADI\Databases\SQL\Builder\Identifier;
use Bootgly\ADI\Databases\SQL\Seed;
use Bootgly\ADI\Databases\SQL\Seed\Seeder;

return new Seeder(
   Run: fn (SQL $Database, Seed $Seed) => $Database
      ->table(new Identifier('users'))
      ->insert()
      ->set(new Identifier('email'), $Seed->fake('Email', seed: 1))
);
```

Regras práticas:

- Retorne `null`, uma string de SQL raw, um `Builder`, uma `Query` compilada ou um array deles.
  Arrays podem se aninhar; as queries rodam em ordem e entradas `null` são puladas. Qualquer
  outra coisa para a execução com
  `Seeder must return null, string, Builder, Query, or an array of those.`
- Mantenha arquivos de seeder apenas como retorno. Não declare símbolos top-level como
  `class` ou `function` neles, porque um runner pode requerer o mesmo arquivo mais de uma vez
  no mesmo processo PHP.
- O nome do arquivo sem `.php` é o nome do seeder: `seed run <seeder>` seleciona por ele e o
  runner o reporta. `Seeder` também aceita um `name:` opcional, que só o objeto guarda — o
  runner nunca seleciona por ele.
- Escreva a idempotência no seeder com `upsert`, deletes com filtro, limpeza ou uma leitura
  antes (veja **[Quando a closure roda](#quando-a-closure-roda)**). Seeders não têm tabela de
  histórico.
- No PostgreSQL o runner segue cada INSERT de `Builder` que grava um valor inteiro com o resync de
  identidade do dialeto (`Dialect::resync()`), então os ids inteiros que ele grava não deixam a
  sequência para trás; `preview()` o lista. Strings de SQL raw, objetos `Query` compilados e
  tabelas ou colunas `Expression` não são rastreados. O papel que roda os seeders precisa de
  `USAGE`/`SELECT` e `UPDATE` nessas sequências — veja
  **[Ids fixos em qualquer banco](/guide/database-seeders/overview/#ids-fixos-em-qualquer-banco)**.

## Valores falsos

`$Seed->fake($kind, seed: ...)` retorna um valor dos fakers do próprio Bootgly
(`Bootgly\ACI\Fakers`):

| Tipo | Retorna | Com `seed: 1` |
| --- | --- | --- |
| `Email` | um endereço `nome.sobrenome@domínio` em minúsculas, em `example.com`, `test.org`, `mail.dev` ou `demo.net` | `frank.davis@test.org` |
| `Integer` | um inteiro de `0` a `PHP_INT_MAX` | `9171440914760070181` |
| `Name` | um nome e um sobrenome | `Frank Davis` |
| `Text` | cinco palavras de lorem ipsum | `ut consectetur lorem labore elit` |
| `UUID` | um UUID versão 4 | `25f4c16a-eb80-47ff-8c2f-67b84814bcee` |

O tipo é comparado sem diferenciar maiúsculas, então `'uuid'` também funciona. Uma seed torna o
valor repetível: o mesmo tipo e a mesma seed retornam o mesmo valor em toda execução, então dê a
cada linha a sua própria seed (`seed: $i`). Sem seed, cada chamada retorna um valor aleatório
novo. Um tipo desconhecido lança `LogicException` com `Faker not found: <kind>`.

Dois limites importam num seeder. Os nomes vêm de 16 nomes e 14 sobrenomes, então os valores se
repetem cedo: a seed 8 dá o mesmo nome e endereço que a seed 5, e as seeds de 1 a 100 dão 79
valores distintos. Não preencha uma coluna `UNIQUE` com eles; monte esses valores a partir do
número da linha (`"user{$i}@example.test"`). E `fake()` não define limites: `Integer` vai de `0`
a `PHP_INT_MAX`, mais do que uma coluna `INTEGER` do PostgreSQL ou do MySQL comporta, e `Text`
tem sempre cinco palavras. Para uma faixa ou um tamanho, construa a própria classe do faker e
defina `min`/`max` ou `words`, como **[Fakers](/testing/deep/fakers/overview/)** mostra.

## Quando a closure roda

O runner chama `Run` primeiro e executa o que ela retorna depois. No PostgreSQL e no SQLite, as
queries que um seeder retorna rodam em uma transação própria: quando uma falha, as outras
queries retornadas por aquele seeder são desfeitas. O MySQL as roda uma a uma, sem transação,
então as instruções anteriores à que falhou continuam aplicadas.

Os seeders rodam um depois do outro, em ordem de nome de arquivo. Um seeder que falha para a
execução com o seu erro: os seeders anteriores continuam aplicados, e os seguintes nunca rodam.

Como `Run` executa antes de essa transação abrir, um seeder pode ler o banco para decidir o que
escrever. Este não escreve nada quando a tabela já tem usuários, então rodá-lo de novo é seguro:

```php
use Bootgly\ADI\Databases\SQL;
use Bootgly\ADI\Databases\SQL\Builder\Identifier;
use Bootgly\ADI\Databases\SQL\Seed;
use Bootgly\ADI\Databases\SQL\Seed\Seeder;

return new Seeder(
   Run: function (SQL $Database, Seed $Seed): array {
      $Operation = $Database->await($Database->query('SELECT count(*) AS n FROM users'));

      // ? The users are already there
      if ((int) $Operation->Result?->cell > 0) {
         return [];
      }

      return [
         $Database->table(new Identifier('users'))
            ->insert()
            ->set(new Identifier('email'), $Seed->fake('Email', seed: 1))
            ->set(new Identifier('name'), $Seed->fake('Name', seed: 1)),
      ];
   }
);
```

O mesmo momento vale para tudo o que a própria closure executa. Uma instrução enviada com
`$Database->query()` dentro de `Run` é confirmada por conta própria, fora da transação do
seeder: uma query retornada que falha depois não a desfaz, e um dry run também a executa.
Mantenha as escritas no que `Run` retorna.

## Rode seeders pelo código

A CLI envolve `Bootgly\ADI\Databases\SQL\Seed\Runner`. Construa um com o banco, o diretório de
seeders e o caminho de um arquivo de lock, e então rode todos os seeders ou um pelo nome:

```php
use Bootgly\ADI\Databases\SQL;
use Bootgly\ADI\Databases\SQL\Seed\Runner;

$Database = new SQL([
   'driver' => 'sqlite',
   'database' => __DIR__ . '/app.sqlite',
]);

$Runner = new Runner($Database, __DIR__ . '/database/seeders', __DIR__ . '/storage/locks/seeders.lock');

$Runner->preview();         // ['demo_users' => [['sql' => 'INSERT INTO …', 'parameters' => […]]]]
$Runner->run();             // ['demo_users']
$Runner->run('demo_users'); // ['demo_users']
```

`run()` retorna os nomes dos seeders que rodou, em ordem. `preview()` compila as mesmas queries
sem executá-las — o formato está na **[Referência](#referência)**.

Para semear toda vez que o projeto sobe, chame o runner na função de boot dele, logo depois das
migrations de
**[Rodar migrations no boot](/manual/ADI/Databases/SQL/Schema/Migrations/overview/#rodar-migrations-no-boot)**
e no mesmo handle, como o cookbook **[Polls](/cookbook/web/polls/overview/)** faz. Todo boot roda
todos os seeders de novo, então faça isso só com seeders seguros de reexecutar:

```php
use Bootgly\ADI\Databases\SQL;
use Bootgly\ADI\Databases\SQL\Schema\Runner as Migrations;
use Bootgly\ADI\Databases\SQL\Seed\Runner as Seeds;
use Bootgly\API\Environment\Configs\DatabaseConfig;
use Bootgly\API\Projects\Project;

return new Project(
   name: 'App',
   exportable: false,

   boot: function (array $arguments = [], array $options = []): void
   {
      $Database = new SQL(new DatabaseConfig(BOOTGLY_PROJECT->Configs->get('database'))->configure());
      new Migrations($Database, __DIR__ . '/database/migrations', BOOTGLY_STORAGE_DIR . 'locks/migrations/App.lock')->up();
      new Seeds($Database, __DIR__ . '/database/seeders', BOOTGLY_STORAGE_DIR . 'locks/seeders/App.lock')->run();

      // @ Start the application here
   }
);
```

Os dois arquivos de lock são os que `bootgly project App migrate` e `bootgly project App seed`
usam, então um boot e uma execução pela CLI do mesmo projeto se excluem: o que chegar depois
falha na hora.

## Locks

`run()` pega dois locks antes de carregar qualquer seeder e solta os dois quando termina, com
falha ou não. Nenhum espera: uma execução que encontra um deles ocupado para na hora.

- **O arquivo de lock** que você passa. Ele guarda o PID da execução que o pegou; uma segunda
  execução no mesmo arquivo falha com `Seeder lock is already active.` Um lock deixado por um
  processo que não existe mais é retomado. Um arquivo `<lock>.guard` fica ao lado dele de
  propósito. O arquivo de lock da CLI é `storage/locks/seeders/<name>.lock`, com cada `/` do
  nome de um projeto aninhado escrito como `~` (`App~API.lock`).
- **Um lock advisory** no banco, no PostgreSQL (`pg_try_advisory_lock`) e no MySQL
  (`GET_LOCK`), com a chave tirada da string do caminho dos seeders. Uma segunda execução do
  mesmo caminho no mesmo banco, no PostgreSQL, ou no mesmo servidor, no MySQL — de outro
  processo, de outra máquina ou com outro arquivo de lock — falha com
  `Seeder advisory lock is already active.` O SQLite não tem lock advisory.

`preview()` não pega nenhum dos dois, então um dry run pode se sobrepor a uma execução real. O
runner solta o lock advisory dele como o runner de migrations, então precisa do mesmo handle — um
novo, ou um com `pool.max` em `1`, e sem `replicas`: veja
**[Locks](/manual/ADI/Databases/SQL/Schema/Migrations/overview/#locks)**.

## Referência

### Runner

```php
public function __construct (SQLDatabase $Database, string $path, string $lock, null|Seed $Seed = null)
```

`$Database` é a fachada `Bootgly\ADI\Databases\SQL` (`SQLDatabase` é o alias com que o código
fonte a importa); o dialeto de schema dela decide as transações e o lock advisory. `$path` é o
diretório de seeders e `$lock` o caminho do arquivo de lock — o diretório dele é criado no
primeiro `run()`. `$Seed` é o contexto que toda closure `Run` recebe: um `Seed` comum quando
omitido, ou uma subclasse sua para dar helpers extras aos seeders. Construir o runner não lê
nenhum arquivo nem abre conexão. O runner guarda esses valores como propriedades somente
leitura: `$Database`, `$Seeders`, `$Seed` e `$Guard`, o helper de lock e execução que o runner de
migrations também usa.

```php
public function create (string $name): string
```

Escreve um seeder stub e retorna o caminho dele. O nome do arquivo é o slug de `$name`: em
minúsculas, cada sequência de caracteres fora de `a-z` e `0-9` trocada por `_`, sem `_` nas
pontas — `Demo Users` vira `demo_users.php`. Letras acentuadas contam como outros caracteres
(`Ação` vira `a_o.php`). Um nome sem letra nem dígito vira `seeder.php`, e hoje o nome `0`
também. O diretório é criado quando falta. Um arquivo existente nunca é sobrescrito:
`InvalidArgumentException` com `Seeder already exists: <slug>.`

```php
public function discover (): array
```

Retorna `['<seeder>' => '<arquivo>', …]` para cada arquivo `*.php` do diretório, ordenado pelo
nome do arquivo, que é a ordem que `run()` segue. Um diretório ausente dá `[]`.

```php
public function preview (null|string $name = null): array
```

Chama `Run` para cada seeder, ou para o nomeado, e compila o que ele retorna sem executar:

```php
[
   'demo_users' => [
      ['sql' => 'INSERT INTO "users" ("email", "name") VALUES ($1, $2)', 'parameters' => ['frank.davis@test.org', 'Frank Davis']],
   ],
   'empty' => [], // a seeder that returned null
]
```

No PostgreSQL um INSERT que grava um valor inteiro — não o de cima — vem seguido do seu resync
de identidade. `preview()` não pega lock, e uma instrução que a própria closure executa ainda
roda.

```php
public function run (null|string $name = null): array
```

Pega os locks, depois carrega e aplica cada seeder em ordem de nome de arquivo, ou o nomeado, e
retorna os nomes que rodou. Um nome desconhecido falha antes de qualquer seeder rodar, com
`RuntimeException` `Seeder file not found: <seeder>.`

### Seeder

```php
public function __construct (Closure $Run, string $name = '')
```

`$Run` recebe `(SQL $Database, Seed $Seed)` e retorna o que o runner executa. `$name` fica
guardado no objeto; quando está vazio, carregar o arquivo o define com o nome do arquivo.

```php
public function run (SQLDatabase $Database, Seed $Seed): mixed
```

Chama `Run` e retorna o resultado como veio; o runner o valida depois.

```php
public function name (string $name): void
```

Define o nome. `Seeders::load()` o chama com o nome do arquivo quando o arquivo deixou o nome
vazio.

### Seeders

```php
public function __construct (string $path)
```

Trabalha com os arquivos de seeder de um diretório. O runner constrói um a partir do seu `$path`.

```php
public function discover (): array
```

A lista por trás de `Runner::discover()`.

```php
public function load (string $file): Seeder
```

Requer o arquivo — de novo a cada chamada — e retorna o `Seeder` dele. Um arquivo que retorna
qualquer outra coisa lança `InvalidArgumentException` com
`Seeder file must return a Seeder object.`

```php
public function create (string $name): string
```

O escritor de stubs por trás de `Runner::create()`.

```php
public function resolve (string $file): string
```

O nome de seeder de um arquivo: o nome base dele sem `.php`.

### Seed

```php
public function fake (string $kind, null|int $seed = null): mixed
```

Um valor falso de `$kind` — veja **[Valores falsos](#valores-falsos)**.

### Erros

| Mensagem | Classe | Quando |
| --- | --- | --- |
| `Seeder already exists: <slug>.` | `InvalidArgumentException` | `create()` encontra o arquivo |
| `Seeder file must return a Seeder object.` | `InvalidArgumentException` | `run()` ou `preview()` carrega um arquivo que retorna outra coisa |
| `Seeder must return null, string, Builder, Query, or an array of those.` | `InvalidArgumentException` | `Run` retornou outro valor |
| `Seeder file not found: <seeder>.` | `RuntimeException` | `run($name)` ou `preview($name)` com um nome desconhecido |
| `Seeder lock is already active.` | `RuntimeException` | `run()` encontra o arquivo de lock ocupado |
| `Seeder advisory lock is already active.` | `RuntimeException` | `run()` no PostgreSQL ou no MySQL encontra o lock advisory ocupado |
| `Seeder advisory lock hashing requires 64-bit PHP.` | `RuntimeException` | `run()` em PHP de 32 bits |
| `Faker not found: <kind>` | `LogicException` | `$Seed->fake()` com um tipo desconhecido |

Uma query que falha lança `RuntimeException` com a mensagem do driver, como
`relation "users" does not exist` no PostgreSQL. `bootgly project <name> seed` imprime a
mensagem de qualquer um desses e sai com status 1.

Hoje, quando a conexão cai com a transação de um seeder aberta, o rollback também falha e o erro
dele substitui o original: a execução reporta `PostgreSQL socket closed.` onde o servidor disse
`terminating connection due to administrator command`.

### Docs ORM relacionadas

- **[ORM Model](/manual/ADI/Databases/SQL/Model/overview/)** - metadata de entidades para tabelas populadas por seeders.
- **[ORM Repository](/manual/ADI/Databases/SQL/Repository/overview/)** - hidrate dados populados para entidades.
