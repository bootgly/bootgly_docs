# Textbox

As cinco demos oficiais do Textbox rodam ao vivo abaixo — código real do framework em PHP 8.4 WebAssembly, no seu navegador, **totalmente interativas**. Clique em um terminal para dar o teclado a ele e use o botão de source para ler o arquivo PHP exato em execução.

## Respostas validadas

Uma porta de servidor com Validator numérico (tente uma resposta inválida para ver o Alert de Falha e a re-pergunta) e depois um nome de projeto obrigatório com tentativas limitadas — respostas vazias assumem os valores padrão.

<d-block-terminal engine="bootgly-cli" title="Textbox — entrada validada" command="demo 27" height="380">
O `ask()` repete até o Validator aceitar: respostas inválidas renderizam a mensagem de erro como um Alert de Falha e perguntam de novo; respostas vazias assumem o valor padrão; tentativas esgotadas (ou EOF) caem nele. O metadado `attempt` conta as rodadas consumidas.
</d-block-terminal>

## Entrada mascarada (secreta)

Uma senha que nunca chega à tela e depois um API token cujo valor padrão fica escondido atrás da máscara:

<d-block-terminal engine="bootgly-cli" title="Textbox — entrada mascarada" command="demo 29" height="380">
O `mask` ecoa um caractere por tecla digitada (`•` e `*` aqui) enquanto o eco do kernel permanece desligado, então o valor nunca é pintado. Um valor padrão mascarado renderiza como a máscara repetida três vezes — qualquer que seja seu tamanho real — e uma resposta vazia ainda assume o valor real.
</d-block-terminal>

## Autocompletando com opções

Um país escolhido entre vinte opções no modo `strict` e depois um editor em que as opções são apenas sugestões:

<d-block-terminal engine="bootgly-cli" title="Textbox — opções" command="demo 38" height="380">
Digitar filtra a lista, `↑`/`↓` miram, `Tab` completa para o label mirado, `Esc` fecha a lista mantendo o texto digitado e Enter submete. `strict = true` aceita apenas uma opção listada; com ele desligado, o texto livre vence e as opções apenas auxiliam.
</d-block-terminal>

## Confirmando (yes/no)

Duas confirmações com valores padrão opostos — o sufixo reflete qual delas o Enter assume:

<d-block-terminal engine="bootgly-cli" title="Textbox — confirm" command="demo 26" height="300">
O `confirm()` renderiza ` [Y/n] ` ou ` [y/N] ` e retorna um `bool`. `y`/`yes`/`n`/`no` são aceitos sem diferenciar maiúsculas; respostas vazias e EOF assumem o padrão.
</d-block-terminal>

## Buscando com um source dinâmico

Uma busca de componentes sobre opções estáticas (chaves string — a resposta é a chave, não o label) e depois uma busca de extensões alimentada por uma Closure com uma consulta lenta simulada:

<d-block-terminal engine="bootgly-cli" title="Textbox — busca" command="demo 53" height="420">
Opções estáticas filtram aqui — sem diferenciar maiúsculas, casando em qualquer posição do label. Um `source` é re-consultado com o texto atual a cada edição e filtra por conta própria, então seus resultados são listados exatamente como retornados. O `viewport` limita as linhas visíveis e as bordas cortadas se anunciam com `↑ N more` / `↓ N more`.
</d-block-terminal>

O componente está documentado no [overview do Textbox](/manual/CLI/UI/Components/Textbox/overview).
