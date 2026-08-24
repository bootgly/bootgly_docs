# Executando Testes

O Bootgly traz seu próprio framework de testes embutido — sem PHPUnit, sem scripts do Composer. Os testes são executados pela CLI `bootgly`, o mesmo executável usado para iniciar qualquer outro projeto Bootgly.

## Requisitos

- PHP 8.4+
- Bootgly instalado localmente (execute com `php bootgly`) ou globalmente (execute com `bootgly` após `sudo php bootgly setup`)

## Executar todas as suítes

Execute todas as suítes registradas a partir da raiz do repositório:

```bash :toolbar="true";
php bootgly test
```

O runner carrega o registro do **escopo resolvido** (veja abaixo), itera sobre cada diretório de suíte e imprime o resumo ao final. A primeira linha de todo run declara esse escopo — `[test] scope: … — …` — de modo que dois relatórios sejam sempre comparáveis. O código de saída é diferente de zero quando ao menos um `Test` falha — e também quando um run termina antes de a varredura completar, de modo que um run sequestrado ou interrompido nunca possa ser lido como sucesso. Todo run declara seu veredito no `stderr` como uma única linha `[test] PASSED|FAILED|INCOMPLETE — …`, que sobrevive a um `stdout` redirecionado.

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

O `tests/autoboot.php` de um projeto retorna um registro `Suites` listando os
diretórios de suíte dele (`bootgly project create` gera um com uma suíte de
exemplo); um arquivo que retorna uma única `Suite` é aceito como projeto de
uma suíte só.

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
| `list` | Imprime cada caso conforme executa e para no primeiro caso que falhar. Padrão para runs focados (`php bootgly test <suite>` / `<suite> <case>`) e para **qualquer** run cujo `stdout` não seja um terminal — um run redirecionado ou em pipe é um log, então a CI recebe a saída completa por caso em vez de um dashboard. Esse fallback muda **apenas a renderização**: um full run continua visitando todas as suítes, exatamente como o heatmap faz. Passar `--view=list` explicitamente é o que pede o contrato de parar no primeiro caso que falhar. |
| `heatmap` | Renderiza um card de dashboard por suíte — moldura arredondada, um medidor de progresso e um quadrado colorido por assertion (verde passed, vermelho suave failed, bege skipped). O medidor enche de forma determinística por **test cases** (a contagem deles é conhecida antes de rodar), enquanto os quadrados são as **assertions** individuais descobertas conforme cada caso roda — então uma suíte de 63 cases pode mostrar 254 assertions. Em terminais interativos o card pinta ao vivo conforme os casos executam. Todas as suítes executam até o fim, as falhas são listadas sob cada card — junto com qualquer saída de debug (`dump()`) capturada pelo caso falho — e o código de saída é diferente de zero quando algum caso falhou. Padrão para full runs (`php bootgly test`) em um terminal interativo. Passe `--view=heatmap` explicitamente para renderizar os cards também em um pipe ou arquivo. |

O card é composto pelo runner com três componentes: um [Fieldset](/manual/CLI/UI/Base/Fieldset) encaixota um [Meter de Charts](/manual/CLI/UI/Components/Charts) (o progresso por cases) e um [Heatmap](/manual/CLI/UI/Components/Heatmap) (a grade de assertions). Agentes de IA (`AI_AGENT=1`) sempre recebem o documento JSON de resultados, independentemente da view. Quando um run não produz documento, o `stdout` fica vazio — o motivo e a saída do processo filho vão para o `stderr`.

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
- Combine `--coverage-diff` com um índice de suíte específico para verificar se linhas novas ou alteradas estão cobertas.
- Em CI, prefira a forma global `bootgly test` — subprocessos abertos via `proc_open` herdam variáveis de ambiente da CI (ex.: `GITHUB_ACTIONS`), o que pode alterar o registro das suítes se seus testes dependem de `Environment::CI_CD`.
