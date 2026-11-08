# Code Coverage

O Bootgly possui cobertura de código integrada ao próprio subsistema `Bootgly\ACI\Tests`. A cobertura não depende de PHPUnit nem de bibliotecas externas: a sessão é controlada por `Coverage`, os backends implementam `Coverage\Driver` e os formatos de saída implementam `Coverage\Report`.

## Visão geral

A cobertura mede quais linhas executáveis foram percorridas durante a execução dos testes e gera relatórios em formatos próprios para leitura humana ou integração com CI.

| Recurso | Papel |
| ------- | ----- |
| `Coverage` | Sessão de cobertura: inicia, para, filtra e renderiza relatórios. |
| `Coverage\Driver` | Contrato dos backends que coletam hits por linha. |
| `Coverage\Drivers\XDebug` | Usa `ext-xdebug` quando o modo `coverage` está ativo. |
| `Coverage\Drivers\PCOV` | Usa `ext-pcov` quando a extensão está disponível. |
| `Coverage\Drivers\Native` | Driver puro PHP com tokenizer e stream filter. |
| `Coverage\Drivers\Nothing` | Driver no-op para smoke tests; não mede nada, então o runner nunca gera relatório nem aplica gate com ele. |
| `Coverage\Gate` | Confere um mapa de hits medido contra um limite mínimo de statements e a regra "nenhuma classe zerada". |
| `Coverage\Changes` | Lê as linhas que um range do git alterou, para um diff de cobertura. |
| `Coverage\Reports\Text` | Relatório textual para terminal. |
| `Coverage\Reports\HTML` | Relatório HTML simples. |
| `Coverage\Reports\Clover` | XML Clover para CI. |

## Uso pela CLI

Para gerar cobertura em texto com o driver automático:

```bash :toolbar="true";
php bootgly test --coverage --coverage-report=text
```

A detecção automática escolhe o Xdebug (em modo coverage) e depois o PCOV. Quando nenhum dos dois consegue medir, o run para **antes de executar qualquer suíte**, sai com código diferente de zero e não escreve relatório — um job de CI nunca recebe um clover com cara de válido e zero statements:

```text
[test] Coverage: no coverage driver is loaded — nothing would be measured, so no report is written.
[test] Load Xdebug (XDEBUG_MODE=coverage) or PCOV, or use the pure-PHP driver:
[test]    php -d opcache.enable_cli=0 bootgly test --coverage-driver=native
```

Uma extensão carregada que não consegue medir para o run do mesmo jeito, já com a correção: Xdebug sem `xdebug.mode=coverage`, ou PCOV com `pcov.enabled=0` (o default de produção de várias distribuições — rode `php -d pcov.enabled=1 bootgly test --coverage`). O driver `Native` nunca é detectado automaticamente: ele precisa iniciar antes de os arquivos medidos serem carregados e exige `opcache.enable_cli=0`, então é sempre escolhido explicitamente.

Para selecionar um driver explicitamente:

```bash
php bootgly test 11 --coverage-driver=xdebug --coverage-report=text
php bootgly test 11 --coverage-driver=pcov --coverage-report=clover:/tmp/coverage.xml
php bootgly test 11 --coverage-driver=nothing --coverage-report=text
```

### Driver Native

O driver `Native` é o backend sem extensão. Ele instrumenta arquivos PHP no carregamento pelo autoloader do Bootgly.

```bash :toolbar="true";
php -d opcache.enable_cli=0 bootgly test 11 --coverage-driver=native --coverage-report=text
```

O `Native` exige `opcache.enable_cli=0`, porque OPcache pode reaproveitar bytecode não instrumentado. Ele também mede apenas arquivos carregados depois do início da sessão de cobertura: um arquivo no escopo carregado antes (pelo bootstrap) fica fora do relatório, sem aviso. Com o OPcache ligado, ou um `--coverage-native-mode` desconhecido, o run para na hora com uma linha `[test] Coverage:` e código de saída 1.

### Diff de cobertura

