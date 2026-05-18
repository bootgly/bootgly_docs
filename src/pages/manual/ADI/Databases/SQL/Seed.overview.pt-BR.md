# Seeders

Seeders são scripts SQL de dados reexecutáveis. Use depois das migrations quando um projeto
precisa de dados de demo, linhas de lookup ou defaults locais.

> O passo a passo completo da CLI está no guia
> **[Seeders de banco](/guide/database-seeders/overview/)**. Esta página explica os objetos
> por trás do arquivo.

## O fluxo

```bash
bootgly project <nome> seed create "Demo Users"  # 1. cria um arquivo
# edite o arquivo
bootgly project <nome> seed list                 # 2. vê seeders disponíveis
bootgly project <nome> seed run --dry-run        # 3. pré-visualiza SQL
bootgly project <nome> seed run                  # 4. roda todos
bootgly project <nome> seed run demo_users       # ou um
```

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

- Retorne um valor tipo query, um array de valores tipo query, ou `null`.
- Valores tipo query podem ser `Builder`, `Query` compilada ou string SQL.
- Use `$Seed->fake($kind, seed: ...)` para dados falsos determinísticos; ele reutiliza
  `Bootgly\ACI\Fakers`.
- Mantenha arquivos de seeder apenas como retorno. Não declare símbolos top-level como
  `class` ou `function` neles, porque um runner pode requerer o mesmo arquivo mais de uma vez
  no mesmo processo PHP.
- Escreva a idempotência no seeder com `upsert`, deletes com filtro ou limpeza. Seeders não
  têm tabela de histórico.
- `Runner::preview()` e `seed run --dry-run` pulam apenas a execução do SQL retornado; seeders
  que chamam `$Database->query(...)` diretamente dentro da closure ainda tocam o banco.

## Referência

### API programática

```php
use Bootgly\ADI\Databases\SQL\Seed\Runner;

$Runner = new Runner($Database, '/path/database/seeders', '/path/locks/app.lock');

$Runner->create('Demo Users'); // escreve um stub
$Runner->discover();           // ['demo_users' => '/path/demo_users.php']
$Runner->preview();            // compila SQL sem executar
$Runner->run();                // roda todos os seeders
$Runner->run('demo_users');    // roda um seeder
```

Classes de apoio:

- `Seed` — contexto de seeding com `fake($kind, $seed)`.
- `Seeder` — retornado pelos arquivos; guarda a closure `Run` e o nome resolvido.
- `Seeders` — descobre, carrega e cria arquivos de seeder.
- `Runner` — pré-visualiza, faz lock, carrega e executa seeders; transação por seeder
  quando suportado.

### Erros

- Criar slug duplicado -> `InvalidArgumentException`.
- Arquivo de seeder não retornando `Seeder` -> `InvalidArgumentException`.
- Rodar um seeder nomeado inexistente -> `RuntimeException`.
- Lock já ativo -> `RuntimeException` ("Seeder lock is already active.").
