# Showcase do CLI ao Vivo

O terminal abaixo executa o **Bootgly CLI de verdade** — os arquivos de demo reais do framework, executados por PHP 8.4 compilado para WebAssembly, inteiramente no seu navegador. Nenhum servidor está envolvido: a primeira execução baixa o runtime PHP e um bundle do código-fonte do framework, e então o `bootgly demo N` inicializa exatamente como em um terminal nativo.

<d-block-terminal
  engine="bootgly-cli"
  title="Bootgly CLI — demos ao vivo"
  commands="Menu:demo 13|Menu (divisores):demo 14|Menu (único):demo 15|Menu (horizontal):demo 16|Menu (centralizado):demo 17|Menu (à direita):demo 18|Alert:demo 12|Fieldset:demo 22|Table:demo 21|Progress:demo 19|Progress (indeterminado):demo 20|Writing:demo 2|Cores de texto:demo 6|Estilos de texto:demo 7|Posicionamento de cursor:demo 3"
  height="420"
>
Escolha um demo e pressione executar — a saída que você vê é produzida pelos mesmos componentes documentados neste manual. Os demos de Menu são **interativos**: clique no terminal, use as setas para mirar, Espaço para selecionar e Enter para confirmar. Use o botão de código-fonte para ler o arquivo PHP do demo.
</d-block-terminal>

## O que você está vendo

Cada comando mapeia para um arquivo real em [`projects/Demo/CLI/`](https://github.com/bootgly/bootgly/tree/main/projects/Demo/CLI) no repositório do framework:

- **Menu** — o componente interativo de seleção, em seis variações (divisores, seleção única, orientação horizontal, alinhamento centralizado e à direita). O terminal encaminha seu teclado para o PHP: setas miram, Espaço alterna, Enter confirma — `Ctrl+C` interrompe.
- **Alert, Fieldset, Table** — componentes de saída renderizando caixas estilizadas em ANSI, rótulos e colunas alinhadas.
- **Progress** — a barra de progresso animada: corações se preenchem enquanto tempo decorrido, ETA e taxa atualizam em tempo real.
- **Writing** — saída ritmada, estilo máquina de escrever, via `Output->writing()`.
- **Cores / estilos de texto** — os helpers de escape `Text` para cores de frente/fundo e estilos de fonte.
- **Posicionamento de cursor** — movimentos de cursor orquestrando layouts dinâmicos.

Os aprofundamentos por componente vivem nas páginas em **CLI → UI** e **CLI → Terminal**, várias das quais embutem seus próprios terminais ao vivo.
