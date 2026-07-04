# Por que Bootgly?

Porque a stack PHP moderna virou um imposto — e a aposta do Bootgly é que você não deveria ter que pagá-lo.

Esta página explica os problemas que o Bootgly existe para resolver, como o seu design responde a eles, os números que sustentam as afirmações e — igualmente importante — os trade-offs dessa aposta.

## O problema

Deixar o PHP rápido e sustentável hoje normalmente custa em três frentes:

1. **Infra inchada** — para ter performance, times empilham Nginx na frente, PHP-FPM atrás, supervisores em volta e extensões em C (Swoole, event loops) por baixo. Cada peça extra é mais uma coisa para configurar, monitorar, atualizar — e pagar;
2. **Superfície de supply chain** — uma aplicação típica coloca centenas de pacotes do `vendor/` em produção. Cada um tem autor, estilo, cadência de release e vulnerabilidades próprias para acompanhar. O tempo de reação a patches fica limitado pelo terceiro mais lento;
3. **Jeitos demais de fazer tudo** — servidores, ORMs, template engines e stacks de teste concorrentes fazem cada projeto começar com uma rodada de decisões de encanamento, cada onboarding começar do zero, e o código gerado por IA chutar entre padrões.

## A resposta do Bootgly

O Bootgly ataca os três custos diretamente, com três decisões deliberadas de design:

**Um único caminho canônico.** Existe exatamente uma forma de fazer cada coisa — um servidor HTTP, um schema de configuração, um autoloader, um framework de testes, um template engine. Quando você pergunta "como faço X no Bootgly?", há uma resposta. O onboarding acelera, os reviews aceleram, e o desenvolvimento assistido por IA fica preciso, porque não há ambiguidade sobre qual ferramenta ou padrão usar.

**Dependência mínima.** O núcleo tem zero pacotes de terceiros em runtime: servidor, router, ORM, sessões, cache e framework de testes são código próprio, projetados juntos. Isso significa integração full-stack, uma superfície de supply chain muito menor para auditar, e tempo de reação a patches que depende só do próprio Bootgly. Veja [O que vem na caixa](/manual/Bootgly/about/what/overview/) para o inventário concreto.

**Um núcleo, duas plataformas.** A arquitetura I2P (Interface-to-Platform) organiza o framework em seis interfaces com direção de dependência estrita e unidirecional — a mesma fundação serve as plataformas **Console** e **Web**, então uma ferramenta CLI e uma API HTTP compartilham componentes em vez de duplicá-los. As camadas são cobertas em profundidade em [Arquitetura](/manual/Bootgly/basic/architecture/overview/).

## Prova, não promessas

Todos os números abaixo vêm de execuções publicadas e reproduzíveis — medidos em 2026-07-04 em 24 CPUs lógicas (WSL2), PHP 8.4.22, 514 conexões, rotas no estilo TechEmpower:

| Cenário | Bootgly | Referência | Δ |
|---|---|---|---|
| HTTP plaintext | 1.030.930 req/s | Swoole — 964.908 req/s | +7,3% |
| HTTP query única no banco | 166.746 req/s | Swoole — 95.718 req/s | +93,8% |
| HTTP plaintext | 1.030.930 req/s | Laravel + PHP-FPM — 6.959 req/s | ~148× |
| WebSocket echo (32B) | 873.804 msg/s | Conformidade Autobahn: 462 aprovados / 0 falhos | — |
| Progress bar na CLI | ~7× | Progress bar do Laravel / Symfony | — |
| Template engine (`foreach`) | ~9× | Laravel Blade | — |

Mesmo hardware, mesma data, scripts reproduzíveis — leia a metodologia antes de citar esses números:

- **[Bootgly vs outros runtimes](/manual/WPI/HTTP/HTTP_Server_CLI/vs/)** — matriz completa contra Swoole, Hyperf, ReactPHP, AMPHP e stacks Laravel;
- **[Repositório de benchmarks](https://github.com/bootgly/bootgly_benchmarks)** — scripts, imagens Docker e relatórios publicados.

## Os trade-offs

Honestidade faz parte da aposta. Escolher construir tudo como código próprio tem custos reais:

- **Features demoram mais para sair** — construir um componente nativo é mais lento do que plugar um pacote de terceiro, então o roadmap avança deliberadamente;
- **Status beta** — o Bootgly é pré-1.0: a API pública ainda está sendo finalizada, e o uso em produção ainda não é recomendado;
- **Linux nativo** — Windows e outros sistemas são suportados apenas via Docker;
- **Ecossistema jovem** — não existe um marketplace de pacotes da comunidade; o que o núcleo não traz, você constrói.

O Bootgly provavelmente **não** é a escolha certa hoje se você precisa de um grande ecossistema de pacotes prontos, de estabilidade com suporte de longo prazo em produção agora, ou de execução nativa no Windows. Se essas são as suas restrições, um framework full-stack tradicional vai te servir melhor — e a página de comparação acima se mantém honesta sobre isso.

## Próximos passos

- **[O que é Bootgly?](/manual/Bootgly/about/what/overview/)** — identidade, inventário e requisitos;
- **[Primeiros passos](/guide/getting-started/overview/)** — de um diretório vazio a um projeto rodando;
- **[Arquitetura](/manual/Bootgly/basic/architecture/overview/)** — as camadas I2P em profundidade.
