# Linter

`bootgly lint check` lê os seus arquivos PHP e reporta — ou corrige — o que o code style do
Bootgly define. Quais regras rodam, sobre quais caminhos, e onde uma regra é isentada fica escrito
uma vez num arquivo `bootgly.Lint.php`, então toda execução — a sua, a do seu CI, a do seu agente
de IA — exige a mesma coisa.

| Regra | O que ela exige | Corrigível |
|---|---|---|
| `imports` | `use` statements: faltando, não usados, com prefixo de barra, fora de ordem | sim |
| `nullables` | Sem atalho nullable — `?T` se escreve `null\|T` | sim |
| `promotions` | Sem constructor property promotion | só checagem |
| `methods` | Nomes de método com uma palavra só, um verbo na forma base | só checagem |
| `spacing` | Um espaço antes da lista de parâmetros de uma declaração, nenhum antes da de uma chamada | sim |
| `casing` | Nomes de objeto e de coleção de objetos começam com maiúscula; siglas são maiúsculas | só checagem |
| `sections` | Propriedades agrupadas sob `// * Config`, `// * Data`, `// * Metadata` | só checagem |

É uma ferramenta de estilo, não um analisador estático. Ela nunca altera uma linha da sua lógica:
uma regra corrigível reescreve exatamente a construção que reporta e nada mais, e uma regra só de
checagem não escreve nada.

Toda regra trabalha sobre os tokens do próprio PHP, nunca sobre o texto cru — então um `?` só é
reportado como atalho nullable quando o PHP o interpretou como um, e `fooBar` só é reportado
quando é um método sendo declarado, nunca quando é um sendo chamado.

## Verificar o código

Escreva um `bootgly.Lint.php` na raiz do seu código — ele retorna a configuração:

```php
<?php

use Bootgly\ABI\Syntax\Analyzers\Rules;
use Bootgly\ABI\Syntax\Lint;

return new Lint(
   version: 1,
   paths: ['app/'],
   excludes: ['**/vendor/**'],
   rules: Rules::cases()
);
```

Depois rode a checagem desse diretório, ou de qualquer diretório abaixo dele:

```bash
bootgly lint check
```

Cada violação é impressa com o arquivo, a linha, a regra e a construção exata de que ela fala:

```text
Lint > Check (imports, nullables, promotions, methods, spacing, casing, sections)
───────────────────────────────────────
Config: bootgly.Lint.php

app/Services/Billing.php
  ✗ Line 13: [imports] Missing import: use function strlen;
  ✗ Line 10: [nullables] Nullable shorthand in parameter type: ?int → use null|int
  ✗ Line 10: [methods] Multi-word method name: chargeCard() → use a single-word verb
  ✗ Line 10: [spacing] Declaration spacing: chargeCard(...) → one space before the parameter list
  ✗ Line 13: [spacing] Call spacing: strlen (...) → no space before the argument list
  ✗ Line 12: [casing] Object variable name starts lowercase: $request → $Request
  ✗ Line 8: [sections] Property outside a section: $count → group it under // * Config, // * Data or // * Metadata

Found 7 issue(s) in 1 file(s).
```

Nada é escrito. O comando sai com código diferente de zero sempre que sobra um issue, então a
mesma linha barra um hook de commit ou uma lane de CI:

```bash
bootgly lint check || exit 1
```

Passe um arquivo ou diretório para checar só parte dos caminhos configurados:

```bash
bootgly lint check app/Services/
bootgly lint check app/Services/Billing.php
```

`version`, `paths`, `excludes` e `rules` são tudo de que o arquivo precisa para começar; o
[manual do Lint](/manual/ABI/Syntax/Lint/overview/) cobre cada entrada, os padrões e como o arquivo
é encontrado. Um `bootgly.Lint.php` quebrado — erro de sintaxe, entrada malformada, uma `version`
de formato que este Bootgly não lê — falha a execução: ele nunca volta aos padrões. Sem nenhum
`bootgly.Lint.php`, `check` roda `imports`, `nullables`, `promotions` e `methods` sobre a árvore
`Bootgly/` do framework, ou sobre o seu projeto dentro de um kit.

