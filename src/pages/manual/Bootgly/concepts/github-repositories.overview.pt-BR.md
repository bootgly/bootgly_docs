# Git repositories

Os repositórios do Bootgly possuem um padrão de nomes associados à sua arquitetura de software I2P. Existem 4 tipos de repositórios:

- Repositórios de projeto
- Repositórios bootáveis
- Repositórios templates
- Repositórios extensão

## Repositórios de projeto

Os repositórios de projeto são os principais e servem como base para outros repositórios.

Eles possuem a seguinte sintaxe: `^[a-z]+$`.

Repositórios de projeto não possuem separadores:

- [bootgly](https://github.com/bootgly/bootgly)

## Repositórios bootáveis

Os repositórios bootáveis são os submódulos do Bootgly e servem para estender suas funcionalidades adicionando outras plataformas ao Bootgly.

Esses repositórios possuem o seguinte padrão em seu nome: `^[a-z]+-[a-z]+$`.

Todos os repositório bootáveis possuem um `-` (traço) como separador:

- [bootgly-console](https://github.com/bootgly/bootgly-console)
- [bootgly-web](https://github.com/bootgly/bootgly-web)

## Repositórios templates

Os repositórios templates do Bootgly funcionam como starter kits e servem para ajudar a prover uma estrutura inicial para o desenvolvimento baseado em alguma plataforma.

Esses repositórios possuem o seguinte padrão em seu nome: `^[a-z]+.[a-z]+$`.

Todos os repositório templates possuem um `.` (ponto) como separador:

- [bootgly.console](https://github.com/bootgly/bootgly.console)
- [bootgly.web](https://github.com/bootgly/bootgly.web)

## Repositórios extensão

Os repositórios extensão servem para armazenar informações adicionais sobre os projetos como Awesome Lists, Documentações e etc.

Eles possuem o seguinte padrão em seu nome: `^[a-z]+_[a-z]+$`.

Todos os repositórios extensão possuem um `_` (underline) como separador:

- [bootgly_awesome](https://github.com/bootgly/bootgly_awesome)
- [bootgly_benchmarks](https://github.com/bootgly/bootgly_benchmarks)
- [bootgly_docs](https://github.com/bootgly/bootgly_docs)
