# Migrations

Uma migration é um arquivo que diz "faça esta mudança no banco" e "como desfazer". Você
cria migrations conforme a app cresce; rodá-las deixa qualquer banco em dia.

> O passo a passo completo via CLI está no guia
> **[Database migrations](/guide/database-migrations/overview/)**. Esta página explica o
> arquivo que você edita e como ler o que aconteceu.

## O fluxo

```bash
bootgly project <nome> migrate create "Create Users Table"  # 1. cria o arquivo
# edite o arquivo (próxima seção)
bootgly project <nome> migrate up                           # 2. aplica pendentes
bootgly project <nome> migrate status                       # 3. vê o estado
bootgly project <nome> migrate down                          # desfaz a última
```

## O arquivo que você edita

`create` cria um stub timestampado em `<projeto>/database/migrations/`, ex.:
`20260515120000_create_users_table.php`. Ele retorna um `Migration` com duas closures:

```php
use Bootgly\ADI\Databases\SQL\Schema\Auxiliaries\Defaults;
use Bootgly\ADI\Databases\SQL\Schema\Auxiliaries\Keys;
use Bootgly\ADI\Databases\SQL\Schema\Auxiliaries\References;
use Bootgly\ADI\Databases\SQL\Schema\Auxiliaries\Types;
use Bootgly\ADI\Databases\SQL\Schema\Blueprint;
use Bootgly\ADI\Databases\SQL\Schema\Migrating;
use Bootgly\ADI\Databases\SQL\Schema\Migration;

return new Migration(
   // Up = a mudança que você quer
   Up: fn (Migrating $Schema) => $Schema->create('users', function (Blueprint $Table): void {
      $Table->add('id', Types::BigInteger)->generate()->constrain(Keys::Primary);
      $Table->add('email', Types::String)->limit(190)->constrain(Keys::Unique);
   }),

   // Down = exatamente como desfazer o Up
   Down: fn (Migrating $Schema) => $Schema->drop('users')
);
```

Regras práticas:

- **`Down` desfaz o `Up`.** Criou uma tabela no `Up`? Remova no `Down`. É isso que faz o
  `migrate down` funcionar.
- Precisa de vários statements? Retorne um **array** — rodam em ordem.
- O filename (sem `.php`) é o nome da migration e sua ordem. Não renomeie arquivos já
  aplicados.

## Lendo o `migrate status`

```
Applied      4      ← já no banco
Local only   2      ← arquivos que você tem, ainda não aplicados  (rode: migrate up)
DB only      0      ← registrado como aplicado mas o arquivo sumiu
Next         20260515120000_create_users_table
```

- **Local only** = pendentes. `migrate up` aplica.
- **DB only** = o banco lembra de uma migration cujo arquivo foi deletado. `migrate sync`
  limpa o registro (não roda nada).

## Desfazendo

```bash
bootgly project <nome> migrate down      # reverte a última aplicada
bootgly project <nome> migrate down 3    # reverte as últimas 3
```

Cada `migrate up` marca suas migrations com um número de **batch**, então um deploy ruim
pode ser revertido como um bloco. Se o banco suporta transações, cada migration aplica
tudo-ou-nada.

## Referência

### API programática

A CLI envolve `Bootgly\ADI\Databases\SQL\Schema\Runner`. Você raramente o instancia direto:

```php
use Bootgly\ADI\Databases\SQL;
use Bootgly\ADI\Databases\SQL\Schema\Runner;

$Runner = new Runner($Database, '/path/database/migrations', '/path/locks/app.lock');

$Runner->report();      // dados de status (formato abaixo)
$Runner->up();          // aplica pendentes; int $limit opcional
$Runner->down(1);       // reverte N aplicadas; filtro de batch opcional
$Runner->sync();        // reconcilia histórico com arquivos, não roda up()/down()
$Runner->create($name); // escreve um stub (delega para Migrations::create())
```

Classes de apoio: `Migration` (o objeto retornado: closures `Up`/`Down`, tipo `Migrating`),
`Migrations` (`discover`/`load`/`create`/`resolve` de arquivos), `Repository` (a tabela de
histórico, nome padrão de `SQLConfig->migrations`, criada automaticamente), `Lock` (lock de
arquivo local; mais um advisory lock do dialeto onde suportado; um lock órfão cujo PID dono
está morto é reclamado).

### Formato do `report()`

```php
[
   'applied' => [ ['migration'=>'…','batch'=>1,'created_at'=>'…'], … ],
   'pending' => ['20260515120000_create_users_table', …], // local, não aplicada
   'missing' => ['…'],                                     // no banco, arquivo deletado
   'files'   => ['nome' => '/abs/path.php', …],
]
```

### Erros

- `down(0)` ou passos negativos → `InvalidArgumentException`.
- Arquivo de migration que não retorna `Migration` → `InvalidArgumentException`.
- `down` atingindo linha de histórico cujo arquivo sumiu → `RuntimeException`.
- Lock já adquirido → `RuntimeException` ("Migration lock is already active.").
