# Estrutura de diretórios

O Bootgly PHP Framework é muito organizado desde a sua fundação e oferece uma estrutura sólida para a construção de seus códigos.

Uma parte fundamental dessa estrutura é a disposição de diretórios da sua pasta raiz, que foi projetada cuidadosamente para garantir uma organização clara e eficiente em ordem crescente de dependências. Um dos motivos desse padrão é separar tudo o que é do Framework em si, de tudo o que foi produzido através dele.

![Dir Structure](images/pages/Bootgly/basic/directory_structure-bootgly3.png)

## Pasta global @/

A pasta `@/` é uma pasta global para artefatos e metadados. Ela pode ser encontrada em diretórios do Bootgly.

É um local destinado a armazenar informações relevantes como arquivos de configuração, arquivos de metadados e outros arquivos gerais específicos do contexto local de onde essa pasta se encontra.

Por ser uma pasta global, você pode criá-la em seus projetos produzidos com o Bootgly.

## Pastas de classes e namespaces

Em projetos e repositórios Bootgly, o primeiro nó de um namespace começa com letra maíuscula e deve ser colocada direto dentro da pasta raiz. Você deve estar acostumado em ver o código fonte dentro da pasta `src/` que fica na pasta raiz de um projeto, mas devido ao sistema de autoloader do Bootgly, o código fonte é carregado com um padrão próprio, simples e eficiente e não deve ser colocado dentro da pasta `src/` porque ela deveria ser considerada uma pasta recurso (ver seção "Pastas recurso").

### Interfaces

Dentro da pasta `Bootgly/`, que representa a plataforma base do Bootgly, estão as interfaces iniciais e elas são:

A interface `ABI` (Abstract Bootable Interface) reúne _tudo o que é "bootável"_, em um contexto relacionado à inicialização ou carregamento inicial de componentes e contém abstrações que são mais voltadas ao SO (Sistema Operacional).

A interface `ACI` (Abstract Common Interface) reúne _tudo o que é comum_ em softwares: um Debugger, Events, Logs, Tests, etc.

A interface `ADI` (Abstract Data Interface) reúne _tudo relacionado a dados_ e essa interface terá muitas implementações e poderá dar origem a uma outra plataforma no futuro.

A interface `API` (Application Programming Interface) _reúne o que é intríseco do Bootgly_ e seu ambiente: classe Project, classe Environment, etc.

A interface `CLI` (Command Line Interface) é uma interface para interagir com um computador ou sistema operacional por meio de texto e comandos digitados em uma _linha de comando_. Ela é utilizada para construção da _plataforma Console_.

A interface `WPI` (Web Programming Interface) é uma interface que _representa a Web em um nível mais base_ onde se define implementações de protocolos por exemplo, e nela deve conter clientes e servidores bases como um TCP Server/Client, um UDP Server/Client, um HTTP Server/Client e etc. Ela é utilizada para construção da _plataforma Web_.

## Pastas recurso

As pastas recursos obrigatoriamente começam com letra minúscula e já é bem conhecida em qualquer projeto de programação. No Bootgly essas pastas simplesmente foram "formalizadas"!

Essas pastas recurso são utilizadas para armazenadas recursos padronizados por alguma classe "Resource", por exemplo, uma classe chamada "Scripts" poderá padronizar uma pasta "scripts/" que servirá para armazenar scripts do Bootgly. Uma classe chamada "Tests" poderá formalizar uma pasta recurso chamada "tests/" que servirá para armazenar os arquivos para testes no Bootgly, e assim por diante!

A pasta `projects/` será utilizada por usuários desenvolvedores para armazenar os seus projetos desenvolvidos a partir do Bootgly como APIs, Apps, etc. Essa pasta só deve ser criada na pasta raiz.

A pasta `public/` servirá para armazenar arquivos da Web e só deve ser colocada na pasta raiz.

A pasta `scripts/` armazena os scripts para o CLI/Console e só deve ser colocada na pasta raiz.

As pastas `tests/` armazenam arquivos de bootstrap de testes e arquivos que definem um "test case". Essas pastas devem ser criadas no mesmo namespace do que está sendo testado.

A pasta `workdata/` contém dados gerados, coletados ou utilizados no ambiente de trabalho, como arquivos de cache, de logs, arquivos temporários, informações sobre projetos, tarefas, etc.
