# Configuração

O Bootgly possui um sistema de configuração por escopos para settings do framework e de projetos. Um escopo de config é uma pequena árvore de nós `Config`, carregada a partir de um arquivo PHP confiável e opcionalmente alimentada por arquivos `.env`.

Use esse sistema para valores como conexões de banco, flags, opções de servidor e sobrescritas específicas de projeto.

## Estrutura de diretórios

Cada escopo fica em seu próprio diretório:

```text
configs/
└── database/
    ├── .env
    ├── .env.production
    └── database.config.php
```

O nome do diretório e o nome do arquivo PHP devem corresponder ao nome do escopo. No exemplo acima, o escopo é `database` e o arquivo executável de configuração é `database.config.php`.

Configs de projeto usam a mesma estrutura dentro do diretório de configs do projeto, por exemplo:

```text
projects/MyApp/configs/
└── database/
    ├── .env
    └── database.config.php
```

## Criando um arquivo de configuração

Um arquivo `<scope>.config.php` retorna um objeto `Bootgly\API\Environment\Configs\Config`.

```php
use Bootgly\API\Environment\Configs\Config;
use Bootgly\API\Environment\Configs\Config\Types;

return new Config(scope: 'database')
   ->Default->bind(key: 'DB_CONNECTION', default: 'mysql')
   ->Connections
      ->MySQL
         ->Driver->bind(key: '', default: 'mysql')
         ->Host->bind(key: 'DB_HOST', default: 'localhost')
         ->Port->bind(key: 'DB_PORT', default: 3306, cast: Types::Integer)
         ->Database->bind(key: 'DB_NAME', default: 'bootgly')
         ->Username->bind(key: 'DB_USER', default: 'root')
         ->Password->bind(key: 'DB_PASS', required: true)
         ->Charset->bind(key: '', default: 'utf8mb4');
```

`bind()` retorna o nó pai, então a árvore pode ser declarada fluentemente. O valor de um nó é lido com `get()`.

## Carregando um escopo

```php
use Bootgly\API\Environment\Configs;

$Configs = new Configs(__DIR__ . '/configs/');
$Database = $Configs->get('database');

$host = $Database->Connections->MySQL->Host->get();
$port = $Database->Connections->MySQL->Port->get();
```

`Configs::get()` aceita apenas o nome do escopo. Dot-notation não é suportada de propósito. Valores aninhados devem ser acessados com object-navigation:

```php
$Database->Connections->MySQL->Host->get();
```

## Resolução de ambiente

Quando um escopo é carregado, o Bootgly lê:

1. `.env`
2. `.env.<BOOTGLY_ENV>` quando `BOOTGLY_ENV` está definido com um nome válido
3. `<scope>.config.php`

Para cada `bind()`, a ordem de resolução é:

1. Ambiente real do processo (`getenv()`)
2. Mapa `.env` local do escopo
3. Valor padrão passado para `bind()`

Isso significa que variáveis injetadas pelo runtime sempre vencem, mas arquivos `.env` não modificam o ambiente global do processo.

Exemplo:

```ini
DB_HOST=localhost
DB_PORT=3306
DB_PASS=secret
```

```bash
BOOTGLY_ENV=production php bootgly
```

Com esse ambiente, o Bootgly também tenta carregar `.env.production` depois de `.env`.

## Política de `.env` local

Nomes de variáveis em `.env` local devem seguir `[A-Z_][A-Z0-9_]*`. Se um arquivo `.env` ou `.env.<BOOTGLY_ENV>` carregado contiver uma chave inválida, o carregamento do escopo falha e o escopo não é registrado.

Use `allow()` para definir exatamente quais chaves `.env` locais um escopo aceita:

```php
use Bootgly\API\Environment\Configs;

$Configs = new Configs(__DIR__ . '/configs/')
   ->allow('database', [
      'DB_HOST',
      'DB_PORT',
      'DB_NAME',
      'DB_USER'
   ]);
```