### Dentro de um kit

`bootgly kit boot` escreve `projects/bootgly.Lint.php` quando não há nenhum, com todas as regras
habilitadas sobre `projects/`. A partir daí ele é seu: o kit nunca o sobrescreve. Entre no seu
projeto e cheque:

```bash
cd projects/App
php ../../bootgly lint check                 # o projeto inteiro
php ../../bootgly lint check Models/         # projects/App/Models
php ../../bootgly lint check Models/ --fix
```

`--fix` nunca reescreve as árvores fixadas do framework e das plataformas (`Bootgly/`, `Console/`,
`Web/`): são submódulos, e um reescrito bloquearia o próximo `bootgly kit upgrade`.

## Corrigir automaticamente

`imports`, `nullables` e `spacing` reescrevem no lugar com `--fix`:

```bash
bootgly lint check --fix
```

Para ver o que ele faria antes, sem tocar em um byte:

```bash
bootgly lint check --dry-run
```

Uma correção só é gravada quando o arquivo reescrito ainda é PHP válido, então uma execução nunca
deixa você com um arquivo quebrado. O arquivo é analisado de novo depois da reescrita: o que as
regras só de checagem reportam — ou o que uma correção não resolveu — continua listado, e
continua falhando a execução.

## Isentar uma regra onde ela não deve valer

Não há comentários de ignore inline. Quando uma regra não deve valer em algum lugar — um nome que
um SDK externo chama, uma propriedade mantida pública por compatibilidade — registre uma
`Exemption` no `bootgly.Lint.php`: a regra, o caminho, opcionalmente o símbolo, e sempre o motivo.

```php
use Bootgly\ABI\Syntax\Lint\Exemption;

return new Lint(
   version: 1,
   paths: ['app/'],
   rules: Rules::cases(),
   Exemptions: [
      new Exemption(
         rule: Rules::Methods,
         path: 'app/Services/Billing.php',
         reason: 'Called by the payment gateway SDK by this name',
         symbol: 'Billing::onPaid'
      ),
   ]
);
```

`symbol` é `name`, `Class::name` ou `Class::$name`; sem ele, todo issue daquela regra nos arquivos
casados é isentado. Uma isenção que não isenta mais nada fica **obsoleta** (stale) e falha a
execução até você removê-la — assim as isenções nunca sobrevivem ao código para o qual foram
escritas.

## Imports

A regra `imports` lê os `use` statements entre a declaração `namespace` e a sua primeira
entidade. Classes globais não são checadas: importe-as você mesmo (`use DateTime;`).

### O que ele detecta

| | |
|---|---|
| **Import faltando** | Função ou constante global usada sem `use` |
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

A regra `nullables` reporta todo atalho nullable `?T` em tipo de parâmetro, de retorno ou
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

A regra `promotions` reporta todo parâmetro de construtor que carrega um modificador de
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
também por isso que esta regra é só de checagem: a declaração que uma correção teria de
escrever precisa de uma seção e de um docblock que nenhuma reescrita pode escolher por você.

Só `__construct` é examinado; um modificador no parâmetro de qualquer outra função não é
promotion (e nem é PHP válido).

## Methods

A regra `methods` reporta todo método cujo nome tem mais de uma palavra — uma letra maiúscula
depois do primeiro caractere, ou um underscore no meio — e todo nome de uma palavra que não é um
verbo na forma base. O Bootgly nomeia métodos com um único verbo e põe o contexto no objeto, não
no nome:

```php
// ✗ reportado
public function renderHTML (): string {}   // mais de uma palavra
protected function getUserData (): array {}
public function loaded (): bool {}         // uma forma de passado

// ✓ verbos únicos — o objeto carrega o contexto
public function render (): string {}       // HTML->render()
protected function fetch (): array {}
public function load (): bool {}
```