O relatório `text` pode mostrar um diff por arquivo com linhas cobertas e não cobertas:

```bash
php -d opcache.enable_cli=0 bootgly test 11 \
   --coverage-driver=native \
   --coverage-report=text \
   --coverage-diff
```

Passe um range do git para `--coverage-diff` e o relatório mede **apenas as linhas que esse range adicionou ou modificou** — em todos os formatos, não só no `text`:

```bash :toolbar="true";
php bootgly test --coverage --coverage-diff=origin/main...HEAD
```

O range é qualquer revisão que o `git diff` aceite: `origin/main...HEAD` (as mudanças de uma branch), `HEAD~3..HEAD` ou uma revisão só, como `main` (comparada com a árvore de trabalho: edições não commitadas em arquivos rastreados entram, arquivos novos não rastreados não). Ele é lido no repositório do diretório de trabalho; um range que começa com `-` é recusado. Só as linhas alteradas contam — configurações locais do git (`diff.relative`, contexto entre hunks, detecção de cópias, `GIT_DIFF_OPTS`, variáveis de pathspec e de localização do repositório como `GIT_DIR`) não ampliam, reduzem nem deslocam essas linhas, e um conteúdo que o git chamaria de binário (um byte NUL, um atributo `-diff`) continua sendo lido linha a linha; só arquivos PHP (`.php` em qualquer caixa) são lidos, então um range que adiciona assets continua pequeno. O coverage mede a árvore de trabalho em checkout, então o range precisa terminar nela — `origin/main...HEAD` num checkout de `HEAD`: um range cujo lado novo é outro commit (`main..feature` com `main` em checkout) aponta linhas e arquivos que o run não tem, e um arquivo PHP alterado que a árvore de trabalho não tem interrompe o run com um erro em vez de ser ignorado. Um range sobre um merge commit (`<merge>^!`) é recusado, porque o diff combinado dele deixa de fora arquivos que vieram limpos de um dos lados: use o range do primeiro pai, `<merge>^1..<merge>`.

Uma linha alterada conta pela instrução a que pertence: uma instrução em várias linhas é executável em uma delas, então um argumento, um elemento de array, o corpo de um heredoc ou o `);` de fechamento alterado mede essa instrução, enquanto uma linha de comentário ou em branco não mede nada. Uma linha no corpo de uma estrutura de controle mede a instrução do corpo, nunca o cabeçalho (`if (…)`, `case …:`, `foreach (…):`), que roda quer o corpo rode ou não; uma instrução do corpo usa primeiro a sua própria linha executável, e uma escrita só na linha do cabeçalho não se distingue dele na cobertura por linha, então conta com os hits dessa linha — como um `if ($a) return;` de uma linha.

Um arquivo PHP alterado que nenhum teste carregou é medido com zero hits em vez de sumir do relatório. Um arquivo alterado dentro de um diretório de recursos (`examples/`, `fixtures/`, `stubs/`, `templates/`, `tests/`) não é código a cobrir e não entra quando nenhum teste o carregou; scripts de teste nunca contam. Esses diretórios são lidos abaixo do diretório de trabalho, então um checkout que fica ele mesmo dentro de um diretório `tests/` mantém seus arquivos. Com o driver `Native`, um arquivo alterado no escopo que ele nunca instrumenta (um caminho sob `/tmp/`, `/vendor/` ou `/storage/`, e o próprio motor de coverage, o `Bootgly/ACI/Tests/Coverage/` do framework) é reportado como impossível de medir quando uma linha alterada contém código (uma edição só de comentário não contém), e um gate reprova em vez de tratá-lo como inalterado. O mesmo vale sem range: um arquivo que um teste carregou mas que o `Native` nunca instrumenta é listado como impossível de medir, e um gate reprova sobre ele — exceto o próprio motor de coverage, que o runner sempre carrega.

## Gate de cobertura

Um gate transforma um run de cobertura em uma verificação de passa/falha. O run continua executando todas as suítes e escrevendo o relatório; depois o gate confere os statements medidos e, quando uma regra não se cumpre, o run falha: código de saída diferente de zero, os motivos na STDERR, um veredito `FAILED … coverage failed` e — para agentes de IA — `"result":"failed"` com a chave `coverage` no documento JSON:

