# O que é Bootgly?

Bootgly é um framework projetado para construir Apps e APIs para a Web e a linha de comando (CLI).

O Bootgly é o primeiro framework a usar a arquitetura I2P (interface-to-platform) e é focado principalmente em **eficiência**, por adotar uma política de dependência mínima.

Devido a essa política, sua arquitetura I2P exclusiva e algumas Convenções de Código e Padrões de Design incomuns, o Bootgly tem desempenho e versatilidade superior, e tem Code APIs de fácil entendimento.

A partir de um único codebase, o Bootgly atende tanto o **CLI** (plataforma Console) quanto a **Web** (plataforma Web), compartilhando camadas fundamentais (ABI, ACI, ADI, API) enquanto se especializa nas interfaces de nível superior. Requer PHP 8.4+ e roda nativamente no Linux, com suporte Docker para outros sistemas operacionais.

Nosso objetivo é ajudar a criar aplicativos/APIs de forma fácil e rápida para a Web e para o CLI, que sejam escaláveis e de alta qualidade. Se você é um desenvolvedor experiente ou está apenas começando, o Bootgly tem tudo o que você precisa.

## Principais características

- **Altamente eficiente** — todos os componentes são built-in e totalmente integrados, eliminando overhead de terceiros e maximizando a coesão interna;
- **Alta performance** — otimizado para Opcache + JIT (até +50% de performance), o HTTP Server CLI benchmarks +7% mais rápido que o Workerman no teste de plain text;
- **Versatilidade** — construa ferramentas CLI e servidores Web a partir do mesmo framework, reutilizando interfaces e componentes compartilhados entre ambas as plataformas;
- **Code APIs fáceis de entender** — convenções de nomenclatura consistentes, estrutura I2P clara e política de caminho único tornam o codebase previsível e fácil de aprender;
- **Escalável** — servidor HTTP multi-worker com arquitetura event-driven, middleware pipeline built-in (CORS, RateLimit, Compression, ETag, SecureHeaders, e mais).
