# Showcase do CLI ao Vivo

O terminal abaixo executa o **Bootgly CLI de verdade** — os arquivos de demo reais do framework, executados por PHP 8.4 compilado para WebAssembly, inteiramente no seu navegador. Nenhum servidor está envolvido: a primeira execução baixa o runtime PHP e um bundle do código-fonte do framework, e então o `bootgly demo N` inicializa exatamente como em um terminal nativo.

<d-block-terminal
  engine="bootgly-cli"
  title="Bootgly CLI — demos ao vivo"
  commands="Client/Server:demo 1|Question:demo 27|Form:demo 28|Menu:demo 13|Alert:demo 12|Fieldset:demo 22|Table:demo 21|Chart:demo 36|Progress:demo 19|Scrollarea:demo 41|Spinner:demo 32|Timer:demo 33|Timeline:demo 34|Text (efeitos):demo 37|Textarea:demo 39|Prompt:demo 40|Logs:demo 25|Mouse:demo 23|Writing:demo 2|Texto:demo 6|Cursor:demo 3|Viewport:demo 24"
  height="420"
>
Escolha um demo e pressione executar — a saída que você vê é produzida pelos mesmos componentes documentados neste manual. Os demos de Mouse e Menu são **interativos**: clique no terminal primeiro; no Menu use as setas para mirar, Espaço para selecionar e Enter para confirmar; no Mouse apenas mova, clique e role — clique direito encerra. Use o botão de código-fonte para ler o arquivo PHP do demo.
</d-block-terminal>

## O que você está vendo

Cada comando mapeia para um arquivo real em [`projects/Demo/CLI/`](https://github.com/bootgly/bootgly/tree/main/projects/Demo/CLI) no repositório do framework. Um exemplo por componente roda aqui — cada variação vive na subpage Showcase do próprio componente:

- **Client/Server** — a API Terminal Client/Server (`Input->reading()`): nativamente ela faz fork de dois processos ligados por um pipe; aqui cada papel roda em seu próprio worker PHP WASM e um `MessageChannel` faz o papel do pipe. Clique no terminal, digite e pressione Enter — o Client ecoa suas teclas e o Server responde com o que você enviou. Setas viram emoji, `*` alterna o modo secreto, `#` o modo oculto.
- **Mouse** — Mouse Reporting em tempo real: o terminal habilita o rastreamento SGR e o PHP decodifica cada movimento, clique, arrasto e rolagem com coordenadas de coluna/linha. Clique direito encerra.
- **Logs** — o viewer de logs do modo Monitor: ~20 records simulados de workers entram ao vivo, e então seu teclado o conduz — Espaço pausa, ↑/↓ selecionam, Enter expande um record, `l` alterna o nível, `/` busca, `1-3` ligam/desligam canais, `q` sai.
- **Question** — entrada de linha validada: o Validator rejeita respostas inválidas com um Alert de Falha e re-pergunta (a variação mascarada/secreta vive no [showcase do Question](/manual/CLI/UI/Components/Question/showcase)).
- **Form** — o componente sequencial multi-campo: campos Text, Secret, Select e Confirm perguntados um por vez (`↑` + Enter volta), terminando em um Fieldset de resumo + Menu de confirmação.
- **Menu** — o componente interativo de seleção: setas miram, Espaço alterna, Enter confirma a seleção ou a opção mirada, letras filtram — `Ctrl+C` interrompe (variações de divisores, seleção única, horizontal, alinhamentos, viewport + filtro e grade vivem no [showcase do Menu](/manual/CLI/UI/Components/Menu/showcase)).
- **Alert, Fieldset, Table** — componentes de saída renderizando caixas estilizadas em ANSI, rótulos e colunas alinhadas.
- **Charts** — a família de charts ANSI: sparkline com gradiente, barras rotuladas e meters (o Graph braille ao vivo transmite no [showcase do Charts](/manual/CLI/UI/Components/Charts/showcase); o Bars também é impresso pelo `bootgly test benchmark`).
- **Progress** — a barra de progresso animada: corações se preenchem enquanto tempo decorrido, ETA e taxa atualizam em tempo real (variações indeterminada e grade multi-bar vivem no [showcase do Progress](/manual/CLI/UI/Components/Progress/showcase)).
- **Text (efeitos)** — texto animado: typewriter, fade-in e a onda de cor shimmer passando letra por letra.
- **Textarea** — o editor multilinha: Enter quebra linhas, setas navegam, Ctrl+D submete (linhas do stdin até EOF em pipes).
- **Scrollarea** — a banda de conteúdo bufferizada: 60 linhas alimentadas em uma janela de 12; `PgUp`/`PgDn` ou a roda do mouse a rolam, e a scrollbar aceita hover, clique e arrasto.
- **Prompt** — a entrada fixa no rodapé (mini REPL): a banda de conteúdo bufferiza a saída de `feed()` acima do frame de entrada — roda/`PgUp`/`PgDn` a rolam (scrollbar arrastável), `Ctrl+T` alterna a seleção de texto nativa, `↑`/`↓` percorrem o histórico, `Alt+Enter` vira multilinha.
- **Spinner** — o indicador de atividade indeterminada: frames braille animam enquanto o loop de trabalho conduz `spin()`, terminando em uma linha de resolução.
- **Timer** — o componente de contagem regressiva: tempo restante e porcentagem atualizam pelo relógio de parede; o Handler dispara uma vez no zero.
- **Timeline** — o fluxo guiado multi-etapas: etapas transicionam pending → active → done (ou failed) com notas, em um frame vertical conectado.
- **Writing** — saída ritmada, estilo máquina de escrever, via `Output->writing()`.
- **Texto** — os helpers de escape `Text` para cores e estilos de fonte (variações de estilos e modificação vivem no [showcase do Text](/manual/CLI/Terminal/Output/Text/showcase)).
- **Cursor** — movimentos de cursor orquestrando layouts dinâmicos (variações de forma e visibilidade vivem no [showcase do Cursor](/manual/CLI/Terminal/Output/Cursor/showcase)).
- **Viewport** — a tela deslocando para baixo e para cima via `Viewport->panDown()`/`panUp()`, um escape de scroll por passo.

Os aprofundamentos por componente vivem nas páginas em **CLI → UI**, **CLI → UX** e **CLI → Terminal**, várias das quais embutem seus próprios terminais ao vivo.
