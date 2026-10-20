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
bootgly project Demo/HTTP_Server_CLI migrate status
bootgly project Demo/HTTP_Server_CLI migrate up
bootgly project Demo/HTTP_Server_CLI seed list
bootgly project Demo/HTTP_Server_CLI seed run --dry-run
bootgly project Demo/HTTP_Server_CLI seed run authorization_rbac
```

Rode os comandos de migrate somente depois de configurar e acessar o banco do projeto.

### Cache de listas de permissões

Cada `check()` e `load()` consulta as quatro tabelas. Passe um `Cache` para guardar uma lista
de permissões por identidade por `lifetime` segundos (300 por padrão):

```php
use Bootgly\ABI\Resources\Cache;
use Bootgly\API\Security\Authorization\RBAC;

$RBAC = new RBAC($Database, Cache: new Cache(['driver' => 'file']), lifetime: 300);
```

Depois que uma gravação de role ou permissão **faz commit**, chame `invalidate()` — com a
identidade cujos grants mudaram, ou sem argumento quando uma role ou permissão mudou:

```php
$Database->Pool->wait($Transaction->commit());   // a revogação fica durável primeiro
$RBAC->invalidate($Identity);                     // as listas dessa identidade
$RBAC->invalidate();                              // todas as listas deste resolver
```

Cada lista em cache fica presa a duas gerações — a do resolver e a da identidade — lidas antes
do banco, e `invalidate()` grava uma nova (ou descarta a antiga quando o cache recusa a
gravação — disco cheio, Redis em maxmemory): um check que começa depois de `invalidate()`
retornar nunca serve uma lista calculada antes dele, mesmo quando um check já em andamento
leu o banco antes da gravação. Um cache que falha numa leitura ou gravação nunca falha o
check: ele responde pelo banco.
As leituras de permissão vão sempre ao primário, então com réplicas de leitura configuradas o
atraso de uma réplica nunca decide um check nem o que o cache guarda. Um resolver sobre uma
`Transaction` lê a visão da própria transação (suas gravações sem commit, seu snapshot) e
nunca a coloca em cache.

Um check em cache custa três leituras de cache (três idas e voltas no Redis). O driver
`memory` guarda listas por objeto `Cache`: num worker, compartilhe um `Cache` entre o código
que grava grants e o que os confere, e use `file`, `shared` ou `redis` entre workers. Um banco
SQLite privado guarda suas listas no processo que o detém.

Resolvers compartilham listas em cache — e invalidações — só dentro de um mesmo **realm**,
derivado da conexão (driver, host, porta, banco, usuário; um arquivo SQLite só pelo caminho, e
um banco SQLite privado — `:memory:` ou o nome vazio — pelo seu objeto SQL) e dos quatro nomes
de tabela: duas aplicações ou tenants no mesmo cache nunca servem as permissões um do outro
enquanto suas conexões ou tabelas diferem. O realm nomeia uma conexão como ela é escrita,
então a mesma grafia alcançando dois servidores ou arquivos (um caminho SQLite em dois
containers, um host em duas redes) compartilha um realm — dê então a cada tenant seu próprio
`prefix` de Cache ou `realm:`. Quando o código que grava grants alcança o banco
com uma grafia diferente da do código que os confere (`localhost` vs `127.0.0.1`, uma role de
admin vs a role da aplicação, um symlink para o arquivo SQLite), o `invalidate()` dele retorna
`true` sem alcançar quem lê — dê aos dois o mesmo `realm:`:

```php
$RBAC = new RBAC($Database, Cache: $Cache, realm: 'shop-permissions');
```

*Atualizando da 1.0.9:* as listas ficam num novo layout de chaves; entradas do antigo expiram
dentro de `lifetime`, e `invalidate()` as limpa nesse meio-tempo (até a 1.1.0), então workers
ainda na release antiga durante um deploy gradual também veem a invalidação. O inverso não
vale: um `invalidate()` de um worker na 1.0.9 não alcança os leitores atualizados, então
atualize primeiro os processos que gravam grants, ou espere até `lifetime` de dados velhos
durante o deploy. Confira que quem grava e quem lê um mesmo conjunto de permissões derivam o
mesmo realm (ou passam o mesmo `realm:`) antes de atualizar — na 1.0.9 toda invalidação
alcançava todo resolver no cache. As leituras de permissão agora vão ao primário mesmo com
réplicas de leitura configuradas.

## Rotas demo

Habilite o set demo de Authorization em
`projects/Demo/HTTP_Server_CLI/router/router.index.php` (o projeto carrega a pasta `router/` via `Router::load()`):

```php :filename="router.index.php";
// adicione 'Authorization' ao manifesto
return [
   'Authorization',
];
```

Depois inicie o servidor demo:

```bash :toolbar="true";
bootgly project Demo/HTTP_Server_CLI start -i
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
`projects/Demo/HTTP_Server_CLI/router/HTTP_Server_CLI-authorization.postman_collection.json`.
Ela cobre sucesso em Scope, Role e Policy, além de casos de negação com tokens válidos.

## Testes

Os testes de Authorization são separados por camada:

```bash
AI_AGENT=1 bootgly test 22       # API/Security: policies, abilities e RBAC
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

## Referência

### Bootgly\API\Security\Authorization\RBAC

```php
public function __construct (SQLDatabase|Transaction $Database, string $roles = 'roles', string $permissions = 'permissions', string $rolePermissions = 'role_permissions', string $userRoles = 'user_roles', null|Cache $Cache = null, int $lifetime = 300, null|string $realm = null)
```

Cria o resolver. Com um `Cache`, as listas de permissões ficam em cache por `$lifetime`
segundos, presas às gerações do resolver e da identidade; `$realm` substitui a parte da
conexão no realm (os quatro nomes de tabela continuam valendo). Sobre uma fachada SQL as
leituras de permissão vão ao primário; sobre uma `Transaction` leem a visão dela e nunca vão
para o cache. Um erro de banco nega (`check()` é `false`, `load()` deixa a identidade intacta)
e nunca vai para o cache.

```php
public function invalidate (null|Identity $Identity = null): bool
```

Descarta listas de permissões em cache depois que uma gravação de role ou permissão faz
commit: as da identidade, ou todas as listas do realm do resolver quando chamado sem uma.
Retorna `false` quando o cache não conseguiu gravar uma nova geração nem descartar a antiga.
Sem cache, não faz nada.
