# Authentication

O upgrade WebSocket é um `GET` HTTP comum, então os **guards** de autenticação do HTTP Server CLI
funcionam nele sem alteração. Passe os guards para `configure(guards: [...])`; o handshake os executa
antes de enviar `101`, e se **todos** os guards negarem, a conexão é rejeitada com `401` e nunca faz
upgrade. O primeiro guard que passar vence.

## Proteger um handshake com token Bearer

Um guard lê a requisição de upgrade (o header `Authorization`, cookies, …) e retorna `true` para
admitir a conexão. O `Guard::extract()` extrai um token `Bearer` da requisição para você:

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authenticating\Guard;

$TokenGuard = new class extends Guard {
   public function authenticate (object $Request): bool
   {
      if ($this->extract($Request) !== 'secret') {   // Authorization: Bearer secret
         return false;
      }

      $this->expose($Request, 'identity', 'user-42');
      $this->expose($Request, 'claims', ['role' => 'admin']);

      return true;
   }
   public function challenge (object $Response): object
   {
      return $this->announce($Response, $this->format('Bearer', ['realm' => 'WS']));
   }
};

$WS->configure(host: '0.0.0.0', port: 8083, workers: 1, guards: [$TokenGuard]);
```

Um cliente sem token válido recebe `HTTP/1.1 401 Unauthorized` no handshake; um válido recebe
`HTTP/1.1 101 Switching Protocols` e o socket faz upgrade.

## Proteger um handshake com credenciais Basic

O mesmo adaptador de handshake faz o parse de `Authorization: Basic …`, então o guard `Basic`
embutido funciona sem alteração — resolva o usuário/senha para uma identidade (ou `false` para
negar):

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authentication\Basic;

$BasicGuard = new Basic(
   Resolver: function (string $user, string $pass): mixed {
      return ($user === 'alice' && $pass === 'secret') ? 'alice' : false;
   },
   realm: 'WS'
);

$WS->configure(host: '0.0.0.0', port: 8083, workers: 1, guards: [$BasicGuard]);
```

## Ler a identidade e as claims

Tudo o que um guard expõe com `Guard::expose()` é copiado para a `Session` após um handshake bem-
sucedido — `identity`, `claims` e `tokenHeaders` — então seus handlers sabem quem está conectado:

```php
->on(Events::Connected, function ($Session) {
   $Session->identity;   // ex.: 'user-42' (ou null)
   $Session->claims;     // ex.: ['role' => 'admin'] (ou null)
})
```

## Desafio na negação

Quando todos os guards negam, o `401` carrega um header `WWW-Authenticate` construído a partir do
primeiro guard cujo `challenge()` anuncia um (esquemas Bearer/JWT/customizado via `announce()` +
`format()`). Isso permite ao cliente descobrir o esquema/realm esperado. O `Basic` não tem um
caminho de retry legível pela aplicação no WebSocket, então recai para um `401` simples.

## Portão de upgrade customizado (checagem de Origin)

Além dos guards, `Events::HandshakeRequested` roda um predicado arbitrário sobre a requisição de
upgrade e **rejeita com `403` quando retorna false** — o lugar canônico para impor uma allowlist de
`Origin` (a defesa WebSocket contra cross-site hijacking, CSWSH):

```php
$WS->on(Events::HandshakeRequested, function ($Request) {
   return $Request->Header->get('Origin') === 'https://app.example';
});
```

O predicado recebe o mesmo adaptador `Handshake\Request` dos guards (headers, token, parser Basic),
roda após os guards, e um retorno `false` encerra o upgrade com `HTTP/1.1 403 Forbidden`. Use para
allowlists de Origin, rate limit por IP, ou qualquer regra de admissão custom.

## Referência

### O adaptador de requisição do handshake

Cada guard recebe um adaptador `Handshake\Request` que expõe a requisição de upgrade de três formas,
para que o contrato de guard do HTTP funcione sem alteração:

```php
$Request->Header->get('Authorization');   // bag de headers case-insensitive
$Request->headers['authorization'];         // mapa de headers em minúsculas
$Request->token;                            // slot pré-resolvido do token Bearer ('' por padrão)
$Request->authenticate();                   // faz parse de `Authorization: Basic …` -> credenciais Basic
```

Para esquemas de cookie ou header customizado, leia `$Request->Header->get('<nome>')` dentro de
`authenticate()`.

> Os guards rodam no handshake, antes de qualquer `Session` existir — guards baseados em sessão não
> são suportados (tal guard simplesmente nega). Veja a página **Authentication** do HTTP Server CLI
> para o contrato completo dos guards.
