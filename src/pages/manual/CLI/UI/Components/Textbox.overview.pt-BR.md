# Componente Textbox

O componente `Textbox` é a entrada de texto de linha única da plataforma Console: um prompt, um editor de linha e — quando há opções a oferecer — uma lista abaixo do input. O mesmo componente cobre texto livre, respostas yes/no (`confirm()`), entrada secreta (`mask`), autocomplete (`options`) e busca (`source`), então existe exatamente um caminho para pedir uma linha ao usuário.

Em terminais interativos, todos os modos editam dentro do mesmo input emoldurado. Em entrada não interativa (pipes, CI) ele lê uma linha simples do stdin, sem moldura — o código consumidor permanece idêntico nos dois casos.

Exemplos em estilo de transcript estão disponíveis no [showcase](/manual/CLI/UI/Components/Textbox/showcase).

## Instância

Para utilizar o componente, é necessário criar uma instância passando como parâmetros as instâncias dos componentes `Input` e `Output`:

```php
use const Bootgly\CLI;
use Bootgly\CLI\UI\Components\Textbox;

$Terminal = CLI->Terminal;

$Textbox = new Textbox($Terminal->Input, $Terminal->Output);
```

## Pedindo uma linha

Defina o `prompt` e o `default` e então chame `ask()`:

```php
$Textbox->prompt = 'Server port';
$Textbox->default = '8080';

$port = $Textbox->ask();
```

Uma resposta vazia (apenas Enter) ou EOF retorna `'8080'`. O editor interativo renderiza `❯ Server port: ` e simplesmente assume o valor padrão em uma linha vazia; o prompt simples usado em pipes (e para entrada mascarada) o carrega entre colchetes — `❯ Server port [8080]: `.

## Validando respostas

Atribua uma Closure a `Validator` — ela recebe a resposta candidata e retorna `true` para aceitá-la ou uma string de mensagem de erro para rejeitá-la. O erro é renderizado como um [Alert](/manual/CLI/UI/Components/Alert/overview) de tipo Failure e a pergunta é feita novamente:

```php
$Textbox->prompt = 'Server port';
$Textbox->default = '8080';
$Textbox->Validator = static function (string $answer): true|string {
   if (preg_match('#^\d{1,5}$#', $answer) !== 1) {
      return 'Invalid port: use a number between 1 and 65535.';
   }

   return true;
};

$port = $Textbox->ask();
```

O valor padrão também passa pelo Validator: uma resposta vazia assume o valor padrão antes de a validação rodar.

## Exigindo uma resposta

Quando `required` é `true` e não há valor padrão, respostas vazias renderizam um Alert de Failure `An answer is required.` e a pergunta é feita novamente:

```php
$Textbox->prompt = 'Project path (e.g. `App` or `App/API`)';
$Textbox->required = true;

$path = $Textbox->ask();
```

É exatamente assim que o wizard do `bootgly projects create` pede o caminho do projeto.

## Limitando tentativas

A propriedade `attempts` limita quantas rodadas a pergunta executa — `0` (o padrão) significa ilimitado. Quando as tentativas se esgotam, o `ask()` desiste e retorna o valor padrão, e `attempt` informa quantas rodadas foram consumidas:

```php
$Textbox->prompt = 'Project name';
$Textbox->required = true;
$Textbox->default = 'MyApp';
$Textbox->attempts = 3;

$name = $Textbox->ask();

echo $Textbox->attempt; // rodadas consumidas
```

## Mascarando entrada secreta

Defina `mask` para ecoar um caractere de máscara em vez do que é digitado — senhas e tokens nunca aparecem na tela. Em TTYs reais o eco do kernel é desabilitado durante a leitura e o componente ecoa a máscara por conta própria, caractere a caractere:

```php
$Textbox->prompt = 'Password';
$Textbox->required = true;
$Textbox->mask = '•';

$password = $Textbox->ask(); // digitar `hunter2` renderiza `•••••••`
```

Uma entrada mascarada com `default` nunca o revela — o prompt renderiza a máscara repetida três vezes (`❯ API token [•••]: `), qualquer que seja o tamanho real, e uma resposta vazia ainda assume o valor padrão real.

## Autocompletando com opções

Defina `options` para listá-las abaixo do input durante a edição. Digitar filtra (sem diferenciar maiúsculas, multibyte, casando em qualquer posição do label), `↑`/`↓` miram, `Tab` completa o texto digitado para o label mirado, `Esc` fecha a lista mantendo o que foi digitado, e Enter submete:

```php
$Textbox->prompt = 'Editor';
$Textbox->options = ['vim', 'nano', 'emacs', 'helix'];

$editor = $Textbox->ask(); // texto livre vence — as opções apenas auxiliam
```

