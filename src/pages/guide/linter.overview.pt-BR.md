# Linter

`bootgly lint` lê os seus arquivos PHP e reporta — ou corrige — o que o code style do Bootgly
define. Ele tem quatro submódulos, um por regra:

| Submódulo | Regra | Corrigível |
|---|---|---|
| `imports` | `use` statements: faltando, não usados, com prefixo de barra, fora de ordem | sim |
| `nullables` | Sem atalho nullable — `?T` se escreve `null\|T` | sim |
| `promotions` | Sem constructor property promotion | só checagem |
| `methods` | Nomes de método com uma palavra só — sem camelCase | só checagem |

É uma ferramenta de estilo, não um analisador estático. Ela nunca altera uma linha da sua
lógica: os dois submódulos corrigíveis reescrevem exatamente a construção que reportam e nada
mais, e os dois de checagem não escrevem nada.

Todo submódulo trabalha sobre os tokens do próprio PHP, nunca sobre o texto cru — então um `?`
só é reportado como atalho nullable quando o PHP o interpretou como um, e `fooBar` só é
reportado quando é um método sendo declarado, nunca quando é um sendo chamado.

## Verificar o código

No checkout do framework, um submódulo sem caminho linta a própria árvore `Bootgly/` do framework
(dentro de um kit o padrão é o seu projeto — veja *Dentro de um kit* abaixo):

```bash
bootgly lint imports
bootgly lint nullables
bootgly lint promotions
bootgly lint methods
```

Aponte para onde quiser para lintar o seu código — um diretório ou um arquivo só:

```bash
bootgly lint nullables app/
bootgly lint methods app/Services/Billing.php
```

Cada violação sai com arquivo, linha e a construção exata de que se trata:

```text
 app/Services/Billing.php
  ✗ Line 17: Unused import: use function array_column;
  ✗ Line 21: Missing import: use function number_format;
```

Nada é escrito. Diretórios `vendor/`, `examples/` e `vs/` dentro do caminho varrido são pulados
— testes são código e são lintados como o resto, e o caminho que você nomeia é sempre varrido,
sejam quais forem os nomes dos seus ancestrais. O comando sai com código diferente de zero sempre que sobram issues, em
qualquer modo, então uma checagem pode barrar um commit ou uma lane de CI; um caminho que não
existe também falha, nunca um verde silencioso:

```bash
for submodule in imports nullables promotions methods; do
   bootgly lint "$submodule" app/ || exit 1
done
```

### Dentro de um kit

Num kit, o `lint` segue o diretório de onde você o roda. Fique no seu projeto e nomeie os caminhos
a partir dali:

```bash
cd projects/App
php ../../bootgly lint nullables                 # o projeto inteiro
php ../../bootgly lint nullables Models/         # projects/App/Models
php ../../bootgly lint imports Models/ --fix
```

- Um caminho relativo é resolvido a partir do diretório atual.
- Sem caminho, o escopo é o diretório em que você está, quando ele fica sob `projects/`. Em
  qualquer outro lugar — a raiz do kit, `Console/` — não há padrão: a execução é recusada até você
  nomear um caminho.
- O `--fix` nunca reescreve `Bootgly/`, `Console/` ou `Web/`, nem um caminho que os contenha — nem
  mesmo pelo launcher do próprio framework dentro de `Bootgly/`: são submódulos fixados, e um
  reescrito bloquearia o próximo `bootgly kit upgrade`. Checá-los sem `--fix` é permitido.

## Corrigir automaticamente

`imports` e `nullables` reescrevem no lugar com `--fix`:

```bash
bootgly lint imports app/ --fix
bootgly lint nullables app/ --fix
```

Para ver antes o que ela faria, sem tocar num byte:

```bash
bootgly lint nullables app/ --dry-run
```

A correção só é gravada se o arquivo reescrito ainda for PHP válido, então uma execução nunca
deixa um arquivo quebrado.

