# Arquitetura

O Bootgly introduziu um jeito novo de desenvolver frameworks utilizando uma arquitetura própria chamada de **I2P (Interface-to-Platform)**.

Na arquitetura I2P, tudo começa com interfaces, que posteriormente dão origem a plataformas.

## Módulos explícitos

Em muitos frameworks, sistemas e apps, os módulos são definidos e separados de forma **implícita**: suas fronteiras ficam diluídas ao longo de vários arquivos e pastas, e a única forma de reconstruí-los é lendo o código.

No Bootgly, a separação de módulos é **explícita**: cada módulo é uma pasta, e cada pasta é nomeada pela sigla que identifica o seu módulo. Exemplos de módulos: `ABI`, `ACI`, `ADI`, `API`, `CLI` e `WPI`.

Duas regras visuais simples mantêm essa separação reconhecível à primeira vista:

- **Pastas de módulos do framework** começam com letra **maiúscula** — `ABI/`, `ACI/`, `ADI/`, `API/`, `CLI/`, `WPI/`;
- **Pastas de recursos** começam com letra **minúscula** — como `tests/`, que pode ser encontrada em vários locais do código.

É assim que a plataforma base se apresenta em disco:

```text
Bootgly/
├── ABI/          ← pasta de módulo (maiúscula)
├── ACI/
├── ADI/
├── API/
├── CLI/
├── WPI/
├── commands/     ← pasta de recurso (minúscula)
├── ABI.php
├── ACI.php
├── ADI.php
├── API.php
├── CLI.php
└── WPI.php
```

> [!NOTE]
> Toda pasta de módulo possui uma entidade de mesmo nível com o mesmo nome (`ABI/` → `ABI.php`). Essa é uma das regras organizacionais do Bootgly, detalhada na próxima página.

No Bootgly, esses módulos não são namespaces comuns: **cada módulo é uma Interface**, e as interfaces são o que define a própria arquitetura I2P.

## Interfaces

O conceito de "Interfaces" no Bootgly possui um significado bem claro e definido:

> "Interface é tudo o que conecta dois sistemas distintos, permitindo que eles se comuniquem, interajam ou troquem informações entre si."

### Significado

A palavra "interface" vem do latim "inter" (entre) e "facies" (face, aparência), o que significa "a superfície ou ponto de contato entre duas coisas"

O termo "interface" pode ser usado para se referir a qualquer coisa que une duas partes para comunicação. Uma interface é geralmente uma camada de abstração que permite que diferentes sistemas, componentes ou dispositivos se comuniquem de uma maneira padronizada, mesmo que tenham sido projetados independentemente.

Por exemplo, um sistema operacional possui uma interface de usuário (UI) que permite que os usuários interajam com o sistema. Esta interface é projetada para ser usada por pessoas, e oferece uma maneira padronizada para acessar diferentes recursos e funcionalidades do sistema. Aqui temos a seguinte interface:

`Pessoa <-UI-> Sistema`

Do mesmo modo, um programa no Front-end pode ter uma interface de programação de aplicativos (API) que permite que outra aplicação no Back-end se comunique com ele. Aqui podemos ter a seguinte interface:

`App (Client) <-API-> (Server) DB`

### Interfaces do Bootgly

No Bootgly, as interfaces base são:

- **ABI (Abstract Bootable Interface)** — Infraestrutura central de bootstrap: configs, manipulação de dados, IO, resources e o template engine. A base sobre a qual tudo é construído.
- **ACI (Abstract Common Interface)** — Utilitários compartilhados para observabilidade: benchmarking, sistema de eventos, logging e o framework de testes integrado.
- **ADI (Abstract Data Interface)** — Abstrações da camada de dados: conexões com banco de dados, operações de tabela e fundações de ORM.

- **API (Application Programming Interface)** — Orquestração de aplicação: componentes, endpoints, ambientes, projetos e gerenciamento de servidor. Bifurca em CLI e WPI.

- **CLI (Command Line Interface)** — Componentes de UI para terminal: alertas, menus, barras de progresso, tabelas e comandos interativos.
- **WPI (Web Programming Interface)** — Infraestrutura web: HTTP server, TCP server, TCP client — networking de alta performance do zero.

As interfaces seguem uma direção de dependência estrita — cada camada só pode depender das camadas que vêm antes dela:

`ABI → ACI → ADI → API → CLI → WPI`

```mermaid
graph TB
  ABI["ABI\nBootable"] --> ACI["ACI\nCommon"]
  ACI --> ADI["ADI\nData"]
  ADI --> API["API\nApplication"]
  API --> CLI["CLI\nCommand Line"]
  API --> WPI["WPI\nWeb Programming"]
  CLI -.-> WPI
```

A WPI vem depois da CLI na ordem de dependência, então ela também pode usar componentes da CLI (seta tracejada) — por exemplo, comandos de terminal para um servidor Web — enquanto a CLI nunca pode depender da WPI.

Na próxima página você poderá ver como as pastas das Interfaces estão estruturadas na plataforma base Bootgly e o que cada uma delas representa.

## Plataformas do Bootgly

Na arquitetura I2P, as interfaces dão origem a plataformas. Existem dois tipos de plataformas: **plataformas base** e **plataformas de trabalho**.

> As _plataformas base_ contêm um conjunto de Interfaces iniciais e as _plataformas de trabalho_ são constituídas por pelo menos uma Interface que existe em uma _plataforma base_.

### Plataforma base

O repositório `bootgly` representa a **plataforma base**. É onde estão as primeiras interfaces — as essenciais, usadas por todas as outras plataformas de trabalho:

`ABI`, `ACI`, `ADI`, `API`, `CLI` e `WPI`.

### Plataformas de trabalho

As plataformas de trabalho são **Console** e **Web**:

| Plataforma | Repositório       | Interface de origem |
| ---------- | ----------------- | ------------------- |
| Console    | `bootgly-console` | CLI                 |
| Web        | `bootgly-web`     | WPI                 |

Cada plataforma de trabalho nasce de pelo menos uma interface da plataforma base: a plataforma Console surge da interface `CLI`, e a plataforma Web surge da interface `WPI`.

As plataformas de trabalho podem conter suas próprias interfaces e os chamados "workables" (trabalháveis). Por exemplo, espera-se que a _plataforma Web_ tenha uma Interface chamada `API` — representando uma API Web — e um `workable` chamado `App`, contendo as dependências necessárias para formalizar um aplicativo Web dentro do Bootgly.

> [!NOTE]
> As interfaces das plataformas de trabalho ainda serão definidas — os repositórios `bootgly-console` e `bootgly-web` estão em estágio inicial de desenvolvimento.

```mermaid
graph TB
  subgraph Base["Plataforma Base"]
    Bootgly["bootgly\n(ABI + ACI + ADI + API + CLI + WPI)"]
  end
  subgraph Working["Plataformas de Trabalho"]
    Console["Plataforma Console\n(bootgly-console)"]
    Web["Plataforma Web\n(bootgly-web)"]
  end
  Bootgly -- CLI --> Console
  Bootgly -- WPI --> Web
```

No futuro poderá surgir uma outra interface chamada de "GUI" (Graphical User Interface), que poderá dar origem a uma outra plataforma chamada de "Graphical", que servirá para construções de aplicações gráficas utilizando o PHP.

## Interoperabilidade por Protocolo

O Bootgly fala os protocolos da web com o rigor das RFCs, mas não herda as abstrações de outros frameworks.

A interoperabilidade acontece em dois níveis diferentes, e o Bootgly trata cada um de um jeito:

- **Interoperabilidade de código** — contratos PHP compartilhados (como as PSRs) que permitem trocar componentes entre frameworks. O Bootgly não os segue: sua arquitetura, suas convenções de nomenclatura e suas interfaces são próprias.
- **Interoperabilidade de protocolo** — formatos de transmissão, padrões e RFCs que permitem ao Bootgly conversar com clientes, servidores, bancos de dados e ferramentas fora do framework. O Bootgly os segue à risca.

Em resumo: **interoperável no protocolo, soberano na arquitetura.**

### Por que não interoperabilidade de código?

