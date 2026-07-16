# Markdown

A demo oficial do Markdown roda ao vivo abaixo — código real do framework em PHP 8.4 WebAssembly, no seu navegador. Use o botão de source no terminal para ler o arquivo PHP exato em execução.

## Markdown renderizado no terminal

Um documento completo renderiza de uma vez: headings estilizados, parágrafos com wrap, ênfases e código inline, listas aninhadas e tasks, um bloco PHP com syntax highlighting, quotes empilhados, uma tabela alinhada e uma régua.

<d-block-terminal
  engine="bootgly-cli"
  title="Markdown — demo ao vivo"
  command="demo 54"
  height="520"
>
Um documento markdown pintado com SGR raw: headings, listas, tasks, quotes, código cercado com highlight, tabela alinhada e links. Use o botão de source para ler o arquivo PHP.
</d-block-terminal>

Em saída não-interativa (pipes, CI) o mesmo render degrada para texto plano estruturado com zero escape codes.

O componente está documentado no [overview do Markdown](/manual/CLI/UI/Components/Markdown/overview).
