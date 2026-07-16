# Wizard

A demo oficial do Wizard roda ao vivo abaixo — código real do framework em PHP 8.4 WebAssembly, no seu navegador. Use o botão de código-fonte no terminal para ler o arquivo PHP exato em execução.

## Fluxo multi-etapas declarativo

Quatro steps declarados antecipadamente — a timeline fica fixa no topo enquanto o componente de cada step renderiza abaixo dela. Clique no terminal e responda: digite um nome de projeto, escolha a interface com `↑`/`↓` + Enter (WPI encaixa um step Port logo em seguida), então confirme para construir — ou recuse para ver o fluxo falhar com um `✖` vermelho.

<d-block-terminal engine="bootgly-cli" title="Wizard — demo ao vivo" command="demo 48" height="480">
`add()` vincula cada rótulo a um handler; `run()` repinta uma tela nova por step — passados ✔ verdes, ativo ◉ ciano, futuros ○ cinzas — e adições mid-run inserem logo após o step ativo.
</d-block-terminal>

Na saída não-interativa (pipes, CI) o mesmo código anexa uma linha simples por transição.

O componente está documentado no [overview do Wizard](/manual/CLI/UX/Components/Wizard/overview).