| Teclas | Ação |
|---|---|
| `↑` / `↓` | miram uma opção |
| `Tab` | completa o texto digitado para o label mirado |
| `Esc` | fecha a lista de opções, mantendo o texto digitado |
| `Enter` | submete |

Qualquer outra tecla edita o buffer através do editor [Line](/manual/CLI/Terminal/Input/Line/overview) (`←`/`→`, `Home`/`End`, `Backspace`/`Delete`, `Ctrl+U`/`Ctrl+K`…), e qualquer edição re-consulta as opções com o novo texto — a mira anterior não significa mais nada depois disso, então a lista volta a mirar a primeira linha.

A propriedade `viewport` limita quantas linhas de opção ficam visíveis (`5` por padrão); listas maiores janelam ao redor da mira e anunciam as bordas cortadas com marcadores `↑ N more` / `↓ N more`.

## Escolhendo uma das opções

O `strict` é o que separa completar de escolher. Com ele desligado (o padrão), Enter submete o texto digitado e as opções são sugestões; com ele ligado, apenas uma opção listada é aceita, e Enter retorna o **valor** da opção mirada:

```php
$Textbox->prompt = 'Database';
$Textbox->options = [
   'db.mysql' => 'MySQL',
   'db.sqlite' => 'SQLite',
   'db.postgres' => 'PostgreSQL'
];
$Textbox->strict = true;

$database = $Textbox->ask(); // mirar `SQLite` retorna 'db.sqlite'
```

As opções são `array<int|string,string>`: uma chave string é o valor retornado, enquanto uma chave int (uma lista simples) retorna o próprio label. Respostas que não casam com nenhuma opção renderizam um Alert de Failure `Pick one of the options.` e a pergunta é feita novamente.

## Buscando com um source dinâmico

Quando os candidatos não podem ser listados de antemão, atribua uma Closure a `source`. Ela recebe a query atual e retorna opções no mesmo formato — é re-consultada a cada edição (e uma vez com a query vazia quando o editor abre) e filtra por conta própria: o resultado é listado como veio, sem uma segunda filtragem por cima:

```php
$Textbox->prompt = 'Search an extension';
$Textbox->hint = '(type to filter, ↑/↓ aim, Enter confirm)';
$Textbox->source = static function (string $query) use ($extensions): array {
   if ($query === '') {
      return $extensions;
   }

   return array_values(array_filter(
      $extensions,
      static fn (string $extension): bool => stripos($extension, $query) !== false
   ));
};
$Textbox->strict = true;

$extension = $Textbox->ask();
```

Como o source é dono da filtragem, ele pode ranquear, paginar ou consultar um banco de dados — os labels nem precisam conter a query.

## Confirmando (yes/no)

`confirm()` faz uma pergunta yes/no e retorna um `bool` — o prompt renderiza um sufixo ` [Y/n] ` (ou ` [y/N] `) refletindo o valor padrão. `y`/`yes`/`n`/`no` são aceitos sem diferenciar maiúsculas; respostas vazias e EOF assumem o padrão; respostas inválidas re-perguntam em terminais interativos e caem no padrão em pipes:

```php
$confirmed = $Textbox->confirm('Create the project?', default: true);

if ($confirmed === false) {
   // abortado…
}
```

É assim que o wizard do `bootgly projects create` faz sua confirmação final — e como o controle `Confirm` do [Form](/manual/CLI/UX/Components/Form/overview) funciona.

## A moldura interativa

Em terminais interativos o input é sempre emoldurado: o `marker` é desenhado antes do prompt em todos os modos, e o `border` desenha uma régua acima e abaixo do input. O `hint` cavalga a régua de baixo, interrompendo-a como uma legenda, para ser lido logo abaixo daquilo que explica, e a lista de opções (um [Listbox](/manual/CLI/UI/Base/Listbox/overview)) cai abaixo dela:

```php
$Textbox->marker = '@#Cyan:❯@; '; // padrão
$Textbox->border = '─';           // padrão
$Textbox->hint = '(type to filter, ↑/↓ aim, Enter confirm)';
```

```text
──────────────────────────────────────────────
❯ Search a component: t
─ (type to filter, ↑/↓ aim, Enter confirm) ───
=> Prompt
   Textbox
   Toasts
   Tree
```

Ambos aceitam markup e ambos aceitam `''` para desabilitar — um `marker` vazio remove o `❯`, um `border` vazio remove as duas réguas (o hint então renderiza como uma linha esmaecida logo abaixo do prompt). Dentro de um host que já emoldura seu conteúdo — um passo do [Wizard](/manual/CLI/UX/Components/Wizard/overview), por exemplo — defina `border = ''` para que dois contêineres não se aninhem.

Assim que a resposta é submetida, a lista de opções é limpa e a moldura final mantém apenas o prompt e o valor capturado.

## Entrada não interativa

