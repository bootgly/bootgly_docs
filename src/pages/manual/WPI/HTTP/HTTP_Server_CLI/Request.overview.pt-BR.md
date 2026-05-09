# HTTP Server CLI — Request

O objeto `Request` está automaticamente disponível em todo handler de rota do HTTP Server CLI. Ele fornece uma estrutura concisa para acessar parâmetros comuns de requisição, tais como cabeçalhos, URI, strings de consulta e conteúdo do corpo.

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request;
```

## Conexão

`address`: O endereço IP de onde a requisição se originou.

```php
$Request->address; // '127.0.0.1'
```

`port`: O número da porta por onde a requisição foi transmitida.

```php
$Request->port; // '52252'
```

`scheme`: O esquema de protocolo, seja `http` ou `https`.

```php
$Request->scheme; // 'https'
```

## HTTP

`method`: O método HTTP usado para a requisição.

```php
$Request->method; // 'GET'
```

`URI`: O Identificador Uniforme de Recursos da requisição. No contexto de um Servidor HTTP, uma URI sempre terá um esquema `http` ou `https`, o domínio e a porta sempre serão os mesmos para o mesmo Host Virtual (VHost). Portanto, uma URI (identificador) no Bootgly é sempre tudo aquilo que vem após o `domínio:porta` sem o âncora/fragmento (#):

```php
$Request->URI; // '/test/foo?query=abc&query2=xyz'
```

`protocol`: A versão do protocolo usada na requisição, normalmente HTTP/1.1.

```php
$Request->protocol; // 'HTTP/1.1'
```

### Resource

`URL`: A parte do caminho da URL da URI. Ainda baseado no contexto acima de uma URI em Servidores HTTP no Bootgly e como uma URL é um subconjunto de uma URI, no Bootgly uma URL (localizador) é o caminho onde o recurso está localizado, sem a string de consulta:

```php
$Request->URL; // '/test/foo'
```

`URN`: A última parte do caminho da URL do URN. Baseado no contexto acima de uma URL, um URN (nome) é a última parte (nó) de um caminho de URL e identifica o nome do recurso. Obviamente, essa semântica só permanece se seu uso na prática seguir esse mesmo padrão.

```php
$Request->URN; // 'foo'
```

### Query

`query`: A parte da string de consulta da URI.

```php
$Request->query; // 'query=abc&query2=xyz'
```

`queries`: Um array associativo da string de consulta analisada.

```php
$Request->queries; // Array ( [query] => abc [query2] => xyz )
```

## Cabeçalho HTTP

`Header`: A classe Header da Requisição.

```php
$Request->Header->get('X-Requested-With'); // Obter valor do cabeçalho X-Requested-With
```

`headers`: Cabeçalhos HTTP em Array.

```php
$Request->headers;
/*
Array (
  User-Agent] => BootglyHTTPClient/1.0
  [Accept] => */*,
  [Set-Cookie] => Array (
    [0] => user_id=123; Expires=Wed, 21 Oct 2024 07:28:00 GMT
    [1] => session_token=abc; HttpOnly
  )
)
*/
```

### Informações do Host

`host`: O nome de domínio totalmente qualificado do servidor.

```php
$Request->host; // 'v1.docs.bootgly.com'
```

`domain`: A parte do domínio do host.

```php
$Request->domain; // 'bootgly.com'
```

`subdomain`: A parte do subdomínio do host.

```php
$Request->subdomain; // 'v1.docs'
```

`subdomains`: Um array contendo componentes individuais de subdomínios.

```php
$Request->subdomains; // Array ( [0] => 'docs' [1] => 'v1' )
```

### Cookies

`Cookies`: A classe que representa os Cookies de cabeçalho HTTP da solicitação.

```php
$Request->Header->Cookies;
```

`cookies`: Um array de cookies enviados com a requisição.

```php
$Request->cookies; // Array ( [nome_do_cookie] => valor_do_cookie )
```

## Corpo HTTP

`Body`: A classe que representa o corpo da Requisição HTTP.

```php
$Request->Body;
```

### Entrada

`input`: Os dados brutos do conteúdo de entrada da requisição.

```php
$Request->input; // Dados brutos do conteúdo de entrada como string
```

`inputs`: Um array associativo de pares chave-valor de entrada.

```php
$Request->inputs; // Array ( [chave_entrada] => valor_entrada )
```

### POST

`post`: Um array associativo de dados POST

```php
$Request->post; // Array ( [chave_post] => valor_post )
```

### Arquivos

`files`: Um array associativo de arquivos enviados através da requisição.

```php
$Request->files; // Array ( [nome_do_arquivo] => atributos_do_arquivo )
```

## Metadados

`raw`: Os dados brutos da requisição HTTP.

```php
$Request->raw; // Dados da requisição HTTP como string
```

`on`: A data na qual a requisição foi criada.

```php
$Request->on; // '2020-03-10'
```

`at`: A hora na qual a requisição foi criada.

```php
$Request->at; // '17:16:18'
```

`time`: Um timestamp Unix representando o tempo da requisição.

```php
$Request->time; // 1586496524
```

`secure`: Indica se a requisição foi feita por HTTPS.

```php
$Request->secure; // true
```

## HTTP Basic Authentication

```php
public function authenticate () : object|null;
```

Este método é responsável por extrair e decodificar as credenciais de autorização de uma Requisição HTTP por parte de um Client HTTP. Ele verifica se as credenciais são fornecidas no formato Basic Authentication e, se sim, extrai o nome de usuário e a senha.

### Exemplo de uso

```php
$Credentials = $Request->authenticate();

