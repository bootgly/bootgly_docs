# Validação

`Bootgly\ADI\Validation` confere um array associativo contra regras e informa, campo a campo, a
mensagem de cada regra que falhou. Uma regra é um objeto, um `Bootgly\ADI\Validation\Condition`: as
18 regras built-in ficam em `Bootgly\ADI\Validators\*`, e o que cada uma aceita está em
**[Validadores](/manual/ADI/Validators/overview/)**. Uma aplicação escreve as suas estendendo
`Bootgly\ADI\Validators` (veja [Escreva uma regra customizada](#escreva-uma-regra-customizada)).

O motor fica na camada ADI, então toda camada acima dele valida com as mesmas regras. No servidor
HTTP, o middleware `Validator` o executa sobre uma fonte do Request antes do handler da rota e,
por padrão, responde `422` quando uma regra falha — veja
**[Validação de Requisição](/manual/WPI/HTTP/HTTP_Server_CLI/Request/overview/#validação-de-requisição)** e
**[Middlewares → Validator](/manual/WPI/HTTP/HTTP_Server_CLI/Middlewares/overview/#validator)**.
Em qualquer outro lugar — um comando de console, um worker, um job, um seeder, um script —, crie uma
`Validation` sobre o array que você tem em mãos. O **[guia de Validation](/guide/validation/overview/)**
percorre esses usos; esta página é o comportamento do motor e a Referência dele. As mensagens são
traduzidas pelo `Bootgly\ABI\Data\Language`, cujos catálogos, e a lista das mensagens padrão, estão
em **[i18n](/guide/i18n/overview/#mensagens-de-validação-localizadas)**.

## Execute uma validação

```php
use Bootgly\ADI\Validation;
use Bootgly\ADI\Validators\Email;
use Bootgly\ADI\Validators\In;
use Bootgly\ADI\Validators\Required;

$Validation = new Validation(
   source: [
      'name' => 'Ada',
      'email' => 'ada.example.com',
      'plan' => 'gold',
   ],
   rules: [
      'name' => [new Required],
      'email' => [new Required, new Email],
      'plan' => [new Required, new In(['free', 'pro'])],
      'country' => new Required,
   ]
);

$Validation->valid; // false
$Validation->errors;
// [
//    'email' => ['email must be a valid email address.'],
//    'plan' => ['plan must be one of the allowed values.'],
//    'country' => ['country is required.'],
// ]
```

O construtor faz o trabalho: ele executa as regras sobre o array de origem, `source`, na hora, e
`valid` e `errors` guardam o resultado — lê-los não executa nada de novo. Uma `Validation` confere
um array uma vez, então crie outra para a próxima requisição, linha ou payload.

- `$rules` mapeia cada campo para uma lista de regras, executadas na ordem em que estão listadas.
  Uma regra sozinha dispensa a lista: `'country' => new Required` equivale a `[new Required]`.
- `errors` (`array<string, array<int,string>>`) só lista um campo quando ao menos uma das regras
  dele falhou, com uma mensagem por regra que falhou, na ordem das regras; os campos vêm na ordem de
  `$rules`. Um campo cujas regras passaram todas fica de fora — `name` acima —, e `errors` é `[]`
  quando tudo passou.
- `valid` é `true` exatamente quando `errors` está vazio.
- Os dois são somente leitura: atribuir `errors` lança `Error` com
  `Cannot modify private(set) property Bootgly\ADI\Validation::$errors from global scope`, e
  atribuir `valid` lança `Property Bootgly\ADI\Validation::$valid is read-only`.

O resultado não carrega valores: o motor informa, e os dados ficam no array que você passou (veja
[Os valores não são convertidos](#os-valores-não-são-convertidos)).

## Regras por campo

A chave de uma regra nomeia uma chave da origem, comparada de forma exata e diferenciando maiúsculas
de minúsculas: `'email'` não casa com `'Email'`. Uma chave com `.` ou com um segmento `*` é um
caminho para dentro de arrays aninhados — `'user.email'`, `'items.*.sku'` — veja
[Caminhos aninhados e curingas](#caminhos-aninhados-e-curingas). Os headers do Request são a única
exceção que o middleware `Validator` faz por você: ele casa os nomes deles em qualquer caixa antes
de o motor rodar (veja
**[Middlewares → Validator](/manual/WPI/HTTP/HTTP_Server_CLI/Middlewares/overview/#validator)**).

- As chaves da origem que nenhuma regra nomeia são ignoradas: não causam erro, e nada as remove. Uma
  chave extra `is_admin` continua no array depois de uma validação que passou, então escolha você
  mesmo as chaves que guarda.
- Um objeto de regra guarda só as próprias configurações, então uma instância pode servir a vários
  campos e a várias validações, e cada mensagem nomeia o próprio campo: um mesmo `$Required` listado
  em `first_name` e `last_name` informa `first_name is required.` e `last_name is required.` O
  middleware `Validator` conta com isso: ele cria uma `Validation` nova a cada requisição a partir
  dos objetos de regra que a rota declarou uma vez.
- Uma lista vazia — `'note' => []` — não confere nada.

## Caminhos aninhados e curingas

Uma chave de regra com pontos entra em arrays aninhados, e um segmento `*` vale para cada entrada do
array naquele nível:

```php
use Bootgly\ADI\Validation;
use Bootgly\ADI\Validators\Email;
use Bootgly\ADI\Validators\In;
use Bootgly\ADI\Validators\Integer;
use Bootgly\ADI\Validators\Maximum;
use Bootgly\ADI\Validators\Minimum;
use Bootgly\ADI\Validators\Required;

$payload = [
   'user' => ['email' => 'ada.example.com', 'role' => 'admin'],
   'items' => [
      ['sku' => 'A-1', 'quantity' => 2],
      ['sku' => 'B-2', 'quantity' => 0],
      ['quantity' => 1],
   ],
];

$Validation = new Validation($payload, [
   'user.email' => [new Required, new Email],
   'user.role' => [new In(['member', 'owner'])],
   'items' => [new Required, new Maximum(50)],
   'items.*.sku' => [new Required],
   'items.*.quantity' => [new Required, new Integer, new Minimum(1)],
]);

$Validation->errors;
// [
//    'user.email' => ['user.email must be a valid email address.'],
//    'user.role' => ['user.role must be one of the allowed values.'],
//    'items.2.sku' => ['items.2.sku is required.'],
//    'items.1.quantity' => ['items.1.quantity must be at least 1.'],
// ]
```

- Um erro fica na chave do caminho concreto que falhou — `items.2.sku`, não `items.*.sku` — e esse
  caminho é o `{field}` da mensagem. As chaves de regra rodam na ordem de `$rules`, e um curinga
  percorre o array dele em ordem.
- Um `*` percorre uma lista e um array com chaves do mesmo jeito, então campos de formulário
  `items[a][sku]=…` também funcionam. Só um segmento inteiro é curinga: `a*` é uma chave chamada
  `a*`.
- Um caminho cujo container falta, é `null` ou `''` está ausente, como uma chave plana: `Required`
  falha no caminho completo (`address.city is required.`) e as outras regras o pulam. Um curinga
  sobre um container ausente, em branco ou vazio não tem entradas, então `items.*.sku` nunca torna
  `items` obrigatório — dê a `items` uma regra própria, como acima.
- Um container presente que não é array falha fechado: `address` com `'Rua A, 10'` sob
  `address.city` informa `address must be an array.` uma vez só, no container, por mais chaves de
  regra que passem por ele, e as regras abaixo dele não rodam.
- Uma regra recebe o caminho concreto em `$field` e a origem inteira em `$data`. O `Confirmed` lê
  `<caminho>_confirmation` como caminho, então `user.password` é confirmado por
  `user.password_confirmation`.

### Chaves com ponto

Um ponto sempre separa segmentos: `'app.name'` é a chave `name` dentro de `app`, nunca uma chave
chamada `app.name`. Escape o ponto para nomear uma chave assim: `'app\.name'`. `\*` é uma chave
chamada `*`, e `\\` uma barra invertida; qualquer outra barra invertida fica como está. Um caminho
de erro escapa as chaves da origem do mesmo jeito, para poder ser lido de volta como chave de
regra — um curinga `*` sobre `['a.b' => …]` informa `rows.a\.b.n`.

```php
$Validation = new Validation(['app.name' => 'Bootgly'], [
   'app\.name' => [new Required], // a chave "app.name": passa
   'app.name' => [new Required],  // "name" dentro de "app": falha
]);

$Validation->errors; // ['app.name' => ['app.name is required.']]
```

Antes da 1.2.0 uma chave de regra era sempre uma chave literal, então uma chave com ponto casava com
essa chave. Escape essas chaves ao atualizar. Uma chave sem escape nem sempre falha de forma visível:
o `Required` informa a chave como ausente, mas uma regra opcional (`'session.token' => [new Regex(…)]`)
agora lê uma chave que não existe e passa em silêncio — enquanto o seu código continua lendo a chave
literal, sem validação.

### Limite dos curingas

Os curingas de uma chave de regra visitam no máximo `limit` entradas, 1000 por padrão — toda
entrada conta, as aninhadas inclusive. Uma chave de regra que visitaria mais não roda: ela informa
um `{field} has too many items.` no container do primeiro curinga e nada mais.

```php
$Validation = new Validation(['tags' => range(1, 1001)], ['tags.*' => [new Integer]]);
$Validation->errors; // ['tags' => ['tags has too many items.']]

$Validation = new Validation(['tags' => range(1, 1001)], ['tags.*' => [new Integer]], limit: 5000);
$Validation->valid; // true
```

O limite impede que um payload hostil dite o trabalho: um body JSON de 1 MB com entradas `[]` tem
349 525 entradas, e validar `items.*.id` em todas elas levou 213 MB e escreveu 17 MB de mensagens;
com o limite, para na entrada 1001. Aumente `limit` onde um payload deve ser grande (uma importação
em lote). O middleware `Validator` usa o padrão.

Entradas não são o único custo: uma chave do cliente é copiada no caminho de toda entrada abaixo
dela, então uma chave de 200 KB sobre `items.*.tags.*` repetiria 200 KB em até 1000 caminhos e
mensagens. Por isso os caminhos concretos que uma chave de regra monta (seus alvos e containers que
falharam) também ficam limitados a `limit` × `Validation::BYTES` bytes — 256 KB por padrão. Acima
disso, a chave de regra falha do mesmo jeito, com `{field} has too many items.`

## Valores em branco e regras implícitas

```php
use Bootgly\ADI\Validation;
use Bootgly\ADI\Validators\In;
use Bootgly\ADI\Validators\Minimum;
use Bootgly\ADI\Validators\Regex;
use Bootgly\ADI\Validators\Required;
use Bootgly\ADI\Validators\URL;

$Validation = new Validation(
   source: [
      'nickname' => '',
      'website' => null,
      'tags' => [],
      'bio' => '   ',
      'phone' => '   ',
   ],
   rules: [
      'nickname' => [new Regex('/\A[a-z]+\z/')],
      'website' => [new URL],
      'tags' => [new Minimum(1)],
      'country' => [new In(['BR', 'US'])],
      'bio' => [new Regex('/\A[a-z]+\z/')],
      'phone' => [new Required],
   ]
);

$Validation->errors;
// [
//    'bio' => ['bio has an invalid format.'],
//    'phone' => ['phone is required.'],
// ]
```

Um valor está em branco quando a chave dele falta ou ele é `null`, `''` ou `[]`. Um valor em branco
pula toda regra que não é implícita, o que torna cada campo opcional até uma regra dizer o
contrário: `nickname`, `website`, `tags` e o `country` ausente passam acima, seja o que for que as
regras deles confiram — `Minimum(1)` inclusive, então ele não consegue exigir uma lista não vazia:
uma regra implícita como o `Required` consegue.

- `Required` é a única regra built-in implícita: ela roda sobre um valor em branco e o reprova. Uma
  regra customizada também pode ser implícita (veja
  [Regras implícitas e entre campos](#regras-implícitas-e-entre-campos)).
- Nada mais está em branco. Uma string de espaços chega a toda regra — `bio` falha no padrão dela —,
  e `Required` a reprova porque apara as strings antes (`phone`). `0`, `'0'` e `false` também não
  estão em branco: passam no `Required` e chegam às outras regras.
- Uma chave ausente e um valor `null` parecem iguais para uma regra: os dois chegam como `null`.
  Uma regra customizada que precisa diferenciá-los confere `array_key_exists($field, $data)`.

`Confirmed` não é implícita, então um campo em branco a pula — mesmo quando a confirmação guarda
outra coisa:

```php
use Bootgly\ADI\Validation;
use Bootgly\ADI\Validators\Confirmed;

$Validation = new Validation(
   source: ['password' => '', 'password_confirmation' => 'something else'],
   rules: ['password' => [new Confirmed]]
);

$Validation->valid; // true
```

Liste `Required` primeiro quando o campo precisa ser preenchido: com `[new Required, new Confirmed]`,
a mesma origem informa `password is required.`

## Toda regra roda

```php
use Bootgly\ADI\Validation;
use Bootgly\ADI\Validators\In;
use Bootgly\ADI\Validators\Regex;
use Bootgly\ADI\Validators\Required;

$Validation = new Validation(
   source: ['category' => 'Latest News'],
   rules: [
      'category' => [new Required, new Regex('/\A[a-z-]+\z/'), new In(['news', 'blog'])],
   ]
);

$Validation->errors;
// [
//    'category' => [
//       'category has an invalid format.',
//       'category must be one of the allowed values.',
//    ],
// ]
```

Uma regra que falha não interrompe o campo dela: toda regra da lista roda, em ordem, e cada falha
acrescenta a sua mensagem. Por enquanto não há como parar na primeira falha; mostre
`$Validation->errors[$field][0]` quando uma mensagem por campo basta.

Assim, uma regra também roda sobre um valor que uma regra anterior rejeitou: um array onde `Integer`
esperava dígitos, um `int` onde `Email` esperava uma string. As regras built-in devolvem um veredito
para um valor de qualquer tipo — um tipo que a regra não trata a reprova —, exceto, por enquanto,
`Date` com formato, que lança `ValueError` sobre uma string que contém um byte NUL (veja
[Datas](/manual/ADI/Validators/overview/#datas)). Por enquanto, mais duas lançam sobre valores que
nenhuma requisição carrega (veja [Erros](/manual/ADI/Validators/overview/#erros)). Uma regra customizada também precisa devolver um veredito para qualquer
tipo, porque nada a protege: um `validate()` que entrega um array ao `strtoupper()` lança
`TypeError` para fora do `new Validation()`. O que uma regra lança escapa do construtor, e nenhuma
`Validation` é retornada.

## Os valores não são convertidos

```php
use Bootgly\ADI\Validation;
use Bootgly\ADI\Validators\In;
use Bootgly\ADI\Validators\Integer;
use Bootgly\ADI\Validators\Required;

parse_str('page=2&limit=25', $query);

$Validation = new Validation($query, [
   'page' => [new Required, new Integer, new In([1, 2, 3])],
   'limit' => [new Integer],
]);

$Validation->errors; // ['page' => ['page must be one of the allowed values.']]
```

O motor não muda nada: não converte, não apara, não filtra, e não devolve uma cópia validada. Cada
regra vê o valor com o tipo com que ele chegou. Uma query string ou um corpo de formulário dá
strings, então `page` é `'2'`: `Integer` aceita os dígitos dele, e o `In([1, 2, 3])` estrito recusa
a string. Um corpo JSON decodificado em array mantém os tipos do JSON, então `{"page": 2}` passa
pelas mesmas regras.

- Escreva os valores como eles chegam — `In(['1', '2', '3'])` — ou compare de forma frouxa —
  `In([1, 2, 3], strict: false)`. Como cada regra lê cada tipo está em
  **[Validadores](/manual/ADI/Validators/overview/)**.
- Converta depois de validar: `(int) $query['page']` é `2`.
- Espaços fazem parte do valor: um formulário que envia `name=+Ada+` dá `' Ada '`, que `In(['Ada'])`
  recusa. Apare antes de validar quando a sua entrada puder vir com espaços nas pontas.

## Mensagens

Uma regra que falha acrescenta `format($field)` a `errors`. Esse único método monta toda mensagem,
em três passos:

1. Ele pega a `message` com que a regra foi criada, ou o template da regra quando não há nenhuma —
   `''` conta como nenhuma. Toda regra built-in recebe `message` como último argumento do
   construtor.
2. Ele procura esse texto no domínio `validation` dos catálogos do `Bootgly\ABI\Data\Language`, para
   o locale ativo. O texto em inglês é a chave, e um texto que nenhum catálogo lista volta como está
   — todo texto, enquanto nenhum catálogo está registrado.
3. Ele substitui `{field}` pelo nome do campo, e os placeholders próprios da regra, como `{limit}`,
   pelos valores deles. Um placeholder que a regra não preenche fica como foi escrito.

### Substitua uma mensagem

```php
use Bootgly\ADI\Validation;
use Bootgly\ADI\Validators\Maximum;
use Bootgly\ADI\Validators\Minimum;
use Bootgly\ADI\Validators\Required;

$Validation = new Validation(
   source: ['age' => '16', 'tags' => ['a', 'b', 'c', 'd']],
   rules: [
      'age' => [new Minimum(18, 'You must be {limit} or older.')],
      'tags' => [new Maximum(3, message: '{field} accepts up to {limit} items.')],
      'name' => [new Required('Tell us your {label}.')],
   ]
);

$Validation->errors;
// [
//    'age' => ['You must be 18 or older.'],
//    'tags' => ['tags accepts up to 3 items.'],
//    'name' => ['Tell us your {label}.'],
// ]
```

Uma mensagem dada a uma regra substitui o template dela e ganha os mesmos placeholders: `{field}`,
e os próprios da regra — `{limit}` aqui. Os placeholders de cada regra built-in estão em
**[Validadores](/manual/ADI/Validators/overview/)**. `Required` não preenche nenhum `{label}`, então
ele fica.

### Traduza mensagens

Um catálogo do domínio `validation` é um arquivo `validation.php` por locale:

```php
<?php
// catalogs/pt-BR/validation.php

return [
   '{field} is required.' => '{field} é obrigatório.',
   'Choose a plan.' => 'Escolha um plano.',
];
```

```php
use Bootgly\ABI\Data\Language;
use Bootgly\ADI\Validation;
use Bootgly\ADI\Validators\In;
use Bootgly\ADI\Validators\Required;

Language::load(__DIR__ . '/catalogs'); // in a project, catalogs/ is registered at boot: skip this line
Language::$locale = 'pt-BR';

$Validation = new Validation(
   source: ['plan' => 'gold'],
   rules: [
      'email' => [new Required],
      'plan' => [new In(['free', 'pro'], message: 'Choose a plan.')],
      'name' => [new Required('Tell us your name.')],
   ]
);

$Validation->errors;
// [
//    'email' => ['email é obrigatório.'],
//    'plan' => ['Escolha um plano.'],
//    'name' => ['Tell us your name.'],
// ]
```

Templates padrão e as suas próprias mensagens são chaves do mesmo jeito: o catálogo acima traduz o
template do `Required` e a mensagem `Choose a plan.`, e deixa `Tell us your name.`, que ele não
lista, como foi escrita. Todos os templates padrão, e como os catálogos são encontrados e
registrados, estão em **[i18n](/guide/i18n/overview/#mensagens-de-validação-localizadas)**.

- `{field}` é o nome do campo exatamente como a chave da regra o escreve, em todo locale — `email`
  acima. Para um nome que os seus usuários leem, escreva a mensagem daquela regra —
  `new Required('Tell us your name.')` — e traduza a mensagem.
- O locale é o que está ativo quando a `Validation` roda, porque `errors` guarda strings prontas:
  mudar `Language::$locale` depois não altera nenhuma delas. Em uma rota HTTP, esse é o locale
  negociado a partir do `Accept-Language` da requisição quando há catálogos registrados (veja
  **[Negociação automática por request](/guide/i18n/overview/#negociação-automática-por-request-web)**);
  em um script ou um comando, defina-o você mesmo (veja
  **[Console e scripts](/guide/i18n/overview/#console-e-scripts)**).
- As mensagens são texto puro, nunca escapado: escape-as onde você as imprimir em HTML.

## Escreva uma regra customizada

```php
use Bootgly\ADI\Validators;

class Prefix extends Validators
{
   // * Config
   public private(set) string $prefix;

   // * Metadata
   protected string $template = '{field} must start with {prefix}.';


   public function __construct (string $prefix, string $message = '')
   {
      parent::__construct($message);

      // * Config
      $this->prefix = $prefix;

      // * Metadata
      $this->substitutions = ['prefix' => $prefix];
   }

   public function validate (string $field, mixed $value, array $data): bool
   {
      return is_string($value) && str_starts_with($value, $this->prefix);
   }
}
```

```php
use Bootgly\ADI\Validation;
use Bootgly\ADI\Validators\Required;

$Validation = new Validation(
   source: ['invoice' => '2026-0042', 'order' => 'X-7'],
   rules: [
      'invoice' => [new Required, new Prefix('INV-')],
      'order' => [new Prefix('ORD-', message: 'Order codes start with {prefix}.')],
   ]
);

$Validation->errors;
// [
//    'invoice' => ['invoice must start with INV-.'],
//    'order' => ['Order codes start with ORD-.'],
// ]
```

Essa é a receita inteira:

- Estenda `Bootgly\ADI\Validators`, a base das regras de aplicação. Ela é um `Condition`, o tipo
  que a `Validation` exige de toda regra.
- Implemente `validate()`. Ele recebe o nome do campo, o valor — `null` quando a chave falta — e a
  origem inteira, e retorna `true` quando o valor passa. Ele pode receber qualquer tipo (veja
  [Toda regra roda](#toda-regra-roda)), então confira o tipo primeiro, como o `is_string()` faz
  aqui.
- Declare a mensagem padrão em `$template`. Ela funciona como a de uma built-in: uma `message` dada
  à regra a substitui, e ela é uma chave de catálogo — com
  `'{field} must start with {prefix}.' => '{field} deve começar com {prefix}.'` em
  `catalogs/pt-BR/validation.php`, o primeiro erro acima fica `invoice deve começar com INV-.` sob
  `pt-BR`. Uma regra sem `$template` próprio informa `{field} is invalid.`, o template do
  `Condition`.
- Coloque os placeholders próprios da regra em `$substitutions`, como strings indexadas pelo nome
  do placeholder, sem as chaves; o `{field}` é preenchido para você.
- Um construtor seu recebe `string $message = ''` e o repassa ao `parent::__construct()`. Pule essa
  chamada e a `message` da regra nunca é definida: a primeira falha dela lança `Error` com
  `Typed property Bootgly\ADI\Validation\Condition::$message must not be accessed before initialization`.
- Mantenha o `validate()` sem estado: um objeto de regra serve a todo campo, validação e requisição
  em que estiver listado (veja [Regras por campo](#regras-por-campo)).

### Regras implícitas e entre campos

```php
use Bootgly\ADI\Validation;
use Bootgly\ADI\Validators;

$Company = new class extends Validators {
   public protected(set) bool $implicit = true;
   protected string $template = '{field} is required for business accounts.';

   public function validate (string $field, mixed $value, array $data): bool
   {
      if (($data['type'] ?? null) !== 'business') {
         return true;
      }

      return is_string($value) && trim($value) !== '';
   }
};

$Validation = new Validation(
   source: ['type' => 'business'],
   rules: ['company' => [$Company]]
);

$Validation->errors; // ['company' => ['company is required for business accounts.']]
```

- Uma regra que não é implícita nunca vê um valor em branco, então sem `$implicit` esta deixaria
  passar um `company` ausente. Redeclare a propriedade como
  `public protected(set) bool $implicit = true;` no corpo da classe, como aqui, ou defina
  `$this->implicit = true;` no construtor, depois do `parent::__construct()`, como o `Required` faz.
- `$data` é a origem inteira, então uma regra pode ler outros campos — `Confirmed` lê
  `<field>_confirmation` do mesmo jeito. Com `'type' => 'personal'`, esta regra passa.

### Por que não sobrescrever format()

O `format()` é onde a `message`, os catálogos e os placeholders são aplicados, então uma regra que o
sobrescreve para retornar um texto próprio perde os três. Escrita com
`public function format (string $field): string { return "{$field} must be even."; }`, uma regra
informa `count must be even.` mesmo quando é criada com `message: 'Give an even number.'`, e
continua em inglês sob `pt-BR` com um catálogo que traduz `{field} must be even.`: nada mais chama
os catálogos. A mesma regra com `protected string $template = '{field} must be even.';` e sem
`format()` informa `Give an even number.` quando recebe essa mensagem, e `count deve ser par.` sob
`pt-BR`. Molde a mensagem com `$template` e `$substitutions`, e deixe o `format()` com o
`Condition`.

## Chame uma regra diretamente

```php
use Bootgly\ADI\Validators\Integer;

$Rule = new Integer;

$Rule->validate('port', '8080', []); // true
$Rule->validate('port', '80a', []);  // false
$Rule->format('port');               // 'port must be an integer.'
```

Uma regra funciona sem uma `Validation`: o `validate()` julga um valor, e o `format()` monta a
mensagem do mesmo jeito, catálogos inclusive. Pular valores em branco é coisa da `Validation`, então
uma chamada direta julga valores em branco também — `new Email` responde `false` para `''`. Esse par
serve ao `Validator` de um Textbox do CLI, que retorna `true` ou a mensagem a mostrar (veja
**[Validando respostas](/manual/CLI/UI/Components/Textbox/overview/#validando-respostas)**):

```php
use Bootgly\ADI\Validators\Integer;

$Port = new Integer;

$Textbox->Validator = static fn (string $answer): true|string =>
   $Port->validate('port', $answer, []) ? true : $Port->format('port');
```

Uma resposta `80a` é recusada com `port must be an integer.`, e a pergunta é feita de novo.

## Exporte um JSON Schema

O `Bootgly\ADI\Validation\Renderer` gera, a partir das mesmas regras, um documento JSON Schema
(draft 2020-12) — para o `inputSchema` de uma tool MCP, uma descrição OpenAPI ou um formulário no
cliente:

```php
use Bootgly\ADI\Validation\Renderer;
use Bootgly\ADI\Validators\Confirmed;
use Bootgly\ADI\Validators\Email;
use Bootgly\ADI\Validators\Integer;
use Bootgly\ADI\Validators\Minimum;
use Bootgly\ADI\Validators\Required;

$Renderer = new Renderer([
   'email' => [new Required, new Email],
   'age' => [new Integer, new Minimum(18)],
   'items.*.sku' => [new Required],
   'password' => [new Required, new Confirmed],
]);

json_encode($Renderer->document, JSON_UNESCAPED_SLASHES);
$Renderer->omissions; // ['password' => ['Bootgly\ADI\Validators\Confirmed']]
```

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "email": { "type": "string", "format": "email", "minLength": 1 },
    "age": { "type": "integer", "minimum": 18 },
    "items": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "sku": { "minLength": 1, "minItems": 1, "minProperties": 1, "not": { "type": "null" } }
        },
        "required": ["sku"]
      }
    },
    "password": { "minLength": 1, "minItems": 1, "minProperties": 1, "not": { "type": "null" } }
  },
  "required": ["email", "password"]
}
```

O Renderer descreve; ele não valida. A `Validation` continua sendo a autoridade, então o servidor
valida de novo o que um cliente montou a partir do schema.

- **Caminhos** — Um segmento nomeado vira uma propriedade de objeto, e um `*` os `items` de um
  array. Um `*` ao lado de chaves nomeadas (`meta.*` e `meta.count`), ou ao lado de uma regra que faz
  do nó um objeto (`Keys`), vira um objeto cujo `additionalProperties` é o schema do curinga. Uma chave de regra com um segmento de índice
  (`items.0.id`, `codes.200`) fica de fora inteira e é listada em `omissions`: a `Validation` lê o
  índice `0` de uma lista e a chave `"0"` de um objeto do mesmo jeito, e nenhum formato único de
  schema aceita os dois sem rejeitar um deles.
- **Regras** — Cada regra que implementa `Bootgly\ADI\Validation\Descriptor` contribui com keywords;
  o mapeamento das regras built-in está em
  **[Validadores → JSON Schema](/manual/ADI/Validators/overview/#json-schema)**. Keywords de um tipo
  diferente do `type` do valor são descartadas, e uma keyword definida duas vezes com valores
  diferentes mantém os dois por meio de `allOf`.
- **Required** — O `Required` lista a chave no `required` do pai, e em todo pai nomeado até o
  primeiro curinga, já que a `Validation` reprova `address.city` quando `address` falta. Ele também
  acrescenta as keywords de não-vazio do tipo do valor (`minLength: 1` para uma string), ou todas elas
  e `not: {type: null}` quando o tipo é desconhecido.
- **Omissões** — Uma regra que não é `Descriptor`, ou cujo `describe()` retorna `null`, fica fora do
  documento e é listada em `omissions` sob a chave da regra: o `Confirmed` (uma verificação entre
  campos), as regras de upload, um `Regex` que o JSON Schema não consegue expressar e as suas próprias
  regras. Confira `omissions` onde um schema precisa estar completo — no boot, antes de publicar uma
  tool.
- **Onde os dois diferem** — O schema descreve o formato JSON canônico; a `Validation` é mais
  tolerante em alguns pontos: aceita strings de inteiro no `Integer`, `0`/`1`/`'true'` no `Boolean` e
  compara strings numéricas pelo valor em `Minimum`/`Maximum`; conta o tamanho das strings em bytes,
  onde o JSON Schema conta caracteres; pula um valor opcional em branco (`null` inclusive) que um
  schema tipado recusa; um `In` não estrito casa mais do que o `enum` dele. Regras que convertem
  também podem se combinar num schema que nada satisfaz, sem aviso: `[new Integer, new In(['1', '2'])]`
  gera `type: integer` com um `enum` de strings (escreva `new In([1, 2])`), e
  `[new Boolean, new Integer]` gera os dois tipos. Os formatos declarados são mais amplos do que o
  verificado: veja **[Validadores → JSON Schema](/manual/ADI/Validators/overview/#json-schema)**.
- Schemas vazios são objetos `stdClass`, então o `json_encode()` escreve `{}`.

Para exportar uma regra sua, implemente `Descriptor` junto com `Condition`:

```php
use Bootgly\ADI\Validation\Descriptor;
use Bootgly\ADI\Validators;

class Slug extends Validators implements Descriptor
{
   protected string $template = '{field} must be a slug.';

   public function validate (string $field, mixed $value, array $data): bool
   {
      return is_string($value) && preg_match('/\A[a-z0-9-]+\z/', $value) === 1;
   }

   public function describe (): null|array
   {
      return ['type' => 'string', 'pattern' => '^[a-z0-9-]+$'];
   }
}
```

## Erros

O `new Validation()` lança `InvalidArgumentException` quando chega a um campo cujas regras não são
objetos de regra. Regras são só objetos: não há sintaxe de string como `'required|email'`.

```php
use InvalidArgumentException;

use Bootgly\ADI\Validation;

try {
   new Validation(['email' => 'ada@example.com'], ['email' => 'required|email']);
}
catch (InvalidArgumentException $Exception) {
   $Exception->getMessage(); // Validation rules for email must be Condition objects.
}
```

| Mensagem | Causa |
|---|---|
| `Validation rules for email must be Condition objects.` | O campo aponta para algo que não é nem uma regra nem uma lista: uma string, `null`, uma closure, um objeto que não é um `Condition` |
| `Validation rule for email must be a Condition object.` | Um item da lista do campo não é uma regra: uma string, um nome de classe como `Email::class`, `null`, uma lista aninhada |

- A conferência acontece quando o motor chega àquele campo, em branco ou não, então os campos
  listados antes dele já foram validados; nenhuma `Validation` é retornada.
- O middleware `Validator` guarda as regras como foram dadas e cria a `Validation` dele a cada
  requisição, então uma lista malformada ali é aceita quando a rota é declarada e lança em toda
  requisição que chega a ela.
- Os construtores das regras lançam os próprios erros — `Regex` recusa um padrão inválido com
  `Invalid validation regex pattern.` (veja **[Validadores](/manual/ADI/Validators/overview/)**).
- Uma origem que não é array lança `TypeError`, e o que o `validate()` de uma regra lançar escapa
  do construtor (veja [Toda regra roda](#toda-regra-roda)).

## Referência

### Validation

`Bootgly\ADI\Validation` — o motor.

```php
__construct (array $source, array $rules, int $limit = 1000)
```

Valida `$source` (`array<string,mixed>`) contra `$rules`
(`array<string, Condition|array<int,Condition>>`) na hora e guarda o resultado em `errors`. Chave de
regra a chave de regra, na ordem de `$rules`, resolve o caminho da chave em alvos concretos (veja
[Caminhos aninhados e curingas](#caminhos-aninhados-e-curingas)) — um só para uma chave plana, com
valor `null` quando a chave falta — e executa as regras da chave em cada alvo, em ordem, só as
implícitas quando o valor está em branco (`null`, `''` ou `[]`), acrescentando o `format()` de cada
regra que retorna `false` sob o caminho do alvo. `$limit` limita as entradas que os curingas de uma
chave de regra visitam (veja [Limite dos curingas](#limite-dos-curingas)). Lança
`InvalidArgumentException` para regras que não são objetos `Condition` (veja [Erros](#erros)) e para
um `$limit` menor que `1` (`Validation limit must be at least 1.`); uma exceção lançada por uma regra
escapa.

```php
public private(set) int $limit
```

O máximo de entradas que os curingas de uma chave de regra podem visitar, como passado ao construtor.
Também define o orçamento de caminhos: `limit` × `Validation::BYTES` bytes de caminhos concretos por
chave de regra.

```php
public const int BYTES = 256
```

Os bytes de caminho concreto que uma chave de regra pode montar por entrada de `limit` (veja
[Limite dos curingas](#limite-dos-curingas)).

```php
public private(set) array $errors = []
```

As mensagens das regras que falharam, `array<string, array<int,string>>`, na chave do caminho
concreto que falhou: um caminho só aparece quando ao menos uma das regras dele falhou, com uma
mensagem por falha, na ordem das regras, mais as estruturais `{field} must be an array.` e
`{field} has too many items.` (cada uma uma vez por caminho). `[]` quando todas as regras passaram.

```php
public bool $valid { get; }
```

`true` quando `errors` está vazio. Calculada a cada leitura; não pode ser atribuída.

### Condition

`Bootgly\ADI\Validation\Condition` — a base abstrata de toda regra. A `Validation` aceita qualquer
`Condition`, e as regras built-in o estendem diretamente.

```php
__construct (string $message = '')
```

Guarda `$message`, o texto que substitui o template; `''` mantém o template. Uma subclasse com um
construtor próprio precisa chamá-lo (veja
[Escreva uma regra customizada](#escreva-uma-regra-customizada)).

```php
validate (string $field, mixed $value, array $data): bool
```

Abstrato: cada regra o implementa. Retorna `true` quando `$value` passa. `$field` é o caminho
concreto conferido — a própria chave da regra, para uma chave plana — `$value` o valor da origem para ela — `null` quando a chave falta — e `$data` a origem
inteira (`array<string,mixed>`). A `Validation` o chama para um valor em branco só quando a regra é
implícita; chamado diretamente, ele julga qualquer valor.

```php
format (string $field): string
```

Retorna a mensagem de uma falha em `$field`: `message`, ou `$template` quando `message` é `''`,
traduzida com `Language::translate()` no domínio `validation` para o locale ativo, com `{field}`
substituído por `$field` e cada entrada de `$substitutions` pelo valor dela (veja
[Mensagens](#mensagens)). Um override substitui tudo isso (veja
[Por que não sobrescrever format()](#por-que-não-sobrescrever-format)).

```php
public protected(set) bool $implicit = false
```

`true` faz a `Validation` executar a regra sobre um valor em branco — uma chave ausente, `null`,
`''` ou `[]` — em vez de pulá-la. `Required` é a única regra built-in que o define.

```php
public protected(set) string $message
```

O texto dado ao construtor, ou `''`. Quando não está vazio, o `format()` o usa no lugar de
`$template`.

```php
protected string $template = '{field} is invalid.'
```

A mensagem padrão, que também é a chave dela no domínio `validation` dos catálogos. Toda regra
built-in declara a sua; uma regra que não declara nenhuma informa `{field} is invalid.`

```php
protected array $substitutions = []
```

Os placeholders próprios da regra, `array<string,string>`: o nome do placeholder, sem as chaves,
mapeado para o valor dele, que o `format()` preenche ao lado de `{field}`. Os `{limit}` e
`{format}` das regras built-in vêm daqui.

### Validators

```php
abstract class Validators extends Condition
```

`Bootgly\ADI\Validators` — a base das regras de aplicação (veja
[Escreva uma regra customizada](#escreva-uma-regra-customizada)). Ela não declara nada próprio: os
membros dela são os do `Condition`. As regras built-in estendem `Condition` diretamente, então
`new Required instanceof Validators` é `false`: para saber se um valor é uma regra, teste
`instanceof Condition`, como a `Validation` faz.

### Path

`Bootgly\ADI\Validation\Path` — uma chave de regra lida como caminho. A `Validation`, o `Renderer`
e o `Confirmed` a usam; uma regra de aplicação pode usá-la para ler outro caminho de `$data`.

```php
__construct (string $key)
```

Interpreta `$key`: `.` separa segmentos, um segmento que é exatamente `*` é um curinga, e `\`
escapa um `.`, `*` ou `\` seguinte. A interpretação nunca falha — um segmento vazio é a chave vazia,
e qualquer outra barra invertida é mantida.

```php
public private(set) string $key
```

A chave da regra como foi escrita.

```php
public private(set) array $segments
```

Os segmentos sem escape, em ordem, `array<int, null|string>`; `null` marca um curinga.
`new Path('items.*.id')->segments` é `['items', null, 'id']`.

```php
public private(set) bool $wildcard
```

`true` quando algum segmento é curinga.

```php
public private(set) string $prefix
```

O caminho escapado antes do primeiro curinga — o container que ele expande (`items` para
`items.*.id`, `''` para `*.id`); a própria chave quando não há curinga.

```php
static escape (int|string $segment): string
```

Escapa uma chave da origem como segmento: `\` → `\\`, `.` → `\.`, e a chave `*` → `\*`. Juntar
chaves escapadas com `.` dá um caminho que é interpretado de volta nessas chaves. Uma chave que não é
UTF-8 válido (o nome de um campo de formulário ou de query) tem cada byte a partir de `0x80` escrito
como `\xHH`, então um caminho de erro sempre pode ser codificado em JSON; esse segmento é só para
exibição e não volta para a chave bruta (então o `Confirmed` sob uma chave assim falha).

```php
resolve (array $source): array
```

Procura o caminho em `$source` e retorna `[bool $exists, mixed $value]` — `[false, null]` quando uma
chave falta, um container no caminho não é array ou um segmento é curinga.

### Renderer

`Bootgly\ADI\Validation\Renderer` — gera um documento JSON Schema (draft 2020-12) a partir de um
conjunto de regras (veja [Exporte um JSON Schema](#exporte-um-json-schema)).

```php
__construct (array $rules)
```

Gera `document` a partir de `$rules` — o mesmo `array<string, Condition|array<int,Condition>>` que
uma `Validation` recebe — e lista o que deixou de fora em `omissions`. Lança
`InvalidArgumentException` para regras que não são objetos `Condition`, com as mensagens da
`Validation`.

```php
public private(set) array $rules
```

As regras passadas ao construtor.

```php
public private(set) array $document
```

O schema, `array<string,mixed>`: `$schema` (a URI do dialeto 2020-12), `type: object`, e as
`properties` e o `required` das chaves de regra. Schemas vazios são `stdClass`, então o
`json_encode()` escreve `{}`.

```php
public private(set) array $omissions = []
```

As regras deixadas de fora, `array<string, array<int,string>>`: chave da regra → nomes de classe
(uma classe anônima aparece como `<pai>@anonymous`).

```php
const string DIALECT = 'https://json-schema.org/draft/2020-12/schema'
```

A URI `$schema` de todo documento.

### Descriptor

`Bootgly\ADI\Validation\Descriptor` — o contrato opcional de uma regra que o JSON Schema consegue
expressar. A `Validation` nunca o chama.

```php
describe (): null|array
```

Retorna as keywords que o valor precisa satisfazer (`array<string,mixed>`), ou `null` quando a regra
não pode ser expressa. A entrada `'required' => true` não é uma keyword: ela marca o valor como
obrigatório e não vazio, e o Renderer o lista no `required` do pai. Qualquer outro valor de `required`
(uma lista de nomes de propriedades) é a keyword do JSON Schema e é mantido. Uma lista (chaves
inteiras) conta como `null`.