Contratos de código compartilhados existem para que pacotes de terceiros se encaixem em um framework. O núcleo do Bootgly é livre de dependências por design, e tem exatamente uma forma canônica de fazer cada coisa (os dois princípios são explicados em [Por que Bootgly?](/manual/Bootgly/about/why/overview/)). Moldar suas interfaces em torno de abstrações externas adicionaria indireção e padrões concorrentes sem entregar ao núcleo nada de que ele precise.

Isso também deixa o Bootgly livre para projetar em função dos próprios objetivos — um runtime assíncrono nativo de event loop, os recursos da linguagem PHP 8.4 e a separação estrita de camadas descrita acima — sem comprometê-los para caber em contratos pensados para outras arquiteturas.

Na era do desenvolvimento assistido por IA, o custo de escrever um adaptador entre duas convenções de código é próximo de zero. O que costumava ser o argumento mais forte a favor de padrões de código — reaproveitar sem reescrever — perdeu boa parte do seu peso. Se algum dia for necessária uma ponte para outro ecossistema, ela pode ser construída rapidamente e mantida fora do núcleo do framework.

### Por que a interoperabilidade de protocolo é inegociável

O mundo externo não se adapta a um framework. Navegadores, proxies, bancos de dados, servidores de e-mail, autoridades certificadoras e sistemas de monitoramento falam protocolos estabelecidos, e o Bootgly precisa falá-los corretamente — não aproximadamente.

Protocolos que o Bootgly implementa nativamente, sem extensão de protocolo (como `pgsql`, `mysqli` ou `redis`) e sem pacote de terceiros:

- **HTTP/1.1** — semântica e framing das RFCs 9110 e 9112, incluindo parsing estrito blindado contra request smuggling
- **HTTP/2** — framing binário da RFC 9113, HPACK (RFC 7541), multiplexação de streams e controle de fluxo, negociado via ALPN sobre TLS ou por conhecimento prévio em texto claro (h2c)
- **WebSocket** — servidor e cliente da RFC 6455, com compressão `permessage-deflate` (RFC 7692)
- **Server-Sent Events** — respostas em streaming conforme o HTML Living Standard
- **TLS + ACME v2** — emissão e renovação automáticas de certificados conforme a RFC 8555 (desafio HTTP-01), com troca a quente nos workers em execução
- **PostgreSQL Frontend/Backend Protocol 3.0** — cliente de protocolo nativo com TLS, autenticação SCRAM-SHA-256 e o protocolo Extended Query
- **Protocolo cliente/servidor do MySQL** — cliente de protocolo nativo para MySQL e MariaDB, com TLS, `caching_sha2_password` e prepared statements binários
- **RESP2 / RESP3** — codec e cliente nativos do protocolo do Redis
- **SMTP** — cliente da RFC 5321 com STARTTLS ou TLS implícito e AUTH PLAIN, LOGIN e XOAUTH2, renderizando mensagens RFC 5322 / MIME
- **JWT / JWKS** — assinatura e verificação de tokens (RFC 7519) e JSON Web Key Sets (RFC 7517)
- **OpenTelemetry (OTLP/HTTP)** e **formato de exposição em texto do Prometheus** — exportação de métricas para pipelines de observabilidade padrão
- **TCP / UDP** — transportes nativos de cliente e servidor

> [!NOTE]
> "Nativamente" significa que o protocolo em si — framing, parsing, máquinas de estado e fluxos de autenticação — é escrito no Bootgly. Só as primitivas de criptografia e compressão vêm das extensões do próprio PHP: `openssl` para TLS e assinaturas, `zlib` para a compressão do WebSocket.

### Princípios de Design

- **Soberania**: o Bootgly define sua própria arquitetura, nomenclatura e interfaces em vez de herdar abstrações projetadas para outros frameworks.
- **Corretude na fronteira**: onde quer que o Bootgly encontre o mundo externo, ele segue a especificação com precisão. As regras do protocolo — framing, limites e tratamento de erros — são implementadas como especificadas, não aproximadas a partir do que os clientes mais comuns costumam tolerar.
- **Pontes fora do núcleo**: quando for necessária compatibilidade com outro ecossistema de código, ela é um adaptador que vive fora do núcleo do framework — nunca remodela as interfaces do núcleo.
