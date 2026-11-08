# Validation

`Bootgly\ADI\Validation` valida qualquer array associativo com objetos de regra componíveis — as mesmas regras verificam o corpo de uma requisição HTTP, o input de um comando CLI, o payload de um job de fila ou uma linha de seeder. Ela vive na camada ADI, então toda camada superior (API, CLI, WPI) pode usá-la.

## Validando dados

Construa uma `Validation` com um array `source` e um mapa de `rules` por campo. A validação roda imediatamente — leia `valid` e `errors` logo em seguida:

```php
use Bootgly\ADI\Validation;
use Bootgly\ADI\Validators\Email;
use Bootgly\ADI\Validators\Integer;
use Bootgly\ADI\Validators\Maximum;
use Bootgly\ADI\Validators\Minimum;
use Bootgly\ADI\Validators\Required;

$Validation = new Validation(
   source: [
      'email' => 'user@example.com',
      'age'   => '18',
   ],
   rules: [
      'email' => [new Required, new Email],
      'age'   => [new Required, new Integer, new Minimum(18), new Maximum(120)],
   ]
);

$Validation->valid;  // true | false
$Validation->errors; // ['email' => ['email must be a valid email address.'], ...]
```

Os erros acumulam como `array<field, array<string>>` — uma mensagem por regra que falhou, então um único campo pode carregar várias mensagens.

## Em um comando ou script CLI

Nada de HTTP é necessário — valide qualquer array que você tiver:

```php
use Bootgly\ADI\Validation;
use Bootgly\ADI\Validators\In;
use Bootgly\ADI\Validators\Required;
use Bootgly\ADI\Validators\URL;

$Validation = new Validation(
   source: [
      'name'   => $arguments[0] ?? null,
      'mode'   => $options['mode'] ?? null,
      'origin' => $options['origin'] ?? null,
   ],
   rules: [
      'name'   => [new Required],
      'mode'   => [new In(['daemon', 'foreground'])],
      'origin' => [new URL],
   ]
);

if ($Validation->valid === false) {
   foreach ($Validation->errors as $field => $messages) {
      echo "- {$messages[0]}\n";
   }
   exit(1);
}
```

## Em um seeder ou job

Proteja os dados antes de chegarem ao banco ou ao worker:

```php
use RuntimeException;

use Bootgly\ADI\Validation;
use Bootgly\ADI\Validators\Date;
use Bootgly\ADI\Validators\Email;
use Bootgly\ADI\Validators\Required;

foreach ($rows as $index => $row) {
   $Validation = new Validation(
      source: $row,
      rules: [
         'email'      => [new Required, new Email],
         'created_at' => [new Date('Y-m-d H:i:s')],
      ]
   );

   if ($Validation->valid === false) {
      throw new RuntimeException("Seed row #{$index} is invalid.");
   }
}
```

## Payloads aninhados

Um body JSON raramente é plano. Aponte uma regra para uma chave aninhada com pontos, e para cada
entrada de uma lista com `*`:

```php
use Bootgly\ADI\Validation;
use Bootgly\ADI\Validators\Email;
use Bootgly\ADI\Validators\Integer;
use Bootgly\ADI\Validators\Maximum;
use Bootgly\ADI\Validators\Minimum;
use Bootgly\ADI\Validators\Required;

$Order = new Validation(
   source: [
      'customer' => ['email' => 'ada@example.com'],
      'lines' => [
         ['sku' => 'A-1', 'quantity' => '2'],
         ['sku' => '', 'quantity' => '0'],
      ],
   ],
   rules: [
      'customer.email' => [new Required, new Email],
      'lines' => [new Required, new Maximum(100)],
      'lines.*.sku' => [new Required],
      'lines.*.quantity' => [new Required, new Integer, new Minimum(1)],
   ]
);

$Order->errors;
// [
//    'lines.1.sku' => ['lines.1.sku is required.'],
//    'lines.1.quantity' => ['lines.1.quantity must be at least 1.'],
// ]
```

