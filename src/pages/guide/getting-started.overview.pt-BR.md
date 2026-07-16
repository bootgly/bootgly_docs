# Começando

O Bootgly tem **uma única maneira canônica** de começar: um único comando que instala tudo e abre o **wizard de projetos**.

```bash :toolbar="true";
curl -fsSL https://bootgly.com/install | bash
```

O instalador:

1. Verifica seu ambiente (`git` + PHP **8.4+**);
2. Clona o template inicial [bootgly.kit](https://github.com/bootgly/bootgly.kit) em `./bootgly.kit` (passe outro nome com `curl -fsSL https://bootgly.com/install | bash -s -- meudir`);
3. Inicializa a **plataforma Bootgly** (git submodule);
4. Faz "boot" de [diretórios recurso](https://docs.bootgly.com/manual/Bootgly/basic/directory_structure/overview/#resource-dirs) (`bootgly boot`);
5. Opcionalmente instala a **CLI do Bootgly globalmente** (`php bootgly setup`) — assim todo comando funciona como `bootgly ...` em vez de `php bootgly ...`;
6. Abre o **wizard de projetos** (`php bootgly project create`).

> **Rodar de novo é seguro.** Se a instalação foi interrompida em qualquer etapa, execute o mesmo comando novamente: quando o diretório alvo já é um checkout do Bootgly Kit, o instalador **retoma** — imprime um checklist do que já foi feito, inicializa o que falta (submodules, resources) e reabre o wizard (pulando-o quando um projeto já está registrado). O wizard só oferece as plataformas ainda não configuradas.

Um kit recém-clonado (`git clone` — ou usando o template do GitHub) contém apenas os arquivos do kit — todos os submodules de plataforma ficam **vazios** até serem instalados:

```text
bootgly.kit/
├── Bootgly/            ← plataforma base (git submodule OBRIGATÓRIO — vazio, ainda não instalado)
├── Console/            ← plataforma Console (git submodule opcional — vazio)
├── Web/                ← plataforma Web (git submodule opcional — vazio)
├── .gitignore
├── .gitmodules         ← Bootgly (obrigatório) + Console e Web (plataformas opcionais)
├── LICENSE
├── README.md
├── bootgly             ← o launcher da CLI (autoboota o Bootgly + as plataformas opcionais)
├── composer.json
└── index.php           ← o front controller Web
```

O instalador inicializa a plataforma base obrigatória (`git submodule update --init Bootgly`); a primeira execução do wizard inicializa os submodules da plataforma escolhida e roda o `bootgly boot` para instalar as suas próprias pastas de recursos:

```text
bootgly.kit/
├── Bootgly/            ← plataforma base (submodule instalado)
│   ├── &/              ← recursos internos do framework
│   ├── @/              ← meta recursos do framework (certificados, análise estática, ...)
│   ├── Bootgly/        ← o framework em si — as interfaces I2P, em ordem de dependência:
│   │   ├── ABI/        ← Configs/ Data/ Debugging/ Differ/ Events/ IO/ Resources/ Syntax/ Templates/
│   │   ├── ACI/        ← Events/ Fakers/ Logs/ Observability/ Process/ Queues/ Schedule/ Tests/
│   │   ├── ADI/        ← Database/ Databases/ Table/ Validation/ Validators/
│   │   ├── API/        ← Endpoints/ Environment/ Projects/ Security/ Workables/
│   │   ├── CLI/        ← Commands/ Terminal/ UI/
│   │   ├── WPI/        ← Connections/ Endpoints/ Events/ Interfaces/ Modules/ Nodes/ Queues/
│   │   └── commands/   ← comandos built-in da CLI (boot, demo, project, test, ...)
│   ├── configs/        ← configs do framework
│   ├── docs/           ← assets de documentação do framework
│   ├── projects/       ← projects a nível de author — as fontes do import (Benchmark/, Demo/, Example/)
│   ├── public/         ← template de recursos usado pelo `bootgly boot`
│   ├── scripts/        ← template de recursos usado pelo `bootgly boot`
│   ├── storage/        ← template de recursos usado pelo `bootgly boot`
│   ├── tests/          ← template de recursos usado pelo `bootgly boot`
│   ├── Bootgly.php     ← a entity raiz do framework
│   ├── autoboot.php    ← autoboot do framework (requerido pelo launcher do kit)
│   ├── bootgly         ← o launcher da CLI do próprio framework
│   ├── composer.json
│   └── index.php
├── Console/            ← plataforma Console (instalada pelo wizard)
├── Web/                ← plataforma Web (instalada quando escolhida)
├── projects/           ← os SEUS projetos — instalado pelo `bootgly boot`
│   ├── Benchmark/      ← exportable: false — oculto do picker de importação
│   ├── Demo/           ← exportable: true — importável / atualizável pelo wizard
│   ├── Example/
│   └── Bootgly.projects.php   ← o registry consumer (allow-list, machine-managed)
├── public/             ← instalado pelo `bootgly boot`
├── scripts/            ← instalado pelo `bootgly boot`
├── storage/            ← instalado pelo `bootgly boot` (cache/, logs/, pids/)
├── tests/              ← instalado pelo `bootgly boot`
├── .gitignore
├── .gitmodules
├── LICENSE
├── README.md
├── bootgly             ← agora autoboota o Bootgly + Console (+ Web) pela cadeia condicional
├── composer.json
└── index.php
```

Tudo o que é seu vive no nível do workspace — `projects/`, `public/`, `storage/` — enquanto as plataformas permanecem intocadas dentro dos seus submodules. Quando um projeto existe tanto no seu `projects/` quanto no de uma plataforma, **a sua cópia vence no carregamento**: por isso re-importar um projeto de plataforma simplesmente atualiza a sua cópia.

## O wizard de projetos

O wizard te guia de um kit vazio até um projeto rodando:

1. **Plataformas** — a **plataforma base Bootgly** sempre vem incluída: não opinativa, ela traz as interfaces `CLI` e `WPI`. Aqui você multi-seleciona as **plataformas extras** com as dependências opinativas — `Console` (extras de CLI — apps TUI) e/ou `Web` (extras de WPI) — ou nenhuma, ficando só com a base. O wizard inicializa os submodules de plataforma correspondentes (`Console/`, `Web/`);
2. **Recursos** — ele executa o `bootgly boot` para instalar as pastas de recursos (`projects/`, `public/`, `scripts/`, `storage/`, `tests/`) no seu kit;
3. **Modo** — crie **do zero (from scratch)**, **importe a partir de projetos de Plataforma** (como os Demos que acompanham o framework) ou **importe de um remoto Git** (qualquer repositório com a assinatura de projeto Bootgly);
4. **Projeto** — do zero: escolha o caminho do projeto (ex.: `App` ou `App/API`), a interface (`CLI` ou `WPI`), porta, descrição, versão e autor. De projetos de Plataforma: apenas multi-selecione os projetos (Espaço marca, Enter confirma) — cada um é copiado sob o próprio caminho de plataforma, sem perguntas; cópias existentes são sinalizadas com `(overwrite)` e atualizadas. De um remoto Git: informe a URL do repositório, o caminho de destino e a interface — o repositório é clonado e validado (assinatura `*.project.php`);
5. **Confirmação** — revise o resumo (modo, importações com a plataforma de origem, overwrites) e confirme. Os projetos ficam em `projects/<Caminho>/` e são registrados em `projects/Bootgly.projects.php`.

Depois, inicie:

```bash
php bootgly project list
php bootgly project MyApp start
```

Você pode rodar o wizard novamente a qualquer momento com `php bootgly project create` — tudo que já estiver configurado é pulado.

### Não-interativo (CI / scripts / agentes de IA)

Todas as entradas do wizard existem como flags — com `--yes` (ou entrada via pipe) nada é perguntado:

```bash :toolbar="true";
php bootgly project create App/API --platform=web --from=scratch --interfaces=WPI --port=8080 --yes
```

Use `--from=Demo/HTTP_Server_CLI` para partir de um projeto de plataforma em vez de começar do zero. Veja a [Referência](#referencia) abaixo com todas as flags.

## Execute a CLI do Bootgly

Para garantir que tudo foi carregado corretamente, execute a tela inicial da CLI do Bootgly a partir do diretório do seu kit:

```bash :toolbar="true";
php bootgly
```

## Instale a CLI do Bootgly globalmente

Para usar `bootgly` como um comando global (e com `sudo` para portas privilegiadas), execute o comando de setup:

```bash :toolbar="true";
sudo php bootgly setup
```

Isso cria um script wrapper em `/usr/local/bin/bootgly` com o caminho absoluto do seu binário PHP, para funcionar corretamente com `sudo` (que reseta o PATH).

Após o setup, você pode usar `bootgly` diretamente de qualquer diretório:

```bash :toolbar="true";
bootgly help
```

Para desinstalar:

```bash :toolbar="true";
sudo bootgly setup --uninstall
```

## Anatomia de um projeto

No Bootgly, **Projetos** inicializam seus apps e servidores. Cada projeto é uma pasta dentro de `projects/` com um arquivo `<Leaf>.project.php` na raiz — esse arquivo é a **assinatura de projeto Bootgly** — retornando uma instância configurada de `Project`:

```php
use Bootgly\API\Projects\Project;
use Bootgly\API\Endpoints\Server\Modes;
use Bootgly\WPI\Nodes\HTTP_Server_CLI;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Events;

return new Project(
   name: 'MyApp',
   exportable: true,
   boot: function (array $arguments = [], array $options = []): void
   {
      $Server = new HTTP_Server_CLI(Mode: Modes::Daemon);
      $Server->configure(
         host: '0.0.0.0',
         port: 8080,
         workers: 2
      );
      $Server
         ->on(Events::RequestReceived, fn ($Request, $Response) => $Response(body: 'Hello, World!'))
         ->on(Events::ServerStarted, function ($Server) {
            // Chamado depois que o servidor começa a escutar
         });
      $Server->start();
   }
);
```

Isso é exatamente o que o wizard gera para um projeto `WPI` (mais um `router/` com uma rota de boas-vindas). Apenas caminhos de projeto registrados em `projects/Bootgly.projects.php` podem ser iniciados — o wizard registra por você.

## Namespaces de projeto

As classes do próprio projeto — controllers, models, resources, games — usam um **namespace simples que espelha o caminho do projeto**, sem o prefixo `projects\`. Uma classe em `projects/Blog/Controllers/Posts.php` declara:

```php
namespace Blog\Controllers;

class Posts { /* ... */ }
```

e é importada de qualquer lugar do projeto como:

```php
use Blog\Controllers\Posts;
```

O primeiro segmento é a raiz do projeto (`Blog`), correspondendo à pasta dentro de `projects/`. Caminhos aninhados também espelham as pastas — `projects/Demo/HTTP_Server_CLI/Models/DemoPost.php` → `namespace Demo\HTTP_Server_CLI\Models;`.

O Bootgly resolve essas classes por meio de um autoloader dedicado ancorado no **caminho absoluto do projeto iniciado** (`BOOTGLY_PROJECT->path`), de modo que um projeto continua funcionando quando vive como seu próprio repositório isolado — clonado ou importado em qualquer lugar, não apenas dentro do `projects/` do monorepo.

> [!NOTE]
> Arquivos de assinatura (`<Leaf>.project.php`) e arquivos de rota puros não declaram classe, então não têm namespace. Só carregam namespace os arquivos que declaram uma classe, função ou constante.

### Nomes reservados

O caminho de um projeto **não** pode começar com uma raiz de namespace de plataforma reservada — elas sombreariam os namespaces do framework e das plataformas que o autoloader controla:

- `Bootgly`, `Console`, `Web` — o framework e as plataformas atuais.
- `Data`, `Graphics`, `Embedded`, `Mobile` — reservados para plataformas futuras.

`php bootgly project create Web` (também `Web/App`, `console`, `MOBILE`, …) é rejeitado com uma mensagem clara — escolha um nome distinto como `Website` ou `MyWeb`.

## Importando projetos

Qualquer repositório git que carregue a assinatura de projeto (`*.project.php` na raiz) pode ser importado diretamente:

```bash :toolbar="true";
php bootgly project import https://github.com/foo/project1 Project1
```

O projeto é clonado, validado, copiado para `projects/Project1/` e registrado.

> [!WARNING]
> Projetos importados executam código de terceiros ao serem iniciados — o comando pede confirmação (pule com `--yes`).

## Vinculando a portas privilegiadas (80, 443)

Portas abaixo de 1024 exigem permissões especiais no Linux. Existem duas abordagens:

### Opção A: Usando sudo

Depois de executar `sudo php bootgly setup`, você pode iniciar o servidor com sudo:

```bash :toolbar="true";
sudo bootgly project MyApp start
```

Para produção, você pode combinar isso com **privilege dropping** — o servidor vincula à porta como root e depois troca para um usuário não privilegiado:

```php
$Server->configure(
   host: '0.0.0.0',
   port: 80,
   workers: 4,
   user: 'www-data', // Troca de privilégios após o bind
);
```

### Opção B: Capabilities do Linux (sem sudo)

Conceda ao PHP a capacidade de vincular portas privilegiadas sem root:

```bash :toolbar="true";
sudo php bootgly setup --capabilities
```

Isso executa `setcap cap_net_bind_service=+ep` no binário do PHP. Depois disso, qualquer servidor `bootgly` pode vincular a portas como 80 ou 443 sem sudo.

> [!WARNING]
> Isso se aplica a TODOS os scripts PHP do sistema, não apenas ao Bootgly.

## Habilitando HTTPS (SSL/TLS)

O Bootgly suporta TLSv1.2 e TLSv1.3 nativamente. Passe o parâmetro `secure` para o `configure()`:

```php
$Server->configure(
   host: '0.0.0.0',
   port: 443,
   workers: 4,
   secure: [
      'local_cert' => '/path/to/certificate.pem',
      'local_pk'   => '/path/to/private-key.pem',
      'verify_peer' => false,
   ],
   user: 'www-data', // Troca de privilégios após o bind
);
```

> [!NOTE]
> Para desenvolvimento local, o Bootgly inclui certificados autoassinados em `@/certificates/`. Para produção, use certificados de uma CA confiável (ex.: Let's Encrypt).

Um exemplo de projeto HTTPS pronto para uso está incluído em `projects/Demo/HTTPS_Server_CLI/`:

```bash :toolbar="true";
sudo bootgly project Demo/HTTPS_Server_CLI start
```