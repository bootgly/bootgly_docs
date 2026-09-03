# Começando

O Bootgly tem **uma única maneira canônica** de começar: um único comando que instala tudo e abre o **wizard de projetos**.

```bash :toolbar="true";
curl -fsSL https://bootgly.com/install | bash
```

O instalador:

1. Verifica seu ambiente (`git` + PHP **8.4+**);
2. Clona o template inicial [bootgly.kit](https://github.com/bootgly/bootgly.kit) em `./bootgly.kit` (passe outro nome com `curl -fsSL https://bootgly.com/install | bash -s -- meudir`);
3. Inicializa a **plataforma Bootgly** (git submodule);
4. Faz "boot" de [diretórios recurso](https://docs.bootgly.com/manual/Bootgly/basic/directory_structure/overview/#resource-dirs) (`bootgly kit boot`);
5. Opcionalmente instala a **CLI do Bootgly globalmente** (`php bootgly setup`) — assim todo comando funciona como `bootgly ...` em vez de `php bootgly ...`;
6. Abre o **wizard de projetos** (`php bootgly projects create`).

> **Rodar de novo é seguro.** Se a instalação foi interrompida em qualquer etapa, execute o mesmo comando novamente: quando o diretório alvo já é um checkout do Bootgly Kit, o instalador **retoma** — imprime um checklist do que já foi feito, inicializa o que falta (submodules, resources) e reabre o wizard (pulando-o quando um projeto já está registrado). O wizard só oferece as plataformas ainda não configuradas.

Um kit recém-clonado (`git clone`) contém apenas os arquivos do kit — todos os submodules de plataforma ficam **vazios** até serem instalados:

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
└── index.php           ← o front controller Web
```

O instalador inicializa a plataforma base obrigatória (`git submodule update --init Bootgly`); a primeira execução do wizard inicializa os submodules da plataforma escolhida e roda o `bootgly kit boot` para instalar as suas próprias pastas de recursos:

> **As plataformas caem em um release, não em um commit.** Depois de inicializar um submodule, o instalador o move para a tag mais nova alcançável a partir do pin do kit — um release estável quando existe, senão o pre-release mais novo. Ele nunca avança *além* do pin, então você nunca recebe uma plataforma com a qual o kit não foi construído. Quando um pin saiu de um release, a execução avisa (`Bootgly was pinned 1 commit past v1.0.0-beta.3 — checked out the release`), e o `git status` passa a mostrar aquele submodule como modificado: esse é o pin corrigido, não uma alteração sua — deixe como está. O kit não é seu para commitar; um `git submodule update` posterior devolve o submodule ao que o kit registra, e a próxima execução do instalador reaplica a correção.

```text
bootgly.kit/
├── Bootgly/            ← plataforma base (submodule instalado)
│   ├── @/              ← meta recursos do framework (certificados, análise estática, ...)
│   ├── Bootgly/        ← o framework em si — as interfaces I2P, em ordem de dependência:
│   │   ├── ABI/        ← Configs/ Data/ Debugging/ Differ/ Events/ IO/ Resources/ Syntax/ Templates/
│   │   ├── ACI/        ← Events/ Fakers/ Logs/ Observability/ Process/ Queues/ Schedule/ Tests/
│   │   ├── ADI/        ← Database/ Databases/ Table/ Validation/ Validators/
│   │   ├── API/        ← Endpoints/ Environment/ Projects/ Security/ Workables/
│   │   ├── CLI/        ← Commands/ Terminal/ UI/
│   │   ├── WPI/        ← Connections/ Endpoints/ Events/ Interfaces/ Modules/ Nodes/ Queues/
│   │   └── commands/   ← comandos built-in da CLI (demo, kit, projects, project, test, ...)
│   ├── configs/        ← configs do framework
│   ├── projects/       ← projects a nível de author — as fontes do import (Benchmark/, Demo/, Example/)
│   ├── scripts/        ← template de recursos usado pelo `bootgly kit boot`
│   ├── storage/        ← template de recursos usado pelo `bootgly kit boot`
│   ├── Bootgly.php     ← a entity raiz do framework
│   ├── autoboot.php    ← autoboot do framework (requerido pelo launcher do kit)
│   ├── bootgly         ← o launcher da CLI do próprio framework
│   ├── composer.json
│   └── index.php
├── Console/            ← plataforma Console (instalada pelo wizard)
├── Web/                ← plataforma Web (instalada quando escolhida)
├── projects/           ← 🏁 os SEUS projetos — cada um um repositório git próprio (registrados em `Bootgly.projects.php`)
├── scripts/            ← instalado pelo `bootgly kit boot`
├── storage/            ← instalado pelo `bootgly kit boot` (cache/, logs/, pids/)
├── .gitignore
├── .gitmodules
├── LICENSE
├── README.md
├── bootgly             ← agora autoboota o Bootgly + Console (+ Web) pela cadeia condicional
└── index.php
```

Tudo o que é seu vive no nível do workspace — `projects/`, `storage/` — enquanto as plataformas permanecem intocadas dentro dos seus submodules. Quando um projeto existe tanto no seu `projects/` quanto no de uma plataforma, **a sua cópia vence no carregamento**: por isso re-importar um projeto de plataforma simplesmente atualiza a sua cópia.

> **O kit é um veículo de entrega — os seus projetos são os repositórios.** Você nunca commita no kit: tudo o que os comandos do Bootgly escrevem na raiz dele (`projects/`, `scripts/`, `storage/`) é ignorado por ele, então o `git status` ali fica limpo e atualizar é `bootgly kit upgrade` (`bootgly kit downgrade` volta). Todo projeto que você cria **do zero** é **bootado** — nasce um repositório git próprio, com o scaffold como commit inicial; uma cópia de um exemplo embarcado chega sem boot, e `bootgly project <Name> boot` é o mesmo hook, sob demanda — e o **Composer é por projeto**: rode `composer require` dentro de `projects/<Name>/`; o framework carrega o `vendor/autoload.php` daquele projeto quando ele sobe. Os exemplos embarcados — os Demos do framework e os projetos de cada plataforma — são importados automaticamente quando o kit é preparado, como guias vivos para pessoas e agentes de IA; eles chegam sem boot (adote um com `project <Name> boot`), e um que você apagar continua apagado.

## O wizard de projetos

O cabeçalho dele nomeia o build que você está instalando — a versão do framework mais o commit de onde ela veio:

```text
Bootgly — New project wizard v1.0.0-beta.1-dev (39f53a89)
```

Toda instalação `dev-main` reporta a mesma versão, então é o **commit** que distingue duas instalações. Cite essa linha em relatórios de bug; quando uma tela parecer mais antiga do que a documentação descreve, é a primeira coisa a conferir (um kit com o pin do submodule atrasado instala um framework mais antigo — busque as tags dentro da plataforma, `git -C Bootgly fetch --tags`, e faça checkout do release mais novo para avançá-lo; evite o `--remote`, que salta para a ponta do branch e deixa você em trabalho de desenvolvimento não lançado). O commit é lido da própria instalação: os metadados git do checkout, ou a referência que o Composer resolveu. Fontes que não têm nenhum dos dois (um arquivo de release) mostram só a versão.

O wizard te guia de um kit vazio até um projeto rodando:

1. **Plataformas** — nada é perguntado: **todas as plataformas são configuradas**. A **plataforma base Bootgly** (não opinativa, traz as interfaces `CLI` e `WPI`) chega junto com as opinativas — `Console` (extras de CLI — apps TUI) e `Web` (extras de WPI) — e o wizard inicializa os submodules delas (`Console/`, `Web/`). Decidir o que usar fica para depois: o que você não quiser, apague; o que talvez queira, deixe parado;
2. **Recursos** — ele executa o `bootgly kit boot` para instalar as pastas de recursos (`projects/`, `scripts/`, `storage/`) no seu kit, e **todos os exemplos embarcados são importados automaticamente** — os Demos do framework mais os projetos de cada plataforma. Eles são os guias vivos do kit: `projects/Demo/` é onde você (e um agente de IA lendo o seu kit) consulta como se monta um projeto Bootgly;
3. **Modo** — três formas de começar, e a primeira não cria nada: **usar os projetos já importados das Plataformas** — o padrão, para ler, rodar ou copiar um deles —, **criar do zero (from scratch)** ou **importar de um remoto Git** (qualquer repositório com a assinatura de projeto Bootgly);
4. **Projeto** — do zero: escolha o caminho do projeto (ex.: `App` ou `App/API`), a interface (`CLI` ou `WPI`), porta, descrição, versão e autor. De um remoto Git: informe a URL do repositório, o caminho de destino e a interface — o repositório é clonado com o histórico completo e validado (assinatura `*.Project.php`);
5. **Confirmação** — revise o resumo e confirme. Os projetos ficam em `projects/<Caminho>/`, são registrados em `projects/Bootgly.projects.php`, e um projeto do zero é **bootado** — um repositório git próprio, com o scaffold como commit inicial.

Comece como começar, o wizard termina com um resumo e os comandos seguintes: o projeto que ele criou (caminho, interface, metadados e, quando você importou, de onde ele veio) nomeado em todas as dicas, ou — quando você escolheu ficar com o que já está lá — os projetos que o kit já tem, agrupados pela plataforma que os entrega.

Depois, inicie:

```bash
php bootgly projects list
php bootgly project MyApp start
```

Você pode rodar o wizard novamente a qualquer momento com `php bootgly projects create` — tudo que já estiver configurado é pulado.

### Não-interativo (CI / scripts / agentes de IA)

Todas as entradas do wizard existem como flags — com `--yes` (ou entrada via pipe) nada é perguntado:

```bash :toolbar="true";
php bootgly projects create App/API --platform=web --from=scratch --interfaces=WPI --port=8080 --yes
```

Use `--from=Demo/HTTP_Server_CLI` para partir de um projeto de plataforma em vez de começar do zero. Veja a [Referência](#referencia) abaixo com todas as flags.

## Execute a CLI do Bootgly

Para garantir que tudo foi carregado corretamente, execute a tela inicial da CLI do Bootgly a partir do diretório do seu kit:

```bash :toolbar="true";
php bootgly
```

## Instale a CLI do Bootgly globalmente

Para usar `bootgly` como um comando global, execute o setup como seu usuário comum a partir do diretório do Kit:

```bash :toolbar="true";
php bootgly setup
```

Isso cria um script wrapper em `/usr/local/bin/bootgly` com o caminho absoluto do seu binário PHP. O PHP e o código do Bootgly permanecem sem privilégios; o setup transmite o wrapper composto por um descritor privado já aberto e delega somente `install -m 0755 /dev/stdin /usr/local/bin/bootgly` via sudo quando necessário. Nenhum processo privilegiado reabre um caminho temporário controlado pelo chamador.

Em uma execução sem privilégios, o wrapper resolve o **launcher Bootgly confiável mais próximo acima do diretório de trabalho** e aceita um launcher do usuário atual ou do root, desde que seu caminho não possa ser substituído por outro usuário. Se nenhum for encontrado, usa o launcher do workspace ativo registrado durante o setup. O wrapper global recusa deliberadamente o usuário efetivo root — inclusive em `sudo bootgly` — com status 126 antes de selecionar um binário PHP ou launcher.

> [!WARNING]
> Não use `sudo bootgly`: o wrapper global é um comando de conveniência sem privilégios. Para um kit pertencente ao desenvolvedor, prefira capabilities do Linux ou um proxy reverso. Um serviço que realmente precise de root deve invocar o launcher absoluto de um deployment separado cuja árvore executável completa pertença ao root e não seja gravável por usuários não-root.

Após o setup, você pode usar `bootgly` diretamente de qualquer diretório:

```bash :toolbar="true";
bootgly help
```

Para desinstalar, mantenha o PHP sem privilégios e deixe o setup delegar somente a operação fixa de remoção quando necessário:

```bash :toolbar="true";
php bootgly setup --uninstall
```

## Anatomia de um projeto

No Bootgly, **Projetos** inicializam seus apps e servidores. Cada projeto é uma pasta dentro de `projects/` com um arquivo `<Leaf>.Project.php` na raiz — esse arquivo é a **assinatura de projeto Bootgly** — retornando uma instância configurada de `Project`:

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

As classes do próprio projeto — controllers, models, resources, games — usam um **namespace simples que espelha o caminho do projeto**, sem o prefixo `projects\`. Uma classe em `projects/Demo/Blog/Controllers/Posts.php` declara:

```php
namespace Demo\Blog\Controllers;

class Posts { /* ... */ }
```

e é importada de qualquer lugar do projeto como:

```php
use Demo\Blog\Controllers\Posts;
```

O primeiro segmento é a raiz do projeto (`Blog`), correspondendo à pasta dentro de `projects/`. Caminhos aninhados também espelham as pastas — `projects/Demo/HTTP_Server_CLI/Models/DemoPost.php` → `namespace Demo\HTTP_Server_CLI\Models;`.

O Bootgly resolve essas classes por meio de um autoloader dedicado ancorado no **caminho absoluto do projeto iniciado** (`BOOTGLY_PROJECT->path`), de modo que um projeto continua funcionando quando vive como seu próprio repositório isolado — clonado ou importado em qualquer lugar, não apenas dentro do `projects/` do monorepo.

> [!NOTE]
> Arquivos de assinatura (`<Leaf>.Project.php`) e arquivos de rota puros não declaram classe, então não têm namespace. Só carregam namespace os arquivos que declaram uma classe, função ou constante.

### Nomes reservados

O caminho de um projeto **não** pode começar com uma raiz de namespace de plataforma reservada — elas sombreariam os namespaces do framework e das plataformas que o autoloader controla:

- `Bootgly`, `Console`, `Web` — o framework e as plataformas atuais.
- `Data`, `Graphics`, `Embedded`, `Mobile` — reservados para plataformas futuras.

`php bootgly projects create Web` (também `Web/App`, `console`, `MOBILE`, …) é rejeitado com uma mensagem clara — escolha um nome distinto como `Website` ou `MyWeb`.

## Importando projetos

Qualquer repositório git que carregue a assinatura de projeto (`*.Project.php` na raiz) pode ser importado diretamente:

```bash :toolbar="true";
php bootgly projects import https://github.com/foo/project1 Project1
```

O projeto é clonado com o **histórico completo**, validado e colocado em `projects/Project1/` — `.git` e `origin` incluídos, então você continua commitando e dando push de lá — e registrado.

> [!WARNING]
> Projetos importados executam código de terceiros ao serem iniciados — o comando pede confirmação (pule com `--yes`).

## Vinculando a portas privilegiadas (80, 443)

Portas abaixo de 1024 exigem permissões especiais no Linux. Existem duas abordagens:

### Opção A: Usando sudo

Se um serviço realmente precisar iniciar como root antes de reduzir privilégios, invoque o launcher absoluto de um deployment pertencente ao root e não gravável por usuários não-root:

> [!WARNING]
> O wrapper global `bootgly` recusa EUID 0. O comando direto abaixo contorna esse wrapper de conveniência, então todo arquivo PHP que o deployment possa carregar — não apenas o launcher — deve ser controlado pelo root. Caso contrário, use a Opção B ou um proxy reverso.

```bash :toolbar="true";
sudo /caminho/para/php-do-root /caminho/para/bootgly-do-root project MyApp start
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
php bootgly setup --capabilities
```

O setup delega somente a operação fixa `setcap cap_net_bind_service=+ep`. Depois disso, qualquer servidor `bootgly` pode vincular a portas como 80 ou 443 sem sudo.

> [!WARNING]
> Isso se aplica a TODOS os scripts PHP do sistema, não apenas ao Bootgly.

Uma capability de arquivo também torna todo processo PHP **não-dumpable**: o kernel
entrega `/proc/<pid>/fd` ao `root`, então ferramentas que resolvem um socket até o
processo dono — `lsof -i`, `ss -p`, `fuser` — deixam de listar servidores PHP mesmo
para o usuário que os iniciou. O Bootgly não é afetado: `bootgly project <nome> stop`
identifica seu master pela tabela de locks do kernel (`/proc/locks`), que continua legível.

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
bootgly project Demo/HTTPS_Server_CLI start
```

Esse comando exato sem privilégios precisa da capability do Linux da Opção B para vincular a porta 443. Um gerenciador de serviços usando um deployment separado e controlado pelo root é uma alternativa operacional, não uma permissão concedida a esse comando.
