# Componente Differ

O componente `Differ` renderiza a diferença entre dois textos como saída colorida no terminal — hunks unified por padrão, ou colunas side-by-side com números de linha e destaque de palavras intra-linha. Ele usa o motor de diff nativo do framework (`Differ` do ABI: LCS com seleção automática de estratégia tempo/memória), com zero dependências de terceiros.

É um **UI Atom** — uma primitiva sem dependência de outros componentes. Uma demo ao vivo está disponível no [showcase](/manual/CLI/UI/Atoms/Differ/showcase).

## Instância

Para usar o componente, crie uma instância passando a instância de `Output`:

```php
use const Bootgly\CLI;
use Bootgly\CLI\UI\Atoms\Differ;

$Differ = new Differ(CLI->Terminal->Output);
```

## Diff de dois textos

Atribua o texto original e o novo — strings ou listas de linhas — e renderize. A view padrão é um diff unified com headers rotulados e hunks numerados:

```php
$Differ->from = "line one\nline two\nline three\nline four\n";
$Differ->to   = "line one\nline 2\nline three\nline four\nline five\n";

$Differ->render();
```

```text
--- Original
+++ New
@@ -1,4 +1,5 @@
 line one
-line two
+line 2
 line three
 line four
+line five
```

Em um terminal interativo, linhas removidas pintam em vermelho, linhas adicionadas em verde, headers de hunk em ciano e headers de arquivo em negrito.

## Rotule os lados

Os rótulos do header são configuráveis — útil ao comparar arquivos ou versões reais:

```php
$Differ->fromFile = 'a/config.php';
$Differ->toFile = 'b/config.php';
```

```text
--- a/config.php
+++ b/config.php
```

## View side-by-side

Defina `split` para renderizar duas colunas com números de linha — linhas removidas à esquerda, adicionadas à direita, pareadas na mesma row. Palavras alteradas dentro de linhas pareadas ganham um fundo mais forte (destaque intra-linha):

```php
$Differ->split = true;

$Differ->render();
```

```text
===========================================================================
 ■■ Original -> New
===========================================================================
  1 │   line one                     ║   1 │   line one
  2 │ - line two                     ║   2 │ + line 2
  3 │   line three                   ║   3 │   line three
  4 │   line four                    ║   4 │   line four
    │ ////////////////////////////// ║   5 │ + line five
```

A largura da view segue o terminal por padrão; defina `width` para fixá-la. Linhas mais largas que sua coluna truncam com reticências. `gutter` controla a largura dos números de linha e `highlight` liga/desliga o destaque intra-linha.

## Controle de contexto

Na view unified, `context` define quantas linhas inalteradas cercam cada hunk — aperte para arquivos grandes:

```php
$Differ->context = 1;
```

```text
@@ -5,3 +5,3 @@
 function step5 () {}
-function step6 () {}
+function stepSix () {}
 function step7 () {}
```

## Saída não interativa

Em pipes e CI a renderização mantém a estrutura com **zero escape codes**. `decoration` é um tri-state: `null` (padrão) segue o TTY, `false` força plain, `true` força cores.

## Referência

### Propriedades

```php
public null|bool $decoration = null;
```

Config. Decoração SGR — `null` segue o TTY, `false` força plain, `true` força cores.

```php
public bool $split = false;
```

Config. Seletor de view — `false` renderiza hunks unified, `true` renderiza colunas side-by-side.

```php
public int $context = 3;
```

Config. Linhas inalteradas ao redor de cada hunk (view unified).

```php
public null|int $width = null;
```

Config. Largura da view, em colunas (view split) — `null` segue a largura do terminal.

```php
public int $gutter = 4;
```

Config. Largura do gutter de números de linha, em dígitos (view split).

```php
public bool $highlight = true;
```

Config. Destaque de palavras intra-linha em linhas alteradas pareadas (view split). Pulado automaticamente quando as palavras alteradas superam o contexto inalterado.

```php
public string $fromFile = 'Original';
```

Config. Rótulo do lado original — alimenta o header unified e o título da view split.

```php
public string $toFile = 'New';
```

Config. Rótulo do lado novo — alimenta o header unified e o título da view split.

```php
public array|string $from = '';
```

Data. O texto original — uma string (dividida em quebras de linha) ou uma lista de linhas.

```php
public array|string $to = '';
```

Data. O texto novo — uma string (dividida em quebras de linha) ou uma lista de linhas.

### render()

```php
public function render (int $mode = self::WRITE_OUTPUT): null|string
```

Renderiza o diff entre os dois textos. `WRITE_OUTPUT` escreve no `Output` e retorna `null`; `RETURN_OUTPUT` retorna a string renderizada. Inputs iguais renderizam os headers rotulados sem hunks.