`promotions` e `methods` são só de checagem. Passar `--fix` ou `--dry-run` a eles não é erro: o
comando avisa que o submódulo é só de checagem, roda a checagem e não escreve nada.

## Imports

`bootgly lint imports` lê os `use` entre a declaração `namespace` e a sua primeira entidade.

### O que ele detecta

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

### O que ele nunca remove

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

### Quando ele não mexe no arquivo

Se o seu bloco de imports contém um comentário, o bloco inteiro é reportado e deixado intacto:

```text
  ✗ Line 16: Comment inside the import block: reordering would drop it, so the block
             is left untouched — move the comment above or below it
```

Reordenar o bloco significa regerá-lo, e um comentário não tem lugar definido na saída
regerada — nem um palpite seguro, já que o import que ele descreve pode ir para outra seção.
Mova o comentário para cima ou para baixo do bloco e o arquivo volta a ser corrigível.

## Nullables

`bootgly lint nullables` reporta todo atalho nullable `?T` em tipo de parâmetro, de retorno ou
de propriedade. O Bootgly escreve a union, `null|T`, para que um tipo nullable se leia como
qualquer outra union e o `null` nunca fique escondido num único caractere:

```php
// ✗ reportado
public function find (?int $id): ?User
{
   // ...
}

private ?Logger $Logger = null;

// ✓ o que o --fix escreve
public function find (null|int $id): null|User
{
   // ...
}

private null|Logger $Logger = null;
```

Parâmetros promovidos do construtor, `readonly`, `static`, propriedades de visibilidade
assimétrica, parâmetros por referência e variádicos, closures, arrow functions e retornos
`?static` são todos cobertos, e um espaço depois do `?` (`? int`) é tratado.

Só declarações de tipo são reportadas. Um `?` que o PHP interpretou como outra coisa nunca é
tocado:

```php
$label = $count ? 'many' : 'one';   // um ternário
$name  = $given ?: 'anonymous';     // um ternário curto
$port  = $config['port'] ?? 8080;   // null coalescing
$size  = $file?->size;              // um acesso nullsafe
```

O `--fix` reescreve `?T` como `null|T`, consumindo o `?` e qualquer espaço em branco depois
dele. Nada mais na linha se move.

## Promotions

`bootgly lint promotions` reporta todo parâmetro de construtor que carrega um modificador de
visibilidade, `readonly` ou de set assimétrico — constructor property promotion:

```php
// ✗ reportado, uma vez por parâmetro promovido
public function __construct (
   private readonly Logger $Logger,
   protected(set) int $retries = 3,
   int $timeout = 30                  // um parâmetro comum — não reportado
) {}

// ✓ o que o Bootgly escreve no lugar
// * Data
private readonly Logger $Logger;
protected(set) int $retries;

public function __construct (Logger $Logger, int $retries = 3, int $timeout = 30)
{
   $this->Logger = $Logger;
   $this->retries = $retries;
}
```

O Bootgly declara toda propriedade explicitamente, na sua seção (`Config`, `Data`, `Metadata`),
com o seu próprio docblock — para que a classe se leia como classe, não como assinatura. É
também por isso que este submódulo é só de checagem: a declaração que uma correção teria de
escrever precisa de uma seção e de um docblock que nenhuma reescrita pode escolher por você.

Só `__construct` é examinado; um modificador no parâmetro de qualquer outra função não é
promotion (e nem é PHP válido).

## Methods

`bootgly lint methods` reporta todo método cujo nome tem mais de uma palavra — uma letra
maiúscula depois do primeiro caractere, a emenda do camelCase. O Bootgly nomeia métodos com um
único verbo e põe o contexto no objeto, não no nome:

```php
// ✗ reportado
public function renderHTML (): string {}
public function buildRoute (): Route {}
protected function getUserData (): array {}

// ✓ verbos únicos — o objeto carrega o contexto
public function render (): string {}     // HTML->render()
public function build (): Route {}       // Route->build()
protected function fetch (): array {}
```

