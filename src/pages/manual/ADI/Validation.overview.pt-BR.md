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

## Campos opcionais e regras implícitas

Um campo ausente, `null`, `''` ou `[]` é tratado como *em branco*. Campos em branco pulam todas as regras **exceto as implícitas** — `Required` é implícita, então ainda roda e falha. Isso torna campos opcionais naturais:

```php
rules: [
   'website' => [new URL], // só validado quando chega um valor não-branco
   'email'   => [new Required, new Email], // Required rejeita o caso em branco
]
```

## Mensagens customizadas

Toda regra aceita um argumento opcional `message` no construtor que substitui a mensagem padrão:

```php
new Required('Name cannot be empty.');
new Minimum(8, 'Password must be at least 8 characters.');
new URL(message: 'Give me a real URL.');
```

## Regras customizadas

Estenda `Bootgly\ADI\Validators` (a base de extensão para regras da aplicação) e implemente `validate()` e `format()`:

```php
use Bootgly\ADI\Validators;

$InviteCode = new class extends Validators {
   /**
    * @param array<string,mixed> $data  Array source completo — útil para regras cross-field.
    */
   public function validate (string $field, mixed $value, array $data): bool
   {
      return is_string($value) && $value === 'bootgly';
   }

   public function format (string $field): string
   {
      return "{$field} must match the demo invite code.";
   }
};
```

Defina `$implicit = true` na sua subclasse quando a regra precisar rodar mesmo para campos ausentes/em branco (como `Required` faz). `validate()` recebe o `$data` source completo, então regras cross-field (como `Confirmed`) não precisam de fiação extra.

## Validando requisições HTTP

Em rotas WPI, conecte as mesmas regras no middleware `Validator` — ele lê uma source do Request e falha fechado com um JSON `422` antes do handler rodar. Veja [Validação de Requisição](/manual/WPI/HTTP/HTTP_Server_CLI/Request/#request-validation) e [Middlewares → Validator](/manual/WPI/HTTP/HTTP_Server_CLI/Middlewares/#validator).

## Referência

### Validation

```php
public function __construct (array $source, array $rules)
```

Roda as regras contra a source imediatamente. `$rules` mapeia cada campo para uma `Condition` ou uma lista de objetos `Condition`; qualquer outra coisa lança `InvalidArgumentException`.

```php
public private(set) array $errors;
```

Mensagens de falha por campo: `array<string, array<int,string>>`. Vazio quando tudo passou.

```php
public bool $valid { get; }
```

`true` quando `$errors` está vazio.

### Condition

A base abstrata de toda regra (`Bootgly\ADI\Validation\Condition`). `Bootgly\ADI\Validators` a estende como base voltada à aplicação para regras customizadas.

```php
abstract public function validate (string $field, mixed $value, array $data): bool
```

Retorna `true` quando o valor é válido. Recebe o `$data` source completo para lógica cross-field.

```php
public function format (string $field): string
```

Retorna a mensagem de erro — a `message` customizada passada ao construtor, ou o padrão da regra.

```php
public protected(set) bool $implicit = false;
```

Regras implícitas rodam mesmo quando o campo está em branco/ausente (ex.: `Required`).

### Regras built-in

Todas em `Bootgly\ADI\Validators`. Cada uma aceita um `string $message` opcional para substituir o padrão.

---

#### Required

```php
new Required;
new Required('Name cannot be empty.');
```

Rejeita `null`, strings vazias (após `trim`) e arrays vazios. Implícita — roda mesmo quando o campo está ausente. Mensagem padrão: `"{field} is required."`

---

#### Boolean

```php
new Boolean;
```

Aceita `bool`, os inteiros `0`/`1` e as strings `'0'`, `'1'`, `'true'`, `'false'` — nada mais (`'yes'`/`'on'` são rejeitados). Mensagem padrão: `"{field} must be a boolean."`

---

#### Integer

```php
new Integer;
```

Aceita `int` nativo ou strings casando com `/\A[-+]?\d+\z/`. Mensagem padrão: `"{field} must be an integer."`

---

#### Minimum

```php
new Minimum(18);
new Minimum(8, 'Password must be at least 8 characters.');
```

Regra de limite inferior. Compara valores numéricos por valor, strings não-numéricas por `strlen` e arrays por `count`. Mensagem padrão: `"{field} must be at least {limit}."`

---

#### Maximum

```php
new Maximum(120);
new Maximum(500, 'Bio cannot exceed 500 characters.');
```

Contraparte de limite superior de `Minimum`, com o mesmo dispatch. Mensagem padrão: `"{field} must be at most {limit}."`

---

#### In

```php
new In(['active', 'archived']);
new In([1, 2, 3], strict: false);
```

Aceita valores dentro da allowlist. Comparação estrita por padrão (`'3'` não casa com `3`); passe `strict: false` para comparação frouxa. Mensagem padrão: `"{field} must be one of the allowed values."`

---

#### Email

```php
new Email;
```

Valida com o `filter_var($value, FILTER_VALIDATE_EMAIL)` do PHP. Mensagem padrão: `"{field} must be a valid email address."`

---

#### URL

```php
new URL;
```

Valida com o `filter_var($value, FILTER_VALIDATE_URL)` do PHP. Mensagem padrão: `"{field} must be a valid URL."`

---

#### Date

```php
new Date;                // qualquer data parseável por strtotime()
new Date('Y-m-d');       // formato estrito
```

Sem formato, aceita qualquer string que o `strtotime()` consiga parsear. Com formato, parseia via `DateTimeImmutable::createFromFormat()` e faz o round-trip do resultado — overflows de calendário como `2026-02-30` são rejeitados. Mensagem padrão: `"{field} must be a valid date."` / `"{field} must be a valid date in the format {format}."`

---

#### Confirmed

```php
new Confirmed;                    // casa com {field}_confirmation
new Confirmed(field: 'PIN_check'); // casa com um campo de confirmação customizado
```

Igualdade cross-field: o valor deve ser estritamente igual ao campo de confirmação na mesma source (padrão `{field}_confirmation`). Mensagem padrão: `"{field} confirmation does not match."`

---

#### Regex

```php
new Regex('/\A[a-z0-9_-]+\z/');
new Regex('/\A[a-z0-9_]{3,}\z/', 'Username must be alphanumeric, 3+ chars.');
```

Casa o valor contra um padrão PCRE. Lança `InvalidArgumentException` na construção se o padrão for inválido. Mensagem padrão: `"{field} has an invalid format."`

---

#### Size

```php
new Size(2 * 1024 * 1024); // 2 MB
```

Valida estruturas de upload (`['name', 'type', 'size', 'error', 'tmp_name']`). Passa quando `error === 0` e `size <= $limit` (bytes). Mensagem padrão: `"{field} must be at most {limit} bytes."`

---

#### MIME

```php
new MIME('application/pdf');
new MIME(['image/jpeg', 'image/png']);
```

Valida estruturas de upload contra uma allowlist de tipos MIME (case-sensitive). Mensagem padrão: `"{field} must have an allowed MIME type."`

---

#### Extension

```php
new Extension('zip');
new Extension(['jpg', 'jpeg', 'png']);
```

Valida estruturas de upload contra uma allowlist de extensões de arquivo (case-insensitive; um `.` inicial é aceito e removido). Mensagem padrão: `"{field} must have an allowed extension."`