Um método que É um loop ou um processo contínuo pode usar a forma `-ing` (`reading()`,
`routing()`). Só declarações dentro de uma classe, interface, trait ou enum contam (classes
anônimas incluídas). Uma função comum, uma closure, uma arrow function, uma chamada como
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
significa renomear todos os chamadores, e é por isso que esta regra é só de checagem.

## Spacing

A regra `spacing` distingue uma declaração de uma chamada pelo espaço antes do parêntese:

```php
// ✓
public function charge (int $amount): int     // uma declaração: um espaço
{
   $Closure = function ($value) {};           // closures e arrow functions também
   return $this->round($amount);              // uma chamada: nenhum espaço
}

// ✗ reportado, e corrigido por --fix
public function charge(int $amount): int
return $this->round ($amount);
```

Chamadas são funções e métodos — nomes, nomes qualificados, uma variável chamada, `new X (`.
Construções da linguagem não são nem uma coisa nem outra: estruturas de controle e `array (`,
`list (`, `isset (`, `empty (`, `unset (`, `eval (` mantêm o espaçamento com que foram escritas.

## Casing

A regra `casing` reporta nomes cuja caixa contradiz o que eles guardam, onde os tokens permitem
saber:

```php
// ✗ reportado
public Request $request;             // tipada com uma classe → $Request
$logger = new Logger();              // recebe `new` → $Logger
public string $url;                  // uma sigla → $URL

// ✓
public Request $Request;
/** @var array<int,Request> */
public array $Requests = [];         // uma coleção de objetos
$count = 0;                          // escalares ficam em minúscula
```

Um objeto ou coleção de objetos é uma propriedade ou parâmetro tipado com uma classe, um `array`
documentado como coleção de uma, ou uma variável que recebe `new X`. Um tipo que não nomeia uma
classe com certeza — `object`, uma união com um escalar, um nome de tipo no plural como um enum —
não é julgado. A regra é só de checagem: o nome de um parâmetro ou de uma propriedade faz parte de
uma API pública, então renomeá-lo é decisão sua, ou uma isenção.

## Sections

A regra `sections` checa como uma classe organiza as suas propriedades: cada uma sob um cabeçalho
`// * Config`, `// * Data` ou `// * Metadata`, os cabeçalhos nessa ordem e cada um no máximo uma vez.

```php
class Server
{
   // * Config
   public string $host;              // uma entrada do construtor, legível publicamente

   // * Data
   protected array $routes = [];     // outras entradas e padrões

   // * Metadata
   public private(set) int $started = 0;   // derivada — nunca escrita de fora
}
```

Ela também reporta uma propriedade Config que não é legível publicamente (o lugar dela é Data) e
uma propriedade Metadata gravável publicamente (restrinja com `private(set)`, `protected(set)` ou
`readonly`). Em qual seção uma propriedade fica é julgamento seu — a regra só checa que a
organização se mantém.

## Os subcomandos por regra

`bootgly lint imports`, `nullables`, `promotions` e `methods` continuam funcionando, com os mesmos
argumentos de antes, e imprimem um aviso de depreciação: ficam até a 2.0 como wrappers de `check`
restritos à sua regra. Use `bootgly lint check` em scripts novos.

## Relatório legível por máquina

Quando o comando detecta que está rodando sob um agente de IA (a variável de ambiente `AI_AGENT`,
ou o marcador que o seu agente define), ele imprime um único documento JSON no lugar do
relatório humano:

```json
{
   "command": "check",
   "rules": ["imports", "nullables", "promotions", "methods", "spacing", "casing", "sections"],
   "config": "bootgly.Lint.php",
   "result": "failed",
   "agent": "1",
   "mode": "check",
   "files": { "scanned": 12, "failed": 1, "fixed": 0, "skipped": 0 },
   "issues": { "total": 1, "unresolved": 1, "exempted": 0 },
   "report": [
      {
         "file": "app/Services/Billing.php",
         "issues": [
            {
               "rule": "nullables",
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
   "skipped": [],
   "exemptions": { "applied": 0, "stale": [] }
}
```