Só declarações dentro de uma classe, interface, trait ou enum contam (classes anônimas
incluídas). Uma função comum, uma closure, uma arrow function, uma chamada como
`$this->renderHTML()`, uma variável, uma propriedade ou um alias de trait nunca são reportados.

### Nomes isentos

Duas famílias de nomes não são escolha do autor, então nunca são reportadas:

- **Métodos mágicos** — todo nome `__*`: `__construct`, `__toString`, `__get`, `__invoke`, ...
- **Nomes que o PHP impõe** — implementar uma das interfaces do próprio PHP ou estender uma
  das suas classes não deixa escolha de nome. Só são isentos numa classe que faz `extends` ou
  `implements` de algo — e num trait, que é misturado em classes que podem fazê-lo; numa classe
  que não herda nada, `getSize()` é escolha do autor e é reportado. A lista completa, mantida
  num só lugar no analisador:

| Interface / classe | Nomes isentos |
|---|---|
| `IteratorAggregate` | `getIterator` |
| `ArrayAccess` | `offsetExists`, `offsetGet`, `offsetSet`, `offsetUnset` |
| `JsonSerializable` | `jsonSerialize` |
| `Throwable` | `getMessage`, `getCode`, `getFile`, `getLine`, `getTrace`, `getTraceAsString`, `getPrevious` |
| `Generator` | `getReturn` |
| `DateTimeInterface` | `getTimestamp`, `getTimezone`, `getOffset`, `setTimezone`, `setTimestamp`, `setDate`, `setTime` |
| `RecursiveIterator`, `OuterIterator`, `CachingIterator` | `getChildren`, `hasChildren`, `getFlags`, `setFlags`, `getSubIterator`, `getInnerIterator`, `hasNext` |
| `ArrayObject`, `ArrayIterator` | `getArrayCopy` |
| `SplFileInfo`, `SplFileObject` | `getRealPath`, `getPathname`, `getFilename`, `getExtension`, `isDir`, `isFile`, `isLink`, `getSize`, `getMTime`, `getCTime`, `getATime`, `getPerms`, `getInode`, `getOwner`, `getGroup`, `getType`, `isReadable`, `isWritable`, `isExecutable`, `getBasename`, `getPath`, `getPathInfo`, `getFileInfo`, `openFile`, `setFileClass`, `setInfoClass` |

A comparação não diferencia maiúsculas, como o PHP resolve nomes de método. Renomear um método
significa renomear todos os chamadores, e é por isso que este submódulo é só de checagem.

## Relatório legível por máquina

Quando o comando detecta que está rodando sob um agente de IA (a variável de ambiente
`AI_AGENT`, ou o marcador que o seu agente define), ele imprime um único documento JSON em vez
do relatório humano:

```json
{
   "result": "failed",
   "submodule": "nullables",
   "fixable": true,
   "agent": "1",
   "mode": "check",
   "files": { "scanned": 12, "failed": 1, "fixed": 0, "skipped": 0 },
   "issues": { "total": 1, "unresolved": 1 },
   "report": [
      {
         "file": "app/Services/Billing.php",
         "issues": [
            {
               "type": "nullable_shorthand",
               "symbol": "int",
               "kind": "parameter",
               "line": 17,
               "message": "Nullable shorthand in parameter type: ?int → use null|int"
            }
         ],
         "fixed": false
      }
   ],
   "skipped": []
}
```

