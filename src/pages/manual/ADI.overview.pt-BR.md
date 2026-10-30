# Dados no Bootgly

Para sua app rodar, você precisa de onde guardar dados e de um jeito de moldá-los. O
Bootgly te dá um banco SQL mais fluxos de **migrations** e **seeders** — é só isso que você
mexe no dia a dia.

## O que você precisa saber de verdade

1. **Conectar** — um projeto guarda as configurações do banco no escopo de config `database`
   (`configs/database/database.Config.php`, PostgreSQL por padrão; o guia
   **[DBAL de banco](/guide/database-dbal/overview/)** mostra como escrevê-lo). Em uma rota
   `HTTP_Server_CLI`, use o resource por worker `$Response->Database`
   (**[Response Resources](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/overview/)**).
   Na função de boot do projeto, em um comando ou em um script que roda dentro do projeto,
   abra o banco com:

   ```php
   use Bootgly\ADI\Databases\SQL;
   use Bootgly\API\Environment\Configs\DatabaseConfig;

   $Database = new SQL(new DatabaseConfig(BOOTGLY_PROJECT->Configs->get('database'))->configure());
   ```

   Essa linha precisa desse escopo: sem um diretório `configs/`, `BOOTGLY_PROJECT->Configs` é
   `null`. Fora de um projeto, passe a conexão como array:
   `new SQL(['driver' => 'pgsql', 'host' => '127.0.0.1', 'port' => 5432, 'database' => 'app', 'username' => 'app', 'password' => 'secret'])`.
   Um `new SQL` sem argumentos não lê config nenhuma: ele usa os defaults locais embutidos
   (PostgreSQL em `127.0.0.1:5432`, banco `bootgly`, usuário `postgres`, senha vazia), que
   também preenchem toda chave que um array omitir, seja qual for o `driver`.

2. **Moldar com migrations** — você nunca escreve `CREATE TABLE` na mão. Você cria uma
   migration, descreve a tabela e aplica:

   ```bash
   bootgly project <nome> migrate create "Create Users Table"
   bootgly project <nome> migrate up
   ```

3. **Semear dados** — depois que as tabelas existem, preencha linhas de demo ou lookup com
   seeders reexecutáveis:

   ```bash
   bootgly project <nome> seed create "Demo Users"
   bootgly project <nome> seed run
   ```

4. **Consultar** — leia e escreva linhas com o guia
   **[Consultas de banco](/guide/database-queries/overview/)** e o
   **[Query Builder](/manual/ADI/Databases/SQL/Builder/overview/)**:
   `$Database->table(...)` monta, `$Database->query(...)` executa.

Esse é o ciclo inteiro: **conectar → migrar → semear → consultar**.

## Comece aqui

- **[Database migrations](/guide/database-migrations/overview/)** — o passo a passo
  completo (criar uma migration, aplicar, ver o que aconteceu). **Leia isto primeiro.**
- **[DBAL de banco](/guide/database-dbal/overview/)** — use o DBAL async em rotas
  `HTTP_Server_CLI` sem expor loops de readiness de baixo nível.
- **[Consultas de banco](/guide/database-queries/overview/)** — o próximo fluxo do dia a
  dia: montar uma query, executar, inspecionar `Operation->rows`.
- **[Transações de banco](/guide/database-transactions/overview/)** — commit ou rollback
  de várias instruções SQL em uma conexão do pool.
- **[Seeders de banco](/guide/database-seeders/overview/)** — preencha tabelas com dados
  reexecutáveis do projeto usando Query Builder e fakers determinísticos.
- **[Query Builder](/manual/ADI/Databases/SQL/Builder/overview/)** — o builder DML para
  `SELECT`, `INSERT`, `UPDATE` e `DELETE`.
- **[Núcleo DBAL](/manual/ADI/Database/overview/)** — config, conexão, pool, operação,
  resultado e lifecycle de driver em baixo nível.
- **[Transações](/manual/ADI/Databases/SQL/Transaction/overview/)** — `begin`, `commit`,
  `rollback` e savepoints aninhados.
- **[Schema Builder](/manual/ADI/Databases/SQL/Schema/overview/)** — as operações de tabela
  que você chama dentro de uma migration (`create`, `alter`, `drop`, …).
- **[Definindo tabelas](/manual/ADI/Databases/SQL/Schema/Blueprint/overview/)** — como
  descrever colunas: ids, texto, booleanos, datas, chaves estrangeiras.
- **[Migrations](/manual/ADI/Databases/SQL/Schema/Migrations/overview/)** — o arquivo de
  migration, `up`/`down` e leitura do status.
- **[Seeders](/manual/ADI/Databases/SQL/Seed/overview/)** — o arquivo de seeder, contexto
  `Seed` e `Runner`.
- **[Dialects](/manual/ADI/Databases/SQL/Schema/Dialects/overview/)** — o que muda se você
  usar MySQL ou SQLite no lugar do PostgreSQL.

## Referência

ADI (Abstract Data Interface) é a camada de dados da arquitetura I2P do Bootgly, na cadeia
unidirecional `ABI → ACI → ADI → API → CLI → WPI`. Ela traz duas fachadas de banco: `SQL`
(`Bootgly\ADI\Databases\SQL`), para bancos relacionais, e `KV`
(`Bootgly\ADI\Databases\KV`), para comandos key-value no Redis, que as rotas usam por
`$Response->KV`
(**[Redis assíncrono no event loop](/guide/cache/overview/#redis-assíncrono-no-event-loop)**,
**[Registrar o resource KV](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/overview/#registrar-o-resource-kv)**).
A fachada `SQL` expõe execução de queries, transações e dois builders:

- `$Database->table(...)` — Query Builder (DML: `SELECT`/`INSERT`/`UPDATE`/`DELETE`).
- `$Database->query(...)` — ponto de execução para SQL cru, um builder ou uma `Query`
  compilada.
- `$Database->begin()` — uma transação presa a uma conexão do pool.
- `$Database->structure()` — Schema Builder (DDL + migrations), uma instância `Schema` em
  cache vinculada ao dialeto do banco (mesma instância em toda chamada).

Em rotas HTTP, o WPI adiciona
**[Response Resources](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/overview/)** para
a rota aguardar operações do DBAL por `$Response->Database` e ainda enviar HTTP pela API
normal de `Response`.