if ($Credentials !== null) {
    $username = $Credentials->username;
    $password = $Credentials->password;

    // Use o nome de usuário e senha para autenticar o cliente
    // ...
}
```

### Metadados gerados

`username`: O nome de usuário fornecido na autenticação básica.

```php
$Request->username; // 'bootgly'
```

`password`: A senha fornecida na autenticação básica.

```php
$Request->password; // 'example123'
```

## HTTP Content Negotiation

```php
public function negotiate (int $with = self::ACCEPTS_TYPES) : array;
```

O método negotiate é responsável por analisar os cabeçalhos de Requisição HTTP do Cliente e negociar as preferências em relação a tipos de mídia, idiomas, conjuntos de caracteres e codificações.

Este método verifica o cabeçalho de requisição HTTP relevante (como `Accept`, `Accept-Language`, `Accept-Charset`, ou `Accept-Encoding`) para obter as preferências do cliente. Em seguida, analisa os valores usando expressões regulares para extrair os itens e suas respectivas qualidades (se especificadas). Os resultados são classificados de acordo com a qualidade e retornados como um array.

Se o cabeçalho de requisição estiver vazio ou não puder ser analisado, o método retornará um array vazio.

### Exemplos de uso

```php
// Suponha que um cliente faça uma requisição ao servidor
// e o servidor receba o objeto de requisição

// Negocia o idioma preferido do cliente
$preferred_languages = $Request->negotiate(Request::ACCEPTS_LANGUAGES);

// Determina o melhor idioma a ser usado com base nos idiomas suportados pelo servidor
$available_languages = ['en', 'fr', 'de']; // Suponha que esses são os idiomas suportados pelo servidor

$selected_language = '';
foreach ($preferred_languages as $language => $quality) {
  if ( in_array($language, $available_languages) ) {
    $selected_language = $language;
    break;
  }
}

// Define o idioma da resposta
if ( ! empty($selected_language) ) {
  // Define os cabeçalhos de resposta para indicar o idioma selecionado
  $Response->Header->set('Content-Language', $selected_language);
}

