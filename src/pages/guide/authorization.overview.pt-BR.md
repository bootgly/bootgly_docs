# Authorization

Authorization responde uma pergunta depois que a autenticação passa: esta `Identity` pode
executar esta ação? O Bootgly mantém essa decisão na camada API, independente de
transporte, e deixa as rotas HTTP da WPI aplicarem a decisão com middleware gates.

A superfície atual tem quatro peças práticas:

- `Scope` gate para grants exatos como `demo:read`.
- `Role` gate para claims de papel como `editor` ou `admin`.
- `Policy` gate para decisões por recurso, como update somente pelo dono.
- `RBAC` resolver para permissões persistidas em tabelas SQL do projeto.

## Fluxo da requisição

Authorization é separada de Authentication de propósito:

1. O middleware de Authentication valida uma credencial Basic, Bearer ou JWT.
2. O guard grava uma `Identity` tipada na request.
3. O middleware de Authorization executa um ou mais gates.
4. Todos os gates configurados precisam passar; a primeira negação retorna `403 Forbidden`.

Essa separação importa porque WPI cuida de HTTP, enquanto API define o modelo de
autorização. Gates WPI não acessam banco diretamente; RBAC com banco fica na API e depende
somente do ADI SQL.

Para a referência do middleware HTTP, veja
**[HTTP Server CLI Authorization](/manual/WPI/HTTP/HTTP_Server_CLI/Authorization/overview/)**.

## Scope gate

Use `Scope` quando a credencial já carrega grants exatos. JWT `scope` é o caso natural.

```php
use Bootgly\API\Security\JWT;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authenticating;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authentication;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authentication\JWT as JWTGuard;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authorizing;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authorization;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authorization\Scope;

$JWT = new JWT('application-secret');
$JWTStrategy = new Authenticating(new JWTGuard($JWT));

$middlewares = [
   new Authentication($JWTStrategy),
   new Authorization(new Authorizing(new Scope('posts:view'))),
];
```

Por padrão, `Scope` exige todos os scopes configurados. Passe `all: false` para aceitar
qualquer um dos grants configurados.

```php
new Scope(['posts:view', 'posts:update'], all: false);
```

## Role gate

Use `Role` quando a identidade autenticada carrega roles mais amplas. O gate verifica tanto
uma claim `role` única quanto uma claim `roles` em lista. O match é exato e case-sensitive.

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authorizing;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authorization;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authorization\Role;

$Authorizing = new Authorizing(
   new Role(['editor', 'publisher'], all: true)
);

$Middleware = new Authorization($Authorizing);
```

Na maioria das rotas, prefira scopes específicos ou policies. Roles funcionam melhor para
grupos amplos, como áreas administrativas.

## Policy gate

Policies modelam decisões por recurso. Estenda
`Bootgly\API\Security\Authorization\Policy` e sobrescreva apenas as ações que a rota usa.
Os exemplos built-in usam `view`, `create`, `update` e `delete`, mas métodos públicos
customizados como `publish` também são válidos.

```php
use Bootgly\API\Security\Authorization\Policy as PolicyContract;
use Bootgly\API\Security\Identity;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authorizing;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authorization;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authorization\Policy as PolicyGate;

$OwnedPost = (object) ['owner' => 'user-42'];

$OwnershipPolicy = new class extends PolicyContract {
   public function update (Identity $Identity, mixed $Resource = null): null|bool
   {
      if (is_object($Resource) === false || property_exists($Resource, 'owner') === false) {
         return null;
      }

      return $Resource->owner === $Identity->id;
   }
};

$Middleware = new Authorization(new Authorizing(new PolicyGate(
   Policy: $OwnershipPolicy,
   action: 'update',
   Resource: static function (object $Request) use ($OwnedPost): object {
      return $OwnedPost;
   }
)));
```

`override()` pode interromper qualquer ação. Use para regras como liberar super-admin ou
negar usuário desativado.

Métodos de policy retornam `null|bool`: `true` permite, `false` nega e `null` significa sem
opinião. O engine trata `null` como negação, então policies falham fechado por padrão.

## Abilities nomeadas

`Abilities` é um registry leve para checks definidos pela aplicação quando uma classe de
policy completa seria excesso.

```php
use Bootgly\API\Security\Authorization\Abilities;
use Bootgly\API\Security\Identity;