```json
{"result":"failed", …, "coverage":{"gate":"failed","failures":["Coverage gate: 76.42% of 1830 statements covered (1398), below the floor of 80%."]}}
```

### Limite mínimo de statements

Falha quando a fração coberta dos statements executáveis fica abaixo de uma porcentagem:

```bash :toolbar="true";
php bootgly test --coverage --coverage-floor=80
```

```text
[test] Coverage gate: 76.42% of 1830 statements covered (1398), below the floor of 80%.
```

Um statement é uma linha executável; ele está coberto quando rodou pelo menos uma vez. Um limite igual à fração medida passa; o limite aceita até quatro casas decimais, comparadas com exatidão (`--coverage-floor=64.4` passa 161 de 250).

### Nenhuma classe zerada

Falha quando um arquivo que declara uma classe, trait ou enum tem statements executáveis e nenhum deles rodou:

```bash :toolbar="true";
php bootgly test --coverage --coverage-classes
```

```text
[test] Coverage gate: 2 class source(s) with no covered statement:
[test]   /app/Bootgly/ABI/Foo.php
[test]   /app/Bootgly/ABI/Bar.php
```

### Medir um diretório inteiro

Xdebug e PCOV só reportam arquivos que o run carregou, então um arquivo que nenhum teste tocou fica invisível para as duas regras. `--coverage-path` mede todo arquivo PHP sob um diretório: os que o run nunca carregou entram no relatório com zero hits.

```bash :toolbar="true";
php bootgly test --coverage --coverage-path=Bootgly/ --coverage-floor=80 --coverage-classes
```

- O caminho substitui os escopos das suítes no relatório (um índice de suíte continua escolhendo quais testes rodam).
- Arquivos dentro de um diretório de recursos abaixo do caminho — `examples/`, `fixtures/`, `stubs/`, `templates/`, `tests/` (`Coverage::RESOURCES`) — ficam fora do conjunto não carregado; um arquivo de recurso que um teste carrega continua no relatório.
- Com o driver `Native`, os arquivos que ele nunca instrumenta (veja acima) são listados como impossíveis de medir em vez de entrar com zero, e um gate reprova sobre eles: meça esses caminhos com Xdebug ou PCOV.
- Um subdiretório que o run não consegue ler é ignorado; um caminho que não é um diretório legível reprova o run.
- As linhas executáveis de um arquivo não carregado são estimadas pelo analisador estático do driver `Native` — compare limites medidos com o mesmo driver.

### Gate das mudanças de um pull request

Combine um range com um limite mínimo para exigir cobertura apenas do código novo:

```bash :toolbar="true";
php bootgly test --coverage --coverage-path=Bootgly/ --coverage-diff=origin/main...HEAD --coverage-floor=90
```

Sob um range, as duas regras valem para os statements alterados: `--coverage-classes` aponta uma classe cujos statements alterados não rodaram. Um range que não alterou nenhum statement do escopo medido (só documentação ou testes) não deixa nada para o gate: o run avisa, reporta `"gate":"skipped"` aos agentes e passa.

### Quando um gate não pode passar

- Uma medição sem nenhum statement executável reprova todas as regras — o gate nunca passa com um relatório vazio (a única exceção é um range que não alterou nada medido, acima).
- Um gate com `--coverage-driver=nothing` falha antes de qualquer suíte rodar.
- `--coverage-floor` aceita um número de `0` a `100` com até quatro casas decimais; qualquer outra coisa para o run antes de começar.
- Um arquivo alterado que o driver não consegue medir reprova o gate (veja acima).

## Cobertura no CI

Rode todas as suítes uma vez com o PCOV, aplique o gate ao resultado e guarde o relatório clover. Num pull request, o mesmo comando aplica o gate só às linhas que o pull request alterou. Um job do GitHub Actions para um Kit:

