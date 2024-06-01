# Bootstrap files

São dois os arquivos de bootstrap principais do Bootgly: `bootgly` e `index.php`. O arquivo `bootgly` são utilizados pela interface CLI e plataforma Console. Já o arquivo `index.php`, como já é bem evidente, é utilizado por algum servidor externo como um servidor HTTP `Apache`, `Nginx`, `Litespeed`, etc., e serve para fazer a ponte que conecta o Bootgly a um Server API (SAPI) não-CLI.

## Arquivos de Bootstrap em Diretórios Recurso

Além dos arquivos de bootstrap principais, existem outros arquivos que são utilizados para inicializar ou indexar algum outro recurso interno do Bootgly como suites de testes por exemplo. Esse arquivos possuem um padrão fixo em seu nome e devem começar com um arroba: `@.php`. Esses arquivos de bootstrap podem ser encontrados no primeiro nível dos Diretórios Recurso do Bootgly.
