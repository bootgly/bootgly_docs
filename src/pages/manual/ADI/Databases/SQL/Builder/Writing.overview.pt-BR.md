# Escrevendo linhas

Mutações usam o mesmo ciclo do builder das leituras: escolha uma tabela, mude o modo,
atribua valores, adicione guards quando necessário e rode a operação.

Os exemplos desta página compartilham estes imports, nomes e um `$Database` aberto a partir do
escopo de config `database` do projeto. Em uma rota `HTTP_Server_CLI`, use `$Response->Database`
no lugar, e fora de um projeto passe a conexão como array — veja
**[Abra um banco](/manual/ADI/Databases/SQL/overview/#abra-um-banco)**.

```php
use Bootgly\ADI\Databases\SQL;
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Operators;
use Bootgly\API\Environment\Configs\DatabaseConfig;

enum Tables: string { case Users = 'users'; case Tags = 'tags'; }
enum Columns: string { case Id = 'id'; case Name = 'name'; case Email = 'email'; case Active = 'active'; }

$Database = new SQL(new DatabaseConfig(BOOTGLY_PROJECT->Configs->get('database'))->configure());
```

`users` tem uma chave que o banco gera (`id`), um `name` obrigatório, um `email` único e uma flag
`active` que por padrão é true; `tags` tem um `id` gerado e um `name` único. Rodados em ordem
sobre tabelas vazias, os exemplos dão os resultados que os comentários mostram.

## Modos

Um builder começa como um `SELECT`, e `insert()`, `upsert()`, `update()` e `delete()` o mudam para
a instrução que nomeiam. Qual chamada define qual modo, e o que cada modo compila, está em
**[Modos](/manual/ADI/Databases/SQL/Builder/overview/#modos)** na página do Query Builder.

> [!WARNING]
> `set()` sozinho não faz uma escrita: sem `insert()`, `update()` ou `upsert()`, o builder continua
> um `SELECT`, roda sem erro e não escreve nada.

Um `SELECT` cuja common table expression escreve ainda conta como leitura por ora, então pode rodar
em uma réplica de leitura — veja
**[Common table expressions](/manual/ADI/Databases/SQL/Builder/Composing/overview/#common-table-expressions)**.

## Inserir uma linha

```php
$Insert = $Database
   ->table(Tables::Users)
   ->insert()
   ->set(Columns::Name, 'Ada')
   ->set(Columns::Email, 'ada@example.com');

$Query = $Insert->compile();
```

PostgreSQL:

```sql
INSERT INTO "users" ("name", "email") VALUES ($1, $2)
```

Parâmetros:

```php
['Ada', 'ada@example.com']
```

Cada `set()` adiciona uma coluna, na ordem das chamadas; um segundo `set()` da mesma coluna
substitui o valor dela e mantém o lugar. Os valores viram parâmetros, vinculados pelo driver: como
booleanos, decimais e datas mapeiam em cada um está em
**[Mapeamento de tipos](/manual/ADI/Databases/SQL/Drivers/Types/overview/)** — no PostgreSQL, formate um
`DateTimeInterface` antes, já que o driver dele recusa um por ora.

Rode o builder como qualquer outro:

```php
$Inserted = $Database->await($Database->query($Insert));

$Inserted->Result->affected; // 1
```

## Inserir várias linhas

Passe vários valores para cada `set()`. Toda coluna inserida deve ter a mesma quantidade de
valores.

```php
$Many = $Database
   ->table(Tables::Users)
   ->insert()
   ->set(Columns::Name, 'Grace', 'Linus')
   ->set(Columns::Email, 'grace@example.com', 'linus@example.com');

$Database->await($Database->query($Many))->Result->affected; // 2
```

PostgreSQL:

```sql
INSERT INTO "users" ("name", "email") VALUES ($1, $2), ($3, $4)
```

Parâmetros, linha após linha:

```php
['Grace', 'grace@example.com', 'Linus', 'linus@example.com']
```

O `set()` que quebra a contagem lança `InvalidArgumentException` com
`SQL insert set columns must have the same value count.` — ou o `insert()` lança, para valores
atribuídos antes dele.

Uma instrução vincula linhas × colunas parâmetros, e cada engine limita esse número. Passado o
limite, a operação falha e não escreve nada:

| Engine | Parâmetros por instrução | Passado o limite |
|--------|--------------------------|------------------|
| PostgreSQL | 65535 | por ora `invalid message format` (`08P01`) |
| MySQL | 65535 | `1390: Prepared statement contains too many placeholders` |
| SQLite | 32766 no build padrão (999 antes do SQLite 3.32) | `Unable to prepare statement: variable number must be between ?1 and ?32766` |

Para carregar mais linhas, envie-as em lotes. Aqui 2500 nomes de tag saem como três `INSERT`s:

```php
$names = array_map(fn (int $number): string => "tag-{$number}", range(1, 2500));

foreach (array_chunk($names, 1000) as $chunk) {
   $Database->await($Database->query(
      $Database->table(Tables::Tags)->insert()->set(Columns::Name, ...$chunk)
   ));
}
```

## Retornar output

No PostgreSQL, `output()` acrescenta `RETURNING`:

```php
$Insert = $Database
   ->table(Tables::Users)
   ->insert()
   ->set(Columns::Name, 'Barbara')
   ->set(Columns::Email, 'barbara@example.com')
   ->output(Columns::Id, Columns::Name);
```

```sql
INSERT INTO "users" ("name", "email") VALUES ($1, $2) RETURNING "id", "name"
```

As colunas retornadas chegam como as linhas do resultado. `output()` funciona com `update()` e
`delete()` também — o `RETURNING` vem depois do `WHERE` — e um `SELECT` o ignora.

MySQL e SQLite rejeitam `output()`: o MySQL não tem `RETURNING`, e no SQLite a extensão `sqlite3`
executaria a instrução duas vezes, duplicando a escrita. A própria chamada lança
`InvalidArgumentException` com `SQL dialect does not support RETURNING output.`, antes de qualquer
SQL ser montado. Nos dois, a chave gerada chega por `Result->inserted`, que o PostgreSQL deixa em
`0`. Código que roda nos três pergunta ao dialeto do builder antes:

```php
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Capabilities;

$Insert = $Database
   ->table(Tables::Users)
   ->insert()
   ->set(Columns::Name, 'Barbara')
   ->set(Columns::Email, 'barbara@example.com');

if ($Insert->Dialect->check(Capabilities::Output)) {
   $Insert->output(Columns::Id, Columns::Name);
}

$Inserted = $Database->await($Database->query($Insert));

$Inserted->Result->rows;     // PostgreSQL: [['id' => 4, 'name' => 'Barbara']] — MySQL and SQLite: []
$Inserted->Result->inserted; // PostgreSQL: 0 — MySQL and SQLite: 4

$id = $Inserted->Result->row['id'] ?? $Inserted->Result->inserted; // 4
```

Leia `inserted` logo depois de um `INSERT` simples. Para um multi-row, o MySQL informa o primeiro
id novo e o SQLite o último, e depois de um upsert ele pode apontar outra linha — veja
**[Diferenças no resultado](/manual/ADI/Databases/SQL/Drivers/overview/#diferenças-no-resultado)**.
Um id além de `PHP_INT_MAX` chega como string (veja
**[Chaves geradas sem RETURNING](/manual/ADI/Databases/SQL/Drivers/overview/#chaves-geradas-sem-returning)**,
que também mostra o ORM preenchendo as chaves das entidades a partir dele).

## Atualizar linhas

```php
$Update = $Database
   ->table(Tables::Users)
   ->update()
   ->set(Columns::Active, false)
   ->filter(Columns::Id, Operators::Equal, 2);
```

PostgreSQL:

```sql
UPDATE "users" SET "active" = $1 WHERE "id" = $2
```

```php
$Database->await($Database->query($Update))->Result->affected; // 1
```

`update()` aceita exatamente um valor por coluna atribuída. Um segundo valor lança
`InvalidArgumentException` com `SQL update set values must be singular.` — do `set()` que o passa,
ou do `update()` para valores atribuídos antes dele.

`limit()`, `order()`, `join()` e as outras chamadas de leitura não chegam a um `UPDATE` nem a um
`DELETE`: são descartadas sem erro, então `limit(1)` não limita as linhas que qualquer uma das duas
instruções muda. O que cada modo compila está em
**[Modos](/manual/ADI/Databases/SQL/Builder/overview/#modos)**.

## Apagar linhas

```php
$Delete = $Database
   ->table(Tables::Users)
   ->delete()
   ->filter(Columns::Id, Operators::Equal, 3);
```

PostgreSQL:

```sql
DELETE FROM "users" WHERE "id" = $1
```

```php
$Database->await($Database->query($Delete))->Result->affected; // 1
```

`update()` e `delete()` exigem pelo menos um `filter()`, `match()` ou `nest()` — `having()` não
conta. Sem um, o `compile()` lança `InvalidArgumentException` com
`SQL update/delete requires at least one filter.`, e o `query()` também, já que ele compila o
builder antes de qualquer envio (veja
**[O que lança e o que falha](/manual/ADI/Databases/SQL/overview/#o-que-lança-e-o-que-falha)**).
**[Erros](/manual/ADI/Databases/SQL/Builder/overview/#erros)** mostra o erro capturado, e o único
jeito de mudar ou remover toda linha de propósito.

> [!WARNING]
> Por ora, um builder de subquery que você altera depois que o builder externo compilou não chega à
> instrução que roda, então um `DELETE` pode remover as linhas da subquery antiga — veja
> **[Compile e execute](/manual/ADI/Databases/SQL/Builder/overview/#compile-e-execute)**.

## Upsert

```php
$Upsert = $Database
   ->table(Tables::Users)
   ->insert()
   ->set(Columns::Email, 'ada@example.com', 'alan@example.com')
   ->set(Columns::Name, 'Ada Lovelace', 'Alan Turing')
   ->upsert(Columns::Email);
```

PostgreSQL:

```sql
INSERT INTO "users" ("email", "name") VALUES ($1, $2), ($3, $4) ON CONFLICT ("email") DO UPDATE SET "name" = EXCLUDED."name"
```

MySQL:

```sql
INSERT INTO `users` (`email`, `name`) VALUES (?, ?), (?, ?) ON DUPLICATE KEY UPDATE `name` = VALUES(`name`)
```

SQLite:

```sql
INSERT INTO "users" ("email", "name") VALUES (?1, ?2), (?3, ?4) ON CONFLICT ("email") DO UPDATE SET "name" = EXCLUDED."name"
```

O email da Ada já existe, então a linha dela recebe o novo nome, e a linha do Alan é inserida:

```php
$Database->await($Database->query($Upsert))->Result->affected; // PostgreSQL and SQLite: 2 — MySQL: 3
```

- `upsert()` muda o builder para INSERT sozinho: o `insert()` acima é opcional.
- Toda coluna atribuída que não é coluna de conflito recebe o valor que chega; não há como
  atualizar só algumas delas.
- No PostgreSQL e no SQLite, as colunas de conflito devem ser as colunas de uma chave primária ou de
  um índice único, ou a operação falha: `there is no unique or exclusion constraint matching the ON CONFLICT specification`
  (`42P10`) no PostgreSQL, `Unable to prepare statement: ON CONFLICT clause does not match any PRIMARY KEY or UNIQUE constraint`
  no SQLite.
- O PostgreSQL faz falhar uma instrução que traz uma chave duas vezes:
  `ON CONFLICT DO UPDATE command cannot affect row a second time` (`21000`). MySQL e SQLite aplicam
  as linhas em ordem, então a última vence.
- Uma segunda chamada a `upsert()` substitui as colunas de conflito da primeira.
- `output()` depois de `upsert()` retorna linhas inseridas e atualizadas igualmente no PostgreSQL;
  uma linha que o `DO NOTHING` pula não é retornada.
- `affected` e `inserted` informam um upsert de forma diferente em cada driver — o MySQL conta uma
  linha atualizada duas vezes — veja
  **[Diferenças no resultado](/manual/ADI/Databases/SQL/Drivers/overview/#diferenças-no-resultado)**.

> [!WARNING]
> Por ora o MySQL ignora as colunas de conflito. O `ON DUPLICATE KEY UPDATE` dispara em uma colisão
> com qualquer chave primária ou índice único, então com `upsert(Columns::Id)`, uma linha nova cujo
> `email` pertence a outro usuário atualiza a linha desse usuário e informa sucesso — onde PostgreSQL
> e SQLite a fazem falhar com uma violação de unicidade. No MySQL, faça upsert só quando nenhuma
> coluna que você atribui pertence a uma chave única além das colunas de conflito.

Quando toda coluna atribuída é coluna de conflito, não há o que atualizar — o caso de inserir se
faltar:

```php
$Tag = $Database
   ->table(Tables::Tags)
   ->insert()
   ->set(Columns::Name, 'php')
   ->upsert(Columns::Name);

$Database->await($Database->query($Tag))->Result->affected; // 1
$Database->await($Database->query($Tag))->Result->affected; // 0
```

PostgreSQL e SQLite compilam `ON CONFLICT ("name") DO NOTHING`, e o MySQL
`` ON DUPLICATE KEY UPDATE `name` = `name` ``, que deixa a linha como estava: a primeira execução
insere a tag, e a segunda não muda nada.

## Valores SQL confiáveis

Use `Expression` apenas para fragmentos SQL que você controla:

```php
use Bootgly\ADI\Databases\SQL\Builder\Expression;

$Database
   ->table(Tables::Users)
   ->update()
   ->set(Columns::Name, new Expression('LOWER("name")'))
   ->filter(Columns::Id, Operators::Equal, 1);
```

PostgreSQL:

```sql
UPDATE "users" SET "name" = LOWER("name") WHERE "id" = $1
```

Valores passados diretamente para `set()` viram parâmetros. Valores `Expression` entram sem
binding — como valores de `INSERT` também — e sem reescrita: o builder não os adapta ao dialeto.
Escreva-os para a engine que os roda. O MySQL, por padrão, lê `"name"` como string, então lá a
instrução acima grava a palavra `name`; escreva ``LOWER(`name`)`` no lugar. Mais usos de
`Expression` estão em
**[Compondo queries](/manual/ADI/Databases/SQL/Builder/Composing/overview/)**.

## Erros

Os erros que as chamadas de escrita levantam, e se a chamada ou o `compile()` lança cada um, estão
listados em **[Erros](/manual/ADI/Databases/SQL/Builder/overview/#erros)** na página do Query
Builder; a Referência abaixo traz os de cada método.

## Referência

Os verbos de leitura — `select()`, `filter()`, `match()`, `nest()` — estão na Referência de
**[Lendo linhas](/manual/ADI/Databases/SQL/Builder/Reading/overview/)**, e `compile()`, `$Mode` e
`$assignments` na de **[Query Builder](/manual/ADI/Databases/SQL/Builder/overview/)**.

```php
insert (): static
```
Muda para o modo INSERT. Com valores já atribuídos, confere se toda coluna tem a mesma
quantidade; senão lança `SQL insert set columns must have the same value count.`.

```php
update (): static
```
Muda para o modo UPDATE e confere se todo valor atribuído até ali é singular; senão lança
`SQL update set values must be singular.`. Compilar exige um `set()` e um filtro.

```php
delete (): static
```
Muda para o modo DELETE. Valores atribuídos são ignorados; compilar exige um filtro.

```php
upsert (BackedEnum|Stringable ...$Columns): static
```
Muda para o modo INSERT e trata conflitos em `$Columns`: atualiza toda outra coluna atribuída, ou
não faz nada quando não sobra nenhuma. Substitui as colunas de conflito de uma chamada anterior.
Lança `SQL dialect does not support upsert handling.` quando o dialeto não tem
`Capabilities::Upsert`, e `SQL upsert requires at least one conflict column.` sem colunas.

```php
set (BackedEnum|Stringable $Column, mixed $value, mixed ...$values): static
```
Atribui valores a uma coluna — um, ou um por linha para um INSERT multi-row — sem mudar o modo. Os
valores viram parâmetros, exceto uma `Expression`, que entra inline. Atribuir uma coluna de novo
substitui os valores dela e mantém a posição. No modo INSERT, lança
`SQL insert set columns must have the same value count.` quando as quantidades diferem; no modo
UPDATE, `SQL update set values must be singular.` para mais de um valor.

```php
output (BackedEnum|Stringable ...$Columns): static
```
Retorna estas colunas via `RETURNING` de um INSERT, UPDATE ou DELETE; as chamadas se somam, e um
alias de coluna se aplica. Lança `SQL dialect does not support RETURNING output.` quando o dialeto
não tem `Capabilities::Output` — MySQL e SQLite.

### Enums desta página

Namespace `Bootgly\ADI\Databases\SQL\Builder\Auxiliaries`. Todo case de todo enum do builder, e o
SQL para o qual ele compila, está em
**[Enums auxiliares](/manual/ADI/Databases/SQL/Builder/Dialects/overview/#enums-auxiliares)**.

| Enum | Cases usados aqui |
| --- | --- |
| `Capabilities` | `Output`, `Upsert` |
| `Operators` | `Equal` |