```yaml
coverage:
  runs-on: ubuntu-24.04
  steps:
    - uses: actions/checkout@v5
      with:
        submodules: recursive   # Bootgly, Console e Web do Kit
        fetch-depth: 0          # o range do pull request precisa da branch base
        persist-credentials: false
    - uses: shivammathur/setup-php@v2
      with:
        php-version: '8.4'
        coverage: pcov
        ini-values: pcov.enabled=1, pcov.directory=${{ github.workspace }}
    - name: Coverage gate
      working-directory: projects   # todos os projetos registrados
      env:
        EVENT: ${{ github.event_name }}
        BASE: ${{ github.base_ref }}
      run: |
        set -- --coverage --coverage-driver=pcov --coverage-path=. \
           --coverage-floor=70 --coverage-report=clover:"$RUNNER_TEMP/coverage.xml"
        if [ "$EVENT" = pull_request ]; then
           set -- "$@" --coverage-diff="origin/$BASE...HEAD" --coverage-classes
        fi
        php ../bootgly test "$@"
    - uses: actions/upload-artifact@v4
      if: always()
      with:
        name: coverage-clover
        path: ${{ runner.temp }}/coverage.xml
```

- Rode a partir de `projects/` (todos os projetos registrados) ou do diretório de um projeto: onde você está decide o escopo, e um run headless na raiz do Kit não tem escopo e para. Os caminhos passados a `--coverage-path` são relativos a esse diretório.
- Informe o driver: um runner sem PCOV falha na hora em vez de não medir nada.
- `pcov.enabled=1` liga a coleta, e `pcov.directory` faz o PCOV instrumentar o checkout inteiro.
- O checkout de um pull request é o seu merge commit, então `origin/<base>...HEAD` termina na árvore medida.
- O PCOV mede só o processo dos testes, a partir do momento em que o runner começa a coletar: código que roda em workers forkados do servidor ou em subprocessos, e linhas que rodam antes de a coleta começar (o boot), contam como não cobertos. Um pull request que só altera esse tipo de código reprova no gate, por mais testado que esteja.
- Defina o limite mínimo a partir de um run medido, um pouco abaixo dele, e suba-o conforme os testes chegam — nunca o abaixe para deixar uma mudança passar.

### O gate do próprio Bootgly

O framework aplica o mesmo gate a si mesmo, medindo todo arquivo PHP em `Bootgly/`:

- a cada push na `main`: no mínimo 65% dos statements cobertos;
- a cada pull request: o mesmo limite mínimo sobre as linhas alteradas, e nenhuma classe alterada sem um statement coberto;
- a cada release: o gate da árvore na tag; quando todas as suítes e o gate passam, o relatório clover é anexado ao release do GitHub como `bootgly-<tag>-coverage.clover.xml`.

Na árvore da 1.2.0, um run cobre 69,8% de 69.266 statements. A regra "nenhuma classe zerada" ainda não vale para a árvore inteira: 66 arquivos de classe estavam zerados nesse baseline.

## API programática

Use a API programática quando estiver criando uma ferramenta interna ou um teste dedicado do próprio framework.

```php
<?php

use Bootgly\ACI\Tests\Coverage;
use Bootgly\ACI\Tests\Coverage\Drivers\Nothing;

$Coverage = new Coverage(new Nothing());
$Coverage->start();

// Execute o código sob teste aqui.

$Coverage->stop();

echo $Coverage->report('text');
```

Para conferir o mapa medido contra um gate:

```php
<?php

use Bootgly\ACI\Tests\Coverage\Gate;

$Gate = new Gate(floor: 80.0, classes: true);

if ($Gate->check($Coverage->data) === false) {
   foreach ($Gate->failures as $failure) {
      echo $failure, PHP_EOL;
   }
}

echo "{$Gate->covered}/{$Gate->statements} statements covered";
```

## Filtros de escopo

A sessão pode limitar o relatório por escopo ou por arquivo-alvo.

```php
$Coverage->includes = ['Bootgly/ACI/Tests'];
$Coverage->targets = [BOOTGLY_ROOT_DIR . 'Bootgly/ACI/Tests/Fixture.php'];
```

