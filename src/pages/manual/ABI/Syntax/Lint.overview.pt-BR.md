# Lint

`Lint` é a configuração do `bootgly lint check`: quais árvores são lintadas, quais caminhos são
pulados, quais regras são aplicadas e quais isenções ficam registradas. Você a escreve uma vez,
num arquivo `bootgly.Lint.php` na raiz da sua árvore, e toda execução — a sua, a do seu CI, a do
seu agente de IA — aplica a mesma coisa.

Sem um `bootgly.Lint.php`, o `bootgly lint check` mantém os padrões: as quatro regras originais
(`imports`, `nullables`, `promotions`, `methods`) sobre a árvore `Bootgly/` do framework, ou sobre
o seu projeto dentro de um kit, pulando todo diretório `vendor/`, `examples/` e `vs/`. Com um
`bootgly.Lint.php`, nada sob o diretório dele é pulado pelas suas costas: o que não é checado ali
é o que os `excludes` listam (um caminho fora desse diretório mantém os pulos embutidos).

## Rode a checagem

```bash
bootgly lint check
```

O `check` roda toda regra habilitada sobre todo caminho configurado e imprime cada violação com
o arquivo, a linha e a regra:

```text
Lint > Check (imports, nullables, spacing, methods)
───────────────────────────────────────
Config: bootgly.Lint.php

app/Services/Billing.php
  ✗ Line 8: [spacing] Declaration spacing: charge(...) → one space before the parameter list
  ✗ Line 17: [methods] Method name is not a base-form verb: loaded() is a past form → name the action in the infinitive

Found 2 issue(s) in 1 file(s).
1 issue(s) waived by exemptions.
```

O comando sai com status `1` quando sobra algum problema ou alguma isenção está obsoleta, então
ele já serve, como está, de gate para um job de CI.

Duas opções reescrevem o que as regras corrigíveis reportam — e nada além disso:

```bash
bootgly lint check --dry-run   # mostra o que o --fix reescreveria, sem escrever nada
bootgly lint check --fix       # reescreve no lugar os problemas corrigíveis
```

Um arquivo reescrito passa pelo `php -l` antes de substituir o original, e é analisado de novo
depois: o que uma correção não conseguiu resolver continua reportado. Regras só de checagem
nunca reescrevem nada. Dentro de um kit, o `--fix` nunca reescreve as árvores fixadas do
framework e das plataformas (`Bootgly/`, `Console/`, `Web/`): uma execução cujos caminhos contêm
uma delas é recusada de saída, a menos que um exclude cubra a árvore inteira (`Bootgly/`, não
`Bootgly/*`), e qualquer arquivo de uma árvore fixada que ainda chegue à correção fica intocado —
os problemas dele continuam, e a execução falha.

## Escreva um bootgly.Lint.php

O arquivo retorna um `Lint`. Todo caminho e padrão nele é relativo ao diretório do arquivo:

