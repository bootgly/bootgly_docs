# Cache

O Bootgly traz uma camada de cache nativa e sem dependências em
`Bootgly\ABI\Resources\Cache`. Uma facade, quatro drivers bloqueantes — **File**, **APCu**,
**Shared-memory** e **Redis** — com TTL, tags, contadores atômicos e invalidação por tag. É o
mesmo cache usado internamente pelo rate limiter multi-worker.

> [!NOTE]
> O cache vive na camada ABI, então todo driver é **bloqueante**. Dentro do worker assíncrono
> do `HTTP_Server_CLI`, prefira `shared`/`apcu` (sem rede) nos caminhos quentes e use o
> **[driver Redis KV](#redis-assincrono-no-event-loop)** não-bloqueante quando precisar de
> Redis no event loop — uma chamada Redis bloqueante travaria o loop.

## Gravar e ler

Crie um cache, depois grave e leia valores. Qualquer valor serializável volta com fidelidade
de tipo:

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
| File | `file` (padrão) | Por host, em disco | Sempre disponível; padrão seguro |
| APCu | `apcu` | Por processo | Dados quentes de worker único (precisa `ext-apcu`) |
| Shared-memory | `shared` | Por host, **cross-worker** | Estado compartilhado multi-worker, rate limiting (precisa `ext-sysvshm` + `ext-sysvsem`) |
| Redis | `redis` | Rede, multi-host | Cache distribuído; RESP nativo, `ext-redis` opcional |

```php
$Cache = new Cache(['driver' => 'shared', 'prefix' => 'app:']);
$Cache = new Cache(['driver' => 'redis', 'host' => '127.0.0.1', 'port' => 6379]);
```

O driver **Shared-memory** é o backend cross-worker canônico: mantém os dados em um segmento de
memória compartilhada System V protegido por um semáforo System V, então todo worker forkado no
host enxerga as mesmas entradas e `increment()` é atômico entre processos.

O driver **Redis** é nativo por padrão — um socket bloqueante falando RESP via o codec
compartilhado `Bootgly\ABI\Data\RESP`, sem dependência Composer. Quando `ext-redis` está
carregada, ela é usada como transporte mais rápido (caminho em C) atrás da mesma interface.

## Configuração

Passe um array (ou um `Cache\Config` pronto) ao construtor:

| Chave | Padrão | Aplica a | Significado |
|---|---|---|---|
| `driver` | `file` | todos | Driver ativo |
| `prefix` | `''` | todos | Namespace prefixado em toda chave |
| `ttl` | `0` | todos | TTL padrão (segundos; `0` = para sempre) |
| `path` | `…/workdata/cache` | file | Diretório base |
| `segment` | `0` | shared | Chave System V (`0` deriva uma) |
| `size` | `16 MiB` | shared | Tamanho do segmento em bytes |
| `host` / `port` | `127.0.0.1` / `6379` | redis | Endpoint do servidor |
| `password` / `database` | `''` / `0` | redis | AUTH / SELECT |
| `timeout` | `5.0` | redis | Segundos de conexão/leitura |
| `secure` | `false` | redis | Conexão TLS |
| `clock` | `null` | file, shared | Override de relógio `Closure(): int` (testes) |

## Rate limiting (backend compartilhado)

O middleware HTTP `RateLimit` usa este cache como backend. Com o driver **Shared-memory** (o
padrão), o limite é aplicado **globalmente em todos os workers** em vez de ser multiplicado por
worker:

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\RateLimit;

$RateLimit = new RateLimit(limit: 60, window: 60);
// Ou injete um cache específico (ex.: Redis para uma frota multi-host):
$RateLimit = new RateLimit(limit: 60, window: 60, Cache: new Cache(['driver' => 'redis']));
```

A janela de cada cliente abre na primeira requisição (a criação do contador define o TTL) e
reinicia quando essa entrada expira. O middleware emite os headers usuais `X-RateLimit-Limit`,
`X-RateLimit-Remaining`, `X-RateLimit-Reset` e `Retry-After`, e retorna `429` quando o limite é
excedido.

## Redis assíncrono no event loop

O driver Redis bloqueante acima travaria o worker HTTP assíncrono. Para Redis não-bloqueante no
event loop, use a **facade KV** — ela fala RESP sobre o mesmo pool de conexões assíncrono do
DBAL que o driver SQL usa, reaproveitando o codec `Bootgly\ABI\Data\RESP`:

```php
use Bootgly\ADI\Databases\KV;

$KV = new KV(['driver' => 'redis', 'host' => '127.0.0.1', 'port' => 6379]);

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
> Escopo v1 do driver Redis KV assíncrono: TCP puro, um comando por conexão (sem pipelining).
> `AUTH`/`SELECT` são enviados uma vez como preâmbulo na abertura da conexão; `SELECT` só
> dispara para um índice `database` numérico.

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
- **Drivers** — `Cache\Drivers\{File, APCu, Shared, Redis}`. File grava um arquivo por chave
  com sharding por hash (temp + rename atômico, `flock` para contadores); Shared usa um segmento
  System V + semáforo com um índice de chaves vivas para `clear`/`purge`; Redis mapeia o
  contrato para `SET`/`GET`/`INCRBY`/`EXPIRE`/`TTL`/`SADD`/`SMEMBERS`/`SCAN`, agrupando
  operações multi-comando em round-trips únicos (stores com tags fazem pipeline de
  `SET`+`SADD`s; `invalidate` e `clear` usam `UNLINK` variádico em chunks) e aceitando a
  chave de config `persistent` para conexões persistentes.
- **Semântica do resolve()** — hit/miss é decidido por um único `fetch()`, então um `null`
  armazenado é tratado como miss e recomputado. Não armazene valores `null` no cache.

## Benchmarking

Faça profiling de cada driver em todo o conjunto de operações (store, fetch, increment,
tags, resolve, ...) com o caso de benchmark `Cache`:

```bash
./bootgly test benchmark Cache
```

Ele imprime uma matriz driver×operação (o mais rápido destacado) e salva os `.marks` em
`workdata/tests/benchmarks/Cache/`. Drivers cujo backend não está disponível (extensão
ausente / servidor Redis inacessível) aparecem como **N/A**, então a execução continua
funcionando em instalações mínimas. Requer o repositório irmão `bootgly_benchmarks` clonado
ao lado de `bootgly`; veja o `Cache/README.md` dele para a lista de operações e flags de
ajuste.

## Próximas referências

- **[Configuração](/guide/configuration/overview/)** - carregue configs por escopo e valores `.env`.
- **[Performance](/guide/performance/overview/)** - ajuste workers, pools e concorrência.
- **[Database DBAL](/guide/database-dbal/overview/)** - o pool assíncrono sobre o qual o driver Redis KV roda.
