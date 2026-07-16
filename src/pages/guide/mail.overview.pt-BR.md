# Mail

O Bootgly traz um cliente SMTP nativo e sem dependências em `Bootgly\ACI\Mail`. Ele fala
RFC 5321 diretamente sobre PHP streams — TLS implícito ou STARTTLS via `ext-openssl`, AUTH
PLAIN / LOGIN / XOAUTH2, timeouts por fase e uma taxonomia tipada de falhas — sem nenhum
pacote do Composer envolvido.

> [!NOTE]
> Componha com o builder `Mail\Message` (corpos alternativos text/HTML, attachments,
> imagens inline, HTML baseado em template) — ou passe uma **string RFC 5322 raw** com
> envelope explícito. Entregue de forma síncrona ou enfileire o envio para um worker em
> background via `WPI\Services\Mail::dispatch()`. Tudo isso já existe hoje.

## Envie um e-mail

```php
use Bootgly\ACI\Mail;
use Bootgly\ACI\Mail\Message;

$Mail = new Mail([
   'host' => 'smtp.example.com',
   'port' => 587,
   'secure' => 'starttls',
   'username' => 'no-reply@example.com',
   'password' => getenv('MAIL_PASSWORD')
]);

$Message = new Message();
$Message->from = 'Bootgly <no-reply@example.com>';
$Message->to = ['user@example.net', 'Ana <ana@example.net>'];
$Message->bcc = 'audit@example.com';       // só no envelope — nunca renderizado
$Message->subject = 'Bem-vindo! 🎉';       // não-ASCII → RFC 2047 automático
$Message->text = 'Versão em texto puro.';
$Message->html = '<p>Versão <strong>HTML</strong> rica.</p>';

$Receipt = $Mail->send($Message);          // envelope derivado do Message

echo $Receipt->reply;   // ex.: "2.0.0 OK: queued as 4Fx19a"
```

`send()` conecta de forma lazy (TCP → TLS → EHLO → AUTH) na primeira chamada, executa a
transação `MAIL FROM` / `RCPT TO` / `DATA` e retorna um `Receipt` — a evidência de aceite
do servidor. Toda falha lança exceção; você nunca recebe um `false` silencioso.

O que o cliente faz por você em todo envio:

- **Normalização de EOL + dot-stuffing** — o data raw pode usar `\n`, `\r\n` ou uma mistura;
  tudo é normalizado para CRLF e pontos no início de linha são escapados conforme a
  RFC 5321 §4.5.2.
- **Guarda contra command injection** — CR/LF/NUL em qualquer valor de envelope é rejeitado
  localmente.
- **Pre-flight de SIZE** — um payload maior que o `SIZE` anunciado pelo servidor falha
  localmente (código 552) antes de qualquer byte da transação ir ao fio.
- **Destinatários all-or-nothing** — se qualquer `RCPT TO` for recusado, a transação é
  abortada (`RSET`) e a exceção é lançada *antes* do `DATA`; nunca há envio parcial da
  audiência.

> [!IMPORTANT]
> Com um `Message`, os dois corpos vão como `multipart/alternative` e o envelope é derivado
> automaticamente: `from` → sender, `to`+`cc`+`bcc` → recipients (deduplicados). O `bcc`
> chega só ao envelope — jamais aparece na mensagem renderizada.

### Forma RFC 5322 raw

A forma com envelope explícito continua funcionando — você compõe headers e corpo:

```php
$Receipt = $Mail->send(
   sender: 'no-reply@example.com',      // endereços de envelope: user@host puro
   recipients: ['user@example.net'],
   data: $rfc5322
);
```

Aqui `sender`/`recipients` governam o roteamento SMTP enquanto `From:`/`To:`/`Subject:`
vivem nos headers do `data` raw. Um `sender` vazio (`''`) envia o null reverse-path `<>`
usado por mensagens de bounce.

> [!WARNING]
> Payloads raw precisam já ser **7-bit safe**. A transação falha fechada — localmente,
> antes do `MAIL` — quando o payload carrega bytes 8-bit e o servidor não anuncia
> `8BITMIME`, ou quando envelope/headers carregam não-ASCII e ele não anuncia `SMTPUTF8`.
> Um render de `Message` é sempre ASCII 7-bit (headers RFC 2047, corpos quoted-printable
> ou base64) e nunca esbarra nessas guardas.

## Anexe arquivos