// Agora, o servidor pode gerar uma resposta no idioma selecionado
// e enviá-la de volta ao cliente
// ...
```

### Parâmetros

#### $with (opcional)

Um inteiro que indica o tipo de negociação a ser realizada. Os valores possíveis são:

- `self::ACCEPTS_TYPES`: Negociar tipos de mídia (padrão).
- `self::ACCEPTS_LANGUAGES`: Negociar idiomas.
- `self::ACCEPTS_CHARSETS`: Negociar conjuntos de caracteres.
- `self::ACCEPTS_ENCODINGS`: Negociar codificações.

### Metadados gerados / acessíveis

`types`: Os MIME types preferidos pelo Cliente HTTP em ordem de relevância.

```php
$Request->types; // Array ( [0] => 'text/html' [1] => 'text/plain' )
```

`type`: O MIME type mais preferido pelo Cliente HTTP.

```php
$Request->type; // 'text/html'
```

`languages`: Os idiomas preferidos pelo Cliente HTTP em ordem de relevância.

```php
$Request->languages; // Array ( [0] => 'en-US' [1] => 'pt-BR' )
```

`language`: O idioma mais preferido pelo Cliente HTTP.

```php
$Request->language; // 'en-US'
```

`charsets`: Os charsets preferidos pelo Cliente HTTP em ordem de relevância.

```php
$Request->charsets; // Array ( [0] => 'UTF-8' [1] => 'ISO-8859-15' )
```

`charset`: O charset mais preferido pelo Cliente HTTP.

```php
$Request->charset; // 'UTF-8'
```

`encodings`: Os encodings preferidos pelo Cliente HTTP em ordem de relevância.

```php
$Request->encodings; // Array ( [0] => 'gzip' [1] => 'deflate' )
```

`encoding`: O encoding mais preferido pelo Cliente HTTP.

```php
$Request->encoding; // 'gzip'
```

### Observações

- Este método é útil para servidores que desejam fornecer conteúdo adaptado às preferências do cliente, como enviar a versão correta de um arquivo de imagem com base no formato aceito pelo navegador do usuário.
- Certifique-se de usar os valores de retorno deste método de acordo com a lógica de negócios de sua aplicação, como selecionar o melhor formato de resposta com base nas preferências do cliente.

## HTTP Caching

```php
public function freshen () : bool;
```

O método freshen é responsável por determinar se uma requisição do cliente é considerada "fresca" ou não, com base em determinados cabeçalhos e configurações de cache. Isso é útil para decidir se é necessário fornecer uma resposta completamente nova ou se uma resposta em cache pode ser utilizada.

### Retorno

- Retorna `true` se a requisição é considerada fresca e pode ser atendida com uma resposta em `cache`.
- Retorna `false` se a requisição não é considerada fresca e `uma nova resposta` deve ser gerada.

### Critérios de avaliação

- A requisição deve ser do tipo `GET` ou `HEAD`. Outros tipos de requisição não são considerados frescos.
- O cabeçalho `Cache-Control` não deve conter a diretiva `no-cache`, indicando que a resposta não deve ser servida a partir do cache.
- O cabeçalho `If-None-Match` (ETag) é verificado em relação ao ETag da resposta armazenada em cache. Se os ETags coincidirem, a resposta em cache é considerada válida.
- O cabeçalho `If-Modified-Since` é comparado com o cabeçalho `Last-Modified` da resposta em cache. Se a data de modificação da resposta for mais recente do que a data especificada no cabeçalho `If-Modified-Since`, a resposta em cache é considerada válida.

### Exemplo com Last-Modified

```php
// Suponha que a solicitação do cliente HTTP chegue assim...:

/*
GET / HTTP/1.1
Host: lab.bootgly.com:8080
User-Agent: insomnia/2023.4.0
If-Modified-Since: Fri, 14 Jul 2023 09:00:00 GMT
Accept: text/html

...
*/

$Response->Header->set('Last-Modified', 'Fri, 14 Jul 2023 08:00:00 GMT');

