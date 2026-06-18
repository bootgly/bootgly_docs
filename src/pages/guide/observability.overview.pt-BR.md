# Observabilidade

O Bootgly traz uma stack de métricas nativa e sem dependências em `Bootgly\ACI\Observability`. Um
registro central `Observability` guarda **instrumentos** (counter, gauge, histogram) e **collectors**
(saúde de processo + runtime). Chamar `gather()` captura tudo em um `Snapshot`, que um **exporter**
converte em bytes (JSON hoje). Duas rotas HTTP — `/health` e `/metrics` — o expõem, e um modelo de
um-arquivo-por-worker mescla as métricas de toda a frota do servidor. Tudo é nativo — sem dependência
Composer, e o coletor vive uma camada abaixo do servidor web (`WPI` alimenta o `ACI`, nunca o
contrário).

## Exponha `/health` e `/metrics`

Os endpoints vêm como um conjunto de rotas no projeto demo. Ative-os adicionando `'Observability'` ao
manifesto do router:

```php
// projects/<seu-projeto>/router/router.index.php
return [
   'Database',
   'Observability',   // ← /health + /metrics
];
```

Suba o servidor e faça o scrape:

```bash
curl -s http://127.0.0.1:8082/health
# {"status":"ok","pid":12345,"uptime_seconds":12.3,"memory_bytes":4194304,"timestamp":...}

# /metrics retorna texto Prometheus por padrão (o padrão de scrape):
curl -s http://127.0.0.1:8082/metrics
# # TYPE http_bytes_read_total counter
# http_bytes_read_total 28320
# # TYPE process_memory_bytes gauge
# process_memory_bytes{pid="12345"} 6291456
# ...

# …ou JSON, quando você pede:
curl -s -H 'Accept: application/json' http://127.0.0.1:8082/metrics
# {"timestamp":...,"metrics":{"process_memory_bytes":{...},"http_bytes_read_total":{...}, ...}}
```

`/health` é uma sonda de liveness barata em JSON (status + pid, uptime e memória deste worker).
`/metrics` é o snapshot completo — saúde de processo & runtime mais qualquer instrumento que você
registrar, mesclado entre os workers — servido como **texto Prometheus por padrão**, ou **JSON**
quando a requisição envia `Accept: application/json`.

> [!NOTE]
> O conjunto de rotas fica em `router/routes/Observability.php`. Ele cria um `Observability` por
> worker (os collectors padrão `Process` + `Runtime` mais contadores HTTP de socket bridgeados),
> grava o snapshot daquele worker a cada scrape e mescla todos os arquivos de worker. Copie-o para
> o seu projeto para assumir a convenção.

## Registre suas próprias métricas

Crie instrumentos e registre-os em um registro. Há três tipos:

```php
use Bootgly\ACI\Observability;
use Bootgly\ACI\Observability\Metrics\Counter;
use Bootgly\ACI\Observability\Metrics\Gauge;
use Bootgly\ACI\Observability\Metrics\Histogram;

$O = new Observability();

$Requests = new Counter(name: 'http_requests_total', help: 'Total de requisições.', labels: ['method' => 'GET']);
$Workers  = new Gauge(name: 'workers_active', help: 'Workers ativos.');
$Latency  = new Histogram(name: 'request_duration_seconds', help: 'Latência das requisições.');

$O->Metrics->push($Requests)->push($Workers)->push($Latency);

$Requests->increment();        // +1 (counters são monotônicos; deltas negativos lançam erro)
$Workers->set(8.0);            // valor absoluto (também increment()/decrement())
$Latency->observe(0.042);      // uma observação nos buckets
```

Um **counter** só sobe (totais). Um **gauge** é um valor que se move nos dois sentidos. Um
**histogram** agrupa observações em buckets — seus buckets padrão são os do Prometheus
(`0.005s … 10s`), substitua com `buckets:`. Instrumentos com o mesmo `name` mas `labels` diferentes
viram séries distintas sob aquele nome.

> [!NOTE]
> Torne o registro acessível de qualquer lugar atribuindo a instância global opcional:
> `Observability::$Instance = $O;`. As rotas e o bridge de métricas então compartilham um registro.

## Colete saúde de processo & runtime

`new Observability()` registra automaticamente dois **collectors**, então um snapshot já traz
auto-saúde de fábrica (cada série é rotulada por `pid`, para que as séries dos workers permaneçam
distintas ao mesclar):

| Collector | Métricas |
|---|---|
| `Process` | `process_memory_bytes`, `process_memory_peak_bytes`, `process_cpu_seconds_total`, `process_uptime_seconds`, `process_open_fds` |
| `Runtime` | `runtime_gc_runs_total`, `runtime_gc_collected_total`, `runtime_included_files`, `runtime_opcache_memory_used_bytes`, `runtime_opcache_hit_rate` |

Eles leem apenas builtins do PHP e `/proc/self` — nunca classes de camadas superiores. Passe
`new Observability(collectors: false)` para um registro puro, sem métricas de saúde.

## Bridge dos contadores existentes do servidor