```php
use Bootgly\ABI\IO\FS\File;

$Message->attach(new File($path));                                        // nome + tipo MIME detectados
$Message->attach($bytes, name: 'report.pdf', type: 'application/pdf');   // bytes raw
```

`attach()` retorna o `Message` para encadear. Uma origem `File` detecta nome (basename) e
tipo MIME; bytes raw exigem `name` e caem em `application/octet-stream`. Attachments vão
em base64 dentro de `multipart/mixed`.

## Embuta imagens inline

```php
$cid = $Message->embed(new File('logo.png'));      // retorna "cid:…"
$Message->html = "<p>Olá!</p><img src=\"{$cid}\">";
```

`embed()` adiciona uma parte inline (`multipart/related`) com `Content-ID` e retorna a URI
`cid:` para usar no corpo HTML. Passe `cid:` explícito para um id estável entre renders.
O aninhamento completo — `mixed { related { alternative { text, html }, embeds… },
attachments… }` — colapsa automaticamente: cada nível só existe quando tem partes.

## Use templates no corpo

O corpo HTML pode vir de um template nomeado renderizado pelo
[engine de templates da ABI](/guide/templates/overview/) — mesmas directives, cache e
herança das views web:

```php
use Bootgly\ACI\Mail\Message;

Message::$path = BOOTGLY_PROJECT->path . 'mails/';   // uma vez, no boot

$Message = new Message();
$Message->from = 'no-reply@example.com';
$Message->to = 'user@example.net';
$Message->subject = 'Bem-vinda!';
$Message->text = 'Bem-vinda, Ana!';        // alternativa em texto puro (manual)
$Message->template = 'welcome';            // mails/welcome.template.php
$Message->data = ['name' => 'Ana'];
```

No `render()` (ou `send()`) a saída do template vira o corpo `html` — compondo com `text`,
attachments e embeds exatamente como um HTML escrito à mão. Nomes de template ficam
enjaulados dentro de `Message::$path` (`''` cai no `Template::$path` atual do engine), e o
layout default da web nunca envolve um e-mail — use um `@extends` explícito no template de
mail para um layout de e-mail compartilhado.

## Renders determinísticos

`id` (Message-ID), `date` e `boundary` são gerados no primeiro `render()` e persistidos de
volta nas propriedades — renderizar é idempotente. Defina-os explicitamente para saída
byte-exata (snapshots, auditoria):

```php
$Message->id = 'token@example.com';
$Message->date = 'Mon, 06 Jul 2026 20:00:00 +0000';
$Message->boundary = 'seed';
```

A saída renderizada é sempre ASCII 7-bit puro: headers não-ASCII viram encoded-words
RFC 2047, corpos de texto não-ASCII viram quoted-printable e partes binárias viram base64
com wrap — independente do que o servidor anuncia.

## Enfileire a entrega

SMTP é lento para um request handler. `Bootgly\WPI\Services\Mail` é o serviço de mail da
plataforma web: faça o boot uma vez, e `dispatch()` só enfileira a mensagem pelo messenger
compartilhado do [`WPI\Queues`](/guide/queues/overview/) (uma escrita local rápida ou um
round-trip no Redis) — a entrega SMTP roda no worker de fila:

```php
use Bootgly\WPI\Queues;
use Bootgly\WPI\Services\Mail;

// uma vez, no boot (servidor HTTP E bootstrap do worker de fila)
Queues::boot(['driver' => 'redis', 'host' => '127.0.0.1']);   // o store de filas da plataforma
Mail::boot(['host' => 'smtp.example.com', 'secure' => 'starttls', 'username' => '…', 'password' => '…']);

// em um route handler
Mail::dispatch($Message);            // → fila `mail`; retorna o Job
Mail::send($Message);                // alternativa síncrona, mesmo mailer compartilhado
```

Rode o consumidor exatamente como qualquer outra fila:

```sh :toolbar="true";
bootgly queue run mail
```

O handler `WPI\Services\Mail\Courier` (incluído no framework) reconstrói a mensagem no worker
(`Message::import()` do payload do Job) e a envia pelo mailer compartilhado. Uma falha de
entrega propaga para o Worker da fila, que **faz retry com o backoff configurado**
(config de fila `attempts`, `base`, `backoff`) e enterra o job como dead-letter quando as
tentativas se esgotam — veja [Queues](/guide/queues/overview/).

