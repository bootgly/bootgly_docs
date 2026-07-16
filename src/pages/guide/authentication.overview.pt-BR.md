# Authentication

O Bootgly traz um scaffold completo de autenticação por sessão/cookie:
registro, verificação de e-mail, login/logout com cookie remember-me opcional,
redefinição e troca de senha — construído sobre stores pequenos do core que
você também pode compor manualmente.

O scaffold é o projeto demo exportável **Auth**. A lógica de segurança vive no
framework:

- `Bootgly\API\Security\Users` — store de credenciais (argon2id via
  `Password`, rehash-on-verify, timing uniforme).
- `Bootgly\API\Security\Tokens` — tokens de ação de uso único (selector +
  verifier) para links de verificação e recuperação.
- `Bootgly\API\Security\Tokens\Trust` — tokens rotativos de dispositivo
  confiável (remember-me) com detecção de roubo.
- `Authentication\Session` + `Authentication\Remember` — os guards WPI que
  ligam sessões e o cookie remember às rotas protegidas.

## Gere o projeto Auth

Em um kit Bootgly, importe o projeto Auth pelo wizard — ele aparece no picker
"Import projects from Platforms":

```bash :toolbar="true";
php bootgly project create
```

Ou de forma não interativa:

```bash :toolbar="true";
php bootgly project create Auth --from=Auth --yes
```

Depois inicie:

```bash :toolbar="true";
php bootgly project Auth start
```

Abra `http://localhost:8087`. Uma conta demo verificada vem seedada:
`demo@bootgly.com` / `bootgly-demo`.

Sem SMTP configurado, todo e-mail vira um arquivo em `storage/mails/*.eml` —
abra o arquivo mais novo e copie o link. Zero setup.

## Os fluxos

### Registro → verificação de e-mail

`POST /register` valida a entrada, registra as credenciais e autentica o
usuário com um id de sessão novo:

```php
$user = $this->Users->enroll($email, $password);   // null se o e-mail já existe

$this->notify($user, $email);                      // minta + envia o link

$Request->Session->regenerate();                   // defesa contra fixation
$Request->Session->set('identity', $user);
```

O link de verificação é um token `selector.verifier` de uso único:

```php
$Token = $this->Tokens->mint($user, Purposes::Verification, ttl: 86400);
$link = "{$URL}/verify/" . str_replace('.', '/', $Token->value);
```

`GET /verify/:selector/:verifier` resgata o token exatamente uma vez e marca a
conta:

```php
$user = $this->Tokens->redeem($token, Purposes::Verification);
if ($user !== null) {
   $this->Users->confirm($user);
}
```

Contas não verificadas ainda podem entrar — a página da conta mostra um banner
com botão de reenvio. Ajuste como preferir.

### Login, logout e remember-me

`POST /login` verifica as credenciais com timing uniforme (e-mails
desconhecidos queimam um hash argon2 decoy), regenera o id de sessão e
opcionalmente emite um cookie de dispositivo confiável:

```php
$Identity = $this->Users->verify($email, $password);
if ($Identity === null) {
   // "Invalid credentials." uniforme — nunca revela qual metade errou
}

$Request->Session->regenerate();
$Request->Session->set('identity', $Identity->id);

if (isSet($Request->fields['remember'])) {
   $this->Remember->emit($this->Trust->issue($Identity->id, Remember::$lifetime));
}
```

O valor do cookie remember é `selector.validator`: o selector (série) fica
estável por dispositivo, o validator rotaciona a cada uso bem-sucedido. Um
validator antigo re-apresentado é a assinatura de cookie roubado — o store
revoga **todos** os dispositivos do usuário e o guard limpa o cookie.

O logout derruba a série do dispositivo apresentado, limpa o cookie e destrói
a sessão:

```php
$this->Trust->forget($Request->Cookies->get(Remember::$name));
$this->Remember->forget();
$Request->Session->flush();
$Request->Session->regenerate();
```

### Redefinição de senha

`POST /forgot` responde de forma uniforme, exista o e-mail ou não:

```php
$Identity = $this->Users->fetch($email);
if ($Identity !== null) {
   $Token = $this->Tokens->mint($Identity->id, Purposes::Recovery, ttl: 3600);
   // envia o link — a resposta abaixo nunca varia
}

$this->flash($Request, 'If that e-mail exists, we sent a password reset link.');
```

`GET /reset/:selector/:verifier` espia o token sem consumir
(`Tokens->check()`), então renderizar o formulário não queima o link. O POST
resgata o token e completa o contrato de orquestração:

```php
$user = $this->Tokens->redeem($token, Purposes::Recovery);

$this->Users->rotate($user, $password);   // novo hash argon2id
$this->Tokens->revoke($user);             // links pendentes morrem
$this->Trust->revoke($user);              // todos os dispositivos confiáveis morrem
$this->Users->confirm($user);             // reset prova posse da caixa de e-mail
```