Os erros nomeiam a entrada exata, então um cliente consegue marcar a linha certa. Dê à lista uma
regra própria (`'lines' => [new Required, …]`): `lines.*.sku` sozinho aceita um `lines` ausente. Um
curinga visita no máximo 1000 entradas por chave de regra por padrão — passe `limit:` para payloads
maiores. Uma chave que contém ponto se escreve `'app\.name'`. Caminhos, containers e o limite estão
detalhados em
**[Caminhos aninhados e curingas](/manual/ADI/Validation/overview/#caminhos-aninhados-e-curingas)**.

## Descrevendo a entrada como JSON Schema

As regras que validam um payload também podem descrevê-lo. O `Validation\Renderer` as transforma em
um documento JSON Schema 2020-12 — o `inputSchema` de uma tool MCP, por exemplo:

```php
use Bootgly\ADI\Validation\Renderer;

$rules = [
   'customer.email' => [new Required, new Email],
   'lines.*.sku' => [new Required],
   'lines.*.quantity' => [new Required, new Integer, new Minimum(1)],
];

$Renderer = new Renderer($rules);

$tool = [
   'name' => 'create_order',
   'description' => 'Create an order',
   'inputSchema' => $Renderer->document,
];

// Regras que o JSON Schema não expressa (Confirmed, uploads, as suas) aparecem aqui:
$Renderer->omissions; // []
```

Valide os argumentos com as mesmas `$rules` quando a chamada chegar: o schema orienta o cliente, a
`Validation` decide. O que cada regra vira, e onde os dois diferem, está em
**[Exporte um JSON Schema](/manual/ADI/Validation/overview/#exporte-um-json-schema)**.

## Campos opcionais e regras implícitas

Um campo ausente, `null`, `''` ou `[]` é tratado como *em branco*. Campos em branco pulam todas as regras **exceto as implícitas** — `Required` é implícita, então ainda roda e falha. Isso torna campos opcionais naturais:

```php
rules: [
   'website' => [new URL], // only validated when a non-blank value arrives
   'email'   => [new Required, new Email], // Required rejects the blank case
]
```

Os detalhes — o que é e o que não é em branco, e como uma regra sua se torna implícita — estão em **[Valores em branco e regras implícitas](/manual/ADI/Validation/overview/#valores-em-branco-e-regras-implícitas)**.

## Mensagens customizadas

Toda regra aceita um argumento opcional `message` no construtor que substitui a mensagem padrão:

```php
new Required('Name cannot be empty.');
new Regex('/\A.{8,}\z/su', 'Password must be at least 8 characters.');
new URL(message: 'Give me a real URL.');
```

Uma mensagem que você passa é montada como a padrão: ela mantém os placeholders da regra e passa pelos catálogos de tradução — veja **[Mensagens](/manual/ADI/Validation/overview/#mensagens)**.

Verifique o tamanho de um texto (uma senha, um nome) com `Length`, que conta caracteres: `Minimum` e `Maximum` comparam strings numéricas pelo valor e medem as outras strings em bytes — veja [Números, tamanhos e contagens](/manual/ADI/Validators/overview/#números-tamanhos-e-contagens).

## Regras customizadas

Estenda `Bootgly\ADI\Validators` (a base de extensão para regras da aplicação), coloque a mensagem padrão em `$template` e implemente `validate()`:

```php
use Bootgly\ADI\Validators;

$InviteCode = new class extends Validators {
   protected string $template = '{field} must match the demo invite code.';

   /**
    * @param array<string,mixed> $data  Full source array — useful for cross-field rules.
    */
   public function validate (string $field, mixed $value, array $data): bool
   {
      return is_string($value) && $value === 'bootgly';
   }
};
```

A regra passa a se comportar como as built-in: `{field}` vira o nome do campo, e uma `message` passada ao seu construtor substitui o template. Como fazê-la rodar em campos em branco, ler os outros campos da origem ou adicionar placeholders — e por que um override de `format()` perde o argumento `message` e os catálogos de tradução — está em **[Escreva uma regra customizada](/manual/ADI/Validation/overview/#escreva-uma-regra-customizada)**.

## Validando requisições HTTP

Em rotas WPI, conecte as mesmas regras no middleware `Validator` — ele lê uma source do Request e falha fechado com um JSON `422` antes do handler rodar. Veja [Validação de Requisição](/manual/WPI/HTTP/HTTP_Server_CLI/Request/#validação-de-requisição) e [Middlewares → Validator](/manual/WPI/HTTP/HTTP_Server_CLI/Middlewares/#validator).

## Validando uploads

`MIME` decide pelo que um arquivo enviado **é**, não pelo que o cliente diz que ele é. Ele
inspeciona os bytes que o servidor recebeu (a extensão `fileinfo` do PHP) e nunca lê o `type`
do registro — o `Content-Type` da part, que qualquer cliente pode definir como quiser:

```php
use Bootgly\ADI\Validation;
use Bootgly\ADI\Validators\Extension;
use Bootgly\ADI\Validators\MIME;
use Bootgly\ADI\Validators\Size;

$Request->download();

$Validation = new Validation($Request->files, [
   'avatar' => [
      new Size(2 * 1024 * 1024),
      new MIME(['image/jpeg', 'image/png']),
      new Extension(['jpg', 'jpeg', 'png']),
   ],
]);
```

Um script PHP enviado como `avatar.png` com `Content-Type: image/png` falha em `MIME`; um PNG
de verdade enviado como `text/plain` passa. Guarde um upload aceito com
[`store()`](/manual/WPI/HTTP/HTTP_Server_CLI/Request/#persistir-um-upload-store), em um disco que o
servidor web não executa — nunca sob um caminho executável ou servido pela web.

O que cada regra de upload lê e como se comportam um input de arquivo vazio e uma lista `photos[]`
estão em **[Uploads](/manual/ADI/Validators/overview/#uploads)**, e por que identificar o formato
não é varrer malware está em **[MIME](/manual/ADI/Validators/overview/#mime)**.

## Regras built-in

`Bootgly\ADI\Validators` traz 18 regras: `Boolean`, `Confirmed`, `Date`, `Email`, `Extension`, `In`, `Integer`, `Keys`, `Length`, `Maximum`, `MIME`, `Minimum`, `Regex`, `Required`, `Size`, `Text`, `URL` e `UUID`. Os argumentos delas, os valores que cada uma aceita e rejeita, as mensagens padrão e as ressalvas estão em **[Validadores](/manual/ADI/Validators/overview/)**; o motor — `Validation`, a classe base `Condition` e como uma mensagem é montada — tem a Referência dele em **[Validação](/manual/ADI/Validation/overview/#referência)**. Toda mensagem é uma key dos catálogos de tradução do domínio `validation`: **[Mensagens de validação localizadas](/guide/i18n/overview/#mensagens-de-validação-localizadas)** mostra um catálogo `pt-BR` completo.
