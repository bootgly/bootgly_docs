# Linter

`bootgly lint imports` lê os `use` dos seus arquivos PHP e reporta — ou corrige — tudo o que o
code style do Bootgly define sobre eles: imports faltando, imports que nada mais usa e imports
fora de ordem.

É uma ferramenta de estilo, não um analisador estático. Ela nunca altera uma linha da sua
lógica; só reescreve o bloco de imports entre a declaração `namespace` e a sua primeira
entidade.

## Verificar o código

Rode sem argumentos para lintar a própria árvore `Bootgly/` do framework:

```bash
bootgly lint imports
```

Aponte para onde quiser para lintar o seu código — um diretório ou um arquivo só:

```bash
bootgly lint imports app/
bootgly lint imports app/Services/Billing.php
```

Cada violação sai com arquivo, linha e o statement exato de que se trata:

```text
 app/Services/Billing.php
  ✗ Line 17: Unused import: use function array_column;
  ✗ Line 21: Missing import: use function number_format;
```

Nada é escrito. Diretórios `vendor/`, `tests/` e `examples/` são pulados.

## Corrigir automaticamente

Acrescente `--fix` para reescrever os blocos de import no lugar:

```bash
bootgly lint imports app/ --fix
```

Para ver antes o que ela faria, sem tocar num byte:

```bash
bootgly lint imports app/ --dry-run
```

A correção só é gravada se o arquivo reescrito ainda for PHP válido, então uma execução nunca
deixa um arquivo quebrado.

## O que ela detecta

| | |
|---|---|
| **Import faltando** | Função, classe ou constante global usada sem `use` |
| **Import não usado** | Um `use` cujo nome não aparece mais em lugar nenhum do arquivo |
| **Prefixo de barra** | `\fclose($handle)` em vez de um import explícito |
| **Ordem errada** | `use function` antes de `use const`, ou classe antes de função |
| **Global fora do topo** | Import global depois de um namespaced do mesmo tipo |
| **Fora de ordem alfabética** | Dois imports do mesmo tipo fora de ordem |

A ordem que o Bootgly espera, de cima para baixo: constantes, depois funções, depois classes —
os globais primeiro, como um bloco, então uma linha em branco, então os namespaced na mesma
ordem de três partes.

## O que ela nunca remove

Decidir que um import não é usado é o único julgamento desta ferramenta capaz de apagar código
que funciona, então ele é feito pelo lado seguro: um import só é reportado como não usado
quando o nome dele não aparece **em nenhum outro lugar do arquivo**, sob nenhuma forma.

Isso quer dizer que todos estes mantêm o import, mesmo sem nenhuma chamada ou `new`:

```php
use Bootgly\ACI\Logs\Logger;

class Billing
{
   public Logger $Logger;                            // tipo de propriedade

   public function charge (Logger $Logger): Logger   // tipo de parâmetro e de retorno
   {
      try {
         // ...
      }
      catch (Logger $Failure) { }                    // cláusula catch

      return $Logger;
   }
}
```

Declarações de tipo, cláusulas `catch`, atributos, `use` de trait dentro do corpo da classe e o
primeiro segmento de um nome qualificado como `extends Logger\Channel` contam como uso.

**Docblocks também.** Um import citado apenas numa linha `@param`, `@return`, `@var` ou
`@throws` é mantido, porque o seu analisador estático lê essas linhas mesmo que o PHP não leia:

```php
use Bootgly\ACI\Logs\Logger;

/**
 * @param Logger $Logger        ← isto sozinho mantém o import
 */
public function attach ($Logger): void {}
```

A consequência é deliberada: o linter erra reportando de menos, nunca de mais. Um nome que por
acaso coincida com uma palavra de um comentário mantém o import vivo. Perder uma limpeza custa
uma linha morta; remover um import em uso custa um build quebrado — então ele pende para o
primeiro.

## Quando ela não mexe no arquivo

Se o seu bloco de imports contém um comentário, o bloco inteiro é reportado e deixado intacto:

```text
  ✗ Line 16: Comment inside the import block: reordering would drop it, so the block
             is left untouched — move the comment above or below it
```

Reordenar o bloco significa regerá-lo, e um comentário não tem lugar definido na saída
regerada — nem um palpite seguro, já que o import que ele descreve pode ir para outra seção.
Mova o comentário para cima ou para baixo do bloco e o arquivo volta a ser corrigível.

## Referência

```bash
bootgly lint imports [path]
```

Linta os `use` de todo arquivo PHP sob `path`. O padrão é `Bootgly/` relativo ao diretório de
trabalho; um caminho relativo é resolvido a partir dele, um caminho absoluto é usado como veio.
Um arquivo único é aceito no lugar de um diretório.

```bash
--fix
```

Reescreve o bloco de imports de cada arquivo no lugar: remove imports não usados, adiciona os
faltantes, tira prefixos de barra e reordena o que sobrou. Só é gravado se o resultado ainda
for PHP válido.

```bash
--dry-run
```

Reporta o que o `--fix` mudaria e não escreve nada.

```bash
--help, -h
```

Mostra o uso e os exemplos do comando.

### Tipos de issue

Estes são os valores de `type` do relatório legível por máquina, que é o que sai quando o
comando detecta que está rodando sob um agente de IA:

| Tipo | Significado |
|---|---|
| `missing_import` | Um símbolo é usado sem nenhum `use` para ele |
| `unused_import` | Um `use` cujo nome não aparece em lugar nenhum do arquivo |
| `backslash_prefix` | Um símbolo alcançado via `\` em vez de import |
| `wrong_order` | A ordem const → function → class foi quebrada |
| `global_not_first` | Um import global vem depois de um namespaced do mesmo tipo |
| `not_alphabetical` | Dois imports do mesmo tipo estão fora de ordem |
| `comment_in_imports` | O bloco carrega um comentário, então não foi reescrito |