- `includes` mantém arquivos cujo caminho contém um dos escopos informados.
- `targets` mantém apenas arquivos específicos quando eles aparecem no mapa bruto.
- Scripts em diretórios lowercase `/tests/` são excluídos do relatório por padrão.

Outras duas entradas ampliam ou estreitam o que é medido:

```php
use Bootgly\ACI\Tests\Coverage\Changes;

// Todo arquivo PHP sob o diretório conta, carregado ou não.
$Coverage->paths = [BOOTGLY_ROOT_DIR . 'Bootgly/ACI'];

// Só as linhas que este range alterou são medidas.
$Coverage->changes = (new Changes('origin/main...HEAD', BOOTGLY_WORKING_DIR))->fetch();
```

Defina as duas antes do `stop()`: ele aplica os filtros, depois adiciona os arquivos não carregados sob `paths` e por fim mantém só as linhas de `changes`.

## Formatos de relatório

| Formato | Uso recomendado |
| ------- | --------------- |
| `text` | Leitura rápida no terminal e debugging local. |
| `html` | Visualização simples em browser. |
| `clover` | Integração com ferramentas de CI e coverage services. |

## Boas práticas

- Use `--coverage-driver=native` quando precisar validar cobertura sem extensões.
- Use `--coverage-driver=nothing` para testar o fluxo de relatório sem custo de instrumentação.
- Prefira `--coverage-report=clover:/caminho/coverage.xml` em CI.
- Em CI, aplique o gate sobre um diretório (`--coverage-path`) para que arquivos sem teste baixem o limite em vez de se esconderem dele.
- Em suítes grandes, selecione um índice de suíte para reduzir o relatório ao escopo sob teste.

## Referência

### Opções da CLI

| Opção | Descrição |
| ----- | --------- |
| `--coverage` | Ativa cobertura com o driver detectado automaticamente (Xdebug, depois PCOV; o run para quando nenhum consegue medir). |
| `--coverage-driver=<name>` | Força um driver: `xdebug`, `pcov`, `native` ou `nothing`. |
| `--coverage-native-mode=<mode>` | Modo do driver nativo: `strict` (padrão) ou `parity`. |
| `--coverage-report=<format>[:<path>]` | Formato do relatório (`text`, `html`, `clover`); impresso na stdout sem caminho. Um `--coverage-report` sem valor vale `text`; o formato ignora maiúsculas. Um formato desconhecido, ou um caminho de arquivo cujo diretório não existe, é recusado antes de qualquer suíte rodar; um stream como `php://stderr` é aceito; um relatório que não pode ser gravado reprova o run. |
| `--coverage-diff[=<range>]` | Sem valor: linhas cobertas/não cobertas por arquivo no relatório `text`. Com um range do git: mede só as linhas que o range alterou. |
| `--coverage-path=<dir>` | Mede todo arquivo PHP sob `dir`; arquivos que nenhum teste carregou contam como zero. |
| `--coverage-floor=<percent>` | Falha quando os statements cobertos ficam abaixo de `percent` (`0`–`100`). |
| `--coverage-classes` | Falha quando um arquivo de classe, trait ou enum não tem nenhum statement coberto. |

### Coverage

```php
public static function detect (): Driver
```

Retorna o driver do Xdebug quando o modo coverage está ativo, senão o driver do PCOV quando a extensão está carregada, senão `Nothing`. Lança `LogicException` quando uma extensão está carregada mas não consegue medir (Xdebug sem modo coverage, PCOV com `pcov.enabled=0`). Nunca retorna o `Native`.

```php
public array $paths = [];
```

Diretórios medidos por inteiro: arquivos PHP sob eles que o run nunca carregou entram no relatório com zero hits (arquivos dentro de um diretório de `RESOURCES` abaixo do caminho, e os que os filtros `includes`/`targets` rejeitam ficam de fora; com o `Native`, os que ele nunca instrumenta vão para `$unmeasured`). O `stop()` lança `LogicException` quando uma entrada não é um diretório legível.

