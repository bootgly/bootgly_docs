# Migrations

Uma migration é um arquivo que diz "faça esta mudança no banco" e "como desfazer". Você
cria migrations conforme a app cresce; rodá-las deixa qualquer banco em dia.

> O passo a passo completo via CLI está no guia
> **[Migrations de banco](/guide/database-migrations/overview/)**. Esta página explica o
> arquivo que você edita, o que o runner registra e como ler o que aconteceu.

## O fluxo

```bash
bootgly project <name> migrate create "Create Users Table"  # 1. make a file
# edit the file (next section)
bootgly project <name> migrate up                           # 2. apply every pending file
bootgly project <name> migrate status                       # 3. see the state
bootgly project <name> migrate down 1                       # undo the last one
```

- `migrate` sem ação roda o `status`.
- `migrate up 2` aplica no máximo os próximos dois arquivos pendentes. Por enquanto a quantidade
  é truncada para um número inteiro — `up 2.5` aplica dois —, e uma que não é número (`up 2x`) ou
  que fica abaixo de 1 (`up 0`, `up 0.5`, `up -1`, cujo `-1` a CLI lê como opção) aplica todos os
  arquivos pendentes. O `--help` do comando ainda não mostra o limite.
- `migrate down` precisa da quantidade, truncada do mesmo jeito: `down 1.9` reverte uma. Sem um
  número — um `migrate down` sozinho, `down 2x`, ou `down -1`, lido como opção — ele para com
  `Migration down requires a numeric step count.`, e abaixo de 1 (`down 0`, `down 0.5`) com
  `Migration down requires a positive step count.`
