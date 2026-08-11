# Button

O demo oficial de Button roda ao vivo abaixo — código real do framework em PHP 8.4 WebAssembly, no seu navegador. Use o botão de source no terminal para ler o arquivo PHP exato sendo executado.

## Pills com hover + Actions de press

O demo pinta quatro botões — um label sem estilo, uma pill estilizada, um contador e um power-off só de ícone. O hover pinta o background; um click esquerdo (ou Enter no botão focado via Tab) dispara a Action; a Action do botão `⏻` encerra.

<d-block-terminal engine="bootgly-cli" title="Button — demo ao vivo" command="demo 61" height="340">
Mova o mouse sobre os botões para o hover, clique para pressionar — ou Tab para ciclar o foco e Enter para pressionar. Cada Action alimenta a linha de status.
</d-block-terminal>

Em saída não interativa (pipes, CI) os mesmos botões renderizam de forma plana, em fluxo, com zero códigos de escape.

O componente está documentado no [overview do Button](/manual/CLI/UI/Atoms/Button/overview).
