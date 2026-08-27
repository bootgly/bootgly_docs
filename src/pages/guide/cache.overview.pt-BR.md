# Cache

O Bootgly traz uma camada de cache nativa e sem dependências em
`Bootgly\ABI\Resources\Cache`. Uma facade, cinco drivers bloqueantes — **Memory**, **File**,
**APCu**, **Shared-memory** e **Redis** — com TTL, tags, contadores atômicos e invalidação por
tag. É o mesmo cache usado internamente pelo rate limiter multi-worker.

> [!NOTE]
> O cache vive na camada ABI, então todo driver é **bloqueante**. Dentro do worker assíncrono
> do `HTTP_Server_CLI`, prefira `memory` (por worker, array puro — nunca toca uma syscall) ou
> `shared`/`apcu` (sem rede) nos caminhos quentes e use o
> **[driver Redis KV](#redis-assincrono-no-event-loop)** não-bloqueante quando precisar de
> Redis no event loop — uma chamada Redis bloqueante travaria o loop.

## Gravar e ler

Crie um cache, depois grave e leia valores. Escalares e arrays voltam com fidelidade de
tipo; objetos voltam assim que a classe deles é declarada (veja [Segurança](#segurança)):

```php
use Bootgly\ABI\Resources\Cache;

$Cache = new Cache(['driver' => 'file']);

$Cache->store('user:42', ['name' => 'Ada'], TTL: 300);
$User = $Cache->fetch('user:42');   // ['name' => 'Ada'], ou null em miss/expiração
$Cache->check('user:42');           // true enquanto presente e não expirado
$Cache->delete('user:42');
```

`fetch()` retorna `null` em um miss ou quando a entrada expira. Use `check()` quando precisar
distinguir um `null` armazenado de um miss.

## Contadores e TTL

`increment()` e `decrement()` são atômicos. Um `TTL` positivo é aplicado **apenas quando o
contador é criado pela primeira vez**, então a janela não desliza nas próximas chamadas —
exatamente o comportamento de um rate limiter de janela fixa (espelha `INCR` + um `EXPIRE`
único do Redis):

```php
$hits = $Cache->increment('hits:home');            // 1, 2, 3, ...
$left = $Cache->increment("quota:$ip", TTL: 60);    // a janela abre na primeira chamada
$secs = $Cache->remain("quota:$ip");                // segundos restantes (-1 = sem expiração, -2 = ausente)
```

`remain()` informa o tempo de vida restante seguindo a semântica do Redis: `-2` quando a chave
está ausente ou expirada, `-1` quando existe sem expiração, caso contrário os segundos
restantes.

## Tags e invalidação

Agrupe chaves com tags e descarte o grupo inteiro em uma chamada:

```php
$Cache->store('post:1', $a, tags: ['posts']);
$Cache->store('post:2', $b, tags: ['posts']);

$Cache->invalidate('posts');   // post:1 e post:2 somem
$Cache->purge();               // remove entradas expiradas; retorna a quantidade removida
$Cache->clear();               // esvazia o namespace deste cache
```

## Obter-ou-computar

`resolve()` retorna o valor em cache, computando e gravando em um miss:

```php
$Report = $Cache->resolve('report:daily', TTL: 3600, compute: function () {
   return build_expensive_report();
});
```

## Escolher um driver

| Driver | `driver` | Escopo | Use para |
|---|---|---|---|
| Memory | `memory` | Por processo, na heap | O mais rápido; caches de processo único, testes, uma camada L1 na frente de um backend compartilhado (sem extensão; não é compartilhado entre workers) |
| File | `file` (padrão) | Por host, em disco | Sempre disponível; padrão seguro |
| APCu | `apcu` | Por processo | Dados quentes de worker único (precisa `ext-apcu`) |
| Shared-memory | `shared` | Por host, **cross-worker** | Estado compartilhado multi-worker, rate limiting (precisa `ext-sysvshm` + `ext-sysvsem`) |
| Redis | `redis` | Rede, multi-host | Cache distribuído; RESP nativo, `ext-redis` opcional |

```php
$Cache = new Cache(['driver' => 'shared', 'prefix' => 'app:']);
$Cache = new Cache(['driver' => 'redis', 'host' => '127.0.0.1', 'port' => 6379]);
```

O driver **Memory** mantém as entradas em um array PHP comum dentro da instância do driver: cada
operação é um acesso direto por hash, sem serialização, sem locks e sem extensão — o backend mais
rápido. O custo é o escopo: cada worker tem sua própria cópia, nada é compartilhado entre workers
forkados, e o store morre com o processo. Use-o como cache de processo único, um dublê de teste,
ou uma camada L1 na frente de um backend compartilhado mais lento.

O driver **Shared-memory** é o backend cross-worker canônico: mantém os dados em um segmento de
memória compartilhada System V protegido por um semáforo System V, então todo worker forkado no
host enxerga as mesmas entradas e `increment()` é atômico entre processos.

O driver **Redis** é nativo por padrão — um socket bloqueante falando RESP via o codec
compartilhado `Bootgly\ABI\Data\RESP`, sem dependência Composer. Quando `ext-redis` está
carregada, ela é usada como transporte mais rápido (caminho em C) atrás da mesma interface.

## Contrato atômico de comparação e mutação

`Bootgly\ABI\Resources\Cache\Atomic` marca drivers cujas operações `create()`, `swap()` e
`evict()` são atômicas em todo o escopo de visibilidade do backend. **File**, **Memory**,
**Shared-memory** e **Redis** implementam esse contrato. **APCu** não oferece um
compare-and-evict genérico, então não é um driver `Atomic`; um driver customizado só deve
aderir depois de implementar as três primitivas.

| Operação | Garantia |
|---|---|
| `create($key, $value, $TTL)` | Grava somente quando nenhum valor vivo possui a chave |
| `swap($key, $expected, $value, $TTL)` | Substitui somente o valor esperado exato |
| `evict($key, $expected)` | Remove somente o valor esperado exato |

Componentes de segurança que elegem um vencedor entre workers ou hosts exigem esse marcador.
Em especial, um JWT `Vault` apoiado por um Cache preparado rejeita APCu e drivers customizados
não atômicos durante a construção:

```php
use Bootgly\ABI\Resources\Cache;
use Bootgly\API\Security\JWT\Vault;

$Cache = new Cache([
   'driver' => 'redis',
   'host' => 'redis.internal',
   'prefix' => 'security:',
]);

$Vault = new Vault(
   $Cache,
   secret: getenv('JWT_VAULT_SECRET') ?: '' // mesmo segredo (>= 32 bytes) em todo host
);
```

`Vault::claim()` e `Vault::take()` elegem o vencedor atomicamente no backend. Novos envelopes
do Vault também carregam um nonce aleatório autenticado, então um compare-and-evict obsoleto
não remove uma gravação posterior de mesmo valor (ABA). Envelopes legados continuam legíveis
durante uma atualização gradual; a garantia completa do nonce começa depois que as instâncias
antigas que ainda gravam saem do conjunto.

> [!WARNING]
> `Vault::lock()` é um bloqueio de arquivo local ao host, não uma transação Redis distribuída
> de múltiplas chaves.
> Ele serializa trabalho composto somente dentro de um host. Não construa uma transação
> entre hosts compondo várias chaves do Vault sob `lock()`.

## Configuração

Passe um array (ou um `Cache\Config` pronto) ao construtor:

| Chave | Padrão | Aplica a | Significado |
|---|---|---|---|
| `driver` | `file` | todos | Driver ativo |
| `prefix` | `''` | todos | Namespace prefixado em toda chave |
| `ttl` | `0` | todos | TTL padrão (segundos; `0` = para sempre) |
| `path` | `…/storage/cache` | file | Diretório base |
| `segment` | `0` | shared | Chave System V (`0` deriva uma) |
| `size` | `16 MiB` | shared | Tamanho do segmento em bytes |
| `host` / `port` | `127.0.0.1` / `6379` | redis | Endpoint do servidor |
| `password` / `database` | `''` / `0` | redis | AUTH / SELECT |
| `timeout` | `5.0` | redis | Segundos de conexão/leitura |
| `secure` | `false` | redis | Conexão TLS |
| `classes` | `[]` | file, redis, shared, apcu | Classes que o cache pode reconstruir (veja [Segurança](#segurança)) |
| `clock` | `null` | file, shared, memory | Override de relógio `Closure(): int` (testes) |

## Rate limiting (backend compartilhado)

O middleware HTTP `RateLimit` usa este cache como backend. Com o driver **Shared-memory** (o
padrão), o limite é aplicado **entre todos os workers conectados ao mesmo segmento naquele host**
em vez de ser multiplicado por worker:

```php
use Bootgly\ABI\Resources\Cache;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\RateLimit;

$Cache = new Cache([
   'driver' => 'shared',
   'prefix' => 'ratelimit:',
]);
$RateLimit = new RateLimit(
   limit: 60,
   window: 60,
   scope: 'public-api',
   Cache: $Cache
);
// Ou use um backend Redis comum para uma frota multi-host:
$Redis = new Cache(['driver' => 'redis', 'prefix' => 'ratelimit:']);
$RateLimit = new RateLimit(
   limit: 60,
   window: 60,
   scope: 'public-api',
   Cache: $Redis
);
```

`scope` nomeia a política lógica, não o cliente. Reutilize o mesmo valor explícito para essa
política em todos os workers que compartilham o backend de Cache e dê valores distintos a políticas
independentes. Um scope não distribui estado por conta própria: entre hosts, use o mesmo scope,
prefixo de Cache e um backend realmente compartilhado, como Redis. Quando omitido, o `RateLimit`
deriva um scope determinístico do arquivo e da linha normalizados da chamada `new RateLimit`. Esse
padrão funciona entre workers que executam o mesmo código, mas mover a expressão muda sua
identidade. Use um scope explícito em factories e deploys graduais multi-host, nos quais revisões
antigas e novas podem coexistir. `globalScope` usa `scope` por padrão; compartilhe-o explicitamente
apenas quando políticas distintas e sem sobreposição de rotas devam contribuir para um único teto
agregado.

O algoritmo `Sliding` padrão usa baldes atual e anterior ponderados e alinhados às épocas do
relógio; ele **não** abre uma janela TTL privada na primeira requisição do cliente. `Fixed` tem o
comportamento iniciado pela primeira requisição: a criação do contador define seu TTL e os
incrementos posteriores não estendem a janela. Ambos emitem `X-RateLimit-Limit`,
`X-RateLimit-Remaining` e `X-RateLimit-Reset`; uma requisição rejeitada retorna `429` com
`Retry-After`.

> [!WARNING]
> A migração para namespaces de política v2 inicia contadores novos no primeiro deploy, portanto
> quotas v1 ativas reiniciam uma vez. Registros v1 antigos podem coexistir com registros v2; depois
> que seus TTLs expiram, eles deixam de contar, mas o driver Shared-memory de capacidade fixa retém
> seu espaço no segmento até um purge explícito. O mesmo requisito de recuperação se aplica à
> expiração normal de contadores v2. Reserve folga no segmento, retenha a instância de Cache injetada
> e execute `purge()` periodicamente (e depois da migração, de preferência fora do
> tráfego quente) para recuperar registros expirados; caso contrário, armazenamento obsoleto pode
> esgotar o
> segmento mesmo que esses contadores já não afetem requisições.

## Redis assíncrono no event loop

O driver Redis bloqueante acima travaria o worker HTTP assíncrono. Para Redis não-bloqueante no
event loop, use a **facade KV** — ela fala RESP sobre o mesmo pool de conexões assíncrono do
DBAL que o driver SQL usa, reaproveitando o codec `Bootgly\ABI\Data\RESP`:

```php
use Bootgly\ADI\Databases\KV;

$KV = new KV([
   'driver' => 'redis',
   'host' => '127.0.0.1',
   'port' => 6379,
   'secure' => ['mode' => 'disable'], // plaintext local explícito
]);

$KV->await($KV->command('SET', ['user:42', 'value']));
$Get   = $KV->await($KV->command('GET', ['user:42']));
$value = $Get->response;   // resposta RESP: string | int | array | null

$Incr  = $KV->await($KV->command('INCRBY', ['hits', 5]));
$count = $Incr->response;  // 5
```

Em scripts CLI você pode `await()` diretamente pelo pool. Em rotas `HTTP_Server_CLI`, conduza a
partir de `$Response->defer()` como qualquer outro recurso assíncrono, para que o código da rota
nunca chame `advance()` manualmente.

> [!NOTE]
> O driver assíncrono faz pipeline de comandos em cada conexão do pool. `AUTH`/`SELECT` são
> enviados uma vez como preâmbulo; `SELECT` só dispara para um índice `database` numérico.
> Redis usa TLS implícito: `prefer` tenta TLS primeiro e só reconecta em plaintext se a
> negociação falhar, enquanto `require`, `verify-ca` e `verify-full` nunca enviam RESP —
> inclusive `AUTH` — antes de um handshake bem-sucedido. `disable` é plaintext explícito.

Use um modo strict em deployment remoto. `verify-full` valida a cadeia do certificado e o
nome do peer; `cafile` seleciona um bundle de CA privado e `peer` sobrescreve a identidade
esperada:

```php
$KV = new KV([
   'driver' => 'redis',
   'host' => 'redis.internal',
   'port' => 6380,
   'password' => getenv('KV_PASS') ?: '',
   'database' => '2',
   'secure' => [
      'mode' => 'verify-full',
      'peer' => 'redis.internal',
      'cafile' => '/run/secrets/redis-ca.pem',
   ],
]);
```

> [!WARNING]
> `prefer` permite downgrade deliberadamente depois de uma geração TLS falhar. Use `require`,
> `verify-ca` ou `verify-full` sempre que plaintext não for aceitável.

## Segurança

O store do cache é uma **fronteira de confiança**: só a sua aplicação deveria conseguir gravar
em `storage/cache/`, no segmento SysV, no pool do APCu ou na instância Redis — proteja todos
com permissões de filesystem e de rede. Como defesa em profundidade, todo driver que persiste
decodifica os registros gravados através de uma **allow-list `allowed_classes` fail-closed**,
então um registro adulterado nunca executa um gadget de object injection
(`__wakeup`/`__destruct`) enquanto está sendo lido. Rejeitar o valor depois não é defesa — a
essa altura o gadget já rodou.

Por padrão nada é reconstruído além do próprio wrapper de registro `Cache\Item` do driver File.
Cachear um objeto significa declarar a classe dele:

```php
$Cache = new Cache([
   'driver' => 'file',
   'classes' => [Product::class, Money::class],
]);
```

> [!WARNING]
> Isso mudou nesta release. Um objeto cacheado **sem** ser declarado volta como um **miss** —
> `fetch()` retorna `null` e `check()` retorna `false` — ele nunca é entregue pela metade.
> Declare toda classe que você cacheia, inclusive classes aninhadas dentro de um array
> cacheado. Valores feitos só de escalares e arrays não precisam de configuração nenhuma.

Os registros são decodificados com um limite de aninhamento de 256, o que deixa espaço para
cerca de **250 níveis** de aninhamento no seu próprio valor — muito além de qualquer estrutura
cacheada real, e existe para limitar a recursão que um registro adulterado pode forçar. Um
valor mais profundo que isso, assim como um registro cujos bytes não batem mais com os tipos
declarados das propriedades, volta como um **miss** em vez de levantar erro.

Enums são a única exceção: o PHP os restaura fora do `allowed_classes`, então um enum cacheado
volta sem precisar ser declarado. Um enum não pode ter destructor, então nenhum deles é um
gadget.

Os quatro drivers que persistem aplicam a lista **antes** de qualquer reconstrução — `file` e
`redis` protegem uma chamada a `unserialize()` diretamente; `shared` e `apcu` guardam os
registros como strings opacas e as decodificam em PHP sob a mesma allow-list, já que
`shm_get_var()` e `apcu_fetch()` não aceitam opção nenhuma e, sem isso, reconstruiriam o que
quer que o store guardasse antes de qualquer código do driver poder recusar. O `memory` não
precisa de lista: guarda valores vivos no heap do processo e nunca serializa.

Como `shared` e `apcu` agora gravam strings opacas, as escritas do *próprio* Bootgly também
nunca carregam um grafo de objetos. O primeiro processo que anexa um segmento escrito por um
Bootgly anterior descarta o segmento, então um deploy zera contadores de rate limit e derruba
sessões compartilhadas exatamente uma vez, e as leituras do `shared` custam cerca de 9-13% a
mais.

> [!NOTE]
> Trate o segmento SysV e o store do APCu como qualquer outro recurso compartilhado: mantenha
> `permissions` em `0600`, não abra o segmento para o grupo, e lembre que a memória do APCu é
> compartilhada por toda aplicação no mesmo pool PHP. Uma aplicação que não pode compartilhar
> identidade de cache com vizinhas ainda deve preferir `file` ou `redis`.

## Referência

- **Contrato** — `Cache\Driver` (abstrato): `fetch`, `store`, `delete`, `clear`, `check`,
  `increment`, `decrement`, `remain`, `invalidate`, `purge`. A facade `Cache` aplica o `prefix`
  da chave e adiciona `resolve()`.
- **Facade vs driver** — `Cache` expõe o driver ativo (`$Cache->Driver`) e o registro
  `Drivers` (`$Cache->Drivers->register('name', MyDriver::class)`), que constrói drivers de
  forma lazy no primeiro uso.
- **Camadas** — o cache é um componente ABI e portanto bloqueante; não pode alcançar o event
  loop. O Redis assíncrono é uma responsabilidade ADI (`Bootgly\ADI\Databases\KV`).
- **Codec RESP** — `Bootgly\ABI\Data\RESP` fornece um `Encoder` stateless e um `Decoder`
  incremental (RESP2 + RESP3), compartilhado pelo driver Redis bloqueante e pelo driver KV
  assíncrono.
- **Drivers** — `Cache\Drivers\{Memory, File, APCu, Shared, Redis}`. Memory mantém as entradas
  em um array PHP por processo (sem serialização, sem locks; o mais rápido, mas não compartilhado
  entre workers e limpo ao encerrar o processo); File grava um arquivo por chave
  com sharding por hash (temp + rename atômico, `flock` para contadores); Shared usa um segmento
  System V + semáforo com um índice de chaves vivas para `clear`/`purge`; Redis mapeia o
  contrato para `SET`/`GET`/`INCRBY`/`EXPIRE`/`TTL`/`SADD`/`SMEMBERS`/`SCAN`, agrupando
  operações multi-comando em round-trips únicos (stores com tags fazem pipeline de
  `SET`+`SADD`s; `invalidate` e `clear` usam `UNLINK` variádico em chunks) e aceitando a
  chave de config `persistent` para conexões persistentes. O `persistent` só é honrado para
  uma conexão cuja sessão é a padrão do servidor — sem `database`, sem `password`, sem TLS:
  o PHP indexa o pool de streams persistentes só por `tcp://host:port`, então uma conexão que
  precisa de sessão própria carregaria essa sessão para todos os outros clientes do endpoint,
  e a deles para ela. Uma config que pede os dois continua funcionando; ela apenas abre o
  próprio socket.
- **Semântica do resolve()** — hit/miss é decidido por um único `fetch()`, então um `null`
  armazenado é tratado como miss e recomputado. Não armazene valores `null` no cache.

## Benchmarking

Faça profiling de cada driver em todo o conjunto de operações (store, fetch, increment,
tags, resolve, ...) com o caso de benchmark `Cache`:

```bash :toolbar="true";
./bootgly test benchmark Cache
```

Ele imprime uma matriz driver×operação (o mais rápido destacado) e salva os `.marks` em
`storage/tests/benchmarks/Cache/`. Drivers cujo backend não está disponível (extensão
ausente / servidor Redis inacessível) aparecem como **N/A**, então a execução continua
funcionando em instalações mínimas. Requer o repositório irmão `bootgly_benchmarks` clonado
ao lado de `bootgly`; veja o `Cache/README.md` dele para a lista de operações e flags de
ajuste.

## Próximas referências

- **[Configuração](/guide/configuration/overview/)** - carregue configs por escopo e valores `.env`.
- **[Performance](/guide/performance/overview/)** - ajuste workers, pools e concorrência.
- **[Database DBAL](/guide/database-dbal/overview/)** - o pool assíncrono sobre o qual o driver Redis KV roda.