`result` é `passed` só quando não sobra nada: nenhuma issue encontrada, ou — em modo `fix` —
todo arquivo reportado reescrito e limpo ao ser analisado de novo (uma reescrita só conta como
corrigida quando resolveu as issues; um formatador que não tinha o que mudar deixa o arquivo
intocado, e o mesmo vale para um arquivo sem permissão de escrita). Se uma reescrita deixar issues
para trás, o arquivo fica reescrito, `fixed` é `false` e o relatório lista o que resta como o
arquivo está agora. Um `--dry-run`, uma checagem que encontrou algo, ou um `--fix`
que deixou um arquivo intocado (um comentário no bloco de imports, uma reescrita que não
parseia) mantêm `result` em `failed`, e `issues.unresolved` diz quantas sobraram. `mode` é
`check`, `dry-run` ou `fix` — um submódulo só de checagem reporta `check` mesmo quando `--fix`
foi passado, e `fixable` diz que tipo de submódulo você rodou. Um caminho sem arquivos PHP
responde o mesmo documento com `files.scanned` em `0`; um caminho que não existe acrescenta um
`message` e falha, assim como uma execução que o kit recusa (sem caminho padrão fora de `projects/`, um diretório de trabalho que não existe mais,
`--fix` num submódulo fixado). Um arquivo que um analisador recusa — `imports` recusa um que declara mais de
um namespace, já que os imports são por bloco — é listado em `skipped` com o motivo, contado em
`files.skipped`, e nunca deixa a execução verde por silêncio nem vermelha por si só. O mesmo
balde guarda um nome que o próprio comando não leria — um que deixou de ser um arquivo regular
(um link plantado depois que a varredura começou).

## Referência

```bash
bootgly lint imports [path]
```

Linta os `use` de todo arquivo PHP sob `path`. O padrão é `Bootgly/` relativo ao diretório do
launcher, e um caminho relativo é resolvido a partir dele. Num kit, um caminho relativo é
resolvido a partir do diretório atual, e o padrão é o diretório sob `projects/` de onde o comando
roda — não há padrão fora de `projects/`. Um caminho absoluto é usado como veio. Um arquivo único é
aceito no lugar de um diretório. Corrigível.

```bash
bootgly lint nullables [path]
```

Reporta todo `?T` em tipo de parâmetro, de retorno ou de propriedade sob `path`. Mesmas regras
de caminho. Corrigível: o `--fix` reescreve cada um como `null|T`.

```bash
bootgly lint promotions [path]
```

Reporta todo parâmetro de construtor promovido sob `path`. Mesmas regras de caminho. Só
checagem.

```bash
bootgly lint methods [path]
```

Reporta todo nome de método com mais de uma palavra sob `path`, exceto os mágicos e os que o
PHP impõe. Mesmas regras de caminho. Só checagem.

```bash
--fix
```

Reescreve cada arquivo reportado no lugar — o bloco de imports no `imports`, cada `?T` no
`nullables`. Só é gravado se o resultado ainda for PHP válido. Ignorado, com um aviso, pelos
submódulos só de checagem. Num kit, recusado para um caminho que seja, contenha ou fique dentro de
`Bootgly/`, `Console/` ou `Web/` — também pelo launcher do próprio framework dentro do `Bootgly/`
do kit.

```bash
--dry-run
```

Reporta o que o `--fix` mudaria e não escreve nada. Ignorado, com um aviso, pelos submódulos
só de checagem.

```bash
--help, -h
```

Mostra o uso e os exemplos do comando; `bootgly lint <submodule> --help` mostra os de um
submódulo.

### Tipos de issue

Estes são os valores de `type` do relatório legível por máquina:

| Tipo | Submódulo | Significado |
|---|---|---|
| `missing_import` | `imports` | Um símbolo é usado sem nenhum `use` para ele |
| `unused_import` | `imports` | Um `use` cujo nome não aparece em lugar nenhum do arquivo |
| `backslash_prefix` | `imports` | Um símbolo alcançado via `\` em vez de import |
| `wrong_order` | `imports` | A ordem const → function → class foi quebrada |
| `global_not_first` | `imports` | Um import global vem depois de um namespaced |
| `not_alphabetical` | `imports` | Dois imports do mesmo tipo estão fora de ordem |
| `comment_in_imports` | `imports` | O bloco carrega um comentário, então não foi reescrito |
| `nullable_shorthand` | `nullables` | Um tipo `?T`; `kind` é `parameter`, `return` ou `property` |
| `promoted_property` | `promotions` | Um parâmetro de construtor promovido; `kind` são os modificadores |
| `multiword_method` | `methods` | Um nome de método em camelCase; `kind` é `method` |
