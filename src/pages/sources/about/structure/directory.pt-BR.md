O Bootgly PHP Framework é muito organizado desde a sua fundação e oferece uma estrutura sólida para a construção de seus códigos.

Uma parte fundamental dessa estrutura é a disposição de diretórios da sua pasta raiz, que foi projetada cuidadosamente para garantir uma organização clara e eficiente em ordem crescente de dependências. Um dos motivos desse padrão é separar tudo o que é do Framework em si, de tudo o que foi produzido através dele.

![Dir Structure](images/bootgly_php_framework-directory_structure.png)

## Pasta global {'@'}
A pasta {'@'} é uma pasta global para artefatos e metadados. Ela pode ser encontrada em diretórios do Bootgly.

É um local destinado a armazenar informações relevantes sobre o projeto, como arquivos de configuração, arquivos de metadados, loaders e outros arquivos gerais específicos de contexto local de onde essa pasta se encontra.

Por ser uma pasta global, você pode criar essa pasta em seus projetos produzidos com o Bootgly.

## Pastas 'Bootables'
As pastas "Bootables" é projetada para conter tudo relacionado à **inicialização do Bootgly**.

Ela inclui a pasta "abstract/", pasta "base/", pasta "core/", enfim, tudo o que é necessário para inicializar o mínimo do Bootgly PHP Framework ou alguma dependência que é utilizada indiretamente.

Essa separação ajuda a manter os arquivos de inicialização organizados em um local central, e também permite a utilização de dependências primárias do Bootgly, em projetos que não querem utilizar o Framework por completo.

## Pastas 'Features'
As pastas "Features" é destinada a todo conteúdo relacionado às **funcionalidades específicas do Framework** e elas são: "interfaces/", "modules/", "nodes/".

Nela contém dependências que são utilizados diretamente pelo desenvolvedor que utiliza o Bootgly para desenvolver seus projetos.

Organizar dessa forma facilita o aprendizado por parte dos contribuidores e ajuda na manutenção e desenvolvimento do Bootgly por separar as features principais do "boot".

## Pastas 'Workables'
Por fim, as pastas "Workables" é projetada para conter **tudo o que é desenvolvido através do Bootgly** e elas são pastas de trabalho.

Essas pastas devem incluir projetos específicos, pastas de código-fonte para Apps, APIs, arquivos de configuração e boot de projetos, entre outros recursos relacionados aos projetos que são construídos utilizando o Bootgly PHP Framework.
Além disso, pode conter arquivos públicos e estáticos para a Web como imagens, arquivos CSS ou JavaScript.

Essa separação permite que os desenvolvedores organizem e gerenciem os artefatos de trabalho em andamento, mantendo-os separados dos outros diretórios do framework e facilitando o compartilhamento de recursos entre diferentes projetos.
