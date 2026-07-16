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

O runner carrega `tests/autoboot.php`, itera sobre cada diretório de suíte e imprime o resumo ao final. O código de saída é diferente de zero quando ao menos uma `Specification` falha.

## Executar uma suíte específica

Cada diretório de suíte listado em `tests/autoboot.php` é endereçável pelo seu índice (começando em 1):

```bash :toolbar="true";
php bootgly test 16
```

O exemplo acima executa somente a suíte `16`. Os índices seguem a ordem declarada no construtor `Suites(...)` do `tests/autoboot.php` raiz.

## Executar um caso de teste específico

Passe o índice da suíte seguido do índice do caso de teste para executar uma única `Specification`:

```bash :toolbar="true";
php bootgly test 16 1
```

Ambos os índices começam em 1. Use esta forma para focar em um único caso falhando durante o desenvolvimento, sem reexecutar a suíte inteira.

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

O driver nativo exige `opcache.enable_cli=0` para que os arquivos de origem não sejam pré-compilados antes que o filtro de cobertura possa instrumentá-los.

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
