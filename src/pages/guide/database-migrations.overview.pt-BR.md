# Migrations de banco

Este guia percorre o fluxo completo de migrations de um projeto Bootgly, ponta a ponta,
usando o **[Schema Builder](/manual/ADI/Databases/SQL/Schema/overview/)** nativo e a CLI
`bootgly project … migrate`. A página **[Migrations](/manual/ADI/Databases/SQL/Schema/Migrations/overview/)**
cobre cada parte a fundo.

## 1. Configurar o banco

Migrations rodam contra o banco SQL do projeto — a conexão que o escopo de config `database`
dele descreve em `configs/database/database.Config.php`, a mesma que o projeto usa em runtime
(veja **[Configurar o banco](/guide/database-dbal/overview/#configurar-o-banco)**). Toda ação do
`migrate` checa, nesta ordem:

| Faltando | O comando para com |
|---|---|
| o projeto em `projects/Bootgly.projects.php` | `Project not registered: <name>` |
| a pasta dele | `Project not found: <name>` |
| o arquivo `<Name>.Project.php` dele | `No project file found for <name>.` |
| um diretório `configs/` | `Project has no configs directory: <name>` |
| um escopo `database` nele | `Project has no database config scope: <name>` |

O `create` checa só as duas primeiras: ele escreve um arquivo e não abre banco nenhum.

O comando guarda os arquivos dele em três lugares:

- as migrations em `<project>/database/migrations/`, uma pasta que o `create` cria sob demanda;
- o histórico na tabela `_bootgly_migrations` desse banco — a CLI sempre usa esse nome (veja
  **[A tabela de histórico](/manual/ADI/Databases/SQL/Schema/Migrations/overview/#a-tabela-de-histórico)**);
- o lock em `storage/locks/migrations/<name>.lock` no kit, com uma `/` do nome do projeto escrita
  como `~` (`Demo~Blog.lock`) e um arquivo `.guard` ao lado, que continua lá depois de cada
  execução.

## 2. Criar uma migration

```bash
bootgly project <name> migrate create "Create Users Table"
```

Isso escreve um stub com timestamp, ex.:
`database/migrations/20260515120000_create_users_table.php`:

```php
<?php

use Bootgly\ADI\Databases\SQL\Schema\Auxiliaries\Defaults;
use Bootgly\ADI\Databases\SQL\Schema\Auxiliaries\Keys;
use Bootgly\ADI\Databases\SQL\Schema\Auxiliaries\References;
use Bootgly\ADI\Databases\SQL\Schema\Auxiliaries\Types;
use Bootgly\ADI\Databases\SQL\Schema\Blueprint;
use Bootgly\ADI\Databases\SQL\Schema\Migrating;
use Bootgly\ADI\Databases\SQL\Schema\Migration;


return new Migration(
   Up: function (Migrating $Schema) {
      return $Schema->create('example', function (Blueprint $Table): void {
         // @ Define columns here.
      });
   },
   Down: function (Migrating $Schema) {
      return $Schema->drop('example');
   }
);
```

O nome é o seu texto em minúsculas, com toda sequência de caracteres fora de `a-z` e `0-9`
trocada por `_`, depois de um timestamp `YmdHis` que mantém os arquivos na ordem de criação. O
nome do arquivo é a identidade da migration: nunca renomeie um arquivo que já rodou (veja
**[O nome da migration](/manual/ADI/Databases/SQL/Schema/Migrations/overview/#o-nome-da-migration)**).

## 3. Escrever Up e Down

Defina a mudança no `Up` e seu inverso exato no `Down`:

```php
use Bootgly\ADI\Databases\SQL\Builder\Expression;
use Bootgly\ADI\Databases\SQL\Schema\Auxiliaries\Keys;
use Bootgly\ADI\Databases\SQL\Schema\Auxiliaries\Types;
use Bootgly\ADI\Databases\SQL\Schema\Blueprint;
use Bootgly\ADI\Databases\SQL\Schema\Migrating;
use Bootgly\ADI\Databases\SQL\Schema\Migration;

return new Migration(
   Up: fn (Migrating $Schema) => $Schema->create('users', function (Blueprint $Table): void {
      $Table->add('id', Types::BigInteger)->generate()->constrain(Keys::Primary);
      $Table->add('email', Types::String)->limit(190)->constrain(Keys::Unique);
      $Table->add('created_at', Types::Timestamp)->default = new Expression('CURRENT_TIMESTAMP');
   }),
   Down: fn (Migrating $Schema) => $Schema->drop('users')
);
```

Uma closure retorna o que rodar: uma chamada do `$Schema`, uma lista delas rodadas em ordem — uma
tabela e o índice dela, por exemplo —, uma string SQL, ou `null` para nada. O contrato inteiro,
com o erro para qualquer outra coisa, está em
**[O que Up e Down retornam](/manual/ADI/Databases/SQL/Schema/Migrations/overview/#o-que-up-e-down-retornam)**.
Veja **[Blueprint](/manual/ADI/Databases/SQL/Schema/Blueprint/overview/)** para a API completa
de colunas.

## 4. Aplicar migrations pendentes

```bash
bootgly project <name> migrate up       # every pending migration
bootgly project <name> migrate up 2     # at most the next two
```

As migrations pendentes aplicam na ordem dos nomes de arquivo, compartilhando um número de
**batch**. No PostgreSQL e no SQLite, cada migration e a linha de histórico dela comitam juntas
ou revertem juntas; o MySQL comita o DDL dela instrução por instrução. A execução para na
primeira falha, e as migrations anteriores continuam aplicadas. Por enquanto o limite é truncado
para um número inteiro — `up 2.5` aplica duas —, e um que não é número (`up 2x`) ou que fica
abaixo de 1 (`up 0`, `up -1`) aplica todas as migrations pendentes.

## 5. Inspecionar o status

```bash
bootgly project <name> migrate status
bootgly project <name> migrate          # the same: status is the default action
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

`Local only` conta os arquivos pendentes, `DB only` as linhas do histórico cujo arquivo sumiu,
`Next` nomeia o próximo arquivo a aplicar e `Remove` a primeira linha DB only (veja
**[Lendo o status](/manual/ADI/Databases/SQL/Schema/Migrations/overview/#lendo-o-status)**).
Por enquanto, o `status` cria a tabela de histórico quando ela não existe, como toda ação exceto
`create`: o usuário do banco precisa de permissão para criar tabelas até para checar o status.

## 6. Reverter

```bash
bootgly project <name> migrate down 1      # revert the last applied migration
bootgly project <name> migrate down 3      # revert the last 3
```

O `down` roda a closure `Down` de cada migration, da mais nova para a mais antiga, e apaga a
linha de histórico dela. A quantidade é obrigatória e conta migrations, não batches: um
`migrate down` sem número para com `Migration down requires a numeric step count.`, e um
`migrate down 0` com `Migration down requires a positive step count.`. Reverter um batch — pelo
código — está em
**[Batches e reversão](/manual/ADI/Databases/SQL/Schema/Migrations/overview/#batches-e-reversão)**.

## 7. Sincronizar o histórico sem rodar migrations

```bash
bootgly project <name> migrate sync
```

O `sync` reconcilia a tabela de histórico com os arquivos de migration **sem** executar nenhum
`Up`/`Down` — registra arquivos pendentes como aplicados e remove linhas de histórico cujos
arquivos foram apagados. Use para adotar migrations num banco já provisionado; para só limpar a
linha de um arquivo apagado, rode o `migrate up` antes, ou os arquivos pendentes são adotados
junto. Ele mostra o que vai adicionar e apagar e então pergunta `[y/N]`: `y` ou `yes` aplica,
`n`, `no` ou Enter cancela, e um script responde pela entrada, como em
`echo y | bootgly project <name> migrate sync`. Todas as respostas estão em
**[Sincronizando o histórico com os arquivos](/manual/ADI/Databases/SQL/Schema/Migrations/overview/#sincronizando-o-histórico-com-os-arquivos)**.

## 8. Rodar no boot

Um projeto pode deixar o banco em dia toda vez que sobe: monte o banco a partir do escopo
`database` dele na função de boot do `<Name>.Project.php` e chame o `up()` do runner antes de
qualquer coisa subir — antes do `start()` em um projeto servidor. A receita está em
**[Rodar migrations no boot](/manual/ADI/Databases/SQL/Schema/Migrations/overview/#rodar-migrations-no-boot)**,
e os cookbooks **[Guestbook](/cookbook/web/guestbook/overview/)** e
**[Polls](/cookbook/web/polls/overview/)** fazem isso em projetos inteiros.

## 9. Testar suas migrations

Toda migration deve aplicar, reverter e aplicar de novo em um banco novo: um `Down` que deixa a
tabela, a coluna ou o índice dela para trás faz o `up()` seguinte daquela migration falhar. Um caso
de teste pode checar isso contra um banco SQLite em memória, com um caminho de lock só da execução
dele, então nunca toca o banco do projeto. Coloque-o em uma das suítes do projeto, ao lado do
`autoboot.php` da suíte — por exemplo `projects/<Name>/tests/project/1.3-migrations.Test.php` — e
liste `'1.3-migrations'` nos `tests` dessa suíte:

```php
<?php

use Bootgly\ACI\Tests\Suite\Test;
use Bootgly\ADI\Databases\SQL;
use Bootgly\ADI\Databases\SQL\Schema\Runner;


return new Test(
   description: 'Migrations: every file applies, reverts and applies again on a fresh database',
   test: function () {
      // ! A throwaway in-memory database and a lock path of this run only
      $Database = new SQL(['driver' => 'sqlite', 'database' => ':memory:']);
      $lock = sys_get_temp_dir() . '/migrations-test.' . bin2hex(random_bytes(6)) . '.lock';
      $Runner = new Runner($Database, __DIR__ . '/../../database/migrations', $lock);

      try {
         $applied = $Runner->up();

         // @@ Newest first: revert one, apply it again — anything its Down left behind makes
         //    this up() throw — and revert it for good
         $reverted = [];
         $reapplied = [];
         for ($left = count($applied); $left > 0; $left--) {
            $reverted[] = $Runner->down(1)[0];
            $reapplied[] = $Runner->up(1)[0];
            $Runner->down(1);
         }
      }
      finally {
         // @ The runner deletes its lock file but keeps the .guard file beside it
         foreach ([$lock, "{$lock}.guard"] as $file) {
            if (is_file($file)) {
               unlink($file);
            }
         }
      }

      yield assert(
         assertion: $applied === array_keys($Runner->Migrations->discover()),
         description: 'every migration file applies'
      );
      yield assert(
         assertion: $reverted === array_reverse($applied),
         description: 'every migration reverts, newest first'
      );
      yield assert(
         assertion: $reapplied === $reverted,
         description: 'every migration applies again after its Down'
      );
   }
);
```

```bash
cd projects/<Name> && php ../../bootgly test
```

O SQLite roda menos ações de `alter()` que o PostgreSQL e o MySQL — uma troca de tipo de coluna,
por exemplo, para com `SQLite schema dialect lacks capability: AlterColumnType.` (veja
**[Dialects](/manual/ADI/Databases/SQL/Schema/Dialects/overview/)**). Quando suas migrations usam
uma delas, aponte o teste para um banco descartável da engine em que você faz o deploy. Como
suítes são registradas e rodadas está em **[Testing](/testing/about/testing/overview/)**, e o
cookbook Guestbook mostra a suíte de um projeto inteiro.

## Concorrência e segurança

Uma execução pega um arquivo de lock — o da CLI, que a receita de boot do passo 8 também pega — e,
no PostgreSQL e no MySQL, um advisory lock com a chave tirada do caminho das migrations. Duas
execuções sobre as mesmas migrations ficam separadas pelo arquivo de lock compartilhado em toda
engine, e pelo advisory lock no PostgreSQL e no MySQL mesmo quando os arquivos de lock delas
diferem; um arquivo de lock deixado por um processo que não roda mais é retomado. Uma execução
nunca espera por um lock: ela para na hora com `Migration lock is already active.` ou
`Migration advisory lock is already active.`. O `status` não pega lock. Veja
**[Locks](/manual/ADI/Databases/SQL/Schema/Migrations/overview/#locks)**.

## Notas por engine

| Engine | Transação da migration | Guarda de concorrência |
|--------|------------------------|------------------------|
| PostgreSQL | cada migration roda em `BEGIN`/`COMMIT` | arquivo de lock + `pg_try_advisory_lock` |
| MySQL/MariaDB | sem transação (DDL comita implicitamente) | arquivo de lock + `GET_LOCK` |
| SQLite | cada migration roda em `BEGIN`/`COMMIT` | arquivo de lock |

O advisory lock precisa ser solto na sessão que o pegou: dê ao runner um handle novo, ou um com
`pool.max` em `1`, e nos dois casos sem `replicas`.
**[Locks](/manual/ADI/Databases/SQL/Schema/Migrations/overview/#locks)** explica o porquê, e o
que acontece com a CLI e com uma execução no boot quando o escopo `database` do projeto declara
réplicas.

## Referência

- **[Schema](/manual/ADI/Databases/SQL/Schema/overview/)** — a fachada DDL.
- **[Consultas de banco](/guide/database-queries/overview/)** — o próximo fluxo depois que
  suas tabelas existem.
- **[Seeders de banco](/guide/database-seeders/overview/)** — preencha as tabelas depois de
  migrar.
- **[Blueprint](/manual/ADI/Databases/SQL/Schema/Blueprint/overview/)** — colunas, tipos, referências.
- **[Migrations](/manual/ADI/Databases/SQL/Schema/Migrations/overview/)** — o contrato do
  arquivo, a tabela de histórico, batches, locks, eventos e a API do `Runner`.
- **[Dialects](/manual/ADI/Databases/SQL/Schema/Dialects/overview/)** — PostgreSQL / MySQL / SQLite.
- **[Events](/guide/events/overview/#adi--banco-sql)** — `Migration\Events::Up` e `Down`,
  disparados antes de cada migration rodar.