O servidor web já conta leituras, escritas, bytes e erros de socket (`Connections::$stats`). Exponha-os
como instrumentos **observáveis** — um callback que lê o valor ao vivo no momento do snapshot. É assim
que o `WPI` alimenta o `ACI` sem o coletor jamais importar o servidor:

```php
use Bootgly\ACI\Observability\Metrics\Counter;
use Bootgly\WPI\Interfaces\TCP_Server_CLI\Connections;

Connections::$stats = true;   // habilita os contadores de socket do servidor (lazy, como o comando `stats`)

$O->Metrics
   ->push(new Counter(name: 'http_bytes_read_total',    help: 'Bytes lidos.',     observe: static fn () => Connections::$read))
   ->push(new Counter(name: 'http_bytes_written_total', help: 'Bytes escritos.',  observe: static fn () => Connections::$written));
```

Como os contadores são por processo após o fork, cada worker reporta seus próprios totais — mesclar os
arquivos por-worker os soma em um total da frota. `Gauge` aceita o mesmo callback `observe:`.

## Registre métricas de requisição HTTP

`Telemetry` registra métricas por requisição ouvindo os eventos de ciclo de vida da requisição do
servidor HTTP — uma chamada `boot()` o conecta a um registro:

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Telemetry;

new Telemetry($O)->boot();
```

Ele registra `http_requests_total`, `http_responses_total{class}` (`2xx`, `4xx`, …),
`http_request_duration_seconds` (histograma) e `http_requests_in_flight`.

> [!NOTE]
> Os eventos de requisição do servidor são protegidos por `isSet` no ponto de emissão, então custam
> **nada** até um listener ser registrado — o hot path não é afetado quando a telemetria está
> desligada. Com a telemetria ligada, o registro por requisição é leve em alocação (counters/gauge
> são acumuladores escalares expostos por instrumentos *observáveis*; só o histograma de duração
> registra por requisição). A duração emparelha os eventos Received→Handled e é exata para respostas
> síncronas.

## Exporte um snapshot

`gather()` constrói um `Snapshot`; um exporter o codifica. O exporter JSON emite um documento
`{timestamp, metrics}` (valores float preservados, ex.: `5.0`):

```php
use Bootgly\ACI\Observability\Exporters\JSON;

$Snapshot = $O->gather();
$json = $O->export(new JSON);     // atalho para (new JSON)->export($O->gather())
```

## Agregue entre workers

Um scrape cai em um worker, então cada worker grava seu snapshot no próprio arquivo e o leitor os
mescla. `dump()` grava de forma atômica (temp + rename); `aggregate()` faz glob dos arquivos, pula os
obsoletos (workers mortos) e soma as séries correspondentes:

```php
use Bootgly\ACI\Observability;
use Bootgly\ACI\Observability\Exporters\JSON;

$dir = sys_get_temp_dir() . '/bootgly-observability';

// em cada worker, ao ser scrapeado:
$O->dump(new JSON, "$dir/worker-" . getmypid() . ".json");

// no handler de /metrics:
$Cluster = Observability::aggregate("$dir/worker-*.json", maxAge: 60.0);
echo (new JSON)->export($Cluster);
```

`merge()` soma valores de counter/gauge e adiciona buckets/sum/count de histogram para séries com o
mesmo nome **e** labels; séries com labels diferentes ficam lado a lado.

> [!NOTE]
> Com um worker isso é exato. Para vários workers, a rota do demo também registra um dump periódico
> por-worker (um `Timer`), então cada worker atualiza num intervalo — não só quando é o que recebeu o
> scrape. Arquivos mais antigos que `maxAge` (ex.: workers mortos) são ignorados.

## Faça scrape com o Prometheus

`/metrics` já fala Prometheus — aponte um scraper para ele:

```yaml
# prometheus.yml
scrape_configs:
  - job_name: bootgly
    static_configs:
      - targets: ['127.0.0.1:8082']
```

O exporter `Prometheus` também é usável diretamente — cabeçalhos `# HELP`/`# TYPE`, uma linha por
série, histogramas expandidos em `_bucket`/`_sum`/`_count`:

```php
use Bootgly\ACI\Observability\Exporters\Prometheus;

echo $O->export(new Prometheus);
# # HELP http_requests_total Total requests.
# # TYPE http_requests_total counter
# http_requests_total{method="GET"} 5
```

Passe `new Prometheus(namespace: 'bootgly')` para prefixar todo nome de métrica.

## Faça push com OpenTelemetry (OTLP)

Para pipelines de push, codifique o snapshot como OTLP/HTTP JSON e faça POST para um collector. O
encoder é puro (ACI — counter → `sum`, gauge → `gauge`, histogram → `histogram`):

```php
use Bootgly\ACI\Observability\Exporters\OTLP;

$body = $O->export(new OTLP(service: 'my-service'));
```

O Bootgly traz um script de envio pronto que mescla os arquivos por-worker e faz um POST — rode-o
num intervalo (cron / systemd-timer):

```bash
cd /caminho/para/bootgly
OTEL_EXPORTER_OTLP_ENDPOINT=http://collector:4318 \
OTEL_SERVICE_NAME=my-service \
php scripts/observability-ship.php
# observability-ship: POST http://collector:4318/v1/metrics → HTTP 200
```