$Abilities = new Abilities;

$Abilities->define('posts:update', function (Identity $Identity, object $Post): bool {
   return $Post->owner === $Identity->id;
});

$allowed = $Abilities->check($Identity, 'posts:update', $Post);
```

Abilities ausentes falham fechado e retornam `false`.

## RBAC persistido

Use `RBAC` quando permissões vivem em tabelas SQL em vez de apenas em claims do token. O
resolver pertence à API e usa ADI SQL por um objeto `SQL` ou uma transação.

```php
use Bootgly\API\Security\Authorization\RBAC;

$RBAC = new RBAC($Database);

$Identity = $RBAC->load($Identity);
$allowed = $RBAC->check($Identity, 'posts:update');
```

As tabelas canônicas de projeto são:

| Tabela | Propósito |
|---|---|
| `roles` | Roles como `admin` ou `editor`. |
| `permissions` | Permissões nomeadas como `posts:update`. |
| `role_permissions` | Grants many-to-many de role para permissão. |
| `user_roles` | Grants de role para o id de usuário da aplicação. |

O projeto demo inclui migrations e um seeder reexecutável para essas tabelas:

```bash
bootgly project Demo-HTTP_Server_CLI migrate status
bootgly project Demo-HTTP_Server_CLI migrate up
bootgly project Demo-HTTP_Server_CLI seed list
bootgly project Demo-HTTP_Server_CLI seed run --dry-run
bootgly project Demo-HTTP_Server_CLI seed run authorization_rbac
```

Rode os comandos de migrate somente depois de configurar e acessar o banco do projeto.

## Rotas demo

Habilite o handler demo de Authorization em
`projects/Demo-HTTP_Server_CLI/Demo-HTTP_Server_CLI.project.php`:

```php
$HTTP_Server_CLI->on(
   Events::RequestReceived,
   require __DIR__ . '/router/HTTP_Server_CLI-authorization.SAPI.php'
);
```

Depois inicie o servidor demo:

```bash
bootgly project Demo-HTTP_Server_CLI start -i
```

Rotas disponíveis:

| Rota | Descrição |
|---|---|
| `/authz` | Lista os exemplos disponíveis de Authorization. |
| `/authz/jwt/issue` | Emite um JWT demo para `demo-user`. |
| `/authz/scope` | Exige `demo:read`. |
| `/authz/role` | Exige `editor`. |
| `/authz/policy` | Exige que o usuário autenticado seja dono do recurso demo. |

A coleção Postman correspondente fica em
`projects/Demo-HTTP_Server_CLI/router/HTTP_Server_CLI-authorization.postman_collection.json`.
Ela cobre sucesso em Scope, Role e Policy, além de casos de negação com tokens válidos.

## Testes

Os testes de Authorization são separados por camada:

```bash
AI_AGENT=1 bootgly test 19       # API/Security: policies, abilities e RBAC
AI_AGENT=1 bootgly test 26       # Units dos middlewares WPI
AI_AGENT=1 bootgly test 28 166   # E2E Scope success
AI_AGENT=1 bootgly test 28 167   # E2E Scope failure
AI_AGENT=1 bootgly test 28 168   # E2E Role success
AI_AGENT=1 bootgly test 28 169   # E2E Role failure
AI_AGENT=1 bootgly test 28 170   # E2E Policy success
AI_AGENT=1 bootgly test 28 171   # E2E Policy failure
AI_AGENT=1 bootgly test 28 172   # E2E RBAC opcional, sem DB por padrão
```

Use testes focados primeiro ao mudar gates ou policies. Adicione E2E mais amplo quando um
novo fluxo de rota combinar middlewares de Authentication e Authorization. Para rodar o
RBAC E2E opcional contra PostgreSQL, configure `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`,
`DB_PASS` e defina `BOOTGLY_RBAC_E2E=1`. Defina `BOOTGLY_RBAC_E2E_RESET=1` somente
quando o teste puder remover e recriar as tabelas isoladas `rbac_e2e_*`.