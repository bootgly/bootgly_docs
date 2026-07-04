O HTTP Server CLI do Bootgly é um servidor orientado a eventos em PHP puro (workers +
fibers, sem extensão C). Esta página o compara com as alternativas medidas no
[`bootgly_benchmarks`](https://github.com/bootgly/bootgly_benchmarks) em recursos, desempenho e
segurança.

## Recursos

### Modelo de execução

| Framework | Motor | Modelo de concorrência | Dependências do core |
|---|---|---|---|
| **Bootgly** | PHP puro | Workers + fibers, event loop | Nenhuma (core sem dependências) |
| Swoole 6.2.0 | Extensão C | Corrotinas | `ext-swoole` |
| Hyperf | Extensão C (Swoole) | Corrotinas | `ext-swoole` + framework |
| ReactPHP | PHP puro | Event loop assíncrono single-thread | Pacotes ReactPHP |
| AMPHP | PHP puro | Event loop assíncrono com fibers | Pacotes Amp |
| Laravel (Octane) | Extensão C (Swoole) | Workers persistentes / corrotinas | Laravel + Octane + `ext-swoole` |
| Laravel (nginx + PHP-FPM) | Pool de processos FPM | Um processo por requisição | nginx + PHP-FPM |
| Laravel (OpenLiteSpeed + LSCache) | LSAPI + cache de borda | Pool de processos + cache | OpenLiteSpeed |

O Bootgly é o único que alcança essa faixa de throughput em **PHP puro** — sem extensão
compilada e sem runtime de terceiros no core.

### Comparação de recursos

Tudo aqui faz parte do
[core do HTTP Server CLI](https://github.com/bootgly/bootgly/tree/main/Bootgly/WPI/Nodes/HTTP_Server_CLI)
— sem pacote extra.
[Roteamento](https://github.com/bootgly/bootgly/tree/main/Bootgly/WPI/Nodes/HTTP_Server_CLI/Router),
[pipeline de middleware](https://github.com/bootgly/bootgly/tree/main/Bootgly/WPI/Nodes/HTTP_Server_CLI/Router/Middlewares),
sessões, autenticação e os
[response resources JSON / View / Database](https://github.com/bootgly/bootgly/tree/main/Bootgly/WPI/Nodes/HTTP_Server_CLI/Response/Resources)
são integrados ao ciclo de requisição/resposta e usados diretamente (ex.: `$Response->JSON->send(...)`,
`$Response->View->render(...)`, `$Response->Database->...`). A tabela mostra o que cada
alternativa te obriga a montar por conta própria.

_Legenda: ✓ nativo · ➕ pacote oficial/companheiro · ✗ não fornecido_

| Recurso | Bootgly | Swoole | Hyperf | ReactPHP | AMPHP | Laravel |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| Roteador nativo | ✓ | ✗ | ✓ | ➕ | ➕ | ✓ |
| Pipeline de middleware | ✓ | ✗ | ✓ | ➕ | ✓ | ✓ |
| Respostas JSON | ✓ | ➕ | ✓ | ➕ | ➕ | ✓ |
| Renderização de Template / View | ✓ | ✗ | ➕ | ✗ | ✗ | ✓ |
| Acesso a banco assíncrono (não-bloqueante) | ✓ | ✓ | ✓ | ➕ | ➕ | ✗ |
| Sessões | ✓ | ✗ | ✓ | ➕ | ➕ | ✓ |
| Autenticação | ✓ | ✗ | ➕ | ✗ | ✗ | ✓ |
| Autorização | ✓ | ✗ | ➕ | ✗ | ✗ | ✓ |
| Validação de requisição | ✓ | ✗ | ✓ | ✗ | ✗ | ✓ |
| Downloads de arquivo (range / streaming) | ✓ | ✓ | ✓ | ➕ | ➕ | ✓ |
| Dispatch de fila | ✓ | ✗ | ✓ | ➕ | ➕ | ✓ |
| Cliente HTTP | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

Os middlewares de segurança (CORS, CSRF, rate limiting, proxy confiável, secure headers) estão
em **Segurança**; throughput em **Desempenho**.

O Laravel oferece um checklist de recursos parecido, mas roda de forma **síncrona, uma
requisição por processo** (veja Modelo de execução) — cada consulta ao banco bloqueia o worker.
O Bootgly é a única stack aqui que combina um framework completo, com baterias inclusas, a um
**core assíncrono e orientado a eventos em PHP puro** — exatamente o que a diferença em
**Desempenho** reflete (≈ 150× o Laravel + FPM em plaintext).

## Desempenho

> [!NOTE]
> **Metodologia** — 24 processadores lógicos (WSL2), PHP 8.4.22, 514 conexões, 10s por ponto,
> `DB_POOL_MAX=1` para **todos** os frameworks (footprint de banco simétrico). A **contagem de
> workers** de cada servidor (`--server-workers`) foi variada de 1 a 24; os números são o pico
> de req/s na melhor contagem de workers de cada framework. A série do Bootgly foi medida na
> **v0.19.1-beta** (pool persistente de Fibers + hot path do DBAL, 2026-07-04); as séries dos
> oponentes são as execuções publicadas de 2026-06 na mesma máquina e configuração. Reproduza com o
> [caso de benchmark HTTP_Server_CLI](https://github.com/bootgly/bootgly_benchmarks/tree/main/HTTP_Server_CLI),
> com as execuções completas por oponente em [results](https://github.com/bootgly/bootgly_benchmarks/tree/main/HTTP_Server_CLI/results).

Pico de req/s por rota, na melhor contagem de workers de cada framework. Versões: **Bootgly
v0.19.1-beta**, **Swoole 6.2.0** (ext-swoole), **Hyperf v3.2.0-beta.1** (engine Swoole),
**ReactPHP** (react/http v1.11.0), **AMPHP** (amphp/http-server v3.4.6) e
**Laravel v13.16.1 + Octane v2.17.5** (engine Swoole):

| Rota (req/s) | Bootgly v0.19.1-beta | Swoole 6.2.0 | Hyperf v3.2.0-beta.1 | ReactPHP v1.11.0 | AMPHP v3.4.6 | Laravel Octane v2.17.5 |
|---|--:|--:|--:|--:|--:|--:|
| `/plaintext` | 1.030.930 | 964.908 | 358.576 | 267.158 | 99.093 | 11.482 |
| `/json` | 1.037.342 | 979.082 | 347.233 | 269.292 | 99.244 | 11.413 |
| `/db` (consulta única) | 166.746 | 95.718 | 75.883 | 43.190 | 29.008 | 8.094 |
| `/query` (20×) | 24.966 | 17.263 | 15.800 | 924 | 1.890 | 2.326 |
| `/fortunes` | 131.263 | 98.557 | 75.650 | 42.550 | 14.954 | 7.695 |
| `/updates` (20×) | 5.782 | 3.721 | 3.499 | 1.086 | 809 | 321 |

O Bootgly lidera **todas as rotas contra todos os frameworks**. Contra o Swoole — o
concorrente mais próximo — a vantagem vai de +6,0% (`/json`) e +6,8% (`/plaintext`) a +33,2%
(`/fortunes`), +44,6% (`/query`), +55,4% (`/updates`) e **+74,2%** (`/db`). Laravel (Octane)
mostrado; em nginx + PHP-FPM a diferença chega a ≈ 150× em `/plaintext`.

Gráficos da varredura completa (server-workers 1→24, clique para o report completo):

**vs Swoole 6.2.0** — [report](https://github.com/bootgly/bootgly_benchmarks/blob/main/HTTP_Server_CLI/results/swoole/RESULTS-techempower-2026-07-04_002103.md)

![Bootgly vs Swoole — throughput TechEmpower](https://github.com/bootgly/bootgly_benchmarks/raw/main/HTTP_Server_CLI/results/swoole/RESULTS-techempower-2026-07-04_002103.chart.throughput.png)

**vs Hyperf v3.2.0-beta.1** — [report](https://github.com/bootgly/bootgly_benchmarks/blob/main/HTTP_Server_CLI/results/hyperf/RESULTS-techempower-2026-07-04_002106.md)

![Bootgly vs Hyperf — throughput TechEmpower](https://github.com/bootgly/bootgly_benchmarks/raw/main/HTTP_Server_CLI/results/hyperf/RESULTS-techempower-2026-07-04_002106.chart.throughput.png)

**vs ReactPHP v1.11.0** — [report](https://github.com/bootgly/bootgly_benchmarks/blob/main/HTTP_Server_CLI/results/reactphp/RESULTS-techempower-2026-07-04_002108.md)

![Bootgly vs ReactPHP — throughput TechEmpower](https://github.com/bootgly/bootgly_benchmarks/raw/main/HTTP_Server_CLI/results/reactphp/RESULTS-techempower-2026-07-04_002108.chart.throughput.png)

**vs AMPHP v3.4.6** — [report](https://github.com/bootgly/bootgly_benchmarks/blob/main/HTTP_Server_CLI/results/amphp/RESULTS-techempower-2026-07-04_002111.md)

![Bootgly vs AMPHP — throughput TechEmpower](https://github.com/bootgly/bootgly_benchmarks/raw/main/HTTP_Server_CLI/results/amphp/RESULTS-techempower-2026-07-04_002111.chart.throughput.png)

**vs Laravel Octane v2.17.5** — [report](https://github.com/bootgly/bootgly_benchmarks/blob/main/HTTP_Server_CLI/results/laravel-octane/RESULTS-techempower-2026-07-04_002118.md)

![Bootgly vs Laravel Octane — throughput TechEmpower](https://github.com/bootgly/bootgly_benchmarks/raw/main/HTTP_Server_CLI/results/laravel-octane/RESULTS-techempower-2026-07-04_002118.chart.throughput.png)

## Segurança

A camada HTTP entrega hardening **por padrão** (auditoria de segurança HTTP do Bootgly, junho
de 2026), com cada item exercitado pela
[suite de testes de segurança HTTP](https://github.com/bootgly/bootgly/tree/main/Bootgly/WPI/Nodes/HTTP_Server_CLI/tests/Security).
As alternativas avaliadas não publicam uma auditoria comparativa equivalente, então
esta seção documenta a postura nativa do Bootgly em vez de ranquear concorrentes — nessas
stacks a segurança depende em grande parte do framework e da aplicação.

| Área | Padrão nativo do Bootgly |
|---|---|
| Protocolo HTTP | Linha de requisição com LF puro rejeitada (`400`); versão não suportada → `505` |
| Limites de conexão | Teto de concorrência global **e** por IP |
| Confiança no IP do cliente | Peer imutável; `X-Forwarded-*` honrado apenas atrás de proxy confiável opt-in |
| Rate limiting | Janela deslizante, agrupamento IPv6 `/64`, cap global, chave plugável |
| CSRF | Mascaramento de token por resposta (resistente a BREACH) com validação dual-accept |
| Decodificação chunked | Deadline absoluto + cap de tamanho do corpo no decodificador |
| JSONP | `text/javascript` + `X-Content-Type-Options: nosniff`, cap no tamanho do callback |
| CORS | Padrão restritivo (sem fallback curinga), `Vary: Origin` em origens refletidas |
| Cabeçalhos de segurança | CSP, HSTS, `X-Content-Type-Options: nosniff`, `X-Frame-Options`, Referrer-Policy, Permissions-Policy |
| Sessões | Cookies `Secure` + `HttpOnly` controlados pelo framework |
| Cache | ETag / compressão restritos a `2xx`/`3xx`; tratamento de `If-None-Match` (RFC 7232) |
| Views | Whitelist + normalização do caminho de renderização |

> [!NOTE]
> Esses são padrões da camada de servidor embutidos na pilha HTTP do Bootgly. Equivalentes
> existem para a maioria dos frameworks, mas são opt-in ou ficam no código da aplicação, e não
> no core do servidor.
