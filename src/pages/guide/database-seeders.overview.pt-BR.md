# Seeders de banco

Seeders preenchem tabelas com dados do projeto: usuários de demo, defaults locais, linhas
de lookup ou registros parecidos com teste que deixam um banco novo utilizável. Eles rodam
depois das migrations e usam a mesma config SQL do projeto.

## Antes de começar

`seed run` abre o banco pelo escopo de config `database` do projeto, o mesmo que o código do
projeto e o `migrate` usam, então o projeto precisa de `configs/database/database.Config.php`
(veja **[Configurar o banco](/guide/database-dbal/overview/#configurar-o-banco)**). Sem ele,
`seed run` para com `Project has no configs directory: <name>` ou
`Project has no database config scope: <name>`; `seed create` e `seed list` funcionam sem banco.
Rode as **[migrations](/guide/database-migrations/overview/)** antes: os seeders escrevem nas
tabelas que elas criam.

## 1. Crie um seeder

```bash
bootgly project <name> seed create "Demo Users"
```

Isso escreve `database/seeders/demo_users.php`, criando o diretório na primeira vez:

```php
use Bootgly\ADI\Databases\SQL;
use Bootgly\ADI\Databases\SQL\Seed;
use Bootgly\ADI\Databases\SQL\Seed\Seeder;


// ? Keep seeder files return-only. Avoid top-level class/function declarations
// ? because seeder files may be required more than once in one process.
return new Seeder(
   Run: function (SQL $Database, Seed $Seed) {
      // @ Return one query, a list of queries, or null.
      return null;
   }
);
```

Nomes de seeders são slugs estáveis, não timestamps: o nome vai para minúsculas e cada
sequência de caracteres fora de `a-z` e `0-9` vira `_`, então `Demo Users` é `demo_users`.
Criar o mesmo slug duas vezes é rejeitado com `Seeder already exists: demo_users.`, para não
sobrescrever um seeder existente.

## 2. Escreva os dados

A closure recebe a fachada SQL e um contexto `Seed`. Use `$Database->table(...)` para DML
portável e `$Seed->fake(...)` para valores falsos determinísticos vindos da pilha ACI
existente de fakers do Bootgly.

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
      ->set(new Identifier('name'), $Seed->fake('Name', seed: 1))
);
```

`fake()` conhece cinco tipos — `Email`, `Integer`, `Name`, `Text` e `UUID` — e o mesmo tipo com
a mesma `seed` sempre dá o mesmo valor, então uma reexecução grava os mesmos dados. Nomes e
endereços se repetem cedo (a seed 8 dá o mesmo que a seed 5), então não preencha uma coluna
`UNIQUE` com eles. **[Valores falsos](/manual/ADI/Databases/SQL/Seed/overview/#valores-falsos)**
lista o que cada tipo retorna e os seus limites; **[Fakers](/testing/deep/fakers/overview/)**
cobre as classes de faker por trás dele.

Um seeder pode retornar um builder/query/string, um array deles, ou `null`. Arrays rodam em
ordem. Qualquer outro valor para a execução com
`Seeder must return null, string, Builder, Query, or an array of those.` Mantenha arquivos de
seeder apenas como retorno; evite declarações top-level de `class` ou `function` porque o mesmo
arquivo pode ser requerido mais de uma vez no mesmo processo PHP.

## 3. Rode seeders

```bash
bootgly project <name> seed run        # run all seeders in filename order
bootgly project <name> seed run demo_users
bootgly project <name> seed run --dry-run
bootgly project <name> seed list       # also what `seed` alone does
```

`seed run` reporta quantos seeders rodaram — `Seeders run: 1` com o único seeder acima.
`--dry-run` imprime, em vez disso, o SQL e os parâmetros que cada seeder enviaria — aqui
`seed run --dry-run demo_users` no PostgreSQL:

```
┌ Seeder Dry Run ────────────────────────────────────────────────────┐
│ Seeders      1                                                     │
│ Seeder       demo_users                                            │
│ SQL 1        INSERT INTO "users" ("email", "name") VALUES ($1, $2) │
│ Parameters   ["frank.davis@test.org","Frank Davis"]                │
└────────────────────────────────────────────────────────────────────┘

 ATTENTION  Dry run only; no seeder SQL was executed.
```

Quando o dialeto do banco suporta transações — PostgreSQL e SQLite —, as queries que um seeder
**retorna** rodam em uma transação própria. O MySQL as roda uma a uma, sem transação, então uma
falha deixa aplicadas as instruções anteriores a ela. A closure em si roda **antes** dessa
transação abrir, então um seeder pode ler o banco para decidir o que escrever — e qualquer
`$Database->query(...)` que ela emita diretamente é uma instrução à parte, fora daquela
transação e não desfeita quando uma query retornada falha. Os seeders rodam em ordem de nome de
arquivo, e o primeiro que falha para a execução: os seeders anteriores continuam aplicados.

Um lock local de seeders, `storage/locks/seeders/<name>.lock` (a `/` do nome de um projeto
aninhado vira `~`), mais um lock advisory do dialeto no PostgreSQL e no MySQL impedem execuções
sobrepostas: um segundo `seed run` falha na hora com `Seeder lock is already active.` ou
`Seeder advisory lock is already active.` em vez de esperar, e um lock deixado por um processo
que não existe mais é retomado. Use `--dry-run` antes de reexecutar para compilar o SQL e os
parâmetros retornados sem enviar as instruções ao banco. Um dry run não pega nenhum dos locks e
ainda precisa do escopo `database`. Ele só pula a execução do SQL retornado; seeders que chamam
`$Database->query(...)` diretamente dentro da closure ainda tocam o banco.

## Reexecutável por design

Seeders não são gravados em uma tabela `_bootgly_seeders`. Rodar o mesmo seeder de novo
executa o arquivo de novo. Use `seed run --dry-run` para inspecionar as instruções primeiro,
e torne um seeder idempotente quando necessário usando `upsert`, deletes com filtro, limpeza da
tabela antes de inserir dados de demo, ou uma leitura antes —
**[Quando a closure roda](/manual/ADI/Databases/SQL/Seed/overview/#quando-a-closure-roda)**
mostra um seeder que não escreve nada quando as linhas dele já estão lá.

### Ids fixos em qualquer banco

O seeder reexecutável de costume grava ids fixos e faz `upsert` neles, então a segunda
execução atualiza as linhas em vez de falhar nelas:

```php
use Bootgly\ADI\Databases\SQL;
use Bootgly\ADI\Databases\SQL\Builder\Identifier;
use Bootgly\ADI\Databases\SQL\Seed;
use Bootgly\ADI\Databases\SQL\Seed\Seeder;

return new Seeder(
   Run: fn (SQL $Database, Seed $Seed) => $Database
      ->table(new Identifier('roles'))
      ->insert()
      ->set(new Identifier('id'), 1, 2)
      ->set(new Identifier('name'), 'admin', 'editor')
      ->upsert(new Identifier('id'))
);
```

MySQL e SQLite movem seus contadores de auto-incremento para depois dos ids explícitos
sozinhos. Uma coluna de identidade do PostgreSQL não: a sequência fica onde estava, então o
primeiro insert gerado da aplicação reutilizaria o id 1. O runner fecha essa lacuna. No
PostgreSQL, todo INSERT que um seeder retorna pelo Query Builder é seguido de uma instrução
que move a sequência da coluna para depois da maior chave explícita — só quando a sequência
está atrás dela, então uma sequência que já está à frente quando a instrução roda não é
tocada. `seed run --dry-run` lista essa instrução logo depois do seu INSERT.

Só são rastreados os INSERTs que um seeder retorna como builders, em uma tabela nomeada — com
chaves dadas como inteiros ou strings inteiras canônicas (`'7'`, não `'007'` nem `7.0`).
Strings de SQL raw, objetos `Query` compilados, tabelas ou colunas `Expression` e instruções
emitidas com `$Database->query(...)` dentro da closure não são; mova a sequência você mesmo
depois deles.

Rode os seeders enquanto nada mais insere nas tabelas semeadas: a instrução lê a sequência e
a move em dois passos, e um insert concorrente pode entrar no meio. Mantenha linhas sentinela
no id 0 ou abaixo — uma chave semeada no máximo do tipo da coluna não deixa ids para as
linhas geradas.

> [!WARNING]
> No PostgreSQL, o papel que roda os seeders precisa de `USAGE` (ou `SELECT`) e `UPDATE` nas
> sequências de identidade — o papel que rodou as migrations é dono delas. Sem esses
> privilégios, `seed run` falha com `permission denied for sequence …`, mesmo quando nada
> precisa mudar, e as escritas do seeder são desfeitas.

## Referência

- **[Migrations de banco](/guide/database-migrations/overview/)** — crie as tabelas primeiro.
- **[Consultas de banco](/guide/database-queries/overview/)** — DML do Query Builder usada nos seeders.
- **[ORM de banco](/guide/database-orm/overview/)** — mapeie tabelas populadas de volta para entidades no código da aplicação.
- **[Seeders](/manual/ADI/Databases/SQL/Seed/overview/)** — `Seed`, `Seeder`, `Seeders` e `Runner`.
- **[Projetos](/manual/Bootgly/essential/projects/overview/)** — cada ação, opção e saída do `seed`.
- **[Fakers](/testing/deep/fakers/overview/)** — as classes de faker por trás de `$Seed->fake()`.
