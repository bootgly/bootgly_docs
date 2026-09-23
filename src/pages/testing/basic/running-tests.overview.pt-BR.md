# Executando Testes

O Bootgly traz seu próprio framework de testes embutido — sem PHPUnit, sem scripts do Composer. Os testes são executados pela CLI `bootgly`, o mesmo executável usado para iniciar qualquer outro projeto Bootgly.

## Requisitos

- PHP 8.4+
- Bootgly instalado localmente (execute com `php bootgly`) ou globalmente (execute com `bootgly` após `php bootgly setup`)

## Executar todas as suítes

Execute todas as suítes registradas a partir da raiz de um checkout do framework ou de uma plataforma (em um **Kit**, onde você está decide o escopo — veja abaixo):

```bash :toolbar="true";
php bootgly test
```

O runner carrega o registro do **escopo resolvido** (veja abaixo), itera sobre cada diretório de suíte e imprime o resumo ao final. Um run humano abre com esse escopo — `[test] scope: …` seguido do registro resolvido, ou do conjunto de projetos quando um run fundido a partir de `projects/` não tem registro único; runs de agente leem o documento JSON de resultados no lugar. O status de saída é diferente de zero para qualquer run que falhe ou fique incompleto.

## Onde você está decide o escopo

Em um **Bootgly Kit**, `bootgly test` não tem flags para decorar: o diretório
de trabalho seleciona o que roda.

| Diretório de trabalho | O que roda |
| --------------------- | ---------- |
| dentro de um projeto (ex.: `projects/App`) | as suítes daquele projeto — o registro `tests/autoboot.php` dele; o caminho registrado mais longo vence, então um `projects/App/API` aninhado é um escopo próprio |
| `projects/` | **todos** os projetos registrados, fundidos em um único run — o conjunto é impresso antes, e os totais reportam *registrados vs executados* |
| um diretório não registrado sob `projects/` | recusado, nomeando o diretório e o registro — registre o projeto primeiro |
| a raiz do kit (ou qualquer outro lugar) | em um terminal, um seletor pergunta qual projeto (ou todos); sem terminal, os projetos registrados e as invocações com `cd` são impressos no `stderr` e o run sai com código diferente de zero |

As flags de plataforma sobrepõem o diretório de trabalho em qualquer lugar:
`--bootgly` roda as suítes do framework, `--console` e `--web` as das
plataformas. Em um checkout do framework ou de plataforma, `bootgly test`
continua rodando o `tests/autoboot.php` do próprio checkout.

O `tests/autoboot.php` de um projeto retorna **sempre** um registro `Suites`
listando os diretórios de suíte dele, e cada um desses diretórios tem o
`autoboot.php` que retorna a `Suite` em si (`bootgly projects create` gera
exatamente isso: um registro mais `tests/example/`). Um registro que retorna
uma `Suite` é recusado, nomeando o arquivo — ele teria de ser lido duas vezes,
uma como registro e outra como bootstrap da suíte que ele representava, o que
torna fatal qualquer `class`, `function` ou `define()` dentro dele e roda todo
`pretest()` em dobro. Um exemplo embarcado importado para um kit antes desse
contrato ainda carrega o layout antigo — reimporte com
`bootgly projects create <Nome> --from=<Nome> --refresh`.

## Executar uma suíte específica

Cada diretório de suíte listado no registro resolvido é endereçável pelo seu índice (começando em 1):

```bash :toolbar="true";
php bootgly test 16
```

O exemplo acima executa somente a suíte `16`. Os índices seguem a ordem declarada no construtor `Suites(...)` do registro resolvido — em um run fundido de `projects/`, o conjunto impresso mostra a faixa de índices de cada projeto.

## Executar um caso de teste específico

Passe o índice da suíte seguido do índice do caso de teste para executar um único `Test`:

```bash :toolbar="true";
php bootgly test 16 1
```

Ambos os índices começam em 1. Use esta forma para focar em um único caso falhando durante o desenvolvimento, sem reexecutar a suíte inteira.

## Ajuda

Liste os argumentos e opções aceitos direto do terminal:

```bash :toolbar="true";
php bootgly test --help
```

`-h` é a forma curta da mesma flag. A ajuda imprime as tabelas de argumentos e opções e sai com sucesso — nenhuma suíte é executada. Para as opções específicas de benchmark, use `php bootgly test benchmark --help` (veja a seção Benchmarks abaixo).

## Verbosidade