`result` só é `passed` quando não sobra nada: nenhum issue sem resolver e nenhuma isenção
obsoleta. Um `--dry-run`, uma checagem que achou algo ou um `--fix` que deixou algo para trás o
mantêm em `failed`, e `issues.unresolved` diz quantos restam; `issues.exempted` conta os issues que
as isenções dispensaram. `mode` é `check`, `dry-run` ou `fix`. Um arquivo que um analisador recusa —
`imports` recusa um que declara mais de um namespace, já que os imports dele são por bloco — é
listado em `skipped` com o motivo, e nunca deixa a execução verde por silêncio nem vermelha por si só.

## Referência

```bash
bootgly lint check [path]
```

Roda toda regra que o `bootgly.Lint.php` mais próximo habilita sobre todo caminho que ele
configura, ou sobre `path` — um arquivo ou diretório dentro deles, relativo ao diretório de
trabalho. Sai com código diferente de zero quando sobra um issue ou uma isenção está obsoleta.
Sem um `bootgly.Lint.php`, roda `imports`, `nullables`, `promotions` e `methods` sobre `Bootgly/`,
ou dentro de um kit sobre o diretório sob `projects/` de onde é chamado.

```bash
--fix
```

Reescreve no lugar cada arquivo reportado, para as regras corrigíveis (`imports`, `nullables`,
`spacing`). Só grava quando o resultado ainda é PHP válido. Num kit, nunca reescreve `Bootgly/`,
`Console/` ou `Web/`.

```bash
--dry-run
```

Reporta o que `--fix` mudaria e não grava nada.

```bash
--help, -h
```

Mostra o uso e os exemplos do comando.

```bash
bootgly lint imports|nullables|promotions|methods [path]
```

Depreciado — mantido até a 2.0. Roda `check` restrito a essa única regra.

### Tipos de issue

Estes são os valores de `type` no relatório legível por máquina:

| Tipo | Regra | Significado |
|---|---|---|
| `missing_import` | `imports` | Um símbolo é usado sem `use` statement para ele |
| `unused_import` | `imports` | Um `use` statement cujo nome não aparece em nenhum lugar do arquivo |
| `backslash_prefix` | `imports` | Um símbolo alcançado por `\` em vez de um import |
| `wrong_order` | `imports` | A ordem const → function → class está quebrada |
| `global_not_first` | `imports` | Um import global está depois de um com namespace |
| `not_alphabetical` | `imports` | Dois imports do mesmo tipo estão fora de ordem |
| `comment_in_imports` | `imports` | O bloco tem um comentário, então não foi reescrito |
| `nullable_shorthand` | `nullables` | Um tipo `?T`; `kind` é `parameter`, `return` ou `property` |
| `promoted_property` | `promotions` | Um parâmetro de construtor promovido; `kind` são os seus modificadores |
| `multiword_method` | `methods` | Um nome de método com mais de uma palavra |
| `verb_form` | `methods` | Um nome de método de uma palavra que não é um verbo na forma base |
| `declaration_spacing` | `spacing` | Uma declaração sem espaço antes da lista de parâmetros |
| `call_spacing` | `spacing` | Uma chamada com espaço antes da lista de argumentos |
| `object_case` | `casing` | Um objeto ou coleção de objetos nomeado em minúscula |
| `acronym_case` | `casing` | Uma sigla que não está em maiúscula |
| `unsectioned_property` | `sections` | Uma propriedade sem cabeçalho de seção |
| `section_order` | `sections` | Um cabeçalho de seção fora de ordem, ou repetido |
| `config_hidden` | `sections` | Uma propriedade Config que não é legível publicamente |
| `metadata_writable` | `sections` | Uma propriedade Metadata gravável publicamente |