Quando uma allowlist existe, typos e chaves de outro escopo falham em modo fail-closed. Por exemplo, `DB_HOSTT` ou `SERVER_HOST` no escopo `database` falhariam o carregamento, a menos que fossem explicitamente permitidas.

Use `lock()` para chaves que não devem vir de arquivos `.env` locais:

```php
$Configs = new Configs(__DIR__ . '/configs/')
   ->allow('database', [
      'DB_HOST',
      'DB_PORT',
      'DB_NAME',
      'DB_USER'
   ])
   ->lock('database', [
      'DB_PASS'
   ]);
```

Uma chave travada ainda pode ser fornecida pelo ambiente real do processo, então plataformas de deploy podem injetar segredos em runtime. Os arquivos `.env` locais apenas não podem fornecer essa chave.

## Valores obrigatórios

Use `bind(required: true)` para segredos e valores que precisam existir:

```php
$Config->JWT->Secret->bind(
   key: 'JWT_SECRET',
   required: true
);

$Config->Database->Password->bind(
   key: 'DB_PASS',
   required: true
);
```

Valores obrigatórios falham em modo fail-closed: valores ausentes e strings vazias lançam exceção. Defaults não são usados quando `required: true` está habilitado.

## Casts estritos

Use `Types` para fazer parsing explícito de escalares:

```php
$Config->Server->Port->bind('SERVER_PORT', 8080, Types::Integer);
$Config->Features->Debug->bind('APP_DEBUG', false, Types::Boolean);
```

Casts suportados:

| Tipo | Exemplos aceitos | Exemplos inválidos |
| --- | --- | --- |
| `Types::Boolean` | `true`, `false`, `1`, `0`, `yes`, `no`, `on`, `off` | `maybe`, `enabled` |
| `Types::Integer` | `8080`, `-1` | `123abc`, `1.2` |
| `Types::Float` | `10.5`, `1e3`, `.25` | `1.2.3`, `ten` |
| `Types::String` | Qualquer valor escalar | — |

Valores booleanos, inteiros e floats inválidos lançam exceção em vez de sofrer coerção silenciosa.

## Overlay de projeto

Configs de projeto podem fazer overlay sobre configs do framework. Valores do projeto vencem; valores do framework preenchem nós ausentes.

```php
use Bootgly\API\Environment\Configs as FrameworkConfigs;
use Bootgly\API\Projects\Configs as ProjectConfigs;

$Framework = new FrameworkConfigs(BOOTGLY_ROOT_BASE . '/configs/');
$Project = new ProjectConfigs($projectPath . 'configs/');

$Project->overlay($Framework, 'database');

$Database = $Project->get('database');
```

O processo de overlay mantém valores `.env` locais a cada loader, então `.env` de framework/projeto não vaza para `getenv()`.

## Modelo de segurança

O Bootgly endurece o carregamento de configs com várias regras:

- Nomes de escopo e ambiente devem seguir `[A-Za-z0-9_-]+`.
- Paths são contidos com `File::guard()` antes de ler `.env` ou executar `.config.php`.
- Valores `.env` são locais à instância do loader e não são exportados com `putenv()`.
- Chaves `.env` devem seguir `[A-Z_][A-Z0-9_]*`.
- `allow()` pode restringir chaves `.env` locais por escopo.
- `lock()` pode reservar chaves sensíveis para o ambiente real de runtime.
- Dot-notation não é suportada por `Configs::get()`.
- Segredos obrigatórios podem falhar em modo fail-closed com `bind(required: true)`.
- Arquivos `.config.php` são código PHP confiável e devem ser revisados como código-fonte.

> [!WARNING]
> Nunca permita que usuário, tenant, upload ou formulário administrativo grave um arquivo `.config.php`. Para configuração não confiável, use um formato declarativo como JSON, INI ou YAML e converta para `Config` a partir de código confiável da aplicação.
