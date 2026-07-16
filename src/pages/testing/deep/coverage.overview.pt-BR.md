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
| `Coverage\Drivers\Nothing` | Driver no-op para smoke tests e ambientes sem cobertura real. |
| `Coverage\Reports\Text` | Relatório textual para terminal. |
| `Coverage\Reports\HTML` | Relatório HTML simples. |
| `Coverage\Reports\Clover` | XML Clover para CI. |

## Uso pela CLI

Para gerar cobertura em texto com o driver automático:

```bash :toolbar="true";
php bootgly test --coverage --coverage-report=text
```

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

O `Native` exige `opcache.enable_cli=0`, porque OPcache pode reaproveitar bytecode não instrumentado. Ele também mede apenas arquivos carregados depois do início da sessão de cobertura.

### Diff de cobertura

O relatório `text` pode mostrar um diff por arquivo com linhas cobertas e não cobertas:

```bash
php -d opcache.enable_cli=0 bootgly test 11 \
   --coverage-driver=native \
   --coverage-report=text \
   --coverage-diff
```

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

## Filtros de escopo

A sessão pode limitar o relatório por escopo ou por arquivo-alvo.

```php
$Coverage->includes = ['Bootgly/ACI/Tests'];
$Coverage->targets = [BOOTGLY_ROOT_DIR . 'Bootgly/ACI/Tests/Fixture.php'];
```

- `includes` mantém arquivos cujo caminho contém um dos escopos informados.
- `targets` mantém apenas arquivos específicos quando eles aparecem no mapa bruto.
- Scripts em diretórios lowercase `/tests/` são excluídos do relatório por padrão.

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
- Em suítes grandes, selecione um índice de suíte para reduzir o relatório ao escopo sob teste.
