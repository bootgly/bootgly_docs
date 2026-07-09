# Tratamento de erros

O Bootgly responde a falhas de acordo com o **ambiente de deployment**: em desenvolvimento,
uma exceção não capturada renderiza uma **página de debug** embutida e auto-contida (frames de
stack navegáveis, trechos de código-fonte, argumentos e contexto da requisição — ou um payload
JSON para clientes de API); em produção o cliente recebe uma **página de erro limpa** que
nunca vaza internals, e o throwable é **reportado** — para o canal de log `exceptions`, para
as métricas de Observability e para qualquer reporter que você registrar. Sem nenhum pacote de
terceiros.

> [!NOTE]
> Tudo aqui é ativo por padrão. A única coisa que você escolhe é o ambiente — e, quando não
> definido, o Bootgly **falha com segurança para `production`**.

## Defina o ambiente

A chave é a variável de ambiente `BOOTGLY_ENVIRONMENT`, lida uma vez no boot para a constante
`BOOTGLY_ENVIRONMENT`. Valores reconhecidos: `development`, `staging`, `test`, `production`
(qualquer outro valor cai em `production`; `staging` se comporta como `production`):

```bash
BOOTGLY_ENVIRONMENT=development bootgly project start Demo/HTTP_Server_CLI -f
```

Experimente com o projeto Demo — a rota `/error` lança de propósito:

```bash
curl http://127.0.0.1:8082/error                                  # página de debug (HTML)
curl -H 'Accept: application/json' http://127.0.0.1:8082/error    # payload JSON
```

## A página de debug (development)

Com `BOOTGLY_ENVIRONMENT=development`, uma exceção que escapa de um handler de rota responde a
requisição com status `500` e a página de debug embutida: uma barra lateral de frames (clique
em um frame para inspecioná-lo), um trecho de código-fonte de ±8 linhas com a linha da falha
marcada, previews limitados dos argumentos, os throwables encadeados de `getPrevious()`, e uma
seção de **Contexto** com os dados sanitizados da requisição (os valores dos headers
`authorization` e `cookie` são mascarados). A página é um único documento HTML auto-contido —
CSS/JS inline, sem assets externos.

Clientes de API negociam: quando a requisição prefere `application/json` (via header
`Accept`), a mesma falha responde como JSON:

```json
{
   "error": "RuntimeException",
   "message": "Demo exception: this route always throws.",
   "file": "projects/Demo/HTTP_Server_CLI/router/routes/Errors.php",
   "line": 29,
   "trace": [ { "index": "1", "file": "…", "line": "…", "call": "…" } ]
}
```

## Páginas de erro em produção

Em `production` (e `staging`) nada interno sai do servidor. Uma requisição que falha responde
`500` com, em ordem de preferência:

1. **A página do seu projeto** — crie `views/errors/500.template.php` no projeto e ela é
   renderizada pelo template engine (a mesma convenção serve qualquer status code que o
   framework responda, por exemplo `errors/503.template.php`):

```html
<!-- views/errors/500.template.php -->
<h1>Algo deu errado</h1>
<p>Nosso time foi notificado.</p>
```

2. **A página limpa embutida** — uma página de status mínima e sem dependências (apenas código
   + mensagem de status).

Clientes JSON recebem um payload só de status — `{"error": "Internal Server Error"}` — nunca a
mensagem ou o trace.

> [!IMPORTANT]
> O ambiente `Test` (usado pelo próprio harness E2E do Bootgly) mantém os bodies legados
> byte-exatos, para que especificações de teste wire-exatas continuem estáveis.

## Reporte exceções

Renderização é o que o *cliente* vê; **reporting** é o que *você* vê. Todo throwable que chega
aos handlers do framework é despachado — exatamente uma vez por instância — para os reporters
registrados:

- **Canal de log** — o HTTP Server registra um canal Logger `exceptions` (pulado no ambiente
  Test). Com o file sink do Demo, falhas caem em `storage/logs/exceptions.log` como linhas
  JSON com classe, arquivo, linha, método, URI e peer.
- **Observability** — quando `Observability::$Instance` está configurado (por exemplo por uma
  rota `/metrics`), um contador `exceptions_total` incrementa por throwable reportado.
- **Seu próprio reporter** — faça push de uma closure; ela recebe o throwable e um array de
  contexto. Um reporter que lança é engolido (nunca cascateia para o caminho de erro):

