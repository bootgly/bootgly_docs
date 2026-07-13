# Bootstrap files

São dois os arquivos de bootstrap principais do Bootgly: `bootgly` e `index.php`. O arquivo `bootgly` são utilizados pela interface CLI e plataforma Console. Já o arquivo `index.php`, como já é bem evidente, é utilizado por algum servidor externo como um servidor HTTP `Apache`, `Nginx`, `Litespeed`, etc., e serve para fazer a ponte que conecta o Bootgly a um Server API (SAPI) não-CLI.

## Arquivos de Bootstrap em Diretórios Recurso

Além dos arquivos de bootstrap principais, todo diretório do Bootgly que precisa inicializar ou indexar um recurso interno — suites de testes, registros de comandos, diretivas de template, e assim por diante — possui seu próprio arquivo de entrada com um único nome canônico: `autoboot.php`. Esse é o arquivo que o Bootgly carrega automaticamente ao entrar em um diretório, então há exatamente um nome a memorizar em todo o framework — do bootstrap da plataforma até cada diretório recurso.

Esses arquivos `autoboot.php` ficam no primeiro nível de cada Diretório Recurso do Bootgly. O nome é fixo e exposto pela constante `Bootgly\ABI\BOOTSTRAP_FILENAME`, de modo que o código do framework nunca o hardcoda. O nome em minúsculas é proposital: ele é ordenado *depois* dos arquivos de entidade em maiúsculo do diretório, de forma que as entidades de um diretório são definidas antes de seu `autoboot.php` executar.
