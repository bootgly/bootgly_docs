# Réplicas de leitura de banco

Réplicas de leitura permitem que o Bootgly envie leituras seguras para pools de réplicas enquanto
mantém escritas no banco primário. Isso ajuda quando um worker atende muitas requisições HTTP
focadas em leitura e o primário deve ficar concentrado em escritas, locks e transações.

O Bootgly mantém um único caminho de roteamento em `SQL::query()`: cada query é normalizada,
classificada como leitura ou escrita e então atribuída ao pool primário ou a um dos pools de
réplica.

## Configurar réplicas

Em código, passe uma janela `routing.sticky` e uma lista `replicas` para `SQL`:

```php
use Bootgly\ADI\Databases\SQL;

$Database = new SQL([
   'host' => 'primary.db.local',
   'routing' => [
      'sticky' => 5.0,
   ],
   'replicas' => [
      [
         'host' => 'replica-1.db.local',
         'pool' => [
            'min' => 0,
            'max' => 8,
         ],
      ],
      [
         'host' => 'replica-2.db.local',
         'statements' => 128,
      ],
   ],
]);
```

Configs de réplica herdam os campos da conexão primária, a menos que a réplica sobrescreva
algum valor. Defina `host` para habilitar o endpoint. Campos opcionais incluem `driver`, `port`,
`database`, `username`, `password`, `timeout`, `secure`, `pool` e `statements`.

`routing.sticky` é a janela best-effort de read-after-write em segundos. Depois de uma escrita,
leituras dentro do mesmo escopo lógico ficam no primário até a janela expirar.

## Config de projeto

O projeto demo HTTP expõe as mesmas opções via `configs/database/database.config.php`. Adicione
`Routing->Sticky` e um ou mais nós `Replicas` abaixo da conexão selecionada:

```php
use Bootgly\ADI\Databases\SQL\Config as ADIConfig;
use Bootgly\API\Environment\Configs\Config;
use Bootgly\API\Environment\Configs\Config\Types;

return new Config(scope: 'database')
   ->Default->bind(key: 'DB_CONNECTION', default: ADIConfig::DEFAULT_DRIVER)
   ->Connections
      ->PostgreSQL
         ->Host->bind(key: 'DB_HOST', default: ADIConfig::DEFAULT_HOST)
         ->Routing
            ->Sticky->bind(key: 'DB_ROUTING_STICKY', default: ADIConfig::DEFAULT_ROUTING_STICKY, cast: Types::Float)
            ->up()
         ->Replicas
            ->Replica1
               ->Host->bind(key: 'DB_REPLICA_1_HOST', default: null)
               ->Port->bind(key: 'DB_REPLICA_1_PORT', default: null, cast: Types::Integer)
               ->Database->bind(key: 'DB_REPLICA_1_NAME', default: null)
               ->Username->bind(key: 'DB_REPLICA_1_USER', default: null)
               ->Password->bind(key: 'DB_REPLICA_1_PASS', default: null)
               ->Timeout->bind(key: 'DB_REPLICA_1_TIMEOUT', default: null, cast: Types::Float)
               ->Statements->bind(key: 'DB_REPLICA_1_STATEMENTS', default: null, cast: Types::Integer);
```

Ao usar `DatabaseConfig`, o adapter API mapeia `Routing->Sticky` para `routing.sticky` e cada
nó de réplica habilitado para a lista ADI nativa `replicas`.

O projeto demo aceita `DB_ROUTING_STICKY` e as seguintes chaves para `Replica1` e `Replica2`:

```text
DB_REPLICA_1_HOST
DB_REPLICA_1_PORT
DB_REPLICA_1_NAME
DB_REPLICA_1_USER
DB_REPLICA_1_PASS
DB_REPLICA_1_TIMEOUT
DB_REPLICA_1_STATEMENTS
DB_REPLICA_1_SSLMODE
DB_REPLICA_1_SSLVERIFY
DB_REPLICA_1_SSLPEER
DB_REPLICA_1_SSLCAFILE
DB_REPLICA_1_POOL_MIN
DB_REPLICA_1_POOL_MAX
```

Use os mesmos sufixos para `DB_REPLICA_2_*`. Uma réplica sem `*_HOST` é ignorada.

## Regras de roteamento

Queries do builder são o caminho mais preciso. `Builder::compile()` marca uma query como leitura
somente quando ela é um `SELECT` simples sem lock. `SELECT ... FOR UPDATE` e outras leituras com
lock vão para o primário.

SQL cru usa um classificador conservador:

- `SELECT`, `SHOW` e `EXPLAIN` sem análise podem usar réplicas.
- CTEs read-only `WITH ... SELECT` podem usar réplicas.
- `INSERT`, `UPDATE`, `DELETE`, `MERGE`, DDL e instruções desconhecidas vão para o primário.
- `EXPLAIN ANALYZE` vai para o primário porque executa a query.

Escritas, DDL, transações e builders com lock sempre usam o pool primário.

## Escopo de read-after-write

O Bootgly rastreia stickiness de read-after-write com um objeto de escopo lógico. Em WPI, o
Database Response Resource built-in vincula esse escopo ao ciclo da requisição atual, então o
trabalho normal e deferido da resposta compartilham a mesma stickiness sem vazar para requisições
keep-alive posteriores.

Ao usar `SQL` diretamente entre Fibers, passe o mesmo objeto de escopo para escritas e leituras
relacionadas:

```php
use stdClass;

$Scope = new stdClass;

$Database->query('UPDATE users SET name = $1 WHERE id = $2', ['Ada', 7], $Scope);
$Read = $Database->query('SELECT name FROM users WHERE id = $1', [7], $Scope);
```

A janela sticky é baseada em tempo. Ela não é uma espera causal por LSN ou GTID. Se a aplicação
precisar de frescor estrito na réplica, mantenha a leitura no primário ou adicione uma espera
causal específica do banco antes de ler de réplicas.

## Failover e quarentena

Leituras em réplica fazem fallback para o primário uma vez quando a operação da réplica falha.
Falhas de conexão, handshake e estabelecimento de socket contam contra a saúde do pool de
réplica. Timeouts de query fazem fallback, mas não colocam a réplica em quarentena.

Depois de `Pool::DEFAULT_FAILURES` falhas consecutivas que afetam saúde, a réplica é pulada até
a janela de retry com jitter expirar ou o pool se recuperar depois de uma operação bem-sucedida.

## Próximas referências

- **[DBAL de banco](/guide/database-dbal/overview/)** - registre o Database Response Resource em projetos HTTP.
- **[Consultas de banco](/guide/database-queries/overview/)** - monte instruções de leitura e escrita.
- **[Transações de banco](/guide/database-transactions/overview/)** - fixe escritas em uma conexão primária.
