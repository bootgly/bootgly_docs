# O que é o Cookbook?

O Cookbook ensina Bootgly **construindo projetos reais e pequenos** — uma página por projeto, uma plataforma por seção. Você não precisa conhecer o Bootgly antes: toda página começa em uma máquina Linux vazia, instala o Bootgly com um comando e termina com um projeto que você pode rodar, testar e manter.

## Como uma página funciona

- **Passo a passo.** Cada projeto é uma sequência guiada: siga os passos em ordem, uma ação por passo, com o comando exato ou o arquivo completo a criar.
- **Copie, cole, rode.** Todo bloco de código é completo — use o botão de copiar. Os arquivos carregam o próprio caminho, então você sempre sabe onde eles vão.
- **Conferido no caminho.** Os passos terminam com algo que você pode rodar para confirmar que está no rumo, e toda página fecha rodando o projeto e o teste dele.
- **Testado do zero.** Toda página foi executada, em ordem, dentro de um container Linux novo sem nada do Bootgly instalado — o código que você vê é o código que rodou.

## Requisitos

Linux (ou WSL2) com um terminal. O instalador verifica **git** e **PHP 8.4+** e oferece instalar o que faltar pelo seu gerenciador de pacotes — nada mais é necessário.

## Projetos

<d-block-cards title="Plataforma Console — apps e jogos de terminal">
  <d-block-card
    title="Monitor"
    description="Um dashboard de sistema ao vivo: telas, atalhos, barra de status e tabelas sobre o /proc."
    to="/cookbook/console/monitor/overview/"
    icon="monitor_heart"
  />
  <d-block-card
    title="Breakout"
    description="Um jogo de terminal: loop de passo fixo, canvas com diff, teclas seguradas, cenas e colisões."
    to="/cookbook/console/breakout/overview/"
    icon="sports_esports"
  />
</d-block-cards>

<d-block-cards title="Plataforma Web — sites e APIs">
  <d-block-card
    title="Guestbook"
    description="Um app web MVC: um formulário, uma lista, migrations SQLite, CSRF, um layout e assets estáticos."
    to="/cookbook/web/guestbook/overview/"
    icon="edit_note"
  />
  <d-block-card
    title="Contacts"
    description="Uma API REST: CRUD em JSON, validação, erros problem+json, paginação e SQLite."
    to="/cookbook/web/contacts/overview/"
    icon="contacts"
  />
</d-block-cards>

Comece pela plataforma que interessa a você — as páginas são independentes. Quando quiser os conceitos por trás de um passo, o [Guia](/guide/getting-started/overview/) explica os tópicos e o [Manual](/manual/Console/App/overview/) documenta cada componente.