### Troca de senha

`POST /password` exige a senha atual (`Users->check()`), rotaciona o hash,
revoga tokens e dispositivos confiáveis e regenera a sessão sobrevivente — os
outros dispositivos são deslogados.

## Configuração

O escopo de config `auth` vive em `configs/auth/auth.config.php`:

| Env | Default | Significado |
|-----|---------|-------------|
| `APP_URL` | `http://localhost:8087` | Base canônica dos links de e-mail |
| `AUTH_VERIFICATION_TTL` | `86400` | Vida do link de verificação (segundos) |
| `AUTH_RECOVERY_TTL` | `3600` | Vida do link de reset (segundos) |
| `AUTH_REMEMBER_NAME` | `remember` | Nome do cookie remember |
| `AUTH_REMEMBER_TTL` | `2592000` | Vida do cookie remember (segundos) |

<d-block-hint kind="warning">
Os links de e-mail são construídos SOMENTE a partir de `APP_URL` — nunca do
header `Host` da request. Derivar links de reset do Host habilita
envenenamento de link de reset.
</d-block-hint>

Os cookies de sessão e remember saem com `Secure; HttpOnly; SameSite=Lax`
(política do framework — o php.ini não consegue rebaixar). Navegadores tratam
`localhost` como contexto seguro, então o demo funciona em HTTP puro no
localhost.

## Configuração de e-mail

`projects/Auth/Mails.php` escolhe uma de três vias de entrega pelo escopo de
config `mail`:

1. **File sink (default)** — `MAIL_HOST` vazio: as mensagens renderizadas caem
   em `storage/mails/*.eml`.
2. **SMTP síncrono** — defina `MAIL_HOST`, `MAIL_PORT`, `MAIL_SECURE`,
   `MAIL_USERNAME`, `MAIL_PASSWORD`.
3. **Fila** — adicionalmente `MAIL_QUEUE=1`; drene com
   `php bootgly queue run mail`.

Veja o guia de **[Mail](/guide/mail/overview/)** para o client SMTP em si.

## Proteja suas próprias rotas

Componha o guard de sessão com o guard remember — a checagem barata de sessão
vence, e a rotação só roda quando a sessão falha. Visitantes recebem um `303`
real para a página de login:

```php
use Bootgly\API\Security\Tokens\Trust;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authenticating;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authentication;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authentication\Remember;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authentication\Session as SessionGuard;

$Trust = new Trust($Response->Database->Database);
$Auth = new Authentication(
   new Authenticating(new SessionGuard, new Remember($Trust)),
   Fallback: function ($Request, $Response) {
      $Request->Session->set('intended', $Request->URI);

      return $Response->redirect('/login', 303);
   }
);

yield $Router->route('/account', new Action(Accounts::class, 'show'), GET, middlewares: [$Auth]);
```

Um resultado de Fallback que já é redirect (3xx + `Location`) é devolvido
intocado; qualquer outro fallback continua normalizado para `401
Unauthorized`.

Combine os endpoints sensíveis com rate limits por rota — e dê a cada
`RateLimit` uma key com escopo da rota, porque as instâncias compartilham um
namespace de cache:

```php
new RateLimit(limit: 5, window: 60, key: static fn (object $Request): string => "login:{$Request->peer}")
```

## Notas de segurança

- **Session fixation** — `Session->regenerate()` roda no login, no registro,
  no revival do remember e após troca/reset de senha.
- **Enumeração** — falhas de login e o fluxo forgot respondem uniformemente;
  identificadores desconhecidos queimam um hash argon2 decoy para o timing não
  revelar existência de conta.
- **Tokens em repouso** — só o digest sha256 do verifier/validator é
  persistido; o segredo raw existe uma vez, no `Token->value` retornado.
- **Uso único** — o resgate deleta a linha atomicamente
  (`DELETE … WHERE id AND verifier` + gate de affected-rows); resgates
  concorrentes perdem.
- **Detecção de roubo** — uma série remember conhecida com validator errado
  revoga todos os dispositivos do usuário e reporta um incidente `Theft`.
- **CSRF** — todo POST (incluindo logout) carrega o `_token` mascarado do
  stack default do `Web\App`.

## Testes

```bash
# bootgly (core)
AI_AGENT=1 ./bootgly test 21   # API/Security — tokens, trust, users (1.18-1.21)
AI_AGENT=1 ./bootgly test 28   # middlewares WPI — guard Remember, redirect do Fallback (11.2-11.3)

# bootgly-web
AI_AGENT=1 ./bootgly test 5    # E2E do demo Auth — 19 specs no wire real
```

A suíte E2E dirige as rotas reais: registro → link de verificação do sink de
e-mail → logout → login + remember → revival/rotação → replay de roubo →
forgot/reset → negativo de CSRF → rate limit.

## Reference

