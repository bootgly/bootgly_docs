# Dados no Bootgly

Para sua app rodar, você precisa de onde guardar dados e de um jeito de moldá-los. O
Bootgly te dá um banco SQL mais um fluxo de **migrations** — é só isso que você mexe no
dia a dia.

## O que você precisa saber de verdade

1. **Conectar** — seu projeto já tem um banco SQL (PostgreSQL por padrão). Você abre com
   uma linha:

   ```php
   use Bootgly\ADI\Databases\SQL;

   $Database = new SQL;
   ```

2. **Moldar com migrations** — você nunca escreve `CREATE TABLE` na mão. Você cria uma
   migration, descreve a tabela e aplica:

   ```bash
   bootgly project <nome> migrate create "Create Users Table"
   bootgly project <nome> migrate up
   ```

3. **Consultar** — leia e escreva linhas com o Query Builder: `$Database->query(...)`.

Esse é o ciclo inteiro: **conectar → migrar → consultar**.

## Comece aqui

- **[Database migrations](/guide/database-migrations/overview/)** — o passo a passo
  completo (criar uma migration, aplicar, ver o que aconteceu). **Leia isto primeiro.**
- **[Schema Builder](/manual/ADI/Databases/SQL/Schema/overview/)** — as operações de tabela
  que você chama dentro de uma migration (`create`, `alter`, `drop`, …).
- **[Definindo tabelas](/manual/ADI/Databases/SQL/Schema/Blueprint/overview/)** — como
  descrever colunas: ids, texto, booleanos, datas, chaves estrangeiras.
- **[Migrations](/manual/ADI/Databases/SQL/Schema/Migrations/overview/)** — o arquivo de
  migration, `up`/`down` e leitura do status.
- **[Dialects](/manual/ADI/Databases/SQL/Schema/Dialects/overview/)** — o que muda se você
  usar MySQL ou SQLite no lugar do PostgreSQL.

## Referência

ADI (Abstract Data Interface) é a camada de dados da arquitetura I2P do Bootgly, na cadeia
unidirecional `ABI → ACI → ADI → API → CLI → WPI`. O ponto de entrada único é a fachada
`SQL`; ela expõe dois builders:

- `$Database->query(...)` — Query Builder (DML: `SELECT`/`INSERT`/`UPDATE`/`DELETE`).
- `$Database->structure()` — Schema Builder (DDL + migrations), uma instância `Schema` em
  cache vinculada ao dialeto do banco (mesma instância em toda chamada).
