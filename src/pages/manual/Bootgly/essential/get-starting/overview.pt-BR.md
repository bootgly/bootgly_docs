# Bootstrap (autoload)

Para começar a utilizar o Bootgly a partir de um starter kit, você deverá utilizar um dos repositórios templates do Bootgly:

- [bootgly.cli](https://github.com/bootgly/bootgly.cli)
- [bootgly.web](https://github.com/bootgly/bootgly.web)

Por enquanto a utilização do Composer é opcional e você poderá utilizar somente o Git para compor os submódulos "bootáveis" do Bootgly.

## Templating

Segue abaixo tutoriais para baixar um starter kit somente utilizando o Git / Github ou Composer.

### Usando Git

Comece utilizando o `Github Templating` para criar outro repositórios a partir de um template (modelo) ou faça um `clone` diretamente de algum repositório template.

Se você não pretende utilizar o Composer ainda, dê o comando abaixo no seu terminal para baixar os submódulos que estão listados no arquivo `.gitmodules`:

```bash
git submodule update --init --recursive
```

### Usando Composer

Se você precisa do Composer para compor alguma dependência externa, utilize o comando `create-project` para baixar e já instalar todas as dependências:

#### Bootgly Console

Se você quer somente desenvolver para o CLI baixe o starter kit do Console:

```bash
composer create-project bootgly/bootgly.console bootgly.console
```

#### Bootgly Web

Se você quer desenvolver para o CLI e para a Web baixe o starter kit da Web que já vem com o Console junto:

```bash
composer create-project bootgly/bootgly.web bootgly.web
```

## Teste o Bootgly CLI

Para se certificar que tudo foi carregado corretamente, ainda no terminal, mude o diretório de trabalho para a pasta que foi gerada e utilize o comando abaixo para executar a tela inicial do Bootgly CLI:

```bash
php bootgly
```