if ($Request->fresh) {
   return $Response(code: 304); // Da segunda resposta em diante o return é aqui
}
else {
   return $Response(body: 'test')->send(); // Na primeira resposta o return é aqui
}
```

### Metadados gerados

`fresh`: Sinalizador indicando se a requisição deve ser considerada fresca.

```php
$Request->fresh; // true
```

`stale`: Sinalizador indicando se a requisição deve ser considerada obsoleta.

```php
$Request->stale; // false
```

## Configuração de Segurança

### Allowlist de Host

```php
public static array $allowedHosts = [];
```

Quando não vazio, qualquer requisição cujo cabeçalho `Host` (case-insensitive, sem considerar porta) não corresponda a uma entrada da lista é rejeitada com `400 Bad Request` no momento da decodificação — antes de qualquer handler ou middleware ser executado.

Isso bloqueia ataques de spoofing do cabeçalho Host, como envenenamento de cache e envenenamento de reset de senha em aplicações multi-tenant (RFC 9112 §3.2 / §7.2).

Cada entrada é um **hostname em minúsculas sem porta**. O prefixo wildcard `*.example.com` corresponde a qualquer subdomínio de um único nível (`api.example.com`), mas NÃO ao domínio apex (`example.com`) e NÃO a subdomínios de múltiplos níveis (`a.b.example.com`). Uma lista vazia (o padrão) desabilita a aplicação por compatibilidade retroativa — zero overhead no hot path.

#### Exemplo

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request;

// ? Permitir apenas hosts conhecidos
Request::$allowedHosts = [
   'example.com',
   '*.example.com',  // corresponde a api.example.com, app.example.com, etc.
   'localhost',
];
// @ Qualquer requisição com cabeçalho Host fora desta lista recebe 400 Bad Request
```

#### Suporte a IPv6

Literais IPv6 entre colchetes são tratados corretamente — a porção da porta após o `]` de fechamento é removida antes da comparação:

```php
Request::$allowedHosts = [
   '[::1]',
   'localhost',
];
```

#### Desabilitando a validação

```php
// : Resetar para o padrão — sem validação
Request::$allowedHosts = [];
```

> **Nota:** Defina `$allowedHosts` antes do servidor iniciar (ex: no seu bootstrap ou arquivo de projeto). O valor é herdado por todos os processos worker.

## Sessão

`Session`: O objeto de sessão, inicializado sob demanda e baseado em arquivos.

```php
$Request->Session; // Objeto Session
```

## Validação de Requisição

O Bootgly fornece um sistema de validação fluente para verificar dados da requisição antes do seu handler executar. Ele gira em torno de três peças:

