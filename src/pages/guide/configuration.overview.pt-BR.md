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
    └── database.Config.php
```

O nome do diretório, o nome do arquivo PHP e o `Config::$scope` retornado devem corresponder. No exemplo acima, o diretório é `database/`, o arquivo executável é `database.Config.php` e esse arquivo deve retornar `new Config(scope: 'database')`.

Configs de projeto usam a mesma estrutura dentro do diretório de configs do projeto, por exemplo:

```text
projects/MyApp/configs/
└── database/
    ├── .env
    └── database.Config.php
```

## Criando um arquivo de configuração

Um arquivo `<scope>.Config.php` retorna um objeto `Bootgly\API\Environment\Configs\Config`.

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

Object-navigation cria um filho ausente. Use `Config::check()` quando precisar testar a existência de um filho direto sem alterar a árvore:

```php
if ($Database->Connections->check('SQLite')) {
   $path = $Database->Connections->SQLite->Database->get();
}
```

Chame `check()` antes de navegar até esse filho. O método informa se o filho direto foi declarado e nunca o cria.

`Configs::load('database')` retorna `false` se `database.Config.php` declarar outro escopo. A árvore incompatível não é registrada sob nenhum dos nomes e não pode substituir um escopo existente. Chamadas lazy a `get('database')` mantêm esse mismatch em um latch e não executam repetidamente o mesmo arquivo inválido. Depois de corrigir o arquivo em um processo ativo, chame `load('database')` explicitamente para tentar novamente; uma carga explícita bem-sucedida limpa o latch.

## Resolução de ambiente

Quando um escopo é carregado, o Bootgly lê:

1. `.env`
2. `.env.<BOOTGLY_ENV>` quando `BOOTGLY_ENV` está definido com um nome válido
3. `<scope>.Config.php`

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

```bash :toolbar="true";
BOOTGLY_ENV=production php bootgly
```

Com esse ambiente, o Bootgly também tenta carregar `.env.production` depois de `.env`.

## Escrevendo variáveis de processo

Arquivos `.env` ficam locais ao loader — eles nunca modificam o ambiente do processo. Quando um valor precisa de fato *estar* no ambiente do processo (porque a resolução o lê primeiro, ou porque um processo filho tem de herdá-lo), escreva-o com `Bootgly\API\Environment`:

```php
use Bootgly\API\Environment;
use Bootgly\API\Environment\Configs;

// @ Escreva antes do escopo carregar: o ambiente do processo vence o .env local do escopo
Environment::put('DB_HOST', 'db.internal');

$Configs = new Configs(__DIR__ . '/configs/');
$Database = $Configs->get('database');

echo $Database->Connections->MySQL->Host->get();   // db.internal
```

`put()` é `putenv()` com o prefixo e o sufixo configurados aplicados, então o valor passa a ser visível para `getenv()` — o passo 1 da ordem de resolução do `bind()` acima — e para todo processo criado depois. A ordem importa: um nó resolve seu valor uma única vez, enquanto `<escopo>.Config.php` roda, então um `put()` feito depois de o escopo carregar não muda o que `get()` já retorna. Use-o para valores que uma etapa de deploy calcula (um host resolvido, uma porta descoberta) antes de a aplicação subir.

## Política de .env local

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
- Paths são contidos com `File::guard()` antes de ler `.env` ou executar `.Config.php`.
- Valores `.env` são locais à instância do loader e não são exportados com `putenv()`.
- Chaves `.env` devem seguir `[A-Z_][A-Z0-9_]*`.
- `allow()` pode restringir chaves `.env` locais por escopo.
- `lock()` pode reservar chaves sensíveis para o ambiente real de runtime.
- Dot-notation não é suportada por `Configs::get()`.
- Segredos obrigatórios podem falhar em modo fail-closed com `bind(required: true)`.
- Arquivos `.Config.php` são código PHP confiável e devem ser revisados como código-fonte.

> [!WARNING]
> Nunca permita que usuário, tenant, upload ou formulário administrativo grave um arquivo `.Config.php`. Para configuração não confiável, use um formato declarativo como JSON, INI ou YAML e converta para `Config` a partir de código confiável da aplicação.

## Referência

A classe `Bootgly\API\Environment` é o lado "ambiente do processo" da configuração: ela lê e escreve o ambiente real que o `bind()` consulta primeiro. Toda chave que você passa — para `get()`, `put()` e `del()`, ou num arquivo que `load()` lê — é composta como `Environment::$prefix . $key . Environment::$suffix`; ambos são strings públicas estáticas, vazias por padrão. `list()` e `save()` trabalham com os nomes reais.

```php
public static function load (string $file): bool
```

Faz o parse de um arquivo no estilo INI e entrega cada par a `put()`, então o prefixo e o sufixo se aplicam e uma variável já definida é sobrescrita — o arquivo vence o ambiente real, o contrário do `bind()`. Retorna `false`, sem aplicar nada, quando o arquivo não existe, não é um arquivo regular (um diretório, um FIFO), não pode ser lido ou parseado, contém um byte NUL ou traz uma chave de array (`CHAVE[]=`, `CHAVE[nome]=`), e também quando `Environment::$prefix` ou `Environment::$suffix` contém `=` ou um byte NUL, já que `put()` recusaria todo nome composto; caso contrário retorna `true`. Este é o equivalente imperativo da leitura de `.env` por escopo descrita acima: diferente de um `.env` de escopo, o que `load()` lê **vira** estado global do processo.

> [!WARNING]
> `load()` exporta todo nome que o arquivo traz — `PATH`, `LD_PRELOAD` e `PHP_INI_SCAN_DIR` como qualquer outro — e todo processo que a aplicação criar depois os herda: quem escreve o arquivo escolhe quais binários esses processos encontram, quais bibliotecas eles pré-carregam e quais diretivas de `php.ini` eles leem. Nunca carregue um arquivo que outra conta possa escrever. Para ler um arquivo `.env`, use `Configs`, o leitor canônico descrito acima: ele mantém os valores locais ao escopo, aceita só nomes `[A-Z_][A-Z0-9_]*`, respeita `allow()` e `lock()` e não exporta nada.

```php
public static function save (string $file): bool
```

Escreve o ambiente **inteiro** do processo — toda variável que `getenv()` retorna — em `$file`, uma linha `CHAVE=valor` por variável: a forma sem aspas que o `docker --env-file` e leitores parecidos esperam. Um valor que a linha sem aspas não levaria intacto através do `load()` é escrito entre aspas, como `CHAVE="valor"` — por exemplo um que contém `;`, começa ou termina com espaço ou tab, ou vem entre aspas duplas. Um leitor que toma as linhas literalmente, como o `docker --env-file`, mantém essas aspas como parte do valor. Cada linha é conferida — ela precisa ser lida de volta exatamente como o seu par — antes de qualquer coisa ser escrita.

A escrita é atômica e privada: as linhas vão para um arquivo temporário de nome aleatório ao lado de `$file`, que recebe o modo `0600` antes do primeiro byte ser escrito — também num diretório cuja ACL padrão daria mais acesso — e então é sincronizado em disco e renomeado por cima de `$file`. O que estava em `$file` é substituído, nunca escrito através: um arquivo novo, pertencente a quem chama, toma o lugar dele, então o dono, o grupo, o modo, a ACL, o rótulo SELinux e os hard links do arquivo antigo não são mantidos (outro hard link para o arquivo antigo continua com o conteúdo antigo), e um link é substituído em vez de seguido, então o alvo dele nunca é tocado. Num diretório sticky como `/tmp`, só o dono de uma entrada, o dono do diretório ou o root podem substituir uma entrada: um link que outra conta plantou em `$file` faz `save()` retornar `false` e fica como estava, a menos que quem chama seja dono do diretório ou root — aí o próprio link é substituído.

Retorna `false`, deixando `$file` intacto, quando:

- `$file` não é um caminho local — um stream wrapper como `php://filter` ou `compress.zlib://`;
- alguma variável não tem uma linha que seja lida de volta como o seu par — uma quebra de linha no valor (uma função de shell exportada, um certificado de várias linhas) ou um nome que o formato INI não comporta (`NULL`, `YES`, `A~B`). Por isso `save()` sempre retorna `false` no Windows 64 bits, onde todo processo traz `ProgramFiles(x86)`;
- o arquivo temporário não pode ficar privado (`0600`);
- a escrita falha — por exemplo porque o diretório de `$file` não aceita escrita, mesmo que o próprio `$file` aceite, ou porque `$file` é um ponto de montagem: um arquivo único montado via bind mount num container (`docker run -v ./app.env:/app/.env`, uma montagem `subPath` do Kubernetes) não pode ser substituído, então monte o diretório dele.