Aumente o detalhe das mensagens de **falha** de assertion com a opção global `-v`:

```bash :toolbar="true";
php bootgly test -v
```

`-v`/`-vv`/`-vvv` é a mesma opção global de verbosidade que todo comando Bootgly aceita (veja [Commands](/manual/CLI/Commands)). No `test` ela é repassada aos Fallbacks de falha das assertions: no nível padrão a falha imprime placeholders redigidos (`actual`, `expected`); com `-v` os valores escalares reais são mostrados e arrays são codificados em JSON; `-vv` também serializa objetos na mensagem. Assertions que não implementam detalhe graduado sempre imprimem seus valores.

## Visualização (View)

Escolha como os resultados são renderizados com `--view=`:

```bash :toolbar="true";
php bootgly test --view=heatmap
```

| Modo | Comportamento |
| ---- | ------------- |
| `list` | Imprime cada caso conforme executa. Padrão para runs focados (`php bootgly test <suite>` / `<suite> <case>`) e para **qualquer** run cujo `stdout` não seja um terminal — um run redirecionado ou em pipe é um log, então a CI recebe a saída completa por caso em vez de um dashboard. A view é **apenas renderização**: seja qual for o modo, o run continua executando tudo o que lhe foi pedido (veja [Fail-fast](#fail-fast)). |
| `heatmap` | Renderiza um card de dashboard por suíte — moldura arredondada, um medidor de progresso e um quadrado colorido por assertion (verde passed, vermelho suave failed, bege skipped). O medidor enche de forma determinística por **test cases** (a contagem deles é conhecida antes de rodar), enquanto os quadrados são as **assertions** individuais descobertas conforme cada caso roda — então uma suíte de 63 cases pode mostrar 254 assertions. Em terminais interativos o card pinta ao vivo conforme os casos executam. Todas as suítes executam até o fim, as falhas são listadas sob cada card — junto com qualquer saída de debug (`dump()`) capturada pelo caso falho — e o código de saída é diferente de zero quando algum caso falhou. Padrão para full runs (`php bootgly test`) em um terminal interativo. Passe `--view=heatmap` explicitamente para renderizar os cards também em um pipe ou arquivo. O dashboard precisa do run inteiro, então um `--view=heatmap` explícito não pode ser combinado com `--fail-fast` — o runner recusa o par com um alerta. |

O card é composto pelo runner com três componentes: um [Fieldset](/manual/CLI/UI/Base/Fieldset) encaixota um [Meter de Charts](/manual/CLI/UI/Components/Charts) (o progresso por cases) e um [Heatmap](/manual/CLI/UI/Components/Heatmap) (a grade de assertions). Agentes de IA (`AI_AGENT=1`) sempre recebem o documento JSON de resultados, independentemente da view. Quando um run não produz documento, o `stdout` fica vazio — o motivo e a saída do processo filho vão para o `stderr`.

Um run de agente executa tudo o que lhe foi pedido, como qualquer outro, e o documento lista todas as falhas em `failures`. Só o `--fail-fast` o faz parar no primeiro caso que falha — e o documento diz isso em vez de esconder: `suites.total` é o que o registro resolvido **registrou**, e toda suíte que o run não alcançou entra em `suites.skipped`. Então um run com `--fail-fast` que parou na primeira de 105 suítes reporta `total: 105, failed: 1, skipped: 104, passed: 0`, nunca um total encolhido com `skipped: 0`. Dentro de uma suíte que carregou, o mesmo vale para os casos: um caso registrado que o run nunca alcançou — uma parada por `--fail-fast`, um Throwable que escapou da suíte, um servidor de teste que parou de aceitar requisições — entra em `cases.skipped` com a mensagem `not reached`. Só os casos de uma suíte que nunca carregou são desconhecidos.

## O documento de resultados do agente

`AI_AGENT=1` — ou qualquer um dos marcadores que o `Bootgly\API\Environment\Agent` conhece
(`CLAUDECODE`, `CODEX_THREAD_ID`, `GEMINI_CLI`, …) — desliga a saída humana e faz o runner imprimir
**um único objeto JSON, em uma linha**, na `stdout`. Esse documento é produzido pelo
`Bootgly\ACI\Tests\Results`: o runner chama `record()` uma vez por caso de teste, o `compile()`
funde esses registros com os totais das suítes no array de resultado, e o `encode()` o escreve.

```bash :toolbar="true";
AI_AGENT=1 php bootgly test 34 --fail-fast
```

Um run real da suíte `34` (`Bootgly/WPI/Nodes/HTTP_Server_CLI/Request/Session/`), literal:

```json
{"result":"passed","agent":"1","suites":{"total":114,"failed":0,"skipped":113,"passed":1},"cases":{"total":12,"failed":0,"skipped":0,"passed":12},"assertions":12,"duration_ms":105.54}
```

| Chave | Tipo | Significado |
| ----- | ---- | ----------- |
| `result` | `string` | `failed` quando algum caso falhou **ou** alguma suíte falhou; `passed` caso contrário. Uma suíte pode falhar sem nenhum caso falho — um erro lançado no corpo de um teste a aborta antes de os casos dela se registrarem — e o veredito ainda lê `failed`. |
| `agent` | `null\|string` | O agente detectado: o valor de `AI_AGENT` com espaços aparados quando ele está definido (`"1"` acima), senão o nome por trás da variável marcadora (`claude`, `codex`, `gemini`, …). |
| `suites.total` | `int` | Quantas suítes o registro resolvido **registrou** — não quantas rodaram. O run focado acima registrou todas as 114. |
| `suites.failed` | `int` | Suítes que terminaram com ao menos um caso falho. |
| `suites.skipped` | `int` | `total − failed − passed`: toda suíte registrada que não reportou desfecho — as 113 que um run focado nunca pediu, e as que um run com `--fail-fast` nunca alcançou. |
| `suites.passed` | `int` | Suítes que rodaram até o fim sem falha. |
| `cases.total` | `int` | `failed + skipped + passed`: todo caso registrado das suítes que carregaram — os que rodaram e os que o run nunca alcançou (skipped, `not reached`). Os casos de uma suíte que nunca carregou são desconhecidos, então nada é contado por eles. |
| `cases.failed` / `cases.skipped` / `cases.passed` | `int` | Contagens por status sobre os casos registrados. |
| `assertions` | `int` | Assertions executadas nas suítes que rodaram. |
| `duration_ms` | `float` | Tempo de parede do run, em milissegundos, arredondado a duas casas. |
| `failures` | `array` | **Presente só quando ao menos um caso falhou.** Um objeto por caso falho: `suite` (o diretório da suíte), `case` (o índice dele, começando em 1), `file`, `message` (o help da falha da assertion, ou a causa que o runner viu — classe, mensagem e origem de um Throwable, um timeout, um servidor inalcançável) e `elapsed_ms`. Um Throwable que escapa de uma suíte também é um caso falho: o caso que estava rodando, ou `case: 0` com `file` vazio quando nenhum caso tinha começado ou a suíte nunca carregou. |

Um run que falha carrega essa última chave, e lista **todas** as falhas — é o `--fail-fast` que a
reduz à primeira:

```json
{"result":"failed","agent":"1","suites":{"total":114,"failed":1,"skipped":113,"passed":0},"cases":{"total":2,"failed":1,"skipped":0,"passed":1},"assertions":7,"duration_ms":89.32,"failures":[{"suite":"Bootgly/WPI/Nodes/HTTP_Server_CLI/Request/Session/","case":4,"file":"4-session-regenerate.Test.php","message":"the session id changed but the payload did not follow","elapsed_ms":6.25}]}
```

Leia a última linha da `stdout` e mais nada: o status de saída é diferente de zero para um run que
falha, e um run que não produziu documento deixa a `stdout` vazia, com o motivo na `stderr`.

## Fail-fast

Por padrão um run executa tudo o que lhe foi pedido — todas as suítes de um full run, todos os casos de um run focado — e reporta todas as falhas. Passe `--fail-fast` para parar no primeiro caso que falhar:

```bash :toolbar="true";
php bootgly test --fail-fast
php bootgly test 23 --fail-fast
AI_AGENT=1 php bootgly test --fail-fast
```

`--fail-fast` é um switch sem valor (um valor falha com um alerta) e decide o contrato sozinho — `--view` nunca decide, nem o modo agente. Uma suíte que gerencia os próprios casos (os harnesses E2E declaram `exitOnFailure: false` no autoboot) ainda executa os casos restantes; o run então para ao fim dessa suíte. Sem `--fail-fast`, o harness do servidor HTTP executa todos os casos mesmo quando um falha, estoura o tempo ou tem a requisição lançando exceção; o harness do cliente HTTP anda em lock-step com o servidor mock, então para na primeira falha e reporta o resto como `not reached`. As suítes nunca alcançadas são reportadas como skipped, tanto na linha de resumo quanto no documento do agente.

## Cobertura (Coverage)

O runner aceita flags de cobertura tratadas por `Bootgly\ACI\Tests\Coverage`:

| Opção | Descrição |
| ----- | --------- |
| `--coverage` | Ativa cobertura com o driver detectado automaticamente. |
| `--coverage-driver=<name>` | Força um driver: `xdebug`, `pcov`, `native` ou `nothing`. |
| `--coverage-native-mode=<mode>` | Modo do driver nativo (padrão `strict`). |
| `--coverage-report=<format>[:<path>]` | Formato do relatório (`text`, `html`, `clover`). Sem `path`, o relatório é impresso na stdout. |
| `--coverage-diff` | Restringe o relatório às linhas alteradas em relação à árvore de trabalho. |

Exemplo — driver nativo, relatório de texto na stdout, escopo apenas da suíte `8`:

```bash
php -d opcache.enable_cli=0 bootgly test 8 \
   --coverage-driver=native \
   --coverage-report=text
```

O driver nativo exige `opcache.enable_cli=0` para que os arquivos de origem não sejam pré-compilados antes que o filtro de cobertura possa instrumentá-los. As opções de interpretador passadas assim (`-d`, `-n`, `-c`) são levadas para o run mesmo quando um ambiente de agente de IA faz o `bootgly test` se reinvocar.

## Benchmarks

O subcomando `benchmark` executa casos de performance localizados em `benchmarks/`:

```bash
php bootgly test benchmark <CASE> --opponents=bootgly --loads=<set>:*
```

Use `--help` após o nome do caso para inspecionar as opções específicas do runner:

```bash
php bootgly test benchmark <CASE> --help
```

## Análise estática

Arquivos de teste devem permanecer livres de erros de análise estática. Execute o PHPStan com a configuração do projeto após escrever ou alterar testes:

```bash :toolbar="true";
vendor/bin/phpstan analyse -c @/phpstan.neon
```

## Padrões comuns

- Reexecute um teste que falhou isoladamente com `php bootgly test <suite> <case>` antes de fazer push.
- Caçando uma falha numa suíte? `php bootgly test <suite> --fail-fast` para no primeiro caso vermelho; sem ele a suíte sempre roda até o fim.
- Combine `--coverage-diff` com um índice de suíte específico para verificar se linhas novas ou alteradas estão cobertas.
- Em CI, prefira a forma global `bootgly test` — subprocessos abertos via `proc_open` herdam variáveis de ambiente da CI (ex.: `GITHUB_ACTIONS`), o que pode alterar o registro das suítes se seus testes dependem de `Environment::CI_CD`.

## Referência

### Results

`Bootgly\ACI\Tests\Results` — o coletor estático por trás do documento do agente. O `TestCommand`
liga o `Results::$enabled` quando o `Agent::detect()` reporta um agente e guarda o nome desse
agente em `Results::$agent`. Seus dados públicos são `$cases` (todos os casos registrados),
`$suitesTotal`, `$suitesFailed`, `$suitesSkipped`, `$suitesPassed`, `$assertions` e `$durationMs`.

```php
public static function record (string $suite, int $case, string $file, string $status, null|string $message = null, float $elapsedMs = 0): void
```

Registra um caso de teste. `$status` é `'passed'`, `'failed'` ou `'skipped'`; `$message` carrega o
help da falha, ou por que um caso foi pulado sem rodar (`not reached`, `ignored`), e fica `null`
nos demais casos; `$elapsedMs` é arredondado a duas casas já ao ser
guardado. Retorna de imediato enquanto `$enabled` for `false`, então um run humano não paga nada
por ele.

```php
public static function compile (): array
```

Funde os casos registrados e os totais das suítes no array de resultado — exatamente a estrutura do
documento JSON acima, com `failures` incluída só quando um caso falhou. As contagens de casos vêm
de `$cases`, e `suites.skipped` de `total − failed − passed`, então um run com `--fail-fast`
reporta as suítes que nunca alcançou em vez de encolher o total dele (e recai no `$suitesSkipped`
incremental caso essa subtração fique negativa).

```php
public static function encode (): string
```

O `compile()` como um documento JSON de uma linha (`JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE`)
terminado por uma quebra de linha — o que o runner escreve na `stdout`.