- `migrate sync` reescreve o histórico sem rodar nada — veja
  [Sincronizando o histórico com os arquivos](#sincronizando-o-histórico-com-os-arquivos).

Toda ação exceto `create` abre o banco do projeto a partir do escopo de config `database` dele:
**[Configurar o banco](/guide/database-migrations/overview/#1-configurar-o-banco)** lista o que o
comando precisa.

## O arquivo que você edita

O `create` cria um stub com timestamp em `<project>/database/migrations/` — e cria a pasta quando
ela não existe —, por exemplo `20260515120000_create_users_table.php`. O arquivo retorna uma
`Migration` montada com duas closures, e cada closure recebe o `$Schema`:

```php
use Bootgly\ADI\Databases\SQL\Schema\Auxiliaries\Keys;
use Bootgly\ADI\Databases\SQL\Schema\Auxiliaries\Types;
use Bootgly\ADI\Databases\SQL\Schema\Blueprint;
use Bootgly\ADI\Databases\SQL\Schema\Migrating;
use Bootgly\ADI\Databases\SQL\Schema\Migration;

return new Migration(
   // Up = the change you want
   Up: fn (Migrating $Schema) => $Schema->create('users', function (Blueprint $Table): void {
      $Table->add('id', Types::BigInteger)->generate()->constrain(Keys::Primary);
      $Table->add('email', Types::String)->limit(190)->constrain(Keys::Unique);
   }),

   // Down = exactly how to undo Up
   Down: fn (Migrating $Schema) => $Schema->drop('users')
);
```

O `$Schema` é o **[Schema Builder](/manual/ADI/Databases/SQL/Schema/overview/)** do banco — o
objeto que `$Database->structure()` retorna (veja
**[Pontos de entrada](/manual/ADI/Databases/SQL/overview/#pontos-de-entrada)**). O tipo dele na
closure, `Migrating`, é a interface com os sete métodos do Schema Builder que uma migration usa:
`create`, `alter`, `drop`, `rename`, `index`, `unindex` e `unconstrain`. Cada um retorna uma
`Query` compilada; nada roda até o runner executar o que a closure retornou.

Regras práticas:

- **`Down` desfaz o `Up`.** Criou uma tabela no `Up`? Remova no `Down`. É isso que faz o
  `migrate down` funcionar.
- **Nunca edite um arquivo que já rodou.** O runner aplica cada arquivo uma vez só; entregue uma
  mudança de schema como uma migration nova.

### O que Up e Down retornam

| A closure retorna | O que roda |
|---|---|
| `null` | nada — a migration é registrada mesmo assim (no `up`) ou removida (no `down`) |
| uma `Query`, que todo método do `$Schema` retorna | essa instrução, com os parâmetros dela |
| uma string SQL | essa instrução como está escrita, sem parâmetros |
| um `Builder` | a instrução que ele compila |
| um array desses, inclusive arrays aninhados | cada um em ordem; um `null` dentro dele é pulado |

Uma tabela e o índice dela, por exemplo, vão em uma lista:

```php
use Bootgly\ADI\Databases\SQL\Schema\Auxiliaries\Keys;
use Bootgly\ADI\Databases\SQL\Schema\Auxiliaries\Types;
use Bootgly\ADI\Databases\SQL\Schema\Blueprint;
use Bootgly\ADI\Databases\SQL\Schema\Migrating;
use Bootgly\ADI\Databases\SQL\Schema\Migration;

return new Migration(
   Up: fn (Migrating $Schema) => [
      $Schema->create('posts', function (Blueprint $Table): void {
         $Table->add('id', Types::BigInteger)->generate()->constrain(Keys::Primary);
         $Table->add('slug', Types::String)->limit(120);
      }),
      $Schema->index('posts', 'slug', unique: true),
   ],

   // Dropping the table drops its index with it
   Down: fn (Migrating $Schema) => $Schema->drop('posts')
);
```

- Um índice precisa do `$Schema->index()` na lista, como acima. Por enquanto, um
  `$Table->index()` dentro de uma closure de `create()` ou `alter()` é descartado: a instrução
  compila sem o índice, e um `alter()` sem mais nada lança
  `ALTER TABLE requires at least one schema action.` (veja
  **[Blueprint](/manual/ADI/Databases/SQL/Schema/Blueprint/overview/)**).
- Uma string carrega uma instrução. Com duas, o PostgreSQL roda as duas, o MySQL recusa a string
  com `1064` e o SQLite roda só a primeira (veja
  **[Uma instrução por query](/manual/ADI/Databases/SQL/Drivers/overview/#uma-instrução-por-query)**):
  retorne uma lista.
- Qualquer outro valor — um número, um objeto que não é nem `Builder` nem `Query` — para a
  execução com `Migration must return null, string, Builder, Query, or an array of those.`, e uma
  string vazia ou em branco com `SQL cannot be empty.`. As duas checagens acontecem antes de
  qualquer instrução daquela migration rodar.

### O nome da migration

O nome do arquivo sem `.php` é o nome da migration e o lugar dela na ordem: o runner ordena os
arquivos pelo nome, o timestamp `YmdHis` que o `create` escreve mantém a ordem de criação, e a
tabela de histórico guarda esse nome.

- O `create` monta o resto do nome a partir do seu texto: minúsculas, toda sequência de
  caracteres fora de `a-z` e `0-9` vira `_`, e um resultado vazio vira `migration`. Letras fora do
  ASCII contam como outros caracteres (`"São Paulo"` → `s_o_paulo`), e por enquanto o texto `0`
  também vira `migration`. Duas chamadas de `create` que chegam ao mesmo nome no mesmo segundo
  escrevem o mesmo arquivo: a segunda substitui a primeira.
- **Mantenha o nome em até 191 caracteres**, com o timestamp — o `create` escreve 15 antes do seu
  texto. Esse é o tamanho da coluna `migration` da tabela de histórico no PostgreSQL e no MySQL, e
  por enquanto nada o checa: um nome maior faz o PostgreSQL falhar com
  `value too long for type character varying(191)` e reverter a migration, e o MySQL falhar com
  `1406: Data too long for column 'migration' at row 1` depois que as instruções da migration
  rodaram, então a execução seguinte falha no que elas criaram. O SQLite aceita qualquer tamanho.
- **Não renomeie um arquivo que já rodou.** O histórico guarda o nome antigo, então o arquivo
  aparece como pendente e o nome antigo como uma linha DB only
  ([Lendo o status](#lendo-o-status)).
- **Deixe de fora o terceiro argumento da `Migration`, `name:`.** Por enquanto o histórico
  registra esse nome enquanto o runner continua casando os arquivos pelo nome do arquivo: a
  migration aparece como pendente e DB only ao mesmo tempo, o próximo `up` a roda de novo, e o
  `down` para com `Migration file not found: <migration>.`

## Lendo o status

```bash
bootgly project <name> migrate status
```

```text
┌ Migration Status ───────────────────────────────┐
│ Applied      4                                  │
│ Local only   2                                  │
│ DB only      1                                  │
│ Next         20260515120000_create_tags_table   │
│ Remove       20260410090000_create_drafts_table │
└─────────────────────────────────────────────────┘
```

| Linha | Significado |
|---|---|
| Applied | todas as linhas da tabela de histórico, inclusive as DB only |
| Local only | arquivos pendentes: o `migrate up` os aplica |
| DB only | linhas do histórico cujo arquivo sumiu, apagado ou renomeado |
| Next | o primeiro arquivo pendente, o próximo que o `up` aplica; aparece quando existe |
| Remove | a primeira linha DB only; aparece quando existe |

Uma linha DB only para o `migrate down` quando ele chega nela, com
`Migration file not found: <migration>.`: devolva o arquivo, ou remova a linha com o
[migrate sync](#sincronizando-o-histórico-com-os-arquivos).

> **O status também escreve.** Por enquanto, o `status` — assim como o `Runner::report()` e toda
> outra ação exceto `create` — roda primeiro um `CREATE TABLE IF NOT EXISTS` para a tabela de
> histórico, mesmo quando a tabela existe. Então:
>
> - o usuário do banco precisa de permissão para criar tabelas: um papel que só lê o histórico
>   falha com `permission denied for schema public` no PostgreSQL e
>   `1142: CREATE command denied to user …` no MySQL, e uma sessão PostgreSQL somente leitura com
>   `cannot execute CREATE TABLE in a read-only transaction`;
> - o `status` não pega lock: em um banco PostgreSQL que ainda não tem a tabela de histórico, um
>   `status` iniciado no mesmo instante que um `migrate up` pode fazer um deles falhar com
>   `duplicate key value violates unique constraint "pg_type_typname_nsp_index"` — rode de novo;
> - o `migrate sync` cria a tabela antes de perguntar, então a tabela existe mesmo quando você
>   responde não.

## Sincronizando o histórico com os arquivos

O `migrate sync` faz o histórico bater com os arquivos sem rodar nenhum `Up` ou `Down`:

- ele apaga toda linha DB only;
- ele registra todo arquivo Local only como aplicado, em um batch novo.

O segundo efeito é a armadilha: uma migration pendente vira "aplicada" sem nunca ter rodado. Rode
o `migrate up` antes, a menos que adotar os arquivos seja o objetivo — um banco cujas tabelas já
existem, criadas por outros meios.

O comando mostra a checagem primeiro e depois pergunta:

```text
┌ Migration Sync Check ───────────────────────────┐
│ Applied      4                                  │
│ Add          2                                  │
│ Delete       1                                  │
│ Add first    20260515120000_create_tags_table   │
│ Delete first 20260410090000_create_drafts_table │
└─────────────────────────────────────────────────┘

❯ Apply migration sync to _bootgly_migrations? [y/N] [y/N]
```

`y` ou `yes`, em maiúsculas ou minúsculas, segue em frente, e o comando informa
`Migration Sync Applied` com as contagens `Added` e `Deleted`. `n`, `no`, Enter ou o fim da
entrada cancelam com `Migration sync cancelled.`; qualquer outra resposta pergunta de novo em um
terminal e cancela sem um. Um script confirma pela entrada:
`echo y | bootgly project <name> migrate sync`. Sem nada para mudar, ele imprime
`Migration history is already synchronized.` e não pergunta nada. Por enquanto, a dica `[y/N]`
sai duas vezes.

## A tabela de histórico

O runner registra toda migration aplicada em uma tabela, `_bootgly_migrations` a menos que você
dê outro nome. Ele cria a tabela, com `CREATE TABLE IF NOT EXISTS`, na primeira vez que um
runner lê o histórico:

| Coluna | PostgreSQL | MySQL | SQLite | Guarda |
|---|---|---|---|---|
| `migration` | `VARCHAR(191)` | `VARCHAR(191)` | `TEXT` | o nome da migration — a chave primária |
| `batch` | `INTEGER` | `INT` | `INTEGER` | o batch que a aplicou |
| `created_at` | `TIMESTAMP` | `TIMESTAMP` | `TEXT` | quando, pelo `DEFAULT CURRENT_TIMESTAMP` |

Toda coluna é `NOT NULL`. Para usar outra tabela, defina a chave `migrations` da config SQL (veja
**[Chaves de config](/manual/ADI/Databases/SQL/overview/#chaves-de-config)**), ou passe o
argumento `table:` do runner, que vale mais que a chave:

```php
use Bootgly\ADI\Databases\SQL;
use Bootgly\ADI\Databases\SQL\Schema\Runner;

$Database = new SQL([
   'driver' => 'sqlite',
   'database' => __DIR__ . '/database/app.sqlite',
   'migrations' => 'schema_history',
]);

$Runner = new Runner($Database, __DIR__ . '/database/migrations', __DIR__ . '/database/app.migrations.lock');
$Runner->Repository->table; // 'schema_history'

$Runner = new Runner($Database, __DIR__ . '/database/migrations', __DIR__ . '/database/app.migrations.lock', table: 'deploy_history');
$Runner->Repository->table; // 'deploy_history'
```

O `bootgly project <name> migrate` sempre usa `_bootgly_migrations`: o escopo `database` do
projeto não tem nó para essa chave (veja
**[Como o escopo vira uma conexão](/guide/database-dbal/overview/#como-o-escopo-vira-uma-conexão)**).
Um projeto que dá outro nome à tabela roda as migrations pelo código —
[no boot](#rodar-migrations-no-boot), por exemplo — e a CLI não enxerga esse histórico.

## Batches e reversão

Cada `up` marca toda migration que aplica com um número de batch — o maior já registrado, mais
um —, e o `sync` faz o mesmo com os arquivos que adota. O `down` percorre o histórico da mais
nova para a mais antiga, do maior batch para o menor e, dentro de um batch, do último nome para o
primeiro: para cada migration, ele roda o `Down` e então apaga a linha dela.

```bash
bootgly project <name> migrate down 1    # revert the last applied migration
bootgly project <name> migrate down 3    # revert the last 3, whatever their batches
```

A quantidade é obrigatória, e ela conta migrations, não batches: `migrate down 0` para com
`Migration down requires a positive step count.`. Para desfazer o último deploy inteiro pela CLI,
passe o número de linhas do batch dele — a coluna `batch` da tabela de histórico. Pelo código, o
`down()` também recebe o batch:

```php
$Runner->down(PHP_INT_MAX, batch: 3); // every migration of batch 3, newest first
$Runner->down(1, batch: 3);           // only the newest one of batch 3
```

Ele alcança qualquer batch, não só o último, e não verifica se um batch posterior depende dele.
Um batch sem migrations não reverte nada, e um batch `0` ou menor lança
`Migration down requires a positive batch number.`

No PostgreSQL e no SQLite, que rodam DDL dentro de transações, cada migration roda em uma
transação própria junto com a linha de histórico dela: uma falha reverte aquela migration e para
a execução, e as migrations anteriores continuam feitas. O MySQL comita cada instrução DDL assim
que ela roda: quando uma instrução falha, as anteriores daquela migration continuam aplicadas, e
a linha de histórico dela não é escrita (no `up`) ou não é apagada (no `down`). Então escreva um
`Down` para MySQL que possa rodar duas vezes: o `drop()` usa `IF EXISTS`, mas por enquanto o
`unindex()` e o `unconstrain()` ignoram o `exists:` no MySQL e falham de novo numa nova
tentativa — remover a tabela remove os índices dela junto.

O `down` também para em uma linha de histórico cujo arquivo sumiu, com
`Migration file not found: <migration>.`, depois de reverter as migrations anteriores a ela.

## Locks

Dois locks impedem que duas execuções se sobreponham. O `up()`, o `down()` e o `sync()` pegam os
dois e soltam os dois quando retornam ou lançam; o `report()`, por trás do `migrate status`, não
pega nenhum.

1. **Um arquivo de lock**, no caminho que você passa ao runner. A CLI usa
   `storage/locks/migrations/<name>.lock` no kit, com uma `/` do nome do projeto escrita como `~`
   e um `.` como `%2E` — `Demo/HTTP_Server_CLI` trava `Demo~HTTP_Server_CLI.lock`. O runner cria
   a pasta, escreve o PID dele no arquivo e apaga o arquivo ao soltar; o arquivo `<lock>.guard`
   ao lado continua lá, por design. Um arquivo de lock cujo PID não roda mais é retomado. Um
   preso por um processo vivo — ou um sem a linha `pid=` — para a execução com
   `Migration lock is already active.`: apague-o à mão só quando nenhuma execução estiver em
   andamento.
2. **Um advisory lock**, no PostgreSQL (`pg_try_advisory_lock`) e no MySQL (`GET_LOCK`); o
   SQLite não tem. A chave vem do caminho das migrations — os primeiros 15 dígitos hexadecimais
   do SHA-256 dele —, então duas execuções sobre o mesmo caminho se excluem seja qual for o
   processo ou a máquina de onde partem, dentro de um banco no PostgreSQL e no servidor inteiro
   no MySQL, enquanto execuções sobre caminhos diferentes nunca se excluem. Ele não espera:
   quando outra sessão o segura, a execução para na hora com
   `Migration advisory lock is already active.`. O runner calcula a chave em toda engine, então um
   PHP de 32 bits para toda execução, inclusive no SQLite, com
   `Migration advisory lock hashing requires 64-bit PHP.`

O advisory lock pertence à sessão do banco que o pegou, e por enquanto o runner o solta pela
sessão do pool que estiver livre naquele momento. Em um handle novo, é a mesma sessão, porque o
runner manda uma instrução por vez. Um handle que já tem várias sessões ociosas, ou que manda
leituras para `replicas` — a liberação é uma leitura, que vai para lá na hora quando o
`routing.sticky` é `0` —, pode soltá-lo em outra sessão: o lock fica preso até a primeira sessão
fechar, e toda execução sobre aquele caminho falha com
`Migration advisory lock is already active.` enquanto isso. Dê ao runner um handle novo, ou um com
`pool.max` em `1` (veja **[Tamanho do pool](/manual/ADI/Database/Config/overview/#tamanho-do-pool)**),
e nos dois casos sem `replicas`.

A CLI e a receita de [Rodar migrations no boot](#rodar-migrations-no-boot) montam um handle novo a
partir do escopo `database` do projeto. Quando esse escopo declara `replicas`, o lock pode durar
mais que a execução: o da CLI até o comando terminar, o do boot até o handle dele fechar. O runner
de seeders pega e solta o advisory lock dele do mesmo jeito.

## Eventos

O runner anuncia cada migration no barramento de eventos antes de rodá-la (veja
**[ADI — Banco SQL](/guide/events/overview/#adi--banco-sql)** no guia de eventos):

```php
use Bootgly\ABI\Events\Emission;
use Bootgly\ABI\Events\Emitter;
use Bootgly\ADI\Databases\SQL\Schema\Migration\Events;

Emitter::$Instance->listen(Events::Up, function (Emission $Emission) {
   [$Migration, $batch] = $Emission->payload;

   error_log("applying {$Migration->name} in batch {$batch}");
});
```

- `Up` e `Down` disparam antes das instruções da migration e fora da transação dela, então um
  listener também fica sabendo de uma migration que depois falha.
- Por enquanto, o `Down` carrega o batch `0`, não o batch sendo revertido.
- Um listener que lança para a execução antes da primeira instrução daquela migration, e a
  exceção dele chega a quem chamou — a CLI imprime a mensagem.

## Rodar migrations no boot

Para deixar o banco em dia toda vez que o projeto sobe, rode o runner na função de boot do
`<Name>.Project.php`, sobre o escopo de config `database` que a CLI lê:

```php
<?php

use Bootgly\ADI\Databases\SQL;
use Bootgly\ADI\Databases\SQL\Schema\Runner;
use Bootgly\API\Environment\Configs\DatabaseConfig;
use Bootgly\API\Projects\Project;


return new Project(
   name: 'Blog',
   exportable: true,
   boot: function (array $arguments = [], array $options = []): void
   {
      // @ Migrate first: a failure stops the boot before anything starts
      $Database = new SQL(new DatabaseConfig(BOOTGLY_PROJECT->Configs->get('database'))->configure());
      new Runner($Database, __DIR__ . '/database/migrations', BOOTGLY_STORAGE_DIR . 'locks/migrations/Blog.lock')->up();

      // @ Then configure and start the server or the console app
   }
);
```

- Em um projeto servidor, mantenha essas linhas antes do `start()`. O `start()` faz o fork dos
  workers, e esse handle não deve chegar às rotas, que usam `$Response->Database` (veja
  **[Usar em um script ou comando](/guide/database-dbal/overview/#usar-em-um-script-ou-comando)**).
- Sem nada pendente, uma subida só pega os locks, checa a tabela de histórico e a lê.
- Uma migration que falha lança para fora da função de boot: o projeto não sobe, e a exceção é
  impressa.
- O arquivo de lock é o que o `bootgly project Blog migrate` pega: no `storage/locks/migrations/`
  do kit, com o nome do caminho do projeto, e cada `/` de um aninhado escrita como `~` (veja
  [Locks](#locks)). Assim um boot e uma execução pela CLI do projeto se excluem em toda engine,
  inclusive no SQLite: o que chegar depois falha na hora, e um boot que chega depois não sobe o
  projeto. Com um arquivo de lock seu, só o advisory lock os mantém separados, e o SQLite não tem
  um.
- O handle é novo, como o advisory lock precisa — a menos que o escopo `database` do projeto
  declare `replicas` (veja [Locks](#locks)).
- Seeders rodam do mesmo jeito, depois das migrations: veja
  **[Seeders](/manual/ADI/Databases/SQL/Seed/overview/)**.

Os cookbooks **[Guestbook](/cookbook/web/guestbook/overview/)** (SQLite) e
**[Polls](/cookbook/web/polls/overview/)** (PostgreSQL) migram no boot em projetos inteiros, cada
um com um arquivo de lock próprio na pasta do projeto.

## Erros

| Mensagem | Lançada por | Causa |
|---|---|---|
| `Migration down requires a positive step count.` | `down()` | `$steps` é `0` ou menor — `migrate down 0` |
| `Migration down requires a positive batch number.` | `down()` | `$batch` é `0` ou menor |
| `Migration file must return a Migration object.` | `up()`, `down()` | Um arquivo de migration retorna outra coisa |
| `Migration must return null, string, Builder, Query, or an array of those.` | `up()`, `down()` | Uma closure `Up` ou `Down` retorna outro valor |
| `SQL cannot be empty.` | `up()`, `down()` | Uma closure retorna uma string vazia ou em branco |
| Um erro de compilação do Schema Builder, ex.: `SQLite schema dialect lacks capability: AlterColumnType.` | `up()`, `down()` | Uma closure monta uma instrução que o dialeto recusa; nada daquela migration roda |
| `Migration file not found: <migration>.` | `down()` | A linha de histórico a reverter não tem arquivo |
| `Migration history row is missing the migration name.` | `down()` | Uma linha de histórico sem nome — vinda de um `Repository` próprio |
| `Migration lock is already active.` | `up()`, `down()`, `sync()` | O arquivo de lock pertence a um processo vivo |
| `Migration advisory lock is already active.` | `up()`, `down()`, `sync()` | Outra sessão segura o advisory lock |
| `Migration advisory lock hashing requires 64-bit PHP.` | `up()`, `down()`, `sync()` | O PHP é um build de 32 bits |
| O erro do servidor, ex.: `relation "users" already exists` | `up()`, `down()`, `sync()`, `report()` | Uma instrução falhou |

As seis primeiras são `InvalidArgumentException` e as demais `RuntimeException`. Quando o
PostgreSQL derruba a conexão no meio de uma migration, o erro que você recebe pode ser o do
rollback que falhou, `PostgreSQL socket closed.`, em vez da causa; nada daquela migration é
comitado.

A CLI captura o que o runner lança — todos os erros acima —, imprime a mensagem e sai com status
`1`. Ela acrescenta mensagens próprias: `Migration down requires a numeric step count.` para um
`down` sem número, `Invalid migration action: <action>` para uma ação desconhecida, e as
checagens de projeto e de config de
**[Configurar o banco](/guide/database-migrations/overview/#1-configurar-o-banco)**. O que falha
fora do runner não é capturado: uma config de banco inválida — como
`Unsupported database TLS mode: <mode>.` — ou um `create` que não consegue escrever o arquivo
imprime a exceção não capturada e sai com status `255`.

## Referência

### Runner

O `Bootgly\ADI\Databases\SQL\Schema\Runner` roda as migrations de uma pasta em um banco. A CLI
monta um por comando.

```php
__construct (SQLDatabase $Database, string $path, string $lock, null|string $table = null, null|Repository $Repository = null)
```

Monta um runner sobre os arquivos de migration em `$path`, com `$lock` como arquivo de lock.
`SQLDatabase` é a fachada `Bootgly\ADI\Databases\SQL`. A tabela de histórico é `$table`, ou a
chave de config `migrations` do banco quando ele é `null`. `$Repository` substitui a fábrica de
queries do histórico, o `Schema\Repository` — as instruções `create()`, `fetch()`, `peek()`,
`insert()` e `delete()` dele —, e então `$table` não é usado. Nada é lido, escrito ou conectado
ainda.

```php
report (): array
```

Cria a tabela de histórico quando este runner ainda não a checou, então compara o histórico com
os arquivos e retorna `['applied' => …, 'pending' => …, 'missing' => …, 'files' => …]`: `applied`
traz as linhas do histórico (`migration`, `batch`, `created_at`), da mais nova para a mais antiga;
`pending`, os nomes com arquivo e sem linha, na ordem dos arquivos; `missing`, os nomes com linha
e sem arquivo; e `files` mapeia o nome de cada arquivo para o caminho dele. O `created_at` volta
como o driver o decodifica: um `DateTimeImmutable` no PostgreSQL e no MySQL, uma string no
SQLite. Não pega lock.

```php
up (int $limit = 0): array
```

Aplica as migrations pendentes na ordem dos arquivos, como um batch novo, sob os dois locks, e
retorna os nomes delas. Um `$limit` acima de `0` aplica no máximo essa quantidade; `0` ou menos
aplica todas.

```php
down (int $steps, null|int $batch = null): array
```

Reverte até `$steps` migrations aplicadas, da mais nova para a mais antiga — só as do `$batch`
quando ele é passado —, sob os dois locks, e retorna os nomes delas. `$steps` ou `$batch` em `0`
ou menos lança antes de qualquer lock.

```php
sync (): array
```

Apaga as linhas do histórico que não têm arquivo e registra todo arquivo pendente como aplicado
em um batch novo, sob os dois locks, sem rodar nenhum `Up` ou `Down`. Retorna
`['added' => [...], 'deleted' => [...]]`, as duas listas de nomes.

```php
create (string $name): string
```

Escreve um stub de migration via `Migrations::create()` e retorna o caminho dele.

```php
public private(set) SQLDatabase $Database;
```

O banco com que o runner foi montado.

```php
public private(set) Migrating $Schema;
```

O que toda closure recebe: `$Database->structure()`.

```php
public private(set) Dialect $Dialect;
```

O dialeto do Schema Builder; a flag `transactions` dele decide se cada migration roda em uma
transação.

```php
public private(set) Guard $Guard;
```

Os dois locks, como um `Schema\Guard`; a propriedade `Lock` dele é o arquivo de lock, um
`Bootgly\ADI\Databases\SQL\Lock`.

```php
public private(set) Migrations $Migrations;
```

Os arquivos: descoberta, carga e stubs.

```php
public private(set) Repository $Repository;
```

A fábrica de queries do histórico; `$Runner->Repository->table` é o nome da tabela de histórico.

### Migrations

O `Bootgly\ADI\Databases\SQL\Schema\Migrations` lê e escreve os arquivos de migration de uma
pasta.

```php
__construct (string $path)
```

Recebe a pasta; nada é lido até um método precisar.

```php
discover (): array
```

Retorna todo arquivo `*.php` da pasta, ordenado pelo nome, como `name => path`, sendo o nome o
nome do arquivo sem `.php`. Uma pasta que não existe dá `[]`.

```php
load (string $file): Migration
```

Faz o require do arquivo e retorna a `Migration` dele, com o nome do arquivo a menos que ela já
tenha um nome. Lança `InvalidArgumentException` com `Migration file must return a Migration object.`
quando o arquivo retorna qualquer outra coisa.

```php
create (string $name): string
```

Escreve o stub em `<YmdHis>_<slug>.php`, criando a pasta quando ela não existe, e retorna o
caminho do arquivo. O slug segue [O nome da migration](#o-nome-da-migration); um arquivo com o
mesmo nome é sobrescrito.

```php
resolve (string $file): string
```

Retorna o nome de migration de um caminho de arquivo: o nome base sem `.php`.

```php
public private(set) string $path;
```

A pasta dos arquivos de migration.

### Migration

A `Bootgly\ADI\Databases\SQL\Schema\Migration` é o que um arquivo de migration retorna.

```php
__construct (Closure $Up, Closure $Down, string $name = '')
```

Recebe as duas closures, cada uma chamada com o schema `Migrating`. Deixe `$name` vazio: o
`load()` dá à migration o nome do arquivo, e por enquanto um nome próprio quebra o histórico (veja
[O nome da migration](#o-nome-da-migration)).

```php
up (Migrating $Schema): mixed
```

Chama o `Up` e retorna o que ele retornou, sem executar.

```php
down (Migrating $Schema): mixed
```

Chama o `Down` e retorna o que ele retornou, sem executar.

```php
rename (string $name): self
```

Define o `$name`; o `load()` o chama para dar à migration o nome do arquivo.

```php
public private(set) Closure $Up;
```

A closure que aplica a migration.

```php
public private(set) Closure $Down;
```

A closure que a reverte.

```php
public private(set) string $name;
```

O nome da migration, que a tabela de histórico guarda.

### Migrating

O `Bootgly\ADI\Databases\SQL\Schema\Migrating` é a interface do `$Schema` em um arquivo de
migration. O **[Schema Builder](/manual/ADI/Databases/SQL/Schema/overview/#referência)** a
implementa, e ela declara os sete métodos que esse builder documenta — `create`, `alter`, `drop`,
`rename`, `index`, `unindex` e `unconstrain` — com as mesmas assinaturas. Cada um compila uma
instrução e a retorna como uma `Query`. O runner sempre passa `$Database->structure()`; nada além
disso no builder, como o `Dialect` dele, faz parte da interface.
