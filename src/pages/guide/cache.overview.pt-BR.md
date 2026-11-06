# Cache

O Bootgly traz uma camada de cache nativa e sem dependências em
`Bootgly\ABI\Resources\Cache`. Uma facade, cinco drivers bloqueantes — **Memory**, **File**,
**APCu**, **Shared-memory** e **Redis** — com TTL, tags, contadores atômicos e invalidação por
tag. É o mesmo cache usado internamente pelo rate limiter multi-worker.

> [!NOTE]
> O cache vive na camada ABI, então todo driver é **bloqueante**. Dentro do worker assíncrono
> do `HTTP_Server_CLI`, prefira `memory` (por worker, array puro — nunca toca uma syscall) ou
> `shared`/`apcu` (sem rede) nos caminhos quentes. Quando uma rota precisar de Redis, use o
> **[resource `$Response->KV`](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/overview/#aguardar-trabalho-key-value)**
> dentro de `$Response->defer()`; o resource estaciona o Fiber da resposta até o Redis
> responder — uma chamada Redis bloqueante travaria o loop, e o `await()` da
> [facade KV raw](#redis-assíncrono-no-event-loop) também.

## Gravar e ler

Crie um cache, depois grave e leia valores. Escalares e arrays voltam com fidelidade de
tipo; objetos voltam assim que a classe deles é declarada (veja [Segurança](#segurança)):

```php
use Bootgly\ABI\Resources\Cache;

$Cache = new Cache(['driver' => 'file']);

$Cache->store('user:42', ['name' => 'Ada'], TTL: 300);
$User = $Cache->fetch('user:42');   // ['name' => 'Ada'], or null on miss/expiry
$Cache->check('user:42');           // true while present and unexpired
$Cache->delete('user:42');
```

`fetch()` retorna `null` em um miss ou quando a entrada expira. Use `check()` quando precisar
distinguir um `null` armazenado de um miss.

## Contadores e TTL

`increment()` e `decrement()` são atômicos. Um `TTL` positivo é aplicado **apenas quando o
contador é criado pela primeira vez** — no mesmo passo atômico que o cria — então a janela não
desliza nas próximas chamadas, e um contador criado com `TTL` nunca existe sem a sua expiração:
exatamente o comportamento de um rate limiter de janela fixa. Um contador que já existe mantém a
sua expiração, inclusive a de não ter nenhuma:

```php
$hits = $Cache->increment('hits:home');            // 1, 2, 3, ...
$left = $Cache->increment("quota:$ip", TTL: 60);    // window opens on first call
$owed = $Cache->decrement("credits:$id", TTL: 86400);
$secs = $Cache->remain("quota:$ip");                // seconds left (-1 = no expiry, -2 = missing)
```

`decrement()` recebe o mesmo `TTL` e o aplica da mesma forma. Omitir o `TTL` aplica o padrão
configurado no cache, como em toda outra escrita — um contador criado num cache configurado
com `TTL: 0` portanto nunca expira, então passe um `TTL` explícito quando a janela precisa
fechar.

`remain()` informa o tempo de vida restante seguindo a semântica do Redis: `-2` quando a chave
está ausente ou expirada, `-1` quando existe sem expiração, caso contrário os segundos
restantes.

## Tags e invalidação

Agrupe chaves com tags e descarte o grupo inteiro em uma chamada:

```php
$Cache->store('post:1', $a, tags: ['posts']);
$Cache->store('post:2', $b, tags: ['posts']);

$Cache->invalidate('posts');   // post:1 and post:2 are gone
$Cache->purge();               // evict expired entries; returns the count removed
$Cache->clear();               // empty this cache's namespace
```

## Obter-ou-computar

`resolve()` retorna o valor em cache, computando e gravando em um miss:

```php
$Report = $Cache->resolve('report:daily', TTL: 3600, compute: function () {
   return build_expensive_report();
});
```

A gravação depois do cálculo é incondicional: um `delete()` ou `invalidate()` que chega enquanto
o cálculo roda é sobrescrito com o que ele calculou. Quando uma invalidação precisa vencer um
cálculo em andamento — listas de permissões, por exemplo — prenda cada valor a uma chave de
geração lida antes do cálculo (é o que o `RBAC` faz).

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
   secret: getenv('JWT_VAULT_SECRET') ?: '' // same secret (>= 32 bytes) on every host
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
> entre hosts compondo várias chaves do Vault sob `lock()`. `JWT\Tokens` não precisa de bloqueio
> entre hosts: num store linearizável com `noeviction` (veja o manual de Authentication), as rotações
> dele continuam seguras entre hosts pela ordem das gravações em volta do `take()` atômico.

## Configuração

Passe um array (ou um `Cache\Config` pronto) ao construtor:

| Chave | Padrão | Aplica a | Significado |
|---|---|---|---|
| `driver` | `file` | todos | Driver ativo |
| `prefix` | `''` | todos | Namespace prefixado em toda chave |
| `TTL` | `0` | todos | TTL padrão (segundos; `0` = para sempre) |
| `path` | o diretório de cache próprio do processo — `…/storage/cache`, `…/storage/cache-<uid>` ou um diretório temporário privado (veja `Config::locate()`) | file | Diretório base |
| `segment` | `0` | shared | Chave System V (`0` deriva uma) |
| `size` | `16 MiB` | shared | Tamanho do segmento em bytes |
| `host` / `port` | `127.0.0.1` / `6379` | redis | Endpoint do servidor |
| `password` / `database` | `''` / `0` | redis | AUTH / SELECT |
| `timeout` | `5.0` | redis | Segundos de conexão/leitura |
| `secure` | `false` | redis | Conexão TLS |
| `classes` | `[]` | file, redis, shared, apcu | Classes que o cache pode reconstruir (veja [Segurança](#segurança)) |
| `clock` | `Clock` do sistema | file, shared, memory | O [`Clock`](/manual/ABI/Clock/overview/) de onde os TTLs são lidos (segundos inteiros) — passe `Fake\Clock` nos testes. APCu e Redis expiram as entradas no relógio do próprio servidor, então a opção não move os TTLs deles. Uma `Closure(): int` ainda funciona, mas está depreciada desde a 1.1.0 (removida na 2.0.0) |

Os nomes das opções são os nomes das propriedades que elas preenchem, e só esses nomes são
aceitos: uma chave desconhecida — `ttl` no lugar de `TTL`, um erro de digitação, uma opção de
outro subsistema — lança `InvalidArgumentException` em vez de cair em silêncio no padrão. Um
`TTL` que não seja um número não-negativo é recusado pelo mesmo motivo (`'1h'` viraria um
segundo).

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
// Or use one common Redis backend for a multi-host fleet:
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

O Bootgly chega ao Redis de três formas, e o driver do Cache acima é uma delas:

| | Driver `redis` do Cache | Fachada KV | Driver `redis` das Filas |
|---|---|---|---|
| Classe | `Bootgly\ABI\Resources\Cache` | `Bootgly\ADI\Databases\KV` | `Bootgly\ACI\Queues` |
| O que faz | Guarda valores PHP com TTLs, tags e contadores atômicos | Envia os comandos Redis que você escreve, em pipeline | Roda jobs em segundo plano, com retentativas, atrasos e um dead-letter store |
| Como espera | Bloqueia o processo a cada chamada | O driver dela só bloqueia para resolver um nome de host, e o `await()` dela até a resposta; numa rota, o `$Response->KV` estaciona a requisição em vez disso | Bloqueia o processo do worker |
| Chaves de conexão | Próprias: porta `6379`, `timeout` `5.0`, `secure` `true` ou `false` | As chaves do banco: porta `5432`, `timeout` `30.0`, `secure.mode` `'prefer'` por padrão | Próprias: porta `6379`, `timeout` `5.0`, `secure` `true` ou `false` |

Numa rota `HTTP_Server_CLI`, chegue ao Redis pelo resource de resposta da fachada KV:
[registre o resource `KV`](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/overview/#registrar-o-resource-kv)
e use o `$Response->KV` dentro de `$Response->defer()` — `fetch()` para um comando, `command()` e
`drain()` para fazer pipeline de vários. Ele estaciona o Fiber da resposta na prontidão (readiness)
da conexão até o Redis responder (veja
[Aguardar trabalho key-value](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/overview/#aguardar-trabalho-key-value)).
O `await()` da própria fachada fica em loop no `stream_select()` e nunca suspende o Fiber que o
chama — dentro de `defer()` também, onde trava todas as requisições do worker —, então chame-o
diretamente só em scripts CLI, comandos de console e workers de fila.

A fachada em si — abri-la, comandos e respostas, pipelining, prazos e cancelamento, o escopo de
config `kv` — está documentada em **[Banco KV](/manual/ADI/Databases/KV/overview/)**, e o driver
dela — autenticação, seleção do banco, TLS e quando o `prefer` cai para plaintext — em
**[Driver Redis](/manual/ADI/Databases/KV/Drivers/Redis/overview/)**. As chaves de conexão dela são
as do banco, com os padrões de um PostgreSQL local, então um array do KV sempre define `driver` e
`port`, e declara um Redis plaintext com `'secure' => ['mode' => 'disable']`: o `prefer` padrão abre
toda conexão com um handshake TLS que um Redis plaintext nunca responde.

## Segurança

O store do cache é uma **fronteira de confiança**: só a sua aplicação deveria conseguir gravar
em `storage/cache/`, no segmento SysV, no pool do APCu ou na instância Redis — proteja todos
com permissões de filesystem e de rede. Como defesa em profundidade, os drivers `file` e
`redis` entregam todo registro gravado a uma **allow-list `allowed_classes` fail-closed** antes
de reconstruir qualquer coisa, então um registro adulterado nunca executa um gadget de object
injection (`__wakeup`/`__destruct`) enquanto está sendo lido. Rejeitar o valor depois não é
defesa — a essa altura o gadget já rodou. `shared` e `apcu` decodificam sob a mesma lista, mas
só *depois* de a extensão do PHP ter reconstruído o registro — veja a ressalva abaixo.

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

`file` e `redis` aplicam a lista **antes** de qualquer reconstrução: protegem uma chamada a
`unserialize()` diretamente. `shared` e `apcu` guardam os registros do Bootgly como strings
opacas e as decodificam em PHP sob a mesma allow-list — mas `shm_get_var()` e `apcu_fetch()`
não aceitam opção nenhuma e reconstroem o que quer que o store guarde **antes** de qualquer
código do driver rodar. Nesses dois drivers a lista barra, portanto, um *registro* adulterado,
não um *objeto* plantado: um processo que consiga gravar no segmento SysV ou no pool do APCu
faz o leitor disparar um `__wakeup`/`__destruct` à escolha dele. É uma limitação conhecida das
duas extensões, não algo que o driver consiga recusar; a única contenção é a própria fronteira
— as permissões `0600` do segmento e quem consegue executar no pool do APCu — e é por isso que
o handler de Session usa `file` por padrão. O `memory` não precisa de lista: guarda valores
vivos no heap do processo e nunca serializa.

Como `shared` e `apcu` agora gravam strings opacas, as escritas do *próprio* Bootgly também
nunca carregam um grafo de objetos. O primeiro processo que anexa um segmento escrito por um
Bootgly anterior descarta o segmento, então um deploy zera contadores de rate limit e derruba
sessões compartilhadas exatamente uma vez, e as leituras do `shared` custam cerca de 9-13% a
mais.

> [!NOTE]
> Trate o segmento SysV e o store do APCu como qualquer outro recurso compartilhado: mantenha
> `permissions` em `0600`, não abra o segmento para o grupo, e lembre que a memória do APCu é
> compartilhada por toda aplicação no mesmo pool PHP. Uma aplicação que não pode compartilhar
> identidade de cache com vizinhas ainda deve preferir `file` ou `redis` — assim como qualquer
> host em que código que você não controla roda como o mesmo usuário, já que esse usuário
> consegue gravar nos dois stores.

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
  com sharding por hash (temp + rename atômico por `File->replace()`, sem sincronizar com o
  disco — um registro pode ser refeito —, `flock` para contadores); Shared usa um segmento
  System V + semáforo com um índice de chaves vivas para `clear`/`purge`; Redis mapeia o
  contrato para `SET`/`GET`/`INCRBY`/`EXPIRE`/`TTL`/`SADD`/`SMEMBERS`/`SCAN`. Um contador com
  `TTL` e `swap`/`evict`/`renew` rodam como um script `EVAL` cada, e o Redis confere cada
  comando dentro de um script contra a ACL também: contadores precisam de `EVAL` mais `SET`,
  `INCRBY` e `GET` (por exemplo `+eval +set +incrby +get`, ou `+@scripting +@string`); um
  contador sem `TTL` é um `INCRBY` simples. Quando o Redis recusa um increment — um valor que
  não é contador, um `TTL` que ele não consegue guardar, um comando que a ACL nega — o driver
  lança exceção nos dois transportes em vez de responder `0`. O driver agrupa
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

```php
Bootgly\ABI\Resources\Cache\Config::locate (null|string $storage = null): string
```

Resolve o diretório de cache próprio deste processo — o `path` padrão do driver File e o
diretório em que ficam os templates compilados. Um diretório só é usado quando é um diretório
comum do usuário atual em que ninguém mais pode escrever, sob ancestrais que só o root ou esse
usuário podem alterar; um ausente é criado só para o dono (`0700`) dentro de um pai próprio. Na
ordem: `storage/cache`, `storage/cache-<uid>` (o que uma inicialização como root entrega aos
workers rebaixados) e, por fim, um `bootgly-<uid>/<app>` privado (um por raiz de storage) no
diretório temporário do sistema, ou em `/tmp` quando aquele não é confiável (uma árvore de
storage em que o processo não pode confiar: o `storage/` de outro usuário ou gravável pelo grupo,
um bind mount de um usuário do host). A raiz de storage é verificada como foi escrita, antes de
ser resolvida: um componente no caminho que pertence a outra pessoa, ou um diretório em que
outros podem escrever sem o sticky bit, mantém o processo fora dessa árvore. `$storage` é, por
padrão, a raiz de storage carregada, localizada uma vez por usuário: um local na árvore de
storage é mantido até `forget()` — sob um diretório compartilhado com sticky bit
(`/tmp/app/storage`), só enquanto a entrada logo abaixo dele continua o mesmo diretório do mesmo
dono —, um temporário é provado de novo a cada chamada. Um `$storage` relativo é tomado do
diretório de trabalho, e `/` mantém o seu próprio `/cache`; um componente dele que não existe — no
caminho escrito ou para onde um dos seus links leva — também mantém o processo fora dessa árvore.
O local é por processo e mantido enquanto ele atende: um processo só se muda quando encontra a sua
árvore de cache sumida ou não confiável — uma compilação de template depois que o seu diretório
`templates/` sumiu, uma escrita do File depois que o diretório de cache sumiu — e os outros workers
mantêm a árvore antiga até lá. Reinicie os workers depois de mudar as permissões de `storage/`. Lança
`RuntimeException`, nomeando os diretórios tentados, quando nem um diretório temporário é
confiável.

```php
Bootgly\ABI\Resources\Cache\Config::forget (): void
```

Descarta o diretório de cache localizado do usuário atual, para que o próximo `locate()` o
resolva de novo — para o código que encontrou o diretório sumido (um cache apagado à mão enquanto
o servidor atende). O cache de templates o chama quando a sua árvore sumiu e não pode ser refeita, ou agora pode ser
alterada por outro usuário; o driver File o chama na sua próxima escrita quando o diretório sumiu
(as leituras erram até lá).

```php
Bootgly\ABI\Resources\Cache\Config->located: bool
```

Se o `path` deste `Config` é o padrão localizado (nenhum `path` informado) em vez de um informado —
somente leitura.

```php
Bootgly\ABI\Resources\Cache\Config::trust (string $directory, int $EUID, bool $sticky = false): bool
```

Se o usuário `$EUID` pode confiar em `$directory` — a regra que `locate()` aplica a cada
candidato, e o cache de templates ao seu subdiretório `templates/`: um diretório comum (não um
link) desse usuário em que o grupo e os outros não podem escrever, sob ancestrais que só o root ou
esse usuário podem alterar (graváveis por grupo ou por todos apenas com o sticky bit). Todo
ancestral é verificado primeiro; depois ele **cria** um diretório ausente só para o dono (`0700`)
quando o pai é desse usuário — ou, com `$sticky` (o que `locate()` passa para o diretório
temporário do sistema), um pai do root com sticky bit — e não cria nada nos outros casos.

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
- **[Banco KV](/manual/ADI/Databases/KV/overview/)** - envie comandos Redis pelo pool assíncrono do DBAL.
