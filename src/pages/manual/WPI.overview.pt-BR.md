
# Web Programming Interface (WPI)

O `Web Programming Interface (WPI)` representa a espinha dorsal da Web no Bootgly, oferecendo uma camada essencial de implementação para desenvolvimento de rede e Web robusto e escalável. Este componente fundamental encapsula blocos centrais como servidores e clientes UDP, TCP e HTTP, além de capacidades de roteamento HTTP, fornecendo assim uma base sólida para aplicações Bootgly que se comunicam pela rede.

## Principais Recursos do WPI

1. `Servidores e Clientes UDP/TCP/HTTP`: O WPI oferece implementações de servidores e clientes UDP, TCP e HTTP, permitindo comunicação eficiente em diferentes camadas de protocolo e necessidades de aplicação.

2. `Roteamento Web`: Com recursos avançados de roteamento, o WPI facilita a definição de endpoints e a manipulação de requisições HTTP, garantindo uma navegação suave e eficaz pelos recursos do aplicativo.

3. `Gerenciamento de Conexões`: Este componente oferece recursos para gerenciar conexões com clientes, lidar com solicitações e respostas de forma eficiente e garantir uma experiência web estável e responsiva.

4. `Segurança Integrada`: Incorpora medidas de segurança para proteger contra ameaças comuns da web, como ataques de injeção de SQL, XSS e CSRF, garantindo assim a integridade e confiabilidade dos aplicativos desenvolvidos com o framework.

5. `Extensibilidade`: O WPI é projetado com uma arquitetura modular e extensível, permitindo a integração fácil de novos recursos e funcionalidades conforme necessário.

## Benefícios do WPI

- Desenvolvimento eficiente em camadas:

Ao fornecer uma infraestrutura comum, o WPI reduz significativamente o tempo e o esforço necessários para o desenvolvimento Web, porque isola a camada de abstração mais baixa que é comum no processo de desenvolvimento Web, permitindo que seja criado separadamente, abstrações mais elevadas para mais de um padrão de arquitetura de software como o MVC, MVP, MVVM, etc.

- Desempenho Aprimorado:

Com sua implementação otimizada de servidores e clientes TCP/HTTP, o WPI garante um desempenho excepcional, mesmo em cargas de trabalho intensas e ambientes de alta demanda.

- Flexibilidade e Controle:

Os recursos avançados de roteamento e gerenciamento de conexões do WPI proporcionam aos desenvolvedores um alto nível de flexibilidade e controle sobre o comportamento do aplicativo, permitindo a criação de experiências web personalizadas e altamente interativas.

- APIs comuns

Com a infraestrutura organizada do Bootgly, é possível integrar outros Server APIs (SAPIs) e manter uma API comum para servidores e clientes, utilizando tanto SAPIs internas quanto externas.

## Componentes

| Componente | Descrição |
|---|---|
| **HTTP Server CLI** | Servidor HTTP event-driven e multi-worker construído sobre TCP. |
| **HTTP Client CLI** | Cliente HTTP puro PHP com keep-alive, pipelining, redirects, timeouts, retries e SSL/TLS. Sem dependência de cURL. |
| **UDP Server CLI** | Servidor UDP de baixo nível para handlers de datagramas, execução com workers e operação via terminal. |
| **UDP Client CLI** | Cliente UDP de baixo nível com fluxo de envio/recebimento guiado por callbacks e execução amigável para monitoramento. |
| **TCP Server CLI** | Servidor TCP de baixo nível com `SO_REUSEPORT` e I/O non-blocking. |
| **TCP Client CLI** | Cliente TCP de baixo nível com integração ao event loop. |
