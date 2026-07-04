# Começando

O Bootgly tem **uma única maneira canônica** de começar: um único comando que instala tudo e abre o **wizard de projetos**.

```bash
curl -fsSL https://bootgly.com/install | bash
```

O instalador:

1. Verifica seu ambiente (`git` + PHP **8.4+**);
2. Clona o template inicial [bootgly.kit](https://github.com/bootgly/bootgly.kit) em `./bootgly.kit` (passe outro nome com `curl -fsSL https://bootgly.com/install | bash -s -- meudir`);
3. Inicializa a **plataforma Bootgly** (git submodule);
4. Abre o **wizard de projetos** (`php bootgly project create`).

## O wizard de projetos

O wizard te guia de um kit vazio até um projeto rodando:

1. **Plataforma** — escolha `Console` (apps CLI / TUI) ou `Web` (inclui o Console). O wizard inicializa os submodules de plataforma correspondentes (`Console/`, `Web/`);
2. **Recursos** — ele executa o `bootgly boot` para instalar as pastas de recursos (`projects/`, `public/`, `scripts/`, `storage/`, `tests/`) no seu kit;
3. **Modo** — crie **do zero (from scratch)** ou **importe um projeto de plataforma** (como os Demos que acompanham o framework);
4. **Projeto** — escolha o caminho do projeto (ex.: `App` ou `App/API`), a interface (`CLI` ou `WPI`), porta, descrição, versão e autor;
5. **Confirmação** — revise o resumo e confirme. O projeto é gerado em `projects/<Caminho>/` e registrado em `projects/Bootgly.projects.php`.

Depois, inicie:

```bash
php bootgly project list
php bootgly project MyApp start
```

Você pode rodar o wizard novamente a qualquer momento com `php bootgly project create` — tudo que já estiver configurado é pulado.

### Não-interativo (CI / scripts / agentes de IA)

Todas as entradas do wizard existem como flags — com `--yes` (ou entrada via pipe) nada é perguntado:

```bash
php bootgly project create App/API --platform=web --from=scratch --interfaces=WPI --port=8080 --yes
```

Use `--from=Demo/HTTP_Server_CLI` para partir de um projeto de plataforma em vez de começar do zero. Veja a [Referência](#referencia) abaixo com todas as flags.

## Configuração manual (git submodules)

Prefere fazer na mão? Use o [bootgly.kit](https://github.com/bootgly/bootgly.kit) como template do GitHub (ou clone), e então:

```bash
git clone https://github.com/bootgly/bootgly.kit
cd bootgly.kit
git submodule update --init Bootgly
php bootgly project create
```

O kit mantém as plataformas como git submodules — `Bootgly/` (o framework), `Console/` e `Web/` — e o wizard inicializa as opcionais sob demanda.

## Usando Composer (alternativa)

Se você precisa do Composer para gerenciar dependências externas:

```bash
composer create-project bootgly/bootgly.kit --stability=dev
cd bootgly.kit
php bootgly project create
```

As dependências são instaladas em `./@imports/` e carregadas pelo mesmo launcher `bootgly`.

## Execute a CLI do Bootgly

Para garantir que tudo foi carregado corretamente, execute a tela inicial da CLI do Bootgly a partir do diretório do seu kit:

```bash
php bootgly
```

## Instale a CLI do Bootgly globalmente

Para usar `bootgly` como um comando global (e com `sudo` para portas privilegiadas), execute o comando de setup:

```bash
sudo php bootgly setup
```

Isso cria um script wrapper em `/usr/local/bin/bootgly` com o caminho absoluto do seu binário PHP, para funcionar corretamente com `sudo` (que reseta o PATH).

Após o setup, você pode usar `bootgly` diretamente de qualquer diretório:

```bash
bootgly help
```

Para desinstalar:

```bash
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

## Importando projetos

Qualquer repositório git que carregue a assinatura de projeto (`*.project.php` na raiz) pode ser importado diretamente:

```bash
php bootgly project import https://github.com/foo/project1 Project1
```

O projeto é clonado, validado, copiado para `projects/Project1/` e registrado.

> [!WARNING]
> Projetos importados executam código de terceiros ao serem iniciados — o comando pede confirmação (pule com `--yes`).

## Vinculando a portas privilegiadas (80, 443)

Portas abaixo de 1024 exigem permissões especiais no Linux. Existem duas abordagens:

### Opção A: Usando sudo

Depois de executar `sudo php bootgly setup`, você pode iniciar o servidor com sudo:

```bash
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

```bash
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

```bash
sudo bootgly project Demo/HTTPS_Server_CLI start
```

## Referência

### Instalador

```bash
curl -fsSL https://bootgly.com/install | bash [-s -- <dir>]
```

Verifica `git` + PHP 8.4+, clona o `bootgly.kit` em `<dir>` (padrão `bootgly.kit`), inicializa o submodule `Bootgly` e abre o wizard de projetos em terminais interativos.

### `bootgly project create`

```bash
bootgly project create [<Name>] [options]
```

Cria um projeto. Em terminais interativos, o wizard preenche as entradas faltantes; com `--yes` (ou entrada via pipe) tudo vem das flags.

| Opção | Descrição |
|---|---|
| `--platform=console\|web` | Plataforma a configurar na primeira execução do kit (submodules + recursos). |
| `--from=scratch\|<source>` | Fonte da criação: do zero (padrão) ou um projeto de plataforma (ex.: `Demo/HTTP_Server_CLI`). |
| `--interfaces=CLI\|WPI` | Interface vinculada ao novo projeto (do zero; padrão `CLI`). |
| `--port=<port>` | Porta do servidor para projetos `WPI` (padrão `8080`). |
| `--description=`, `--version=`, `--author=` | Metadados do projeto (do zero). |
| `--default` | Marca o projeto como padrão de autoboot Web (WPI). |
| `--yes` | Pula confirmações (não-interativo). |

### `bootgly project import`

```bash
bootgly project import <url> [<Name>] [--interfaces=CLI|WPI] [--default] [--yes]
```

Clona `<url>` (git do sistema), valida a assinatura de projeto Bootgly (`*.project.php` na raiz do repositório), copia para `projects/<Name>/` (padrão: o nome do repositório) e registra.
