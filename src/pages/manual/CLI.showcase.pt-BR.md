# Showcase do CLI ao Vivo

O terminal abaixo executa o **Bootgly CLI de verdade** — os arquivos de demo reais do framework, executados por PHP 8.4 compilado para WebAssembly, inteiramente no seu navegador. Nenhum servidor está envolvido: a primeira execução baixa o runtime PHP e um bundle do código-fonte do framework, e então o `bootgly demo N` inicializa exatamente como em um terminal nativo.

<d-block-terminal
  engine="bootgly-cli"
  title="Bootgly CLI — demos ao vivo"
  commands="Client/Server:demo 1|Mouse:demo 23|Logs:demo 25|Menu:demo 13|Menu (divisores):demo 14|Menu (único):demo 15|Menu (horizontal):demo 16|Menu (centralizado):demo 17|Menu (à direita):demo 18|Alert:demo 12|Fieldset:demo 22|Table:demo 21|Progress:demo 19|Progress (indeterminado):demo 20|Writing:demo 2|Cores de texto:demo 6|Estilos de texto:demo 7|Posicionamento de cursor:demo 3|Viewport:demo 24"
  height="420"
>
Escolha um demo e pressione executar — a saída que você vê é produzida pelos mesmos componentes documentados neste manual. Os demos de Mouse e Menu são **interativos**: clique no terminal primeiro; no Menu use as setas para mirar, Espaço para selecionar e Enter para confirmar; no Mouse apenas mova, clique e role — clique direito encerra. Use o botão de código-fonte para ler o arquivo PHP do demo.
</d-block-terminal>

## O que você está vendo

Cada comando mapeia para um arquivo real em [`projects/Demo/CLI/`](https://github.com/bootgly/bootgly/tree/main/projects/Demo/CLI) no repositório do framework:

- **Client/Server** — a API Terminal Client/Server (`Input->reading()`): nativamente ela faz fork de dois processos ligados por um pipe; aqui cada papel roda em seu próprio worker PHP WASM e um `MessageChannel` faz o papel do pipe. Clique no terminal, digite e pressione Enter — o Client ecoa suas teclas e o Server responde com o que você enviou. Setas viram emoji, `*` alterna o modo secreto, `#` o modo oculto.
- **Mouse** — Mouse Reporting em tempo real: o terminal habilita o rastreamento SGR e o PHP decodifica cada movimento, clique, arrasto e rolagem com coordenadas de coluna/linha. Clique direito encerra.
- **Logs** — o viewer de logs do modo Monitor: ~20 records simulados de workers entram ao vivo, e então seu teclado o conduz — Espaço pausa, ↑/↓ selecionam, Enter expande um record, `l` alterna o nível, `/` busca, `1-3` ligam/desligam canais, `q` sai.
- **Menu** — o componente interativo de seleção, em seis variações (divisores, seleção única, orientação horizontal, alinhamento centralizado e à direita). O terminal encaminha seu teclado para o PHP: setas miram, Espaço alterna, Enter confirma — `Ctrl+C` interrompe.
- **Alert, Fieldset, Table** — componentes de saída renderizando caixas estilizadas em ANSI, rótulos e colunas alinhadas.
- **Progress** — a barra de progresso animada: corações se preenchem enquanto tempo decorrido, ETA e taxa atualizam em tempo real.
- **Writing** — saída ritmada, estilo máquina de escrever, via `Output->writing()`.
- **Cores / estilos de texto** — os helpers de escape `Text` para cores de frente/fundo e estilos de fonte.
- **Posicionamento de cursor** — movimentos de cursor orquestrando layouts dinâmicos.
- **Viewport** — a tela deslocando para baixo e para cima via `Viewport->panDown()`/`panUp()`, um escape de scroll por passo.

Os aprofundamentos por componente vivem nas páginas em **CLI → UI** e **CLI → Terminal**, várias das quais embutem seus próprios terminais ao vivo.
