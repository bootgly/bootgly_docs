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

Quando o dialeto do banco suporta transações, cada seeder roda em sua própria transação. Um
lock local de seeders mais um lock advisory do dialeto quando suportado impedem execuções
sobrepostas. Use `--dry-run` antes de reexecutar para compilar o SQL e os parâmetros
retornados sem enviar as instruções ao banco. O dry-run só pula a execução do SQL retornado;
seeders que chamam `$Database->query(...)` diretamente dentro da closure ainda tocam o banco.

## Reexecutável por design

Seeders não são gravados em uma tabela `_bootgly_seeders`. Rodar o mesmo seeder de novo
executa o arquivo de novo. Use `seed run --dry-run` para inspecionar as instruções primeiro,
e torne um seeder idempotente quando necessário usando `upsert`, deletes com filtro ou
limpeza da tabela antes de inserir dados de demo.

## Referência

- **[Migrations de banco](/guide/database-migrations/overview/)** — crie as tabelas primeiro.
- **[Consultas de banco](/guide/database-queries/overview/)** — DML do Query Builder usada nos seeders.
- **[Seeders](/manual/ADI/Databases/SQL/Seed/overview/)** — `Seed`, `Seeder`, `Seeders` e `Runner`.
