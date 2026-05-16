# Database migrations

Este guia percorre o fluxo completo de migrations de um projeto Bootgly, ponta a ponta,
usando o **[Schema Builder](/manual/ADI/Databases/SQL/Schema/overview/)** nativo e a CLI
`bootgly project … migrate`.

## 1. Configurar o banco

Migrations rodam contra o banco SQL configurado do projeto (PostgreSQL por padrão). As
configurações de conexão vêm do config de ambiente do projeto (`DatabaseConfig`) — o mesmo
usado em runtime. Não há setup extra além de um banco acessível.

Os arquivos de migration ficam em `<projeto>/database/migrations/` e o lock do runner em
`workdata/locks/migrations/<projeto>.lock` (ambos criados sob demanda).

## 2. Criar uma migration

```bash
bootgly project <nome> migrate create "Create Users Table"
```

Isso escreve um stub timestampado, ex.:
`database/migrations/20260515120000_create_users_table.php`:

```php
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

## 3. Escrever `Up` / `Down`

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

Uma closure pode retornar uma query ou um array de queries (migrations multi-statement
rodam em ordem). Veja **[Blueprint](/manual/ADI/Databases/SQL/Schema/Blueprint/overview/)**
para a API completa de colunas.

## 4. Aplicar migrations pendentes

```bash
bootgly project <nome> migrate up
```

Todas as pendentes aplicam em ordem de filename, compartilhando um número de **batch**.
Quando o banco suporta transações, cada migration mais sua linha de histórico commitam
atomicamente e revertem em caso de erro.

## 5. Inspecionar status

```bash
bootgly project <nome> migrate status
```

Mostra `Applied`, `Local only` (pendentes), `DB only` (arquivo deletado mas ainda
registrado) e a próxima migration a rodar.

## 6. Reverter

```bash
bootgly project <nome> migrate down        # reverte a última aplicada
bootgly project <nome> migrate down 3      # reverte as últimas 3
```

`down` roda a closure `Down` de cada migration em ordem inversa. É obrigatório informar uma
quantidade de passos positiva.

## 7. Sincronizar histórico sem rodar migrations

```bash
bootgly project <nome> migrate sync
```

`sync` reconcilia a tabela de histórico com os arquivos de migration **sem** executar
`Up`/`Down` — registra arquivos pendentes como aplicados e remove linhas de histórico cujos
arquivos foram deletados. Use para adotar migrations num banco já provisionado.

## Concorrência e segurança

Um lock de arquivo local mais um advisory lock do dialeto (onde suportado) impedem duas
execuções simultâneas; um lock órfão cujo processo dono não existe mais é reclamado
automaticamente. Se o lock estiver realmente ativo você recebe
`Migration lock is already active.`

## Referência

- **[Schema](/manual/ADI/Databases/SQL/Schema/overview/)** — a fachada DDL.
- **[Consultas de banco](/guide/database-queries/overview/)** — o próximo fluxo depois que
  suas tabelas existem.
- **[Blueprint](/manual/ADI/Databases/SQL/Schema/Blueprint/overview/)** — colunas, tipos, referências.
- **[Migrations](/manual/ADI/Databases/SQL/Schema/Migrations/overview/)** — `Runner`, batches, histórico.
- **[Dialects](/manual/ADI/Databases/SQL/Schema/Dialects/overview/)** — PostgreSQL / MySQL / SQLite.