- `Validation` — executa um conjunto de regras contra um array de dados de entrada, acumulando erros por campo.
- `Validators\*` — classes de regra built-in (`Required`, `Email`, `Integer`, `Minimum`, `Maximum`, `Regex`, `Size`, `MIME`, `Extension`).
- Middleware `Validator` — aplica validação a uma fonte do Request e falha rapidamente (padrão `422 Unprocessable Entity`) se inválido. Veja [Middlewares → Validator](../Middlewares/#validator).

### Validação Standalone

Execute validação diretamente em qualquer array associativo — útil em scripts CLI, jobs, ou quando você precisa do resultado da validação dentro do handler:

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request\Validation;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request\Validators\Email;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request\Validators\Integer;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request\Validators\Maximum;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request\Validators\Minimum;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request\Validators\Required;

$Validation = new Validation(
   source: $Request->fields,
   rules: [
      'email' => [new Required, new Email],
      'age'   => [new Required, new Integer, new Minimum(18), new Maximum(120)],
   ]
);

$Validation->valid;  // true | false
$Validation->errors; // ['email' => ['email must be a valid email address.'], ...]
```

Os erros são armazenados como `array<campo, array<string>>` — um único campo pode acumular múltiplas mensagens (uma por regra falhada).

### Fontes Disponíveis

A enum `Sources` identifica qual propriedade do Request o middleware `Validator` lê:

| Fonte | Propriedade do Request | Descrição |
|---|---|---|
| `Sources::Fields` | `$Request->fields` | Campos de formulário / corpo decodificado |
| `Sources::Queries` | `$Request->queries` | Parâmetros da query string |
| `Sources::Headers` | `$Request->headers` | Headers HTTP da requisição |
| `Sources::Cookies` | `$Request->cookies` | Cookies da requisição |
| `Sources::Files` | `$Request->files` | Estruturas de arquivos enviados |

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request\Validation\Sources;
```

### Validadores Built-in

Todas as regras built-in vivem em `Bootgly\WPI\Nodes\HTTP_Server_CLI\Request\Validators`. Cada uma aceita um argumento opcional `string $message` no construtor para sobrescrever a mensagem de erro padrão.

---

#### Required

Rejeita `null`, strings vazias (após `trim`) e arrays vazios. Implícita — executa mesmo quando o campo está ausente.

```php
new Required;
new Required('Name cannot be empty.');
```

Mensagem padrão: `"{field} is required."`

---

#### Email

Valida com `filter_var($value, FILTER_VALIDATE_EMAIL)` do PHP.

```php
new Email;
```

Mensagem padrão: `"{field} must be a valid email address."`

---

#### Integer

Aceita `int` nativo ou strings que correspondem a `/\A[-+]?\d+\z/`.

```php
new Integer;
```

Mensagem padrão: `"{field} must be an integer."`

---

#### Minimum

Regra de limite inferior. Compara valores numéricos por valor, strings não-numéricas por `strlen`, e arrays por `count`.

```php
new Minimum(18);
new Minimum(8, 'Password must be at least 8 characters.');
```

Mensagem padrão: `"{field} must be at least {limit}."`

---

#### Maximum

Contraparte de `Minimum` para limite superior, com o mesmo dispatch (numérico, comprimento de string ou contagem de array).

```php
new Maximum(120);
new Maximum(500, 'Bio cannot exceed 500 characters.');
```

Mensagem padrão: `"{field} must be at most {limit}."`

---

#### Regex

Faz matching do valor contra um padrão PCRE. Lança `InvalidArgumentException` no momento da construção se o padrão for inválido.

```php
new Regex('/\A[a-z0-9_-]+\z/');
new Regex('/\A[a-z0-9_]{3,}\z/', 'Username must be alphanumeric, 3+ chars.');
```

Mensagem padrão: `"{field} has an invalid format."`

---

#### Size

Valida estruturas de upload (`['name', 'type', 'size', 'error', 'tmp_name']`). Passa quando `error === 0` e `size <= $limit` (em bytes).

```php
new Size(2 * 1024 * 1024); // 2 MB
```

Mensagem padrão: `"{field} must be at most {limit} bytes."`

---

#### MIME

Valida estruturas de upload contra uma allowlist de tipos MIME (case-sensitive).

```php
new MIME('application/pdf');
new MIME(['image/jpeg', 'image/png']);
```

Mensagem padrão: `"{field} must have an allowed MIME type."`

---

#### Extension

Valida estruturas de upload contra uma allowlist de extensões de arquivo (case-insensitive; um `.` inicial é aceito e removido).

```php
new Extension('zip');
new Extension(['jpg', 'jpeg', 'png']);
```

Mensagem padrão: `"{field} must have an allowed extension."`

---

### Regras Customizadas

Estenda `Bootgly\WPI\Nodes\HTTP_Server_CLI\Request\Validation\Condition` para adicionar sua própria regra. Implemente `validate()` (retorna `true` se válido) e `format()` (retorna a mensagem de erro).

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request\Validation\Condition;

$InviteCode = new class extends Condition {
   /**
    * @param array<string,mixed> $data  Array completo da fonte — útil para regras cross-field.
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

Defina `$implicit = true` na sua subclasse quando a regra precisar executar mesmo para campos ausentes/vazios (como `Required` faz).

### Middleware Validator

Para plugar validação diretamente em uma rota, use o middleware `Validator`. O handler é pulado se alguma regra falhar:

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request\Validation\Sources;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request\Validators\Email;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request\Validators\Required;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\BodyParser;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Validator;

yield $Router->route('/users', function (Request $Request, Response $Response) {
   return $Response->JSON->send(['created' => true, 'user' => $Request->fields]);
}, POST, middlewares: [
   new BodyParser,
   new Validator(rules: [
      'email' => [new Required, new Email],
   ], Source: Sources::Fields),
]);
```

Veja [Middlewares → Validator](../Middlewares/#validator) para a referência completa do middleware (status code, fallback closure).

### Exemplo End-to-End

Um router completo demonstrando todos os modos de validação — corpo, query string, upload de arquivo, regra customizada e resposta de falha customizada:

```php
use function is_string;

use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request\Validation;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request\Validation\Sources;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request\Validators;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request\Validators\Email;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request\Validators\Extension;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request\Validators\Integer;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request\Validators\Maximum;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request\Validators\MIME;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request\Validators\Minimum;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request\Validators\Regex;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request\Validators\Required;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request\Validators\Size;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\BodyParser;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Validator;

$Custom = new class extends Validators {
   public function validate (string $field, mixed $value, array $data): bool
   {
      return is_string($value) && $value === 'bootgly';
   }
   public function format (string $field): string
   {
      return "{$field} must match the demo invite code.";
   }
};

// Validação fail-closed do corpo
yield $Router->route('/validation/middleware', function (Request $Request, Response $Response) {
   return $Response->JSON->send(['created' => true, 'fields' => $Request->fields]);
}, POST, middlewares: [
   new BodyParser,
   new Validator(rules: [
      'email' => [new Required, new Email],
      'age'   => [new Required, new Integer, new Minimum(18), new Maximum(120)],
   ], Source: Sources::Fields),
]);

// Resposta de falha customizada
yield $Router->route('/validation/fallback', function (Request $Request, Response $Response) {
   return $Response->JSON->send(['created' => true]);
}, POST, middlewares: [
   new BodyParser,
   new Validator(
      rules: ['email' => [new Required, new Email]],
      Source: Sources::Fields,
      fallback: function (Request $Request, Response $Response, Validation $Validation): Response {
         $Response->code(400);
         return $Response->JSON->send([
            'created' => false,
            'fields'  => $Request->fields,
            'errors'  => $Validation->errors,
         ]);
      }
   ),
]);

// Validação de query
yield $Router->route('/validation/query', function (Request $Request, Response $Response) {
   return $Response->JSON->send(['queries' => $Request->queries]);
}, GET, middlewares: [
   new Validator(rules: [
      'page'   => [new Integer, new Minimum(1)],
      'filter' => [new Regex('/\A[a-z0-9_-]+\z/')],
   ], Source: Sources::Queries),
]);

// Validação de upload de arquivo
yield $Router->route('/validation/files', function (Request $Request, Response $Response) {
   return $Response->JSON->send(['files' => $Request->files]);
}, POST, middlewares: [
   new BodyParser,
   new Validator(rules: [
      'avatar' => [
         new Required,
         new Size(2 * 1024 * 1024),
         new MIME(['image/jpeg', 'image/png']),
         new Extension(['jpg', 'jpeg', 'png']),
      ],
   ], Source: Sources::Files),
]);

// Regra customizada
yield $Router->route('/validation/custom', function (Request $Request, Response $Response) {
   return $Response->JSON->send(['accepted' => true]);
}, POST, middlewares: [
   new BodyParser,
   new Validator(rules: [
      'code' => [new Required, $Custom],
   ], Source: Sources::Fields),
]);
```
