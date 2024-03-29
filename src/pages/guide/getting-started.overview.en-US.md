# Getting started

To start using Bootgly from a starter kit, you should use one of [Bootgly's template](/manual/Bootgly/concepts/github-repositories/overview) repositories:

- [bootgly.console](https://github.com/bootgly/bootgly.console)
- [bootgly.web](https://github.com/bootgly/bootgly.web)

For now, the use of Composer is optional and you can use only Git to compose the "bootable" submodules of Bootgly.

## Templating

Here are tutorials to download a starter kit using only Git/Github or Composer.

### Option 1): Using Composer

If you need Composer to compose some external dependency, use the `create-project` command to download and already install all the dependencies:

#### Bootgly Console

If you only want to develop only for the CLI, download the Console starter kit:

```bash
composer create-project bootgly/bootgly.console bootgly.console
```

#### Bootgly Web

If you want to develop for the CLI and for the Web, download the Web starter kit that already comes with the Console together:

```bash
composer create-project bootgly/bootgly.web bootgly.web
```

### Option 2): Using Git

Start by using `Github Templating` to create other repositories from a template or make a `clone` directly from some template repository.

If you do not intend to use Composer yet, run the command below in your terminal to download the submodules that are listed in the `.gitmodules` file:

```bash
git submodule update --init --recursive
```

## Execute the Bootgly CLI

To make sure everything was loaded correctly, in the terminal, change the working directory to the folder that was generated and use the command below to execute the initial screen of Bootgly CLI:

```bash
php bootgly
```