```php
public null|array $changes = null;
```

Linhas alteradas a medir, `[canonical_file => [line => true]]`, como `Changes::fetch()` as retorna. Quando definido, o `stop()` adiciona com zero hits cada arquivo PHP alterado que o run nunca carregou (quando os filtros o admitem e ele não está num diretório de `RESOURCES`), depois mantém só as instruções que essas linhas tocam (uma linha alterada dentro de uma instrução em várias linhas conta como essa instrução; uma linha de comentário não conta) e descarta todo arquivo sem nenhuma; `null` mede todas as linhas.

```php
public private(set) array $unmeasured = [];
```

Arquivos PHP no escopo que o driver não consegue medir (caminhos que o driver `Native` nunca instrumenta) — arquivos que um teste carregou e arquivos sob `$paths`; quando `$changes` está definido, só os alterados cujas linhas alteradas contêm código. O motor de coverage nunca é listado por estar carregado. Preenchidos pelo `stop()`; o runner os lista e reprova um gate sobre eles.

```php
public const array RESOURCES = ['examples' => true, 'fixtures' => true, 'stubs' => true, 'templates' => true, 'tests' => true];
```

Nomes de diretórios de recursos — `examples`, `fixtures`, `stubs`, `templates`, `tests` — cujos arquivos PHP não carregados nunca entram no relatório.

```php
public const array REPORTS = ['clover' => Clover::class, 'html' => HTML::class, 'text' => Text::class];
```

Formatos de relatório que o `report()` renderiza, por nome; o `--coverage-report` aceita esses nomes.

### Coverage\Gate

```php
public function __construct (null|float $floor = null, bool $classes = false)
```

Cria um gate. `floor` é o limite mínimo de statements em porcentagem; `classes` ativa a regra "nenhuma classe zerada". Lança `InvalidArgumentException` quando o limite não é um número finito de `0` a `100` ou tem mais de quatro casas decimais.

```php
public function check (array $data): bool
```

Confere um mapa de hits (`[file => [line => hits]]`, como `Coverage::$data` o guarda) e retorna `true` quando todas as regras ativas passam. Um mapa sem nenhum statement executável reprova sempre que alguma regra está ativa. Cada chamada substitui as métricas abaixo.

```php
public private(set) int $statements;
public private(set) int $covered;
public float $percent { get; }
```

Statements executáveis, statements cobertos e a fração coberta (em porcentagem, `0.0` quando nada foi medido) do último `check()`.

```php
public private(set) array $zeros;
public private(set) array $failures;
```

Os arquivos de classe encontrados zerados (só com `classes` ativo) e as linhas de falha legíveis do último `check()` (vazias quando passa).

### Coverage\Changes

```php
public function __construct (string $range, string $directory)
```

Descreve um range do git lido do repositório que contém `directory`. Lança `InvalidArgumentException` quando o range é vazio, começa com `-` ou contém espaço em branco ou caractere de controle.

```php
public function fetch (): array
```

Roda `git diff --unified=0` para o range (sem shell, sem `GIT_DIFF_OPTS`/`GIT_EXTERNAL_DIFF`, caminhos a partir da raiz da árvore de trabalho) e retorna as linhas do lado novo que ele adicionou ou modificou, `[canonical_file => [line => true]]`; o resultado também fica em `$lines`. Arquivos removidos e remoções puras não contam. Lê como texto um conteúdo que o git chamaria de binário (`--text`). Lança `RuntimeException` quando o git não roda, o diretório não existe, o git rejeita o range ou o range cobre um merge (um diff combinado).

```php
public static function parse (string $diff, string $root): array
```

Converte a saída do `git diff` no mesmo mapa, resolvendo os caminhos a partir da raiz da árvore de trabalho (`root`); só as linhas `+` contam (linhas de contexto, inclusive as em branco, apenas avançam a numeração) e arquivos que não existem são ignorados. Lança `RuntimeException` num diff combinado (`diff --cc`).