> [!IMPORTANT]
> O processo do worker também precisa chamar `Queues::boot()` e `Mail::boot()` (o Job
> carrega a mensagem, nunca as credenciais SMTP). Tudo que uma mensagem enfileirada
> carrega — `template` + `data` incluídos — precisa ser serializável; o template em si é
> renderizado no worker.

## Escolha o modo TLS

```php
'secure' => 'starttls',   // padrão — conexão plaintext, upgrade via STARTTLS (porta 587)
'secure' => 'tls',        // TLS implícito desde o primeiro byte (SMTPS, porta 465)
'secure' => 'none',       // plaintext (apenas relays locais)
```

A verificação de certificado vem **ligada por padrão** (`'verify' => true`) contra o CA
bundle do sistema; aponte `'cafile'` para um bundle próprio ou `'peer'` para o nome esperado
do certificado quando diferirem de `host`. Não existe downgrade silencioso: sob `starttls`,
um servidor que não anuncia ou recusa STARTTLS lança `CryptoException` — o cliente jamais
continua em plaintext. Um valor desconhecido de `secure` lança imediatamente.

## Autentique

As credenciais selecionam o mecanismo automaticamente:

```php
// PLAIN (ou LOGIN, conforme o servidor anunciar):
'username' => 'no-reply@example.com',
'password' => getenv('MAIL_PASSWORD'),

// XOAUTH2 (Gmail/Microsoft — um token não vazio o seleciona):
'username' => 'no-reply@example.com',
'token' => $bearerToken,   // obter/renovar o token OAuth fica por sua conta
```

Sem credenciais configuradas, nenhum AUTH é tentado. Com credenciais sobre uma sessão
**não criptografada** (`'secure' => 'none'`), o cliente recusa localmente — antes de
qualquer byte de credencial tocar o fio — a menos que você opte explicitamente com
`'insecure' => true`.

## Trate falhas e retries

Tudo que o cliente lança implementa `Bootgly\ACI\Mail\Exceptioning`, então um único `catch`
cobre o subsistema inteiro. As duas exceções guiadas por reply mapeiam direto para a
política de retry:

```php
use Bootgly\ACI\Mail\Exceptions\PermanentException;
use Bootgly\ACI\Mail\Exceptions\TransientException;

try {
   $Receipt = $Mail->send($sender, $recipients, $data);
}
catch (TransientException $e) {
   // 4xx — recusa temporária do servidor: tente de novo depois (com backoff)
   retry($e->getCode(), $e->status);   // ex.: 450, '4.2.0'
}
catch (PermanentException $e) {
   // 5xx — repetir o mesmo envio não vai funcionar
   giveUp($e->getCode(), $e->status);  // ex.: 550, '5.1.1'
}
```

| Exceção | Lançada para |
|---|---|
| `TransientException` | qualquer reply 4xx (421 ocupado, 450 mailbox busy, …) — retryable; carrega `$status` |
| `PermanentException` | qualquer reply 5xx + pre-flights locais com semântica 5xx (SIZE, SMTPUTF8) — carrega `$status` |
| `AuthenticationException` | AUTH rejeitado (535), mecanismo não anunciado, ou AUTH plaintext sem opt-in |
| `CryptoException` | falha de negociação/verificação TLS; STARTTLS ausente/recusado sob `starttls` |
| `ConnectionException` | recusa de conexão, timeout de reply, EOF inesperado |
| `ProtocolException` | o servidor violou a gramática SMTP |

No sucesso, o value object `Receipt` carrega a evidência de entrega para os seus logs:
`code` (250), `status` (`2.0.0`), `reply` (o texto do servidor, geralmente com um queue id),
`recipients` (envelope aceito) e `size` (bytes transmitidos).

## Reuse a conexão

A sessão permanece aberta entre envios — ideal para um worker drenando uma fila de e-mails:

```php
$Mail->connect();                              // pre-flight opcional (TCP+TLS+EHLO+AUTH)

foreach ($outbox as $mail) {
   $Mail->send($mail->sender, $mail->recipients, $mail->data);
}

$Mail->disconnect();                           // QUIT best-effort (também roda na destruição)
```

Uma transação recusada (`Transient`/`PermanentException`) é abortada com `RSET` e a sessão
**continua conectada e reutilizável** — apenas falhas de transporte a derrubam. `connect()`
é idempotente; uma chamada no boot serve de verificação de credenciais.

## Trace do fio

Para depuração, conecte um hook no diálogo do fio. Credenciais são redigidas
(`AUTH PLAIN ****`) e o payload do DATA aparece apenas como contagem de bytes — um log de
trace nunca vaza segredos nem corpos:

```php
'trace' => function (string $direction, string $line): void {
   error_log("{$direction} {$line}");   // "> EHLO app.example.com" / "< 250-STARTTLS"
}
```

## Timeouts

Blocking com deadlines absolutos por fase (a RFC 5321 §4.5.3.2 permite valores bem maiores;
os padrões são pragmáticos):

| Chave | Padrão | Cobre |
|---|---|---|
| `timeout` | `10.0` s | conexão TCP (e o handshake do TLS implícito) |
| `wait` | `30.0` s | cada reply de comando: greeting, EHLO, AUTH, MAIL, RCPT, DATA-init |
| `drain` | `120.0` s | o reply final após o terminador `.` (processamento no servidor) |

## Reference

```php
public function __construct (array|Config $config = [])
```

`Bootgly\ACI\Mail` — constrói o serviço a partir de um array de config (chaves abaixo) ou
de um `Mail\Config` pronto. Valores inválidos de `secure` lançam `InvalidArgumentException`.

```php
public function connect (): bool
```

Faz o pre-flight da sessão SMTP — conexão TCP, TLS (implícito ou STARTTLS), descoberta de
capabilities via EHLO e AUTH — sem enviar nada. Idempotente enquanto conectado. Lança uma
exceção `Mail\Exceptioning` em qualquer falha.

```php
public function send (string|Message $sender, array|string $recipients = [], string $data = ''): Receipt
```

Envia um e-mail, conectando de forma lazy quando preciso. Forma de argumento único: um
`Message` — envelope e data derivam dele (passar `$recipients`/`$data` junto lança).
Forma explícita: sender de envelope puro (pode ser `''` — null reverse-path), um
destinatário ou lista, e o `$data` RFC 5322 raw. Retorna o `Receipt`; lança exceção em
toda falha (veja a tabela de exceções).

```php
public function disconnect (): bool
```

Fecha a sessão com um `QUIT` best-effort. Idempotente; também roda na destruição.

### Message

```php
public function attach (File|string $source, string $name = '', string $type = ''): self
```

Adiciona um attachment comum. Um `File` detecta nome/tipo MIME; bytes raw exigem `$name` e
caem em `application/octet-stream`. Retorna o `Message` para encadear.

```php
public function embed (File|string $source, string $name = '', string $type = '', string $cid = ''): string
```

Adiciona uma parte inline (`multipart/related`) com `Content-ID` e retorna a URI `cid:`
para o corpo HTML. `$cid` = `''` gera um aleatório; passe-o para renders estáveis.

```php
public function render (): string
```

Renderiza a mensagem RFC 5322 raw completa — quebras CRLF, 7-bit safe. Quando `template`
está definido, primeiro o renderiza (dentro de `Message::$path`) no corpo `html`. Gera e
persiste `id`/`date`/`boundary` não definidos (idempotente). Lança
`InvalidArgumentException` com `from` ausente, endereços inválidos, header injection ou
nomes de headers reservados, e `TemplateException` em problemas de template.

```php
public function export (): array
```

Exporta a mensagem como um array só de escalares — a forma que o payload de um Job
enfileirado carrega entre processos (attachments e embeds incluídos, conteúdo binário
intacto).

```php
public static function import (array $data): self
```

Reconstrói um `Message` a partir de um array de `export()`. Chaves desconhecidas são
ignoradas e valores malformados caem nos defaults das propriedades.

| Propriedade | Significado |
|---|---|
| `Message::$path` | estático — diretório base dos templates de mail (`''` = `Template::$path` do engine) |
| `from`, `reply` | `a@b` ou `Name <a@b>` (`reply` = Reply-To; `''` omite) |
| `to`, `cc`, `bcc` | um endereço ou lista; `bcc` é só de envelope |
| `subject`, `text`, `html` | conteúdo — não-ASCII é codificado automaticamente |
| `template`, `data` | nome do template de mail + variáveis — renderizados em `html` no render() |
| `id`, `date`, `boundary` | overrides determinísticos (`''` = gerado + persistido) |
| `headers` | headers extras `name => value` (nomes estruturais rejeitados) |
| `$Attachments`, `$Embeds` | listas de `Attachment` somente leitura |
| `$sender`, `$recipients` | envelope derivado somente leitura (virtual) |

### WPI\Services\Mail (serviço web)

```php
public static function boot (array|Config $config = []): Messenger
```