O servidor mantém os arquivos por-worker frescos via o `Timer` de dump periódico, então o script
sempre tem dados atuais — sem precisar de scrape.

## Referência

```php
new Observability (bool $collectors = true)
```
O registro. Guarda `Metrics` e `Collectors` públicos; quando `$collectors` é true (padrão) registra
automaticamente os collectors de saúde `Process` + `Runtime`. O estático `$Instance` é um handle
compartilhado opcional.

```php
Observability->gather (): Snapshot
```
Lê todo instrumento e roda todo collector em um único `Snapshot` pontual.

```php
Observability->export (Exporter $Exporter): string
```
Codifica o snapshot atual através de um exporter (atalho para `$Exporter->export($this->gather())`).

```php
Observability->dump (Exporter $Exporter, string $path): bool
```
Faz gather, codifica e grava o snapshot de forma atômica em `$path` (criando o diretório). Usado por
cada worker com um caminho por-PID.

```php
Observability::aggregate (string $pattern, float $maxAge = 0.0): Snapshot
```
Lê e mescla todo snapshot JSON que casa com o glob `$pattern`; quando `$maxAge > 0`, arquivos mais
antigos que isso (em segundos) são ignorados.

```php
new Counter (string $name, string $help = '', array $labels = [], null|Closure $observe = null)
```
Total monotônico. `increment(int|float $by = 1): void` (negativo lança); `read(): array`. Com
`observe:` definido, `read()` puxa o total ao vivo do callback.

```php
new Gauge (string $name, string $help = '', array $labels = [], null|Closure $observe = null)
```
Um valor que se move nos dois sentidos. `set(float): void`, `increment($by = 1)`, `decrement($by = 1)`,
`read(): array`. Com `observe:`, `read()` puxa o valor ao vivo.

```php
new Histogram (string $name, string $help = '', array $labels = [], array $buckets = Histogram::BUCKETS)
```
Agrupa observações em buckets. `observe(float): void`; `read()` retorna buckets cumulativos
`le => count` (mais um total `+Inf`), `sum` e `count`. `Histogram::BUCKETS` é a escada padrão do
Prometheus.

```php
Observability\Collector
```
Fonte abstrata: `collect(): array`. Concretos `Collectors\Process` e `Collectors\Runtime`. A coleção
`Collectors` expõe `push(Collector): self` e `collect(): array`.

```php
Observability\Data\Snapshot
```
DTO: `$timestamp` e `$metrics` públicos (séries agrupadas por nome). `merge(Snapshot): self` funde
outro snapshot (aditivo em nome+labels iguais); o estático `import(array): self` reconstrói um a
partir de um documento decodificado.

```php
Observability\Exporters\JSON
```
Implementa `Observability\Exporter` (`export(Snapshot): string`). Emite um documento JSON
`{timestamp, metrics}` terminado por nova linha, preservando os valores float.

```php
new Observability\Exporters\Prometheus (string $namespace = '')
```
Implementa `Exporter`. Renderiza o texto de exposição Prometheus (v0.0.4): `# HELP`/`# TYPE` + uma
amostra por série; histogramas expandem em `_bucket{le=…}` cumulativo mais `_sum`/`_count`.
`$namespace` prefixa todo nome de métrica.

```php
new Observability\Exporters\OTLP (string $service = 'bootgly', string $scope = 'bootgly.observability')
```
Implementa `Exporter`. Renderiza uma requisição de métricas OTLP/HTTP em JSON (sem protobuf):
counters → `sum` cumulativo monotônico, gauges → `gauge`, histogramas → `histogram` com
`bucketCounts` de-cumulados + `explicitBounds`; campos int64 (`timeUnixNano`, `count`,
`bucketCounts`) são strings. Enviado a um collector por `scripts/observability-ship.php`.

```php
new Bootgly\WPI\Nodes\HTTP_Server_CLI\Telemetry (Observability $Observability)
```
Registra os instrumentos de requisição HTTP no registro; `boot(): void` anexa os listeners de
`Request\Events::Received`/`Handled` que registram `http_requests_total`, `http_responses_total{class}`,
`http_request_duration_seconds` e `http_requests_in_flight`. Desligado até `boot()` (os pontos de
emissão protegidos do servidor não custam nada quando nenhum listener está anexado).

- **Camadas** — `ACI\Observability` depende apenas do ABI e de si mesmo; os `Collectors` leem builtins
  do PHP e `/proc/self`, nunca `ACI\Process` ou qualquer classe `WPI`. O servidor o alimenta através de
  instrumentos observáveis — sem dependência reversa `ACI → WPI`.

## Próximas referências

- **[Logging](/guide/logging/overview/)** — o pipeline `ACI` irmão que compartilha o modelo de pipe/sink.
- **[Eventos](/guide/events/overview/)** — o barramento de eventos do ABI (`Worker::Boot`) usado para configuração por-worker.
- **[Performance](/guide/performance/overview/)** — os padrões de alocação-zero que estes instrumentos seguem.
