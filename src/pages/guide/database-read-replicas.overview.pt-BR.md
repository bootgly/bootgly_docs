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

Configs de réplica herdam os campos da conexão primária, a menos que a réplica sobrescreva algum
valor. Defina `host` para habilitar o endpoint: uma réplica sem ele é descartada. Campos opcionais
incluem `driver`, `port`, `database`, `username`, `password`, `timeout`, `secure`, `pool` e
`statements` (veja **[Chaves e padrões](/manual/ADI/Database/Config/overview/#chaves-e-padrões)**).
Cada réplica é aberta como um pool próprio, listado em `$Database->ReplicaPools`.

Uma réplica que declara `secure.mode` deriva de novo `secure.verify` e `secure.name` a partir desse
modo — a mesma regra do primário: `prefer`/`require` sem verificação, `verify-ca`/`verify-full`
verificando — então repita `verify` na réplica para manter um opt-in explícito do primário. Uma
réplica que não declara nem `mode` nem `verify` herda os flags resolvidos do primário. Um `cafile`
só é herdado por uma réplica que verifica; um que a própria réplica declara sob um modo sem
verificação é recusado na config. Seja qual for o modo, o `secure.peer` de uma réplica tem como
padrão o próprio `host`, nunca o `peer` do primário. Desde a 1.0.3 — antes, a réplica herdava os flags do primário
fosse qual fosse o seu próprio modo. Uma réplica PostgreSQL alcançada sob `prefer` que recusa TLS e
pede uma senha cleartext ou MD5 (ou SCRAM abaixo de 4096 iterações) é recusada pelo próprio host e modo (loopback isento), e a leitura
cai para o primário.

`routing.sticky` é a janela best-effort de read-after-write em segundos (padrão `5.0`; `0` a
desliga). Depois de uma escrita, leituras dentro do mesmo escopo lógico ficam no primário até a
janela expirar (veja [Escopo de read-after-write](#escopo-de-read-after-write)).

## Config de projeto

O projeto demo HTTP expõe as mesmas opções via `configs/database/database.Config.php`. Adicione
`Routing->Sticky` e um ou mais nós `Replicas` abaixo da conexão selecionada:

```php
use Bootgly\ADI\Databases\SQL\Config as ADIConfig;
use Bootgly\API\Environment\Configs\Config;
use Bootgly\API\Environment\Configs\Config\Types;

return new Config(scope: 'database')
   ->Enabled->bind(key: 'DB_ENABLED', default: true, cast: Types::Boolean)
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

Ao usar `DatabaseConfig`, o adapter API mapeia `Routing->Sticky` para `routing.sticky` e cada nó
de réplica habilitado para a lista ADI nativa `replicas`. O Database Response Resource do HTTP
também precisa que o nó `Enabled` valha `true` (veja
**[Configurar o banco](/guide/database-dbal/overview/#configurar-o-banco)** para o escopo inteiro).

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

O adapter lê quantos nós de réplica o escopo declarar, mas sob o resource HTTP um arquivo `.env`
só pode definir as chaves das réplicas 1 e 2: uma linha `DB_REPLICA_3_HOST` ali faz o escopo
falhar ao carregar (veja
**[Chaves que um .env pode definir](/guide/database-dbal/overview/#chaves-que-um-env-pode-definir)**).
Uma terceira réplica precisa de um nó próprio no `database.Config.php`, com os valores vindos do
ambiente do processo ou de defaults literais.

## Regras de roteamento

Queries do builder são o caminho mais preciso. `Builder::compile()` marca uma query como leitura
somente quando ela é um `SELECT` simples sem lock. `SELECT ... FOR UPDATE` e outras leituras com
lock vão para o primário.

SQL raw usa um classificador conservador, que lê a primeira palavra-chave da instrução:

- `SELECT`, `SHOW` e `EXPLAIN` sem análise podem usar réplicas.
- CTEs read-only `WITH ... SELECT` podem usar réplicas. Uma instrução `WITH` que contém `ALTER`,
  `CREATE`, `DELETE`, `DROP`, `INSERT`, `MERGE`, `TRUNCATE` ou `UPDATE` em qualquer ponto — até
  dentro de uma string literal — vai para o primário.
- `INSERT`, `UPDATE`, `DELETE`, `MERGE`, DDL e instruções desconhecidas vão para o primário.
- `EXPLAIN ANALYZE` vai para o primário porque executa a query.
- Uma instrução que começa com um comentário ou um parêntese vai para o primário: a primeira
  palavra dela não é uma palavra-chave que o classificador conhece.

Depois da primeira palavra-chave, o classificador só procura essas palavras de escrita num `WITH`
e `ANALYZE` depois de `EXPLAIN`. Um `SELECT` que chama uma função que escreve — o `nextval()` do
PostgreSQL, por exemplo — conta portanto como leitura, e por enquanto um `SELECT ... FOR UPDATE`
raw também: faça o lock pelo `lock()` do builder, ou dentro de uma transação.

Uma `Query` que você monta à mão nunca é classificada como uma string raw: o flag `reading` dela
decide, e o padrão é `false`.

```php
use Bootgly\ADI\Databases\SQL\Builder\Query;

$Report = new Query('/* report */ SELECT count(*) AS total FROM users', [], reading: true);
$Sequence = new Query("SELECT nextval('orders_id_seq') AS id");

$Count = $Database->await($Database->query($Report));
$Next = $Database->await($Database->query($Sequence));
```

`$Report` pode ir para uma réplica embora o texto dela comece com um comentário. `$Sequence` vai
para o primário embora o texto dela comece com `SELECT`, porque uma `Query` sem `reading: true` é
uma escrita. Toda instrução tratada como escrita — raw, do builder ou montada à mão — também marca
o escopo de read-after-write.

Escritas, DDL, transações e builders com lock sempre usam o pool primário. Leituras vão em
round-robin para as réplicas cujo pool está saudável — para o primário quando nenhum está, ou
enquanto o escopo da leitura estiver dentro da janela sticky.

### Veredictos de segurança

Os stores de segurança apoiados em SQL não tomam decisões de autenticação ou
revogação a partir de réplicas potencialmente atrasadas. Consultas de
credenciais em `Users`, tokens de ação em `Tokens` e dispositivos confiáveis em
`Trust` são forçadas para o primário. Isso inclui o veredicto de rotação do
token remember: o atraso de uma réplica não pode transformar o validator atual
em um falso incidente de roubo nem reviver um token já revogado no primário.

Essas leituras forçadas usam um escopo de roteamento transitório. Elas não
iniciam nem estendem a stickiness de read-after-write para consultas não
relacionadas executadas depois no mesmo worker. Quando um store de segurança
usa uma `Transaction`, a transação continua fixada à sua conexão primária como
sempre e obtém o veredicto nessa conexão. MySQL e PostgreSQL usam
`SELECT ... FOR UPDATE`: o MySQL lê a linha mais recente, enquanto o PostgreSQL
Read Committed lê a linha corrente e Repeatable Read ou Serializable podem
rejeitar uma linha alterada depois do snapshot com SQLSTATE `40001`. Essa
rejeição falha fechada; faça rollback e repita a transação inteira.

O SQLite não suporta `FOR UPDATE`. Os stores executam primeiro uma barreira DML
de zero linhas na mesma transação, que reserva o writer antes do SELECT ou falha
fechada com `database is locked` quando um snapshot WAL já está obsoleto. A
barreira e os locks de linha duram até commit/rollback, e transações read-only
não conseguem adquiri-los. Mantenha essas transações curtas e trate o
rollback/retry do banco. As assinaturas dos construtores e as APIs públicas dos
stores não mudam.

## Escopo de read-after-write

O Bootgly rastreia stickiness de read-after-write com um objeto de escopo lógico. Uma escrita marca
o escopo dela com o momento em que o `query()` a emitiu, e enquanto essa marca for mais nova que
`routing.sticky`, leituras no mesmo escopo vão para o primário:

```php
$Database->await($Database->query('UPDATE users SET name = $1 WHERE id = $2', ['Ada', 7]));

$Read = $Database->await($Database->query('SELECT name FROM users WHERE id = $1', [7]));
$Read->Pool === $Database->Pool; // true
```

Sem o argumento `$Scope`, o escopo é o Fiber atual, ou a própria instância `SQL` quando o código
roda fora de qualquer Fiber. Um script ou comando tem portanto um escopo só para todas as suas
queries: depois de qualquer escrita, toda leitura daquela instância fica no primário durante a
janela. Dentro de Fibers, cada Fiber é um escopo próprio, então uma escrita num Fiber não prende
as leituras de outro.

Em WPI, o Database Response Resource built-in vincula esse escopo ao ciclo da requisição atual,
então o trabalho normal e deferido da resposta compartilham a mesma stickiness sem vazar para
requisições keep-alive posteriores.

Ao usar `SQL` diretamente entre Fibers, passe o mesmo objeto de escopo para escritas e leituras
relacionadas:

```php
use stdClass;

$Scope = new stdClass;

$Database->await($Database->query('UPDATE users SET name = $1 WHERE id = $2', ['Ada', 7], $Scope));
$Read = $Database->await($Database->query('SELECT name FROM users WHERE id = $1', [7], $Scope));
```

Qualquer objeto pode ser um escopo — um job, uma mensagem, uma requisição. A fachada o guarda de
forma fraca: quando nada mais referencia o objeto, a marca dele some junto.

Quando a escrita aconteceu onde esta fachada não podia vê-la — por outra instância `SQL`, outro
processo ou serviço, ou uma instrução que o classificador conta como leitura —, marque o escopo
você mesmo com `touch()`:

```php
$Database->touch($Scope);

$Read = $Database->await($Database->query('SELECT name FROM users WHERE id = $1', [7], $Scope));
$Read->Pool === $Database->Pool; // true
```

O `touch()` sem argumento marca o escopo padrão: o Fiber atual, senão a fachada. Escritas por uma
transação também marcam o escopo, assim que são compostas (veja
**[Escopo de read-after-write](/manual/ADI/Databases/SQL/Transaction/overview/#escopo-de-read-after-write)**
na página de Transações).

A janela sticky é baseada em tempo. Ela não é uma espera causal por LSN ou GTID. Se a aplicação
precisar de frescor estrito na réplica, mantenha a leitura no primário ou adicione uma espera
causal específica do banco antes de ler de réplicas.

## Failover e quarentena

Uma leitura de réplica que falha é executada de novo uma vez no primário, com um deadline novo do
`timeout` da réplica, seja qual for a causa: um dial recusado, uma falha de TLS ou de autenticação,
uma sessão perdida, um timeout ou um simples erro de SQL. A operação então informa `fallback` como
`true`. Uma leitura que você cancelou ou retirou nunca é executada de novo.

Só falhas no nível da conexão contam contra a saúde do pool da réplica; um erro de SQL ou um
timeout não. Depois de `Pool::DEFAULT_FAILURES` falhas consecutivas, o pool da réplica fecha por
uma janela de retry com jitter e as leituras o pulam, para outra réplica saudável ou para o
primário. Uma leitura que dá certo na réplica zera a contagem. Os números, e o que custa uma réplica
que aceita conexões mas nunca responde, estão em
**[Saúde das réplicas](/manual/ADI/Database/Pool/overview/#saúde-das-réplicas)**.

Cada pool de réplica informa o próprio estado:

```php
foreach ($Database->ReplicaPools as $index => $Replica) {
   echo "replica {$index}: ", $Replica->healthy ? 'healthy' : 'closed', " ({$Replica->failures} failures)\n";
}
```

## Próximas referências

- **[DBAL de banco](/guide/database-dbal/overview/)** - registre o Database Response Resource em projetos HTTP.
- **[Consultas de banco](/guide/database-queries/overview/)** - monte instruções de leitura e escrita.
- **[Transações de banco](/guide/database-transactions/overview/)** - fixe escritas em uma conexão primária.
- **[Pool de conexões](/manual/ADI/Database/Pool/overview/)** - os pools de réplica, os deadlines e a saúde deles.