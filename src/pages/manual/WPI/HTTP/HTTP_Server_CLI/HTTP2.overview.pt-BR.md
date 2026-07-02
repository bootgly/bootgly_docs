# HTTP/2

O HTTP Server CLI do Bootgly fala **HTTP/2** (RFC 9113) nativamente — framing binário,
compressão de headers HPACK (RFC 7541), multiplexação de streams e controle de fluxo,
tudo implementado como componentes Bootgly sem dependências. Sem extensão, sem proxy,
sem pacote de terceiros.

Suas rotas não mudam: o mesmo handler atende conexões HTTP/1.1 e HTTP/2. O protocolo é
negociado por conexão e a multiplexação é resolvida dentro do servidor — o handler
continua vendo um `$Request` e retornando um `$Response`.

Há duas formas de uma conexão virar HTTP/2:

- **h2 sobre TLS (ALPN)** — browsers e clientes HTTP negociam `h2` durante o handshake
  TLS. Habilitado por padrão assim que o servidor é configurado com `secure`.
- **h2c prior knowledge** — HTTP/2 em texto claro: o cliente abre a conexão com o
  preface HTTP/2 (`PRI * HTTP/2.0`). Habilitado por padrão, zero configuração. É o que
  `curl --http2-prior-knowledge`, ferramentas estilo gRPC e load testers usam.

> O caminho de Upgrade do HTTP/1.1 (`Upgrade: h2c` + 101) **não** é implementado — a
> RFC 9113 o deprecou, e nenhum cliente moderno o utiliza.

## Servir HTTP/2 em texto claro (h2c)

Nada para habilitar. Suba o servidor normalmente:

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Events;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response;

$HTTP_Server_CLI = new HTTP_Server_CLI;
$HTTP_Server_CLI->configure(
   host: '0.0.0.0',
   port: 8080,
   workers: 8
);
$HTTP_Server_CLI->on(
   Events::RequestReceived,
   function ($Request, Response $Response): Response {
      return $Response->send("Servido via {$Request->protocol}");
   }
);
$HTTP_Server_CLI->start();
```

Verifique com curl — a mesma rota responde nos dois protocolos:

```bash
# HTTP/2 com prior knowledge (texto claro)
curl -s --http2-prior-knowledge http://127.0.0.1:8080/ -w '\n%{http_version}\n'
# Servido via HTTP/2
# 2

# HTTP/1.1 puro continua funcionando na mesma porta
curl -s http://127.0.0.1:8080/ -w '\n%{http_version}\n'
# Servido via HTTP/1.1
# 1.1
```

A troca não custa nada ao hot path do HTTP/1.1: a sondagem do preface de 24 bytes é uma
única comparação de caractere na primeira leitura da conexão.

## Servir HTTP/2 sobre TLS (ALPN)

Passe um contexto TLS em `secure` — o ALPN com `h2,http/1.1` é anunciado automaticamente:

```php
$HTTP_Server_CLI->configure(
   host: '0.0.0.0',
   port: 8443,
   workers: 8,
   secure: [
      'local_cert' => '/caminho/para/cert.pem',
      'local_pk' => '/caminho/para/key.pem',
   ]
);
```

Browsers e curl negociam `h2` no handshake TLS; clientes que só oferecem `http/1.1`
caem para HTTP/1.1 de forma transparente:

```bash
curl -sk --http2 https://127.0.0.1:8443/ -w '\n%{http_version}\n'
# Servido via HTTP/2
# 2

curl -sk --http1.1 https://127.0.0.1:8443/ -w '\n%{http_version}\n'
# Servido via HTTP/1.1
# 1.1
```

Para servir apenas HTTP/1.x — sem `h2` no anúncio ALPN E sem prior knowledge em texto
claro — desligue explicitamente:

```php
$HTTP_Server_CLI->configure(
   // ...
   enableHTTP2: false
);
```

## Detectar o protocolo no handler

A superfície do Request é idêntica entre protocolos. Dois membros conhecem HTTP/2:

```php
$HTTP_Server_CLI->on(
   Events::RequestReceived,
   function ($Request, Response $Response): Response {
      if ($Request->protocol === 'HTTP/2') {
         // $Request->stream carrega o id do stream HTTP/2 (0 em HTTP/1.x)
         $Response->Header->set('X-Stream', (string) $Request->stream);
      }

      return $Response->send('ok');
   }
);
```

Todo o resto — `$Request->method`, `$Request->URI`, `$Request->queries`, headers,
cookies, sessões, middlewares, o Router — se comporta exatamente como no HTTP/1.1. O
pseudo-header `:authority` é exposto como header `host`, e campos `cookie` duplicados
são unidos conforme a RFC 9113 §8.2.3.

## Proteção embutida

O decoder HTTP/2 aplica os limites da RFC 9113 por conexão, com padrões seguros:

- **128 streams concorrentes** (`MAX_CONCURRENT_STREAMS`) — streams excedentes são
  recusados sem derrubar a conexão.
- **Frames de 16 KB e listas de headers decodificadas de 16 KB** — entradas maiores são
  erro de conexão.
- **Mitigação de rapid-reset** (CVE-2023-44487) — mais de 64 resets de stream numa
  janela de 10 segundos fecha a conexão com `ENHANCE_YOUR_CALM`.
- **Controle de fluxo** nas duas direções — respostas maiores que a janela do cliente
  ficam estacionadas e drenam conforme chega crédito de `WINDOW_UPDATE`; corpos de
  request respeitam o mesmo `requestMaxBodySize` do HTTP/1.1 (413 acima dele).
- Requests malformados (nomes de header em maiúsculas, campos connection-specific,
  `content-length` divergente) são rejeitados por stream com `400`/`RST_STREAM` — um
  stream ruim nunca derruba a conexão.

## Limitações atuais

- **Sem server push** — `PUSH_PROMISE` nunca é enviado (deprecado na prática; o Chrome
  removeu o suporte). Frames `PRIORITY` são aceitos e ignorados (a RFC 9113 deprecou a
  árvore de prioridades).
- **As APIs de streaming de resposta são orientadas a HTTP/1.1**: sobre HTTP/2, os
  ranges de arquivo de `$Response->upload()` são materializados em frames DATA (até
  16 MiB) e `Transfer-Encoding` é removido — chunked framing não existe no HTTP/2.
- **Corpos multipart de request** sobre HTTP/2 são bufferizados em memória (limitados
  por `requestMaxBodySize`) e não são transmitidos para disco — a paridade de streaming
  de `$Request->files` está planejada.
- **WebSockets sobre HTTP/2** (extended CONNECT, RFC 8441) está fora de escopo — o
  upgrade de WebSocket permanece no HTTP/1.1.

---

## Referência

### `HTTP_Server_CLI->configure()`

```php
public function configure (
   string $host, int $port, int $workers,
   null|array $secure = null,
   null|string $user = null, null|string $group = null,
   null|bool $enableHTTP2 = null,
   /* limites de request/conexão ... */
): self
```

`enableHTTP2` é o interruptor único do HTTP/2. `null`/`true` (padrão) serve HTTP/2 nos
dois caminhos: o ALPN anuncia `h2,http/1.1` sempre que `secure` estiver definido, e o
preface de prior knowledge em texto claro é aceito. `false` torna o servidor
HTTP/1.x-only — sem `h2` no ALPN e com a sondagem do preface desligada. Uma chave
`alpn_protocols` custom dentro de `secure` tem precedência sobre o anúncio padrão. O
valor resolvido é exposto em `HTTP_Server_CLI::$enableHTTP2`.

### Estáticos de `Decoders\Decoder_HTTP2`

```php
public static int $streams = 128;
```

`SETTINGS_MAX_CONCURRENT_STREAMS` anunciado e aplicado. Streams abertos além dele são
recusados com `RST_STREAM(REFUSED_STREAM)`.

```php
public static int $list = 16384;
```

`SETTINGS_MAX_HEADER_LIST_SIZE` anunciado e aplicado, em octetos, medido na lista de
headers decodificada (nome + valor + 32 por campo, conforme RFC 7541 §4.1).

```php
public static int $resets = 64;
```

Resets de stream tolerados numa janela de 10 segundos antes de a conexão ser fechada com
`GOAWAY(ENHANCE_YOUR_CALM)` — o orçamento de rapid-reset (CVE-2023-44487).

### Membros do `Request`

```php
public string $protocol;
```

`'HTTP/2'` em streams HTTP/2; `'HTTP/1.1'` / `'HTTP/1.0'` caso contrário.

```php
public int $stream;
```

O id do stream HTTP/2 que carregou este Request; `0` em conexões HTTP/1.x.

### Primitivas de protocolo

Os blocos de construção wire-level vivem em `Bootgly\WPI\Modules\HTTP2` e são
reutilizáveis fora do servidor: `HTTP2` (constantes de frames/flags/settings),
`Frame::pack()`, `Settings` (parse/pack de payloads SETTINGS), `HPACK` (codec RFC 7541
completo com decodificação Huffman) e `Errors` (códigos de erro da RFC 9113 §7).