```php
<?php

use Bootgly\ABI\Syntax\Analyzers\Rules;
use Bootgly\ABI\Syntax\Lint;
use Bootgly\ABI\Syntax\Lint\Exemption;

return new Lint(
   paths: ['app/'],
   excludes: ['**/tests/fixtures/**'],
   rules: [Rules::Imports, Rules::Nullables, Rules::Spacing, Rules::Methods],
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

- `paths` — as árvores checadas: diretórios ou arquivos, caminhos relativos simples (sem
  curingas, sem segmentos `..`, `.` ou vazios no meio); `.` sozinho é o próprio diretório do
  arquivo. Pelo menos um.
- `excludes` — padrões dos caminhos nunca checados (veja *Padrões* abaixo).
- `rules` — as regras aplicadas, em ordem, cada uma uma vez. Quando omitido: `imports`,
  `nullables`, `promotions` e `methods`.
- `Exemptions` — as isenções registradas (veja *Isente uma regra onde ela não deve valer*).

## Escolha as regras

| Regra | O que ela exige | Corrigível |
|---|---|---|
| `Rules::Imports` | `use` statements: faltando, sem uso, com barra invertida na frente, fora de ordem | sim |
| `Rules::Nullables` | Sem o atalho nullable — `?T` se escreve `null\|T` | sim |
| `Rules::Promotions` | Sem constructor property promotion | só checagem |
| `Rules::Methods` | Nomes de método têm uma só palavra, e essa palavra é um verbo na forma base (`load()`, não `loaded()`, `status()` ou `isReady()`); a forma `-ing` fica para laços (`reading()`) | só checagem |
| `Rules::Spacing` | Um espaço antes da lista de parâmetros de uma declaração (`function charge (`), nenhum antes dos argumentos de uma chamada (`charge(`) | sim |
| `Rules::Casing` | Uma variável, parâmetro ou propriedade que guarda um objeto, ou uma coleção de objetos, começa com maiúscula (`$Request`, `$Requests`); um acrônimo fica em maiúsculas (`$URL`, `$SQL`) | só checagem |
| `Rules::Sections` | Propriedades agrupadas sob `// * Config`, `// * Data` e `// * Metadata`, nessa ordem; Config é publicamente legível, Metadata nunca é publicamente gravável | só checagem |

Nomes cuja forma é imposta pelo PHP ou por um contrato — métodos mágicos, `getIterator()`,
`offsetGet()`, `jsonSerialize()`, os métodos de stream wrapper (`stream_open()`, `url_stat()`, …)
— nunca são reportados pelo `methods`.

## Padrões

Os `excludes` e o `path` de uma isenção são padrões comparados ao caminho de cada arquivo,
relativo ao diretório do `bootgly.Lint.php`. Um padrão é ancorado nesse diretório: `vendor/` é o
`vendor/` ao lado do arquivo, não um mais fundo na árvore — escreva `**/vendor/` para todos:

| Padrão | Casa com |
|---|---|
| `vendor/` | o diretório e tudo abaixo dele |
| `**/vendor/` | todo diretório `vendor/`, em qualquer profundidade |
| `app/Legacy.php` | exatamente esse arquivo |
| `app/*/Legacy.php` | `*` é qualquer sequência de caracteres dentro de um segmento |
| `app/Model?.php` | `?` é um caractere dentro de um segmento |
| `**/tests/fixtures/**` | `**` é zero ou mais segmentos inteiros |

Um padrão sempre fica dentro da árvore: caminho absoluto, segmento `..`, barra invertida ou
caractere de controle são recusados quando a configuração é construída — assim como um segmento
`.` ou vazio (`src/./gen/`, `src//gen/`), que nunca casaria.

## Isente uma regra onde ela não deve valer

Não existem comentários de ignore inline. Uma isenção é uma `Exemption` no `bootgly.Lint.php` —
a regra, onde, opcionalmente o quê, e sempre o porquê:

```php
new Exemption(
   rule: Rules::Casing,
   path: 'app/Bridges/**',
   reason: 'Mirrors the vendor SDK field names'
);
```

Sem `symbol`, todo problema da regra nos arquivos casados é isentado. Um `symbol` estreita a
isenção dentro desses arquivos:

| Símbolo | Isenta |
|---|---|
| `onPaid` | qualquer símbolo reportado com esse nome |
| `Billing::onPaid` | esse método (ou outro símbolo) dentro da classe `Billing` |
| `Billing::$url` | essa propriedade ou variável dentro da classe `Billing` |

Nomes de classe e de método são comparados sem diferenciar maiúsculas, como o PHP os resolve;
nomes com `$` são comparados exatamente. Uma isenção precisa citar uma regra listada em
`rules`, e um `reason` em branco é recusado.

Uma isenção que não isenta nada está **obsoleta** (stale), e ela falha a execução até você
removê-la:

```text
✗ Stale exemption: methods app/Services/Billing.php Billing::onRefund — waives nothing in the files it matches
```

Um `check` completo (sem caminho) também reporta a isenção cujo padrão não casa com nenhum
arquivo checado.

## Onde o arquivo é encontrado

O `bootgly lint check` procura o `bootgly.Lint.php` no diretório de trabalho e depois em cada
pai, até a raiz do workspace — nunca acima dela. O mais próximo vence.

Um `bootgly.Lint.php` que não carrega falha a execução: erro de parse, valor que não é um
`Lint`, entrada malformada. O comando nunca volta aos padrões por causa de um arquivo quebrado:

```text
Malformed bootgly.Lint.php: Lint exemption for 'methods' at 'app/Services/Billing.php' needs a reason.
```

## Cheque uma parte da árvore

Passe um caminho para checar só parte das árvores configuradas:

```bash
bootgly lint check app/Services/
bootgly lint check app/Services/Billing.php
```

Um caminho relativo é lido a partir do diretório de trabalho. Ele precisa estar dentro de uma
árvore configurada, ou conter algumas delas; qualquer
outro falha com `Path outside the configured paths`, e um caminho que não existe falha com
`Path not found`. Os excludes continuam valendo.

## Os subcomandos por regra

`bootgly lint imports`, `nullables`, `promotions` e `methods` continuam funcionando, com os
mesmos argumentos de antes, e imprimem um aviso de depreciação: eles ficam até a 2.0 como
wrappers sobre o `check` restritos à sua regra. O relatório JSON deles mantém as chaves
`submodule` e `fixable` e ganha `deprecated`, um `rule` em cada problema, `issues.exempted` e
`exemptions` — só acréscimos. Sob um `bootgly.Lint.php`, respeitam os
excludes dele e as isenções da sua regra. Use `bootgly lint check` em scripts novos.

## Para agentes de IA

Quando um agente de IA roda o comando (`AI_AGENT=1`, ou o ambiente de um agente conhecido), ele
imprime um único documento JSON. O `check` o abre com o comando, as regras rodadas e a
configuração carregada:

```json
{
  "command": "check",
  "rules": ["imports", "nullables", "spacing", "methods"],
  "config": "bootgly.Lint.php",
  "result": "failed",
  "agent": "claude",
  "mode": "check",
  "files": { "scanned": 1, "failed": 1, "fixed": 0, "skipped": 0 },
  "issues": { "total": 2, "unresolved": 2, "exempted": 1 },
  "report": [
    {
      "file": "app/Services/Billing.php",
      "issues": [
        {
          "rule": "methods",
          "type": "verb_form",
          "symbol": "loaded",
          "kind": "method",
          "line": 17,
          "message": "Method name is not a base-form verb: loaded() is a past form → name the action in the infinitive"
        }
      ],
      "fixed": false
    }
  ],
  "skipped": [],
  "exemptions": { "applied": 1, "stale": [] }
}
```

`skipped` lista os arquivos que um analisador recusou, com o motivo. Cada isenção obsoleta é listada com `rule`, `path`, `symbol`, `reason` e `why`.

## Referência

### Lint

```php
new Lint (array $paths, array $excludes = [], array $rules = [Rules::Imports, Rules::Nullables, Rules::Promotions, Rules::Methods], array $Exemptions = [])
```

Constrói a configuração e checa cada entrada: cada argumento precisa ser uma lista; `paths` tem
pelo menos um caminho relativo simples; `excludes` tem padrões válidos; `rules` tem casos de
`Rules`, pelo menos um, sem repetição; `Exemptions` tem `Exemption`s de regras habilitadas, com
padrões válidos. Qualquer outra coisa lança uma `InvalidArgumentException` que nomeia a entrada.

```php
Lint::discover (string $directory, string $root): null|string
```

Retorna o caminho absoluto do `bootgly.Lint.php` mais próximo, subindo de `$directory` até
`$root` inclusive, ou `null` quando não há nenhum. Um `$directory` fora de `$root` procura só em
`$root`.

```php
Lint::load (string $file): Lint
```

Faz o require do arquivo num escopo isolado e retorna o `Lint` que ele retorna, com `file`
preenchido. Lança uma `UnexpectedValueException` quando o arquivo não existe ou retorna outra
coisa; qualquer outro erro que o arquivo levante é lançado como está.

```php
$Lint->exclude (string $path): bool
```

Diz se um caminho, relativo ao diretório da configuração e separado por `/`, casa com algum dos
`excludes`.

```php
$Lint->select (Rules $rule, string $path): array
```

Retorna as isenções de `$rule` cujo padrão casa com o `$path` relativo, indexadas pela posição
delas em `Exemptions`.

```php
$Lint->paths      // array<int,string>
$Lint->excludes   // array<int,string>
$Lint->rules      // array<int,Rules>
$Lint->Exemptions // array<int,Exemption>
$Lint->file       // null|string — o arquivo de onde foi carregada
```

A configuração como foi construída (só leitura), e o arquivo de onde foi carregada (`null`
quando foi construída em código).

### Exemption

```php
new Exemption (Rules $rule, string $path, string $reason, null|string $symbol = null)
```

Uma isenção. Lança uma `InvalidArgumentException` quando `$reason` está em branco ou `$symbol`
não é `name`, `Class::name` ou `Class::$name`. Os argumentos ficam legíveis nas propriedades
`rule`, `path`, `reason` e `symbol`.

```php
$Exemption->cover (Issue $Issue, string $class): bool
```

Diz se a isenção cobre um problema pelo símbolo, dado o nome curto da classe que o envolve
(`''` quando nenhuma). A regra e o caminho são casados pelo `Lint::select()`.

### Glob

```php
new Glob (string $pattern)
```

Um padrão de `excludes` ou do `path` de uma isenção. Lança uma `InvalidArgumentException` quando
o padrão está vazio, é absoluto, sai da árvore com `..`, ou tem barra invertida, caractere de
controle ou segmento `.` ou vazio. `pattern` o guarda como foi escrito, `regex` a expressão em que ele compila.

```php
$Glob->match (string $path): bool
```

Diz se um caminho relativo, separado por `/`, casa com o padrão.

### Rules

```php
enum Rules: string
```

`Bootgly\ABI\Syntax\Analyzers\Rules` — um caso por regra: `Imports` (`'imports'`),
`Nullables` (`'nullables'`), `Promotions` (`'promotions'`), `Methods` (`'methods'`), `Spacing`
(`'spacing'`), `Casing` (`'casing'`) e `Sections` (`'sections'`).