### `Bootgly\API\Security\Users`

```php
public function __construct (SQLDatabase|Transaction $Database, Password $Password, string $table = 'users', string $key = 'id', string $identifier = 'email', string $secret = 'password', string $verified = 'email_verified_at')
```

Cria o store de credenciais sobre uma conexão SQL do ADI. Nomes de tabela e
colunas são configuráveis; os defaults casam com as migrations do demo Auth.

```php
public function enroll (string $email, #[\SensitiveParameter] string $password): null|string
```

Registra credenciais e retorna o id da nova conta. Retorna `null` em
identificador duplicado (o índice único é o único gate — sem corrida
read-then-write) ou erro de banco.

```php
public function verify (string $email, #[\SensitiveParameter] string $password): null|Identity
```

Verifica credenciais com timing uniforme e rehash-on-verify: hashes legados
migram para a política argon2id atual de forma transparente. Retorna uma
`Identity` com claims `email` e `verified`, ou `null`.

```php
public function check (string $user, #[\SensitiveParameter] string $password): bool
```

Gate de senha atual por id de conta — usado pelo formulário de troca de senha.

```php
public function fetch (string $email): null|Identity
```

Busca uma conta pelo identificador sem credenciais (fluxo de pedido de reset).

```php
public function rotate (string $user, #[\SensitiveParameter] string $password): bool
```

Substitui o hash armazenado. Quem chama DEVE seguir uma rotação bem-sucedida
com `Tokens->revoke()`, `Trust->revoke()` e regeneração de sessão.

```php
public function confirm (string $user): bool
```

Marca o e-mail da conta como verificado (epoch em segundos). Idempotente.

### `Bootgly\API\Security\Tokens`

```php
public function __construct (SQLDatabase|Transaction $Database, string $table = 'tokens')
```

Cria o store de tokens de ação de uso único.

```php
public function mint (string $user, Purposes $Purpose, int $ttl = 3600): Token
```

Minta um token e substitui qualquer token vivo do mesmo usuário + propósito. O
`Token->value` retornado (`selector.verifier`) é a única exposição do segredo
raw. Propósitos: `Purposes::Recovery`, `Purposes::Verification`.

```php
public function redeem (string $token, Purposes $Purpose): null|string
```

Consome um token exatamente uma vez e retorna o id do dono. Verifiers
adulterados nunca consomem a linha; linhas expiradas são purgadas no contato.

```php
public function check (string $token, Purposes $Purpose): bool
```

Valida sem consumir — para renderizar um formulário de reset a partir do link
GET.

```php
public function revoke (string $user, null|Purposes $Purpose = null): int
```

Derruba tokens vivos de um usuário, opcionalmente restrito a um propósito.

```php
public function sweep (): int
```

Derruba tokens expirados.

### `Bootgly\API\Security\Tokens\Trust`

```php
public function __construct (SQLDatabase|Transaction $Database, string $table = 'trusts')
```

Cria o store de tokens de dispositivo confiável (remember-me).

```php
public function issue (string $user, int $ttl = 2592000): Token
```

Inicia uma nova série de dispositivo.

```php
public function rotate (string $token, int $ttl = 2592000): null|Theft|Token
```

Valida e rotaciona o validator (a série fica estável). Uma série conhecida com
validator errado revoga TODOS os dispositivos do usuário e retorna `Theft`.
Uma rotação concorrente que perde a corrida do update atômico retorna `null` —
deliberadamente não `Theft`, para um duplo submit benigno não revogar todas as
sessões.

```php
public function forget (string $token): bool
```

Derruba a série do dispositivo apresentado (logout de um dispositivo). Exige o
validator correspondente, então não serve como oráculo de revogação.

```php
public function revoke (string $user): int
```

Derruba todas as séries de dispositivo de um usuário (logout em todo lugar /
troca de senha).

```php
public function sweep (): int
```

Derruba séries expiradas.

### `Authentication\Remember` (guard WPI)

```php
public function __construct (Trust $Trust, string $key = 'identity', string $realm = 'Protected area')
```

Guard de login persistente. Política estática de cookie (do framework):
`Remember::$name` (`remember`), `$lifetime` (2592000), `$path`, `$domain`,
`$secure` (true), `$httpOnly` (true), `$sameSite` (`Lax`).

```php
public function authenticate (object $Request): bool
```

Revive uma sessão a partir do cookie remember: rotaciona o token de confiança,
regenera o id de sessão, instala a identity e reemite o cookie rotacionado. Em
roubo, limpa o cookie e recusa.

```php
public function emit (Token $Token): void
```

Anexa o `Set-Cookie` remember de um token de dispositivo confiável — os fluxos
de login o chamam após `Trust->issue()`. Um único dono canônico do cookie.

```php
public function forget (): void
```

Anexa um `Set-Cookie` expirado (`Max-Age=0`) — logout e tratamento de roubo.