```php
use Bootgly\ABI\Debugging\Data\Throwables;

Throwables::$reporters[] = static function (Throwable $Throwable, array $context): void {
   // ex.: encaminhar para ingestão estilo Sentry, emitir um evento, acionar alguém…
};
```

Para conectar ao event bus, emita de dentro de um reporter (a camada de Debugging em si fica
livre de eventos por design):

```php
use Bootgly\ABI\Events\Emitter;
use Bootgly\ABI\Debugging\Data\Throwables;

Throwables::$reporters[] = static function (Throwable $Throwable, array $context): void {
   Emitter::$Instance->emit(App\Events::Failed, $Throwable, $context);
};
```

## Comportamento na CLI

Throwables não capturados em scripts e comandos de console renderizam o report ANSI (classe,
mensagem, trecho de código com highlight, backtrace) e o processo agora termina com status
**255** — assim cadeias com `&&`, cron jobs e pipelines de CI enxergam a falha (antes da v0.23
o processo saía com `0`). Desligue com `Throwables::$exit = false`.

Erros fatais (out-of-memory, parse errors em includes) passam por fora dos error handlers do
PHP — o Bootgly os sintetiza no shutdown em um report de `ErrorException`, então eles são
renderizados e reportados como todo o resto.

## Referência

```php
const BOOTGLY_ENVIRONMENT;
```

Constante de boot com o nome do ambiente resolvido: `development`, `staging`, `test` ou
`production` (o default fail-safe). Fonte: a variável de ambiente `BOOTGLY_ENVIRONMENT`.

```php
Environments::fetch (string $name): self
```

Mapeia um nome de ambiente para o case do enum `Bootgly\API\Environments`; nomes não
reconhecidos mapeiam para `Environments::Production`.

```php
Throwables::render (Throwable $Throwable, null|int $target = null): string
```

Renderiza o report do throwable como string. Targets: `Debugging::TARGET_CLI` (ANSI) e
`Debugging::TARGET_HTML` (bloco HTML escapado). `null` escolhe pela SAPI (`cli` → CLI, senão
HTML).

```php
Throwables::report (Throwable $Throwable): void
```

Renderiza com o target padrão e faz echo.

```php
Throwables::notify (Throwable $Throwable, array $context = []): void
```

Despacha o throwable para todos os reporters registrados — uma vez por instância de throwable
(deduplicado via `WeakMap`), cada reporter isolado pelo próprio `try/catch`.

```php
Throwables::$reporters
```

`array<int,Closure(Throwable,array<string,mixed>):void>` — o seam de reporters. Faça push de
closures no boot; camadas superiores (ACI Observability, o canal de log do HTTP Server) fazem
push das delas automaticamente.

```php
Throwables::$exit
```

`bool` (padrão `true`) — se um throwable *não capturado* termina o processo com exit status
`255` depois de coletado e reportado.

```php
Throwables::$verbosity
```

`int` (padrão `3`) — detalhe do report: `1` classe+mensagem, `2` + arquivo e trecho de código,
`3` + backtrace.

```php
Page::render (Throwable $Throwable, array $context = []): string
```

Monta o documento auto-contido da página de debug (`Bootgly\ABI\Debugging\Page`). Seções de
`$context` (por exemplo dados da requisição) são renderizadas como tabelas chave/valor. Sem
estado e totalmente escapada.

```php
Catcher::respond (null|Request $Request, Response $Response, null|Throwable $Throwable = null, int $code = 500): Response
```

Respondedor de erro do lado WPI (`Bootgly\WPI\Nodes\HTTP_Server_CLI\Encoders\Catcher`) usado
pelo pipeline de dispatch HTTP: reporta o throwable e retorna a Response de erro adequada ao
ambiente (página de debug / JSON em development; página custom do projeto, página limpa ou
JSON só de status em production; bodies legados em Test). `Catcher::$Environment` é um
override one-shot consumido pela próxima chamada — útil em especificações E2E.

```php
Shutdown::collect (null|array $error = null): bool
```

Coleta o último erro fatal (`E_ERROR`, `E_PARSE`, `E_CORE_ERROR`, `E_COMPILE_ERROR`) de
`error_get_last()` — ou do `$error` injetado, para testes. `Shutdown::debug()` sintetiza o
fatal coletado em um `ErrorException`, reporta e renderiza.
