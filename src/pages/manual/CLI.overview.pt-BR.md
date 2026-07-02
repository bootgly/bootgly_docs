
# Command-Line Interface (CLI)

No universo da programação, o `Command-Line Interface (CLI)` é uma ferramenta indispensável, permitindo interação direta com um computador através de comandos de texto em um terminal. No âmbito do desenvolvimento de software, um CLI eficiente pode ser a diferença entre uma experiência de usuário fluida e uma complicada.

## Introdução ao CLI

O CLI é uma interface textual onde os usuários interagem com um programa por meio de comandos digitados manualmente. É uma maneira poderosa e eficiente de controlar e automatizar tarefas, especialmente em ambientes de desenvolvimento e administração de sistemas.

## Bootgly CLI

No contexto do Bootgly Framework, estamos focados em simplificar e otimizar o desenvolvimento de interfaces de linha de comando. Nossa missão é fornecer componentes robustos e flexíveis que permitam aos desenvolvedores criar CLIs intuitivos e poderosos para suas aplicações.

### Parser de Comandos

O Parser de Comandos do Bootgly permite analisar e interpretar os argumentos passados pela linha de comando, tornando fácil extrair informações relevantes e tomar ações apropriadas com base nelas.

### Gerenciador de Opções e Argumentos

Com o Gerenciador de Opções, os desenvolvedores podem definir e gerenciar as opções disponíveis para seus comandos, incluindo opções de linha de comando curtas e longas, valores padrão, restrições e documentação automática.

### Interface de Usuário Intuitiva

A interface de usuário do Bootgly CLI é projetada para ser intuitiva e amigável, com prompts claros e mensagens de erro informativas para orientar os usuários durante a interação.

### Componentes visuais (UI) moderno

Nosso framework oferece suporte uma ampla variedade de componentes visuais para experiência do usuário, como os componentes `Alert`, `Fieldset`, `Menu`, `Progress`, `Table`, etc.

## Benefícios do Bootgly CLI

- `Produtividade Aprimorada`

Com uma API limpa e intuitiva, os desenvolvedores podem criar CLIs poderosos em menos tempo e com menos esforço.

- `Documentação Automática`

O Bootgly CLI gera automaticamente documentação para os comandos e opções, facilitando a compreensão e o uso por parte dos usuários.

- `Flexibilidade e Extensibilidade`

Com suporte a plugins, os desenvolvedores podem estender facilmente a funcionalidade do CLI para atender às necessidades específicas de seus projetos.

- `Experiência do Usuário Aprimorada`

Uma interface de usuário intuitiva e mensagens claras garantem uma experiência de usuário agradável e sem complicações.

## Ambiente

O CLI resolve seu ambiente de execução a partir de algumas variáveis bem conhecidas:

- **`BOOTGLY_SAPI`** — o Bootgly condiciona suas interfaces de plataforma à constante `BOOTGLY_SAPI`, definida no boot como `getenv('BOOTGLY_SAPI') ?: PHP_SAPI`. Runtimes embarcados que se comportam como console — como PHP compilado para WebAssembly, onde `PHP_SAPI` reporta `embed` — exportam `BOOTGLY_SAPI=cli` para inicializar a plataforma Console. Checagens de capacidade (sockets, controle de processos) intencionalmente continuam usando `PHP_SAPI`.
- **`COLUMNS` / `LINES`** — o Terminal resolve seu tamanho primeiro a partir dessas variáveis de ambiente (a convenção do ncurses), com fallback para `tput cols` / `tput lines` e, por fim, `80x30`. Pipes, runners de CI e runtimes embarcados podem exportá-las para controlar o layout sem um TTY.

Quando a posição do cursor não pode ser consultada (sem TTY no stdin), os componentes degradam graciosamente: o `Progress` ancora sua renderização com save/restore de cursor ANSI em vez de posicionamento absoluto.

Essas são as mecânicas que alimentam o [showcase do CLI ao vivo](/manual/CLI/showcase) — cada demo ali executa o framework real em PHP 8.4 WebAssembly no seu navegador.