Em pipes e CI, o `ask()` renderiza o prompt simples e lê uma linha do stdin — sem moldura, sem lista de opções, sem modo raw:

```bash
printf '9090\n' | php app.php
```

Com `strict`, a linha digitada é resolvida contra as opções exatamente como escolher uma linha faria: labels casam sem diferenciar maiúsculas, valores casam exatamente, e a resposta retornada é sempre o valor da opção — então digitar `mysql` responde `db.mysql`. Linhas não listadas renderizam o Alert `Pick one of the options.` e a pergunta é feita novamente; um `source` é consultado com a própria linha digitada para resolvê-la.

## Referência

### Propriedades

```php
public string $prompt
```

Config. A pergunta renderizada depois do `marker`. Padrão: `''`.

```php
public string $hint
```

Config. Linha de ajuda esmaecida renderizada junto ao input durante a edição — interrompe a régua de baixo como uma legenda (ou renderiza como uma linha própria quando `border` está vazio). Vazio a esconde. Padrão: `''`.

```php
public string $default
```

Config. A resposta assumida em resposta vazia, EOF ou tentativas esgotadas. Padrão: `''`.

```php
public bool $required
```

Config. Quando `true` e `default` é vazio, respostas vazias refazem a pergunta em vez de serem aceitas. Padrão: `false`.

```php
public int $attempts
```

Config. Número máximo de rodadas de pergunta antes de o valor padrão ser assumido — `0` significa ilimitado. Padrão: `0`.

```php
public null|Closure $Validator
```

Config. Closure opcional de validação com a assinatura `fn (string $answer): true|string`. Ela recebe a resposta candidata — já resolvida para o valor da opção no modo `strict`. Retornar `true` aceita a resposta; retornar uma string a rejeita e renderiza a string como um Alert de Failure. Padrão: `null`.

```php
public null|string $mask
```

Config. Quando definido, cada caractere digitado ecoa essa máscara em vez do caractere (entrada secreta) e o prompt nunca revela o `default`. Padrão: `null`.

```php
public array $options
```

Config. As opções oferecidas abaixo do input (`array<int|string,string>`) — uma chave string é o valor retornado, uma chave int retorna o próprio label. Vazio não oferece nada. Padrão: `[]`.

```php
public null|Closure $source
```

Config. Source dinâmico com a assinatura `fn (string $query): array<int|string,string>`, re-consultado a cada edição e retornando opções no mesmo formato de `options`. Ele filtra por conta própria — seu resultado nunca é filtrado novamente. Padrão: `null`.

```php
public int $viewport
```

Config. Número máximo de linhas de opção visíveis — listas maiores janelam ao redor da mira com marcadores `↑ N more` / `↓ N more`. Padrão: `5`.

```php
public string $marker
```

Config. Markup desenhado antes do prompt em todos os modos — `''` o desabilita. Padrão: `'@#Cyan:❯@; '`.

```php
public string $border
```

Config. O caractere das réguas desenhadas acima e abaixo do input — `''` desabilita a moldura. Padrão: `'─'`.

```php
public bool $strict
```

Config. Quando `true`, a resposta deve ser uma das opções e Enter submete o valor da opção mirada. Padrão: `false`.

```php
public private(set) string $answer
```

Metadata (somente leitura). A resposta retornada pela última chamada de `ask()`.

```php
public private(set) int $attempt
```

Metadata (somente leitura). O número de rodadas consumidas pela última chamada de `ask()`.

```php
public private(set) null|bool $confirmed
```

Metadata (somente leitura). O resultado da última chamada de `confirm()` — `null` antes da primeira chamada.

### ask()

```php
public function ask (): string
```

Pergunta até uma resposta válida, EOF ou tentativas esgotadas. Terminais interativos editam dentro do input emoldurado (com a lista de opções quando há algo a oferecer); entrada mascarada ecoa a máscara; entrada não interativa lê uma linha simples do stdin. Respostas vazias assumem o valor padrão; quando `required` é `true` e não há valor padrão, respostas vazias refazem a pergunta; no modo `strict`, respostas não listadas refazem a pergunta e as listadas resolvem para o valor da opção; quando o `Validator` retorna uma string de erro, o erro é renderizado como um Alert de Failure e a pergunta é feita novamente. EOF ou `attempts` esgotadas retornam o valor padrão. Armazena o resultado em `answer` e o retorna.

### confirm()

```php
public function confirm (string $prompt = '', bool $default = false): bool
```

Pede uma confirmação yes/no renderizando `prompt [Y/n] ` (ou ` [y/N] ` quando `$default` é `false`). Um `$prompt` não vazio sobrescreve o configurado. Aceita `y`/`yes`/`n`/`no` sem diferenciar maiúsculas; respostas vazias e EOF assumem o padrão; em entrada não interativa, respostas inválidas também caem no padrão. Armazena o resultado em `confirmed` e o retorna.
