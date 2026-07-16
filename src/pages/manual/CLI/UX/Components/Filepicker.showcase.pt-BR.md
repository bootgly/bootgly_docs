# Filepicker

A demo oficial do Filepicker roda ao vivo abaixo — código real do framework em PHP 8.4 WebAssembly, no seu navegador. Use o botão de código-fonte no terminal para ler o arquivo PHP exato sendo executado.

## Navegador de arquivos com varreduras lazy

Navegue o diretório `projects/` do bundle: mire com `↑`/`↓` (o marcador pisca), pressione `Enter` em um diretório para entrar nele — cada diretório é varrido apenas na primeira abertura — e `Enter` em um arquivo para escolhê-lo. `Esc` cancela.

<d-block-terminal
  engine="bootgly-cli"
  title="Filepicker — demo ao vivo"
  command="demo 52"
  height="480"
>
Um Tree pré-configurado para o sistema de arquivos: varreduras lazy com DirectoryIterator, ícones 📁/📄, diretórios ordenados primeiro. Use o botão de código-fonte para ler o arquivo PHP.
</d-block-terminal>

Em saída não interativa (pipes, CI) o seletor degrada para uma linha de caminho digitada.

O componente está documentado no [overview do Filepicker](/manual/CLI/UX/Components/Filepicker/overview).
