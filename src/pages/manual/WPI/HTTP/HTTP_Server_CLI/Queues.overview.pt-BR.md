# Filas

O HTTP Server CLI roda sobre um event loop `stream_select` não-bloqueante, então um handler de
requisição nunca pode fazer trabalho lento e bloqueante inline — isso travaria todas as outras
conexões daquele worker. A fila é como você descarrega esse trabalho: um handler **enfileira um
job e retorna na hora**, enquanto um processo worker separado `bootgly queue run` faz o trabalho
pesado depois.

```
requisição ──► route handler ──► Queues::dispatch(Handler, payload) ──► resposta (agora)
                                            │
                                   store da fila (File / Redis)
                                            │
                          bootgly queue run ─┴─► Handler->handle($Job)   (outro processo)
```

> [!IMPORTANT]
> De dentro do servidor HTTP, **apenas enfileire** — uma escrita local rápida (File) ou um único
> round-trip no Redis. Nunca rode o loop de consumo bloqueante (`reserve()` / `queue run`) no
> event loop. Esse loop pertence ao processo worker dedicado.

## Configure o messenger no boot do projeto

A facade `Bootgly\WPI\Queues` encapsula o contrato `ACI/Queues`. Boote-a uma vez no closure
`boot` do seu projeto, antes do `start()`, para que todos os workers a compartilhem:

```php
use Bootgly\WPI\Queues;

// dentro do boot do Project:
Queues::boot(['driver' => 'file']);   // ou 'redis' (+ host/port) para workers cross-host
```

## Enfileire a partir de um route handler

`Queues::dispatch()` constrói o job e o enfileira, retornando o `Job` (com seu id) sem bloquear:

```php
use Bootgly\WPI\Queues;

yield $Router->route('/email/:to', function (Request $Request, Response $Response) {
   $Job = Queues::dispatch(SendEmail::class, [
      'to' => $this->Params->to,
   ], 'emails');

   return $Response->JSON->send(['queued' => true, 'job' => $Job->id]);
}, GET);
```

O handler (`SendEmail`) implementa `Bootgly\ACI\Queues\Handler` e roda depois, no worker — não
nesta requisição. O payload precisa ser serializável (escalares/arrays), nunca uma Closure.

## Inspecione uma fila a partir de uma rota

```php
yield $Router->route('/queue', function (Request $Request, Response $Response) {
   $ready = Queues::$Messenger->Queues->fetch('emails')->count();

   return $Response->JSON->send(['queue' => 'emails', 'ready' => $ready]);
}, GET);
```

## Rode o worker

O worker é um processo **separado** do servidor:

```bash
cd <seu-projeto>
bootgly queue run emails        # drena a fila 'emails' até SIGTERM/SIGINT
```

Como o worker não boota o projeto web, ele não consegue autoload das classes de handler do
projeto. Coloque um `queues.php` na raiz do projeto que dê `require` nelas e retorne a config da
fila — `queue run` lê o `queues.php` do diretório atual:

```php
// queues.php
require_once __DIR__ . '/SendEmail.php';   // torna o handler carregável no worker

return ['driver' => 'file'];               // precisa bater com o que o servidor enfileira
```

Rode vários workers (até em hosts diferentes com Redis) para mais throughput — cada job é
reivindicado de forma atômica, então nunca é processado duas vezes.

## Exemplo funcional

Um projeto completo e executável fica em `projects/Demo-Queue-HTTP_Server_CLI/`:
`GET /email/:to` enfileira um job e responde na hora; `bootgly queue run emails` o processa e
acrescenta a prova em `workdata/queue-demo.log`. Veja o `README.md` dele para a execução completa.

## Veja também

- **[Filas](/guide/queues/overview/)** — a API completa de filas, drivers, retry/backoff, eventos e segurança.
- **[Router](/manual/WPI/HTTP/HTTP_Server_CLI/Router/overview/)** — declarando as rotas que enfileiram.
- **[Response](/manual/WPI/HTTP/HTTP_Server_CLI/Response/overview/)** — enviando a resposta imediata.
