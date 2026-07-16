# Tree

A demo oficial do Tree roda ao vivo abaixo — código real do framework em PHP 8.4 WebAssembly, no seu navegador. Use o botão de código-fonte no terminal para ler o arquivo PHP exato sendo executado.

## Seletor hierárquico com filhos lazy

A demo despeja a estrutura do projeto estaticamente primeiro e então abre o seletor interativo: mire com `↑`/`↓` (o marcador `=>` pisca), dobre com `→`/`←`, pressione `→` no ramo lazy `📦 vendor` para ver o resolver varrer no lugar, aperte `Enter` em `projects` para ver uma ação programável dobrá-lo em vez de confirmar, e confirme qualquer outro nó com `Enter` — ou cancele com `Esc`.

<d-block-terminal
  engine="bootgly-cli"
  title="Tree — demo ao vivo"
  command="demo 51"
  height="480"
>
A mesma árvore comanda as duas saídas: um render estático seguro para relatórios e uma sessão de navegação com input raw e janela de viewport. Use o botão de código-fonte para ler o arquivo PHP.
</d-block-terminal>

Em saída não interativa (pipes, CI) o seletor degrada para um único dump estático.

O componente está documentado no [overview do Tree](/manual/CLI/UI/Components/Tree/overview).
