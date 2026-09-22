# O que é o Cookbook?

O Cookbook ensina Bootgly **construindo projetos reais e pequenos** — uma página por projeto, uma plataforma por seção. Você não precisa conhecer o Bootgly antes: toda página começa em uma máquina Linux vazia, instala o Bootgly com um comando e termina com um projeto que você pode rodar, testar e manter.

## Como uma página funciona

- **Passo a passo.** Cada projeto é uma sequência guiada: siga os passos em ordem, uma ação por passo, com o comando exato ou o arquivo completo a criar.
- **Copie, cole, rode.** Todo bloco de código é completo — use o botão de copiar. Os arquivos carregam o próprio caminho, então você sempre sabe onde eles vão.
- **Conferido no caminho.** Os passos terminam com algo que você pode rodar para confirmar que está no rumo, e toda página fecha rodando o projeto e o teste dele.
- **Testado do zero.** Toda página foi executada, em ordem, dentro de um container Linux novo sem nada do Bootgly instalado — o código que você vê é o código que rodou.

## Requisitos

Linux (ou WSL2) com um terminal. O instalador verifica **git** e **PHP 8.4+** e oferece instalar o que faltar pelo seu gerenciador de pacotes — nada mais é necessário. O Shop e o Polls precisam, além disso, de **Docker** para rodar o banco em um container (ou de um servidor MySQL/PostgreSQL existente para apontar).

## Projetos

<d-block-cards title="Plataforma Console — apps e jogos de terminal">
  <d-block-card
    title="Construa um Console App de dashboard do sistema"
    description="Monitor — um dashboard de sistema ao vivo: telas, atalhos, barra de status e tabelas sobre o /proc."
    to="/cookbook/console/monitor/overview/"
    icon="monitor_heart"
  />
  <d-block-card
    title="Construa um Console Game de quebrar tijolos"
    description="Breakout — um jogo de terminal: loop de passo fixo, canvas com diff, teclas seguradas, cenas e colisões."
    to="/cookbook/console/breakout/overview/"
    icon="sports_esports"
  />
</d-block-cards>

<d-block-cards title="Plataforma Web — sites e APIs">
  <d-block-card
    title="Construa um Web App de livro de visitas"
    description="Guestbook — um app web MVC: um formulário, uma lista, migrations SQLite, CSRF, um layout e assets estáticos."
    to="/cookbook/web/guestbook/overview/"
    icon="edit_note"
  />
  <d-block-card
    title="Construa uma Web REST API de contatos"
    description="Contacts — uma API REST: CRUD em JSON, validação, erros problem+json, paginação e SQLite."
    to="/cookbook/web/contacts/overview/"
    icon="contacts"
  />
  <d-block-card
    title="Construa um Web App de loja em MySQL"
    description="Shop — uma loja em MySQL: catálogo com paginação, carrinho na sessão, checkout em uma transação com bloqueio de linhas, relações do ORM."
    to="/cookbook/web/shop/overview/"
    icon="storefront"
  />
  <d-block-card
    title="Construa um Web App de votação em PostgreSQL"
    description="Polls — um app de votação em PostgreSQL: um voto por visitante via upsert, RETURNING em uma transação, TIMESTAMPTZ, relações do ORM."
    to="/cookbook/web/polls/overview/"
    icon="how_to_vote"
  />
</d-block-cards>

Comece pela plataforma que interessa a você — as páginas são independentes. Quando quiser os conceitos por trás de um passo, o [Guia](/guide/getting-started/overview/) explica os tópicos e o [Manual](/manual/Console/App/overview/) documenta cada componente.
