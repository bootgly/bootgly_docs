# Arquitetura

O Bootgly introduziu um jeito novo de desenvolver frameworks utilizando uma arquitetura própria chamada de I2P (Interface-to-Platform)...

## Interfaces

O conceito de "Interfaces" no Bootgly possuem um significado bem claro e definido. Interface é tudo o que conecta dois sistemas distintos, permitindo que eles se comuniquem, interajam ou troquem informações entre si.

No Bootgly, as interfaces iniciais são:

- ABI (Abstract Bootable Interface)
- ACI (Abstract Core Interface)
- ADI (Abstract Data Interface)

- API (Application Programming Interface) -> API para Bootgly (platforma)

- CLI (Command Line Interface) -> interface do Console (platforma)
- WPI (Web Programming Interface) -> interface da Web (platforma)

### Significado

A palavra "interface" vem do latim "inter" (entre) e "facies" (face, aparência), o que significa "a superfície ou ponto de contato entre duas coisas"

O termo "interface" pode ser usado para se referir a qualquer coisa que une duas partes para comunicação. Uma interface é geralmente uma camada de abstração que permite que diferentes sistemas, componentes ou dispositivos se comuniquem de uma maneira padronizada, mesmo que tenham sido projetados independentemente.

Por exemplo, um sistema operacional possui uma interface de usuário (UI) que permite que os usuários interajam com o sistema. Esta interface é projetada para ser usada por pessoas, e oferece uma maneira padronizada para acessar diferentes recursos e funcionalidades do sistema. Aqui temos a seguinte interface:

`pessoa <-UI-> sistema`.

Do mesmo modo, um programa no Front-end pode ter uma interface de programação de aplicativos (API) que permite que outra aplicação no Back-end se comunique com ele. Aqui podemos ter a seguinte interface:

`app (client) <-API-> (server) database`.

## Plataformas

No Bootgly, existem as **plataformas bases** e as **plataformas de trabalho**.

As `plataformas bases` contém um conjunto de Interfaces iniciais e as `plataformas de trabalho` são constituídas por pelo menos uma Interface que existe em uma outra `plataforma base`.

As `plataformas de trabalho` podem conter subinterfaces e/ou podem conter "workables" (trabalháveis).

Por exemplo, na `plataforma Web` existe uma Interface chamada `API` que representa uma API Web e existe um `workable` chamado de `App` que contém as dependências necessárias para formalizar um applicativo dentro do Bootgly.
