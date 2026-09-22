# Seeders de banco

Seeders preenchem tabelas com dados do projeto: usuários de demo, defaults locais, linhas
de lookup ou registros parecidos com teste que deixam um banco novo utilizável. Eles rodam
depois das migrations e usam a mesma config SQL do projeto.

## 1. Crie um seeder

```bash
bootgly project <nome> seed create "Demo Users"
```

Isso escreve `database/seeders/demo_users.php`:

```php
use Bootgly\ADI\Databases\SQL;
use Bootgly\ADI\Databases\SQL\Seed;
use Bootgly\ADI\Databases\SQL\Seed\Seeder;

return new Seeder(
   Run: function (SQL $Database, Seed $Seed) {
      return null;
   }
);
```

Nomes de seeders são slugs estáveis, não timestamps. Criar o mesmo slug duas vezes é
rejeitado para não sobrescrever um seeder existente.

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

Um seeder pode retornar um builder/query/string, um array deles, ou `null`. Arrays rodam em
ordem. Mantenha arquivos de seeder apenas como retorno; evite declarações top-level de
`class` ou `function` porque o mesmo arquivo pode ser requerido mais de uma vez no mesmo
processo PHP.

## 3. Rode seeders

```bash
bootgly project <nome> seed run        # roda todos em ordem de filename
bootgly project <nome> seed run demo_users
bootgly project <nome> seed run --dry-run
bootgly project <nome> seed list
```

Quando o dialeto do banco suporta transações, as queries que um seeder **retorna** rodam em
uma transação própria. A closure em si roda **antes** dessa transação abrir, então um seeder
pode ler o banco para decidir o que escrever — e qualquer `$Database->query(...)` que ela
emita diretamente é uma instrução à parte, fora daquela transação e não desfeita quando uma
query retornada falha. Um
lock local de seeders mais um lock advisory do dialeto quando suportado impedem execuções
sobrepostas. Use `--dry-run` antes de reexecutar para compilar o SQL e os parâmetros
retornados sem enviar as instruções ao banco. O dry-run só pula a execução do SQL retornado;
seeders que chamam `$Database->query(...)` diretamente dentro da closure ainda tocam o banco.

## Reexecutável por design

Seeders não são gravados em uma tabela `_bootgly_seeders`. Rodar o mesmo seeder de novo
executa o arquivo de novo. Use `seed run --dry-run` para inspecionar as instruções primeiro,
e torne um seeder idempotente quando necessário usando `upsert`, deletes com filtro ou
limpeza da tabela antes de inserir dados de demo.

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