Nomes que `getenv()` deixa de fora (veja `list()`) não são escritos. As linhas levam os nomes reais, então carregar o arquivo de volta com um prefixo ou sufixo configurado compõe cada nome de novo: com o prefixo `APP_`, `APP_TOKEN` volta como `APP_APP_TOKEN` e `PATH` como `APP_PATH`.

> [!WARNING]
> `save()` despeja o ambiente **inteiro** do processo, não só as chaves que o Bootgly escreveu — tokens e credenciais herdados inclusive. Trate o arquivo como material secreto e nunca o aponte para um caminho dentro de um diretório servido.

```php
public static function list (): array
```

Retorna todo o ambiente do processo como `array<string,string>`, exatamente o que `getenv()` retorna. As chaves vêm literais: o prefixo e o sufixo não são removidos. `getenv()` deixa de fora todo nome que contém `.`, espaço ou `[` — uma variável assim continua definida, `get()` continua lendo-a e processos filhos continuam herdando-a, mas ela falta nesta lista e no arquivo que `save()` escreve.

```php
public static function get (string $key, null|string|false $default = null): false|string
```

Lê uma variável. Retorna o valor como string, ou `$default` quando a variável não está definida e um padrão não-`null` foi passado, ou `false` quando ela não está definida e nenhum padrão foi passado. Como o caso ausente é `false`, compare com `===` em vez de testar vazio — `'0'` é um valor válido.

```php
public static function match (int $type): bool
```

Testa o ambiente em execução contra uma das constantes da classe: `Environment::CI_CD` (verdadeiro quando `GITHUB_ACTIONS`, `TRAVIS`, `CIRCLECI` ou `GITLAB_CI` está definida) ou `Environment::AI_AGENT` (verdadeiro quando o processo é detectado como um agente de IA). Qualquer outro valor retorna `false`.

```php
public static function put (string $key, string|int $value): bool
```

Escreve uma variável no ambiente real do processo via `putenv()`, retornando se a escrita teve sucesso. Um `int` é convertido para string, então `get()` sempre lê uma string de volta. Retorna `false`, sem escrever nada, quando `$key` é vazia, o nome composto (prefixo, chave e sufixo) contém `=` ou um byte NUL, ou quando `$value` contém um byte NUL — do contrário `putenv()` agiria sobre outra variável ou cortaria o valor. O valor é visível para `getenv()`, para a resolução do `bind()` e para processos criados depois — ele **não** é escrito em nenhum arquivo `.env`, e não alcança processos que já estão rodando.

```php
public static function del (string $key): bool
```

Remove uma variável, compondo o prefixo e o sufixo como `get()` e `put()`: com `Environment::$prefix = 'BOOTGLY_'`, `Environment::del('DB_HOST')` remove `BOOTGLY_DB_HOST` e deixa um `DB_HOST` sem prefixo intocado. Retorna `true` quando a variável fica removida — também quando ela não estava definida — e `false`, sem remover nada, quando `$key` é vazia ou o nome composto contém `=` ou um byte NUL (`putenv()` agiria sobre outra variável: `del('NOME=valor')` *definiria* `NOME`).