Constrói e guarda o `Mail\Messenger` compartilhado sobre um mailer `ACI\Mail`. Chame no
boot do servidor HTTP **e** no bootstrap do worker de fila (ele também liga o `Courier` ao
mailer compartilhado). O store de filas é configurado à parte — uma vez — via
`WPI\Queues::boot()`.

```php
public static function send (string|Message $sender, array|string $recipients = [], string $data = ''): Receipt
```

Envia de forma síncrona pelo messenger compartilhado (criado lazy no primeiro uso). Mesma
assinatura e comportamento de `ACI\Mail::send()`.

```php
public static function dispatch (Message $Message, string $queue = 'mail'): Job
```

Exporta a mensagem para um Job tratado por `WPI\Services\Mail\Courier` e o enfileira pelo
messenger compartilhado do `WPI\Queues` — a entrega SMTP acontece no worker do
`bootgly queue run`, nunca no event loop HTTP.

### Chaves de config

| Chave | Padrão | Significado |
|---|---|---|
| `host` | `'127.0.0.1'` | host do servidor SMTP |
| `port` | `587` | porta do servidor SMTP (465 típica para `tls`) |
| `secure` | `'starttls'` | `'none'` \| `'tls'` \| `'starttls'` — valores inválidos lançam |
| `verify` | `true` | verificação do certificado TLS (peer + peer name) |
| `cafile` | `''` | caminho do CA bundle (`''` = padrão do sistema) |
| `peer` | `''` | nome esperado do certificado / SNI (`''` = `host`) |
| `username` | `''` | identidade AUTH (`''` desliga o AUTH, salvo `token`) |
| `password` | `''` | segredo do AUTH PLAIN/LOGIN |
| `token` | `''` | bearer token XOAUTH2 (não vazio seleciona XOAUTH2) |
| `domain` | `''` | nome de cliente no EHLO (`''` = hostname da máquina) |
| `timeout` | `10.0` | timeout da conexão TCP, em segundos |
| `wait` | `30.0` | timeout por reply, em segundos |
| `drain` | `120.0` | timeout do reply final do DATA, em segundos |
| `insecure` | `false` | permite AUTH sobre sessão não criptografada (opt-in explícito) |
| `trace` | `null` | hook do fio: `function (string $direction, string $line): void` |

### Value objects e internos

- **Receipt** — `Mail\Receipt`: `$code`, `$status`, `$reply`, `$recipients`, `$size`
  (somente leitura). Retornado por `send()`.
- **Reply** — `Mail\Reply`: `$code`, `$status`, `$lines` (somente leitura); `$text` virtual.
  A forma parseada de cada reply do servidor (também exposta pelo hook de trace).
- **Exceções** — `Mail\Exceptioning` (interface catch-all) e as seis classes concretas em
  `Mail\Exceptions\*` (tabela acima); `Transient`/`PermanentException` expõem o enhanced
  status via `$status`.
- **Unidades do Message** — `Message\Address` (value object `email`+`name` parseado),
  `Message\Attachment` (name/type/contents/disposition/cid) e `Message\Encoder`
  (encoded-words RFC 2047, quoted-printable, base64 com wrap, folding de headers).
- **SMTP_Client** — `Mail\SMTP_Client`: o transporte blocking por trás da facade, com as
  unidades de protocolo `SMTP_Client\Decoder` (parser incremental de replies), `Encoder`
  (escrita de comandos + dot-stuffing), `Extensions` (capabilities do EHLO) e `Mechanisms`
  (blobs de AUTH).
- **Unidades web** — `WPI\Services\Mail` (o serviço de mail da plataforma),
  `WPI\Services\Mail\Messenger` (o adapter do mailer compartilhado, despachando pelo
  `WPI\Queues`) e `WPI\Services\Mail\Courier` (o `Handler` de fila que entrega mensagens
  exportadas no worker).
- **Camadas** — `ACI\Mail` não depende de nada acima da ABI: PHP streams puros para o
  socket, `ext-openssl` para TLS (templates vêm do engine da ABI). Comandos de console,
  queue workers e handlers web podem usá-lo igualmente; a facade de fila vive na WPI.

## Próximas referências

- **[Queues](/guide/queues/overview/)** — o retry/backoff, os drivers e o worker por trás
  de `Mail::dispatch()` e do handler `Courier`.
- **[Templates](/guide/templates/overview/)** — o engine da ABI por trás de
  `Message->template` (directives, herança, cache de compilação).
