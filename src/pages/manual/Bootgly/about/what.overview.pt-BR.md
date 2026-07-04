# O que é Bootgly?

Bootgly é o **framework PHP nativo e sem dependências**: um único núcleo assíncrono que serve tanto a **Web** quanto o **Console (CLI)**. Seu servidor HTTP é um processo de longa duração com event loop escrito em PHP puro — Fibers para I/O não bloqueante, sem Nginx ou PHP-FPM na frente, sem extensões em C.

O Bootgly também é o primeiro framework PHP construído sobre a arquitetura **I2P (Interface-to-Platform)**: seis interfaces em camadas com direção de dependência estrita e unidirecional, em que as interfaces de topo dão origem às plataformas — `CLI` cria a plataforma **Console** e `WPI` cria a plataforma **Web**. As camadas em si são cobertas em [Arquitetura](/manual/Bootgly/basic/architecture/overview/).

Na prática, o ecossistema são três repositórios: [`bootgly`](https://github.com/bootgly/bootgly) é a **plataforma base** com as interfaces compartilhadas, enquanto as **plataformas de trabalho** — **Console** ([`bootgly-console`](https://github.com/bootgly/bootgly-console)) e **Web** ([`bootgly-web`](https://github.com/bootgly/bootgly-web)) — são os pontos de partida para os seus próprios projetos.

## O que vem na caixa

Cada item abaixo é código próprio — o núcleo tem **zero dependências de terceiros em runtime**:

- **HTTP** — HTTP/1.1 e HTTP/2 nativo (HPACK, multiplexação, ALPN), TLS, router baseado em generators com cache de resposta por rota, e um cliente HTTP assíncrono;
- **WebSockets** — servidor e cliente, RFC 6455, canais e broadcast, compressão permessage-deflate;
- **TCP / UDP** — servidores e clientes de socket raw para protocolos customizados;
- **Dados** — DBAL PostgreSQL assíncrono com pool de conexões, Query Builder, Schema Builder, migrations, seeders, ORM (Data Mapper) e réplicas de leitura;
- **Segurança** — CORS, CSRF com masking de token, rate limiting de janela deslizante, secure headers, trusted proxies, JWT (HS256/RS256/JWKS), autorização RBAC e sessões server-side;
- **Testes** — suites, assertions expressivas, doubles Mock/Spy/Fake, cobertura de código, snapshots e fakers determinísticos;
- **CLI** — sistema de comandos, I/O de terminal ANSI e componentes de UI: Progress, Table, Menu, Alert, Logs;
- **Operações** — cache (File, APCu, memória compartilhada, Redis), storage (Local, Memory, compatível com S3), filas, scheduler, eventos, logging e observabilidade com exportadores JSON, Prometheus e OTLP;
- **Templates** — template engine nativo com diretivas e iteradores.

## Requisitos e status

- **PHP ≥ 8.4** — Opcache + JIT recomendados (até +50% de performance);
- **Licença** — MIT;
- **Sistema operacional** — Linux nativo; Windows e outros sistemas via Docker.

> [!WARNING]
> O Bootgly está em **beta**, estabilizando rumo à 1.0. Fixe uma versão e espere algumas mudanças de API antes do release estável — ainda não é recomendado para uso em produção.

## Próximos passos

- **[Por que Bootgly?](/manual/Bootgly/about/why/overview/)** — os problemas que ele resolve e a prova por trás disso;
- **[Arquitetura](/manual/Bootgly/basic/architecture/overview/)** — as camadas I2P em profundidade;
- **[Primeiros passos](/guide/getting-started/overview/)** — seu primeiro servidor HTTP em quatro comandos;
- **[Bootgly vs outros runtimes](/manual/WPI/HTTP/HTTP_Server_CLI/vs/)** — matriz de features e benchmarks contra Swoole, Hyperf, ReactPHP, AMPHP e stacks Laravel.
