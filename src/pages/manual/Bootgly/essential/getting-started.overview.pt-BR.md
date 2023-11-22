# Começando

Para começar a utilizar o Bootgly a partir de um starter kit, você deverá utilizar um dos [repositórios templates](/manual/Bootgly/concepts/github-repositories/overview) do Bootgly:

- [bootgly.console](https://github.com/bootgly/bootgly.console)
- [bootgly.web](https://github.com/bootgly/bootgly.web)

Por enquanto, a utilização do Composer é opcional e você poderá utilizar somente o Git para compor os submódulos "bootáveis" do Bootgly e já começar a desenvolver!

## Templating

Segue abaixo tutoriais para baixar o boilerplate utilizando o Composer ou o Git/Github.

### Utilizando o Composer

Se você precisa do Composer para compor alguma dependência externa ou possui uma preferência por ele, dê o comando `create-project` para baixar e já instalar todas as dependências:

#### Bootgly Console

Se você quer desenvolver apenas para o CLI, baixe o skeleton do Console:

```bash
composer create-project bootgly/bootgly.console bootgly.console
```

#### Bootgly Web

Se você quer desenvolver para o CLI e para a Web, baixe o starter kit da Web, que já vem com o Console junto:

```bash
composer create-project bootgly/bootgly.web bootgly.web
```

### Utilizando o Git submodule

Comece utilizando o `Github Templating` para criar outro repositório a partir do repositório template (modelo) e depois faça um `git clone` do repositório gerado.

Se você não pretende utilizar o Composer ainda, apenas dê o comando abaixo no seu terminal para baixar recursivamente os submódulos que estão listados no arquivo `.gitmodules` do repositório modelo:

```bash
git submodule update --init --recursive
```

## Execute o Bootgly CLI

Para se certificar que tudo foi carregado corretamente, ainda no terminal, mude o diretório de trabalho para a pasta que foi gerada e utilize o comando abaixo para executar a tela inicial do Bootgly CLI:

```bash
php bootgly
```
