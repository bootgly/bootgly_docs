# Projetos

O Bootgly organiza aplicações como **projetos** — diretórios autocontidos dentro de `projects/` que contêm um ou mais arquivos de boot. Cada projeto declara seus metadados (name, description, version, author) e uma Closure de boot que inicializa a aplicação.

Os projetos são gerenciados inteiramente através do comando CLI `project`, que fornece subcomandos para listar, executar, parar, inspecionar e fazer hot-reload de projetos.

## Estrutura de um projeto

Um projeto é um diretório dentro de `projects/` com um arquivo de boot. O arquivo de boot segue a convenção de nomenclatura `{project_folder_name}.project.php` — o nome do arquivo deve corresponder ao nome da pasta do projeto.

Por exemplo, um projeto na pasta `Sample_Project` deve ter seu arquivo de boot nomeado como `Sample_Project.project.php`:

```
projects/
├── WPI.projects.php
├── CLI.projects.php
├── Sample_Project/
│   └── Sample_Project.project.php
└── Another_Project/
    └── Another_Project.project.php
```

### Exemplo de arquivo de boot

Cada arquivo de boot retorna uma instância de `Project` com metadados e uma Closure de boot:

```php
use Bootgly\API\Projects\Project;

return new Project(
   name: 'Projeto Genérico',
   description: 'Um exemplo genérico de projeto Bootgly',
   version: '1.0.0',
   author: 'Seu Nome',

   boot: function (array $arguments = [], array $options = []): void
   {
      // Inicialize e execute sua aplicação aqui
   }
);
```

A classe `Project` aceita as seguintes propriedades:

| Propriedade | Tipo | Descrição |
|-------------|------|-----------|
| `name` | string | Nome de exibição do projeto |
| `description` | string | Breve descrição |
| `version` | string | Versão semântica |
| `author` | string | Nome do autor |
| `boot` | Closure | A função de boot que inicializa a aplicação |

### Arquivos de índice de interface

Cada interface possui um arquivo de índice na raiz de `projects/` que lista os projetos pertencentes àquela interface:

**`WPI.projects.php`** — projetos Web (servidores HTTP, TCP, etc.):

```php
<?php
return [
   'HTTP_Server_CLI',
   'TCP_Server_CLI',
   'TCP_Client_CLI'
];
```

**`CLI.projects.php`** — projetos CLI:

```php
<?php
return [
   'Demo_CLI'
];
```

Quando `bootgly project list` é executado, esses índices são lidos para determinar a(s) interface(s) de cada projeto.

## O comando `project`

O comando `project` é a ferramenta central para gerenciar projetos Bootgly. Execute `php bootgly project` para ver todos os subcomandos disponíveis:

```mermaid
graph LR
  project["php bootgly project"]
  project --> list["list"]
  project --> run["run"]
  project --> stop["stop"]
  project --> show["show"]
  project --> reload["reload"]
  project --> restart["restart"]
  project --> info["info"]
```

### `project list`

Descobre e lista todos os projetos no diretório `projects/`, mostrando suas interfaces (CLI, WPI ou ambas) e marcando o projeto padrão:

```bash
php bootgly project list
```

Exemplo de saída:

```
 Project list:

 #1  - Projeto Generico (projects/Sample_Project) [CLI]
    Exemplo generico de projeto para a documentacao do Bootgly

 #2  - Outro Projeto (projects/Another_Project) [WPI]
```

### `project start`

Inicializa um projeto pelo nome:

```bash
# Executar um projeto específico
php bootgly project start Sample_Project

# Executar outro projeto
php bootgly project start Another_Project

# Executar em modo interativo
php bootgly project start Sample_Project -i

# Executar em modo monitor
php bootgly project start Sample_Project -m
```

Você pode inverter a ordem dos argumentos para ter as duas opções de passar subcomandos para um mesmo projeto ou passar vários projetos para um mesmo subcomando:

```bash
# Executar um projeto específico
php bootgly project Sample_Project run
# Executar outro projeto
php bootgly project Another_Project run
# Executar em modo interativo
php bootgly project Sample_Project run
# Parar o mesmo projeto
php bootgly project Sample_Project stop
```

Opções disponíveis:

| Opção | Descrição |
|-------|-----------|
| `-d` | Executar em modo daemon (padrão) |
| `-i` | Executar em modo interativo |
| `-m` | Executar em modo monitor |

### `project stop`

Para um projeto em execução enviando SIGTERM ao processo master. Se o processo não terminar em 5 segundos, envia SIGKILL:

```bash
# Parar um projeto específico
php bootgly project stop Sample_Project
```

### `project show`

Mostra o status atual de um projeto em execução, incluindo PID, workers, endereço e uptime:

```bash
php bootgly project show Sample_Project
```

Exemplo de saída:

```
┌─ Project Status ────────────────────┐
│ Project        Sample_Project       │
│ Type           CLI                  │
│ Status         running              │
│ Master PID     12345                │
│ Workers        11/11                │
│ Address        -                    │
│ Uptime         2h 15m 30s           │
└─────────────────────────────────────┘
```

### `project reload`

Envia um sinal de hot-reload (SIGUSR2) a um projeto em execução, permitindo que ele recarregue seu código sem um restart completo:

```bash
php bootgly project reload Sample_Project
```

### `project restart`

Para e depois inicia o projeto novamente. Aceita as mesmas opções que `project start`:

```bash
php bootgly project restart Sample_Project
```

### `project info`

Exibe metadados detalhados sobre um projeto em um Fieldset:

```bash
php bootgly project info Sample_Project
```

Exemplo de saída:

```
┌─ Project Info ──────────────────────────────────────────────────────┐
│ Name           Projeto Generico                                    │
│ Folder         Sample_Project                                      │
│ Description    Um exemplo generico de projeto Bootgly              │
│ Version        0.1.0                                               │
│ Author         Seu Nome                                            │
│ Interfaces     CLI                                                 │
│ Path           /path/to/projects/Sample_Project                    │
└─────────────────────────────────────────────────────────────────────┘
```

## Ciclo de vida de um projeto

O ciclo de vida típico de um projeto segue este fluxo:

```mermaid
graph TB
  Create["Criar diretório do projeto\ncom arquivo de boot"] --> Register["Registrar no índice\nda interface"]
  Register --> Run["Executar projeto"]
  Run --> Show["Monitorar status"]
  Show --> Reload["Hot-reload de alterações"]
  Reload --> Show
  Show --> Restart["Reiniciar se necessário"]
  Restart --> Show
  Show --> Stop["Parar projeto"]
```

1. **Criar** um diretório em `projects/` com um arquivo de boot `*.project.php`;
2. **Registrar** no arquivo de índice da interface (`WPI.projects.php` ou `CLI.projects.php`);
3. **Executar** com `project start`;
4. **Monitorar** seu status com `project show`;
5. **Recarregar** alterações de código com `project reload` (envia SIGUSR2);
6. **Reiniciar** completamente se necessário com `project restart`;
7. **Parar** com `project stop`.

## Projetos built-in

O Bootgly vem com vários projetos de exemplo no diretório `projects/`:

| Projeto | Interface | Descrição |
|---------|-----------|-----------|
| `Demo_CLI` | CLI | Demo interativo de CLI para componentes de terminal (22 demos) |
| `HTTP_Server_CLI` | WPI | Demo de HTTP server com roteamento estático/dinâmico e catch-all 404 |
| `TCP_Server_CLI` | WPI | TCP server raw com workers configuráveis |
| `TCP_Client_CLI` | CLI | Benchmark de TCP client (teste de stress write/read) |