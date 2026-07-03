# Viewport

O demo de panning do Viewport roda ao vivo abaixo — código real do framework em PHP 8.4 WebAssembly, no seu navegador. Use o botão de source no terminal para ler o arquivo PHP exato em execução.

## Deslocando a tela

Um bloco de linhas coloridas de conteúdo é escrito, então o viewport desloca para **baixo** (o conteúdo rola para cima, novas linhas entram por baixo) e de volta para **cima** (o conteúdo rola para baixo), uma linha por vez.

<d-block-terminal engine="bootgly-cli" title="Viewport — panning" command="demo 24" height="380">
`$Output->Viewport->panDown(1)` e `panUp(1)` em passos animados — cada chamada emite um escape de scroll (`\e[1S` / `\e[1T`) e o terminal desloca o viewport inteiro.
</d-block-terminal>

A classe está documentada no [overview do Viewport](/manual/CLI/Terminal/Output/Viewport/overview).
