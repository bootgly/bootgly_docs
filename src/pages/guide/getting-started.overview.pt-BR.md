# Começando

Para começar a utilizar o Bootgly a partir de um starter kit, você deverá utilizar um dos [repositórios templates](/manual/Bootgly/concepts/github-repositories/overview) do Bootgly:

- [bootgly.console](https://github.com/bootgly/bootgly.console)
- [bootgly.web](https://github.com/bootgly/bootgly.web)

Por enquanto, a utilização do Composer é opcional e você poderá utilizar somente o Git para compor os submódulos "bootáveis" do Bootgly e já começar a desenvolver!

## Templating

Segue abaixo tutoriais para baixar o boilerplate utilizando o Composer ou o Git/Github.

### Opção 1): Utilizando o Composer

Se você precisa do Composer para compor alguma dependência externa ou possui uma preferência por ele, dê o comando `create-project` para baixar e já instalar todas as dependências:

#### Bootgly Console

Se você quer desenvolver apenas para o CLI, baixe o skeleton do Console:

```bash
composer create-project bootgly/bootgly.console bootgly.console
```

#### Bootgly Web

Se você quer desenvolver para o CLI e para o WPI, baixe o starter kit da Web, que já vem com o Console junto:

```bash
composer create-project bootgly/bootgly.web bootgly.web
```

### Opção 2): Utilizando o Git submodule

Comece utilizando o `Github Templating` para criar outro repositório a partir do repositório template (modelo) e depois faça um `git clone` do repositório gerado.

Se você não pretende utilizar o Composer ainda, apenas dê o comando abaixo no seu terminal para baixar recursivamente os submódulos que estão listados no arquivo `.gitmodules` do repositório modelo:

```bash
git submodule update --init --recursive
```

## Execute o Bootgly CLI

Para se certificar que tudo foi carregado corretamente, ainda no terminal, mude o diretório de trabalho para a pasta que foi gerada e utilize o comando abaixo para executar a tela inicial do Bootgly CLI:

```bash
php bootgly
```

## Instalar Bootgly CLI globalmente

Para usar `bootgly` como comando global (e com `sudo` para portas privilegiadas), execute o comando de setup:

```bash
sudo php bootgly setup
```

Isso cria um wrapper script em `/usr/local/bin/bootgly` com o caminho absoluto do seu binário PHP, garantindo que funcione corretamente com `sudo` (que redefine o PATH).

Após o setup, você pode usar `bootgly` diretamente de qualquer diretório:

```bash
bootgly help
```

Para desinstalar:

```bash
sudo bootgly setup --uninstall
```

## Iniciar um Servidor HTTP

No Bootgly, **Projetos** iniciam servidores. Cada projeto é um arquivo PHP que cria e configura uma instância de servidor.

Crie um arquivo `HTTP_Server_CLI.project.php` dentro da pasta do seu projeto (ex: `projects/HTTP_Server_CLI/`):

```php
use Bootgly\API\Projects\Project;
use Bootgly\WPI\Endpoints\Servers\Modes;
use Bootgly\WPI\Nodes\HTTP_Server_CLI;

return new Project(
   name: 'HTTP Server CLI',
   boot: function (): void
   {
      $Server = new HTTP_Server_CLI(Mode: Modes::Daemon);
      $Server->configure(
         host: '0.0.0.0',
         port: 8082,
         workers: 4
      );
      $Server->handle(function ($Request, $Response, $Router) {
         return $Response(body: 'Hello, World!');
      });
      $Server->start();
   }
);
```

Então execute o projeto:

```bash
bootgly project run HTTP_Server_CLI
```

O servidor iniciará escutando em `0.0.0.0:8082`. Veja a documentação do [HTTP Server CLI](/manual/WPI/HTTP/HTTP_Server_CLI) para a referência completa de configuração e arquitetura.

## Vinculando a portas privilegiadas (80, 443)

Portas abaixo de 1024 requerem permissões especiais no Linux. Existem duas abordagens:

### Opção A: Usando sudo

Após executar `sudo php bootgly setup`, você pode iniciar o servidor com sudo:

```bash
sudo bootgly project run HTTP_Server_CLI
```

Para produção, você pode combinar com **privilege dropping** — o servidor faz o bind na porta como root, depois rebaixa para um usuário sem privilégios:

```php
$Server->configure(
   host: '0.0.0.0',
   port: 80,
   workers: 4,
   user: 'www-data', // Rebaixa privilégios após o bind
);
```

### Opção B: Linux capabilities (sem sudo)

Conceda ao PHP a capacidade de fazer bind em portas privilegiadas sem root:

```bash
sudo php bootgly setup --capabilities
```

Isso executa `setcap cap_net_bind_service=+ep` no binário PHP. Depois disso, qualquer servidor Bootgly pode usar portas como 80 ou 443 sem sudo.

> **Nota:** Isso se aplica a TODOS os scripts PHP no sistema, não apenas ao Bootgly.

## Habilitando HTTPS (SSL/TLS)

O Bootgly suporta TLSv1.2 e TLSv1.3 nativamente. Passe o parâmetro `ssl` para `configure()`:

```php
$Server->configure(
   host: '0.0.0.0',
   port: 443,
   workers: 4,
   ssl: [
      'local_cert' => '/caminho/para/certificado.pem',
      'local_pk'   => '/caminho/para/chave-privada.pem',
      'verify_peer' => false,
   ],
   user: 'www-data', // Rebaixa privilégios após o bind
);
```

Para desenvolvimento local, o Bootgly inclui certificados auto-assinados em `@/certificates/`. Para produção, use certificados de uma CA confiável (ex: Let's Encrypt).

Um exemplo de projeto HTTPS pronto para uso está incluído em `projects/HTTPS_Server_CLI/`:

```bash
sudo bootgly project run HTTPS_Server_CLI
```
