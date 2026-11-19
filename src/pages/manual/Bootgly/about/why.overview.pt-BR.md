# Por que Bootgly?

Porque a stack PHP moderna virou um imposto — e a aposta do Bootgly é que você não deveria ter que pagá-lo.

Esta página explica os problemas que o Bootgly existe para resolver, como o seu design responde a eles, os números que sustentam as afirmações e — igualmente importante — os trade-offs dessa aposta.

## O problema

Deixar o PHP rápido e sustentável hoje normalmente custa em quatro frentes:

1. **Adaptadores externos demais** — para ter performance, times empilham Nginx na frente, PHP-FPM atrás, supervisores em volta e extensões em C (Swoole, event loops) por baixo. Cada peça extra é mais uma coisa para configurar, monitorar, atualizar e adaptar — e pagar;
2. **Superfície de supply chain** — uma aplicação típica coloca centenas de pacotes do `vendor/` em produção. Cada um tem autor, estilo, cadência de release e vulnerabilidades próprias para acompanhar. O tempo de reação a patches fica limitado pelo terceiro mais lento;
3. **Flexibilidade demais no Code API (mais de um caminho canônico)** — servidores, ORMs, template engines e stacks de teste concorrentes fazem cada projeto começar com uma rodada de escolhas de ferramentas, cada onboarding começar do zero, e o código gerado por IA chutar entre padrões;
4. **Teto de evolução e de performance** — derivado dos dois primeiros: cada peça externa da qual a stack depende é uma fronteira à qual o framework precisa se adaptar, então cada melhoria ou recurso novo espera o que essas peças permitem, e toda requisição atravessa essas camadas de adaptação — é aí que se formam os grandes gargalos de performance.

## A resposta do Bootgly

O Bootgly responde a cada um desses custos com uma decisão deliberada de design:

**Um runtime nativo, sem adaptadores externos.** O servidor HTTP é um processo de longa duração com event loop, escrito em PHP puro — Fibers para I/O não bloqueante, sem Nginx ou PHP-FPM na frente, sem supervisor em volta, sem extensões em C por baixo. O Bootgly roda e supervisiona os próprios workers: reloads graciosos, reciclagem de workers, health checks e certificados HTTPS ([Auto-TLS](/guide/auto-tls/overview/)) fazem parte do mesmo processo. É uma coisa só para configurar, monitorar e atualizar, e nada no meio para adaptar.

