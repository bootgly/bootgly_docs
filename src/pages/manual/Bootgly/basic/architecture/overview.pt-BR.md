# Arquitetura

O Bootgly introduziu um jeito novo de desenvolver frameworks utilizando uma arquitetura própria chamada de **I2P (Interface-to-Platform)**.

Na arquitetura I2P, tudo começa com interfaces, que posteriormente dão origem a plataformas.

## Interfaces

O conceito de "Interfaces" no Bootgly possui um significado bem claro e definido:

> "Interface é tudo o que conecta dois sistemas distintos, permitindo que eles se comuniquem, interajam ou troquem informações entre si."

### Significado

A palavra "interface" vem do latim "inter" (entre) e "facies" (face, aparência), o que significa "a superfície ou ponto de contato entre duas coisas"

O termo "interface" pode ser usado para se referir a qualquer coisa que une duas partes para comunicação. Uma interface é geralmente uma camada de abstração que permite que diferentes sistemas, componentes ou dispositivos se comuniquem de uma maneira padronizada, mesmo que tenham sido projetados independentemente.

Por exemplo, um sistema operacional possui uma interface de usuário (UI) que permite que os usuários interajam com o sistema. Esta interface é projetada para ser usada por pessoas, e oferece uma maneira padronizada para acessar diferentes recursos e funcionalidades do sistema. Aqui temos a seguinte interface:

`Pessoa <-UI-> Sistema`

Do mesmo modo, um programa no Front-end pode ter uma interface de programação de aplicativos (API) que permite que outra aplicação no Back-end se comunique com ele. Aqui podemos ter a seguinte interface:

`App (Client) <-API-> (Server) DB`

### Interfaces iniciais

No Bootgly, as interfaces iniciais são:

- ABI (Abstract Bootable Interface)
- ACI (Abstract Common Interface)
- ADI (Abstract Data Interface)

- API (Application Programming Interface)

- CLI (Command Line Interface)
- WPI (Web Programming Interface)

Na próxima página você poderá ver como as pastas das Interfaces estão estruturadas na plataforma base Bootgly e o que cada uma delas representa.

## Plataformas

No Bootgly, existem as **plataformas bases** e as **plataformas de trabalho**.

> As _plataformas bases_ contém um conjunto de Interfaces iniciais e as _plataformas de trabalho_ são constituídas por pelo menos uma Interface que existe em uma _plataforma base_.

As _plataformas de trabalho_ podem conter outras interfaces e/ou os chamados "workables" (trabalháveis).

Por exemplo, na _plataforma Web_ existe uma Interface chamada `API` que representa uma API Web e existe um `workable` chamado de `App` que contém as dependências necessárias para formalizar um applicativo Web dentro do Bootgly.

No Bootgly as atuais plataformas são:

- Bootgly (plataforma base)
- Console (plataforma da interface CLI)
- Web (plataforma da interface WPI)

No futuro poderá surgir uma outra interface chamada de "GUI" (Graphical User Interface), que poderá dar origem a uma outra plataforma chamada de "Graphical", que servirá pra construções de aplicações gráficas utilizando o PHP.
