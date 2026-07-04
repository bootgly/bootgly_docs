# Question

O demo oficial do Question roda ao vivo abaixo — código real do framework em PHP 8.4 WebAssembly, no seu navegador. Use o botão de source no terminal para ler o arquivo PHP exato em execução.

## Respostas validadas

O demo pergunta uma porta de servidor (Validator numérico — tente uma resposta inválida para ver o Alert de Falha e a re-pergunta) e depois um nome de projeto obrigatório com tentativas limitadas. Clique no terminal para interagir; respostas vazias assumem os defaults.

<d-block-terminal engine="bootgly-cli" title="Question — demo ao vivo" command="demo 27" height="380">
O `ask()` repete até o Validator aceitar: respostas inválidas renderizam a mensagem de erro como um Alert de Falha e re-perguntam; respostas vazias assumem o default; tentativas esgotadas (ou EOF) caem no default.
</d-block-terminal>

O componente está documentado no [overview do Question](/manual/CLI/UI/Components/Question/overview).