**Dependência mínima.** O núcleo tem zero pacotes de terceiros em runtime: servidor, router, ORM, sessões, cache e framework de testes são código próprio, projetados juntos. Isso significa integração full-stack, uma superfície de supply chain muito menor para auditar, e tempo de reação a patches que depende só do próprio Bootgly. Por design, isso vale também para os contratos de código: o Bootgly segue as próprias convenções em vez de implementar os contratos de código compartilhados do PHP (PSRs), então há um contrato canônico para cada assunto. Código próprio não significa fechado: onde quer que o Bootgly encontre o mundo externo — HTTP/2, WebSocket, PostgreSQL, MySQL, Redis, SMTP — ele fala o protocolo nativamente e conforme a especificação ([Interoperabilidade por Protocolo](/manual/Bootgly/basic/architecture/overview/#interoperabilidade-por-protocolo)). Veja [O que vem na caixa](/manual/Bootgly/about/what/overview/) para o inventário concreto.

**Um único caminho canônico.** Existe exatamente uma forma de fazer cada coisa — um servidor HTTP, um schema de configuração, um autoloader, um framework de testes, um template engine. Quando você pergunta "como faço X no Bootgly?", há uma resposta. O onboarding acelera, os reviews aceleram, e o desenvolvimento assistido por IA fica preciso, porque não há ambiguidade sobre qual ferramenta ou padrão usar. A mesma regra faz o Bootgly ser **Linux nativo**: adaptá-lo por completo a outros sistemas significaria um segundo jeito de fazer coisas centrais. O Windows não tem as extensões nativas do PHP para processos (`pcntl`, `posix`), e o volume padrão do macOS não diferencia maiúsculas de minúsculas, então a pasta da plataforma `Bootgly/` e o launcher `bootgly` não convivem lado a lado. Use WSL2 ou Docker no Windows, e um volume case-sensitive no macOS (para desenvolvimento).

**Sem teto de adaptação.** As duas decisões acima removem as fronteiras que limitam uma stack montada com peças externas. Sem nada de fora para adaptar, uma melhoria ou um recurso novo sai quando o Bootgly o constrói, e uma requisição percorre um hot path projetado de ponta a ponta — do socket à resposta — em vez de atravessar camadas de adaptação. Os números abaixo são o resultado.

**Um núcleo, duas plataformas.** A arquitetura I2P (Interface-to-Platform) organiza o framework em seis interfaces com direção de dependência estrita e unidirecional — a mesma fundação serve as plataformas **Console** e **Web**, então uma ferramenta CLI e uma API HTTP compartilham componentes em vez de duplicá-los. As camadas são cobertas em profundidade em [Arquitetura](/manual/Bootgly/basic/architecture/overview/).

## Prova, não promessas

Todos os números abaixo vêm de execuções publicadas e reproduzíveis — linhas HTTP medidas em 2026-10-29 em 24 CPUs lógicas (Fedora 44, mitigações do kernel desligadas), PHP 8.5.12, 514 conexões, rotas no estilo TechEmpower (Laravel + PHP-FPM da sessão de 2026-07-04):

| Cenário | Bootgly | Referência | Δ |
|---|---|---|---|
| HTTP plaintext | 1.100.393 req/s | Swoole — 1.086.952 req/s | +1,2% |
| HTTP query única no banco | 133.882 req/s | Swoole — 71.843 req/s | +86,4% |
| HTTP plaintext | 1.100.393 req/s | Laravel + PHP-FPM — 6.959 req/s | ~158× |
| WebSocket echo (32B) | 873.804 msg/s | Conformidade Autobahn: 462 aprovados / 0 falhos | — |
| Progress bar na CLI | ~7× | Progress bar do Laravel / Symfony | — |
| Template engine (`foreach`) | ~9× | Laravel Blade | — |

Mesmo hardware, mesma data, scripts reproduzíveis — leia a metodologia antes de citar esses números:

- **[Bootgly vs outros runtimes](/manual/WPI/HTTP/HTTP_Server_CLI/vs/)** — matriz completa contra Swoole, Hyperf, ReactPHP, AMPHP e stacks Laravel;
- **[Repositório de benchmarks](https://github.com/bootgly/bootgly_benchmarks)** — scripts, imagens Docker e relatórios publicados.

## Os trade-offs

Honestidade faz parte da aposta. Escolher construir tudo como código próprio tem custos reais:

- **Features demoram mais para sair** — construir um componente nativo é mais lento do que plugar um pacote de terceiro, então o roadmap avança deliberadamente;
- **Suporte contínuo** — a `1.0` não é uma linha de suporte de longo prazo: as correções saem apenas como patch release da minor mais recente (com a `X.Y` atual, na `X.Y.Z`), sem backport para minors anteriores, então manter-se atualizado faz parte do acordo (veja [Versionamento](/guide/versioning/overview/));
- **Ecossistema jovem** — não existe um marketplace de pacotes da comunidade; o que o núcleo não traz, você constrói.

O Bootgly provavelmente **não** é a escolha certa hoje se você precisa de um grande ecossistema de pacotes prontos, de estabilidade com suporte de longo prazo em produção agora, ou de execução nativa no Windows. Se essas são as suas restrições, um framework full-stack tradicional vai te servir melhor — e a página de comparação acima se mantém honesta sobre isso.

## Próximos passos

- **[O que é Bootgly?](/manual/Bootgly/about/what/overview/)** — identidade, inventário e requisitos;
- **[Primeiros passos](/guide/getting-started/overview/)** — de um diretório vazio a um projeto rodando;
- **[Arquitetura](/manual/Bootgly/basic/architecture/overview/)** — as camadas I2P em profundidade.
