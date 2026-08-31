# Bootstrap files

O Bootgly possui três tipos de arquivos de bootstrap — e uma única convenção de nomes que diz o que cada arquivo carrega e o que ele retorna antes mesmo de você abri-lo:

- **Bootstrap global** — o `autoboot.php` da raiz: inicializa o processo uma única vez (constantes, autoloader, camadas).
- **Bootstrap de entrada de diretório** — um `autoboot.php` por Diretório Recurso: indexa os recursos internos daquele diretório.
- **Bootstrap específico** — um `<stem>.<Sufixo>.php` por entidade: retorna um objeto ou um recurso.

## Bootstrap global

Um processo Bootgly inicia por um único lançador: `bootgly`. A interface CLI, a plataforma Console e a plataforma Web (servida pelo próprio servidor HTTP CLI do Bootgly) começam todas ali, e sua primeira ação é dar `require` no `autoboot.php` da raiz. Não existe lançador SAPI web — inicializar sob um SAPI não-CLI (Apache, Nginx + FPM) é recusado com uma exceção explícita.

O `autoboot.php` da raiz define as constantes `BOOTGLY_*`, registra o autoloader e inicializa as seis camadas na ordem de dependência (`ABI → ACI → ADI → API → CLI → WPI`). Ele executa uma vez por processo — uma guarda de idempotência torna qualquer `require` posterior um no-op.

## Bootstrap de entrada de diretório (`autoboot.php`)

Além do bootstrap global, todo diretório do Bootgly que precisa inicializar ou indexar um recurso interno — suites de testes, registros de comandos, diretivas de template, e assim por diante — possui seu próprio arquivo de entrada com um único nome canônico: `autoboot.php`. Esse é o arquivo que o Bootgly carrega automaticamente ao entrar em um diretório, então há exatamente um nome a memorizar em todo o framework.

Esses arquivos `autoboot.php` ficam no primeiro nível de cada Diretório Recurso do Bootgly. O nome é fixo e exposto pela constante `Bootgly\ABI\BOOTSTRAP_FILENAME`, de modo que o código do framework nunca o hardcoda. O nome em minúsculas é proposital: ele é ordenado *depois* dos arquivos de entidade em maiúsculo do diretório, de forma que as entidades de um diretório são definidas antes de seu `autoboot.php` executar.

O que um bootstrap de entrada de diretório retorna é o **container ou registry** daquele diretório — o índice de recursos que o framework carregará em seguida:

- o `tests/autoboot.php` da raiz retorna um `Suites` (o registry de suites);
- o `tests/autoboot.php` de uma suite retorna um `Suite` (seus stems de casos, listados sem sufixo);
- um `commands/autoboot.php` registra as instâncias de comando do diretório;
- um `directives/autoboot.php` de template retorna o manifesto de diretivas.

## Bootstrap específico (`<stem>.<Sufixo>.php`)

Enquanto o `autoboot.php` indexa um diretório, um **arquivo de bootstrap específico** define uma entidade. Seu nome é um stem variável mais um sufixo fixo — e a caixa do sufixo já diz o tipo de retorno:

- **Sufixo com inicial MAIÚSCULA ⇒ o arquivo retorna um objeto da classe homônima.**
- **Sufixo minúsculo ⇒ o arquivo retorna um recurso — dados que não são um objeto.**

### Objetos (sufixo maiúsculo)

Um `1.1-basic.Test.php` retorna um `Test`; um `MyApp.Project.php` retorna um `Project`; um `cache.Config.php` retorna um `Config`. O sufixo nomeia a classe que o arquivo deve retornar, e o loader garante isso com `instanceof` — retornar qualquer outra coisa aborta o carregamento:

```php
use Bootgly\ACI\Tests\Suite\Test;

return new Test(
   description: 'It should sum',
   test: function () {
      return 1 + 1 === 2;
   }
);
```

### Recursos (sufixo minúsculo)

Um sufixo minúsculo já avisa que não há objeto a instanciar — o arquivo retorna dados puros ou um callable: `Bootgly.projects.php` retorna o registry de allow-list de projetos (um array); um `*.directive.php` retorna um mapa de closures compiladoras de diretivas; um `router.index.php` retorna os nomes dos route-sets (um array de strings); um `*.routes.php` retorna a generator-closure de um route set.

Sufixos de acrônimos são a única exceção ao sinal de caixa: acrônimos são sempre MAIÚSCULOS no Bootgly, então um `*.SAPI.php` mantém o nome em maiúsculas mesmo retornando uma `Closure`, e não um objeto `SAPI`.

Arquivos cujo valor de retorno é ignorado — templates (`*.template.php`), demos (`*.demo.php`) — são includes de efeito colateral, não arquivos de bootstrap, e permanecem totalmente minúsculos.

## Reference

| Sufixo | Retorna | Consumido por |
|--------|---------|---------------|
| `.Test.php` | objeto `Test` (`Bootgly\ACI\Tests\Suite\Test`) | suites de teste e runners E2E |
| `.Project.php` | objeto `Project` | carregamento de projetos e `bootgly project import` |
| `.Config.php` | objeto `Config` | `Configs` — configuração por escopo |
| `.projects.php` | `array` — registry de allow-list de projetos | `Projects` |
| `.directive.php` | `array<string,Closure>` — compiladores de diretivas | `Directives` de template |
| `.index.php` | `array<string>` — nomes de route-sets | `Router` HTTP |
| `.routes.php` | `Closure` — route set `(Request, Response, Router): Generator` | `Router` HTTP |
| `.SAPI.php` | `Closure` — handler generator (acrônimo: permanece maiúsculo) | scripts SAPI de projeto |
| `autoboot.php` | container/registry (`Suites`, `Suite`, comandos, diretivas) | carregamento de diretórios |
