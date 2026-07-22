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

### Persistir um upload (`store`)

`store()` move um upload finalizado do seu arquivo temporário para um disco do
[Storage](/guide/storage/overview/) — Local, S3 ou qualquer driver registrado — transmitindo os
bytes (memória constante) e removendo o arquivo temporário em caso de sucesso.

```php
use Bootgly\ABI\Resources\Storage;

$Storage = new Storage([
   'disks' => ['uploads' => ['driver' => 's3', 'bucket' => 'assets', /* … */]],
]);

$Request->download();
$path = $Request->store('avatar', 'users/1/avatar.png', $Storage->open('uploads'));
// $path === 'users/1/avatar.png' em caso de sucesso, false caso contrário ($Disk->error tem o motivo)
```

```php
public function store (string $key, string $path, Driver $Disk, array $options = []): string|false
```

Persiste o arquivo enviado em `$key` no `$Disk` em `$path` (um `$path` vazio, ou terminado em `/`,
usa o nome do arquivo enviado). `$options` são repassados ao `write()` do driver (ex.: `type`/`meta`
do S3). Retorna o caminho armazenado, ou `false` quando a chave não existe, a parte falhou no
upload, ou a escrita no disco falhou — nesse caso o arquivo temporário é mantido para o `clean()`
recuperá-lo e o motivo fica em `$Disk->error`.

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

## HTTP Authentication

```php
public function authenticate () : Basic|null;
```

Este método extrai credenciais Basic de autorização de uma Requisição HTTP. A comparação do esquema Basic é case-insensitive como exige a RFC 7235, então `Basic` e `basic` são aceitos. Ele apenas faz o parse das credenciais; a verificação pertence aos guards de autenticação e aos resolvers da aplicação. O transporte Bearer é exposto por `$Request->token` e tratado pelos guards de autenticação do router. O parsing de autenticação é cacheado por request e resetado quando o request é clonado ou reinicializado.

### Exemplo de uso

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request\Authentications\Basic;

$Credentials = $Request->authenticate();

if ($Credentials instanceof Basic) {
   $username = $Credentials->username;
   $password = $Credentials->password;

   // Verifique username e password...
}

$token = $Request->token; // Token Bearer para Router\Middlewares\Authentication\Bearer/JWT
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

`token`: O token fornecido na autenticação Bearer.

```php
$Request->token; // 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...'
```

`identity`: O principal autenticado exposto pelos guards de autenticação.

```php
$Request->identity; // Bootgly\API\Security\Identity|string|null
```

`claims`: Claims verificados expostos por guards baseados em token.

```php
$Request->claims; // ['sub' => 'user-1', 'scope' => 'demo:read']
```

Veja [Authentication](../Authentication/) para exemplos com guards Basic, Bearer, JWT e Session.

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

### Limite de Byte-ranges

```php
public static int $maxRanges = 16;
```

Número máximo de membros aceitos em um único cabeçalho `Range`. Uma requisição cujo conjunto de ranges excede o limite é respondida com `416 Range Not Satisfiable` (`Content-Range: bytes */<tamanho>`) — o arquivo nunca é lido e nenhum corpo é produzido.

Isso limita a amplificação de resposta: sem ele, algumas centenas de bytes de cabeçalho `Range` repetindo o mesmo range se transformariam em uma leitura de arquivo e uma cópia do corpo **por membro** (RFC 9110 §14.2). Um conjunto de 32 membros contra um arquivo de 82 KB já é uma resposta de ~2,6 MB a partir de um cabeçalho de 261 bytes.

O limite é aplicado antes de o conjunto ser interpretado — o cabeçalho é dividido no máximo `$maxRanges + 1` vezes — então um conjunto excessivo não custa nada além da própria verificação.

#### Exemplo

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request;

// ? Restringir o limite em um servidor de arquivos estáticos
Request::$maxRanges = 4;
// @ `Range: bytes=0-9,20-29,40-49,60-69,80-89` (5 membros) agora recebe 416 Range Not Satisfiable
```

#### Coalescência

Dentro do limite, `Response::upload()` combina o conjunto aceito: ranges sobrepostos e adjacentes são fundidos em uma única parte, mantendo cada parte fundida na sua posição de requisição mais antiga. Ranges duplicados, portanto, não podem multiplicar o corpo da resposta.

```php
// @ `Range: bytes=0-9,5-14,15-19` → uma parte: `Content-Range: bytes 0-19/<tamanho>`
```

Quando a coalescência resulta em um único range, a resposta é um `206 Partial Content` simples com o cabeçalho `Content-Range`, em vez de um corpo `multipart/byteranges`.

#### Desabilitando byte-ranges

Qualquer valor abaixo de `1` rejeita todo cabeçalho `Range` com `416`:

```php
// : Recusar todas as requisições de range
Request::$maxRanges = 0;
```

> **Nota:** Defina `$maxRanges` antes do servidor iniciar (ex: no seu bootstrap ou arquivo de projeto). O valor é herdado por todos os processos worker.

## Sessão

`Session`: O objeto de sessão, inicializado sob demanda e baseado em arquivos.

```php
$Request->Session; // Objeto Session
```

<span id="request-validation"></span>

## Validação de Requisição

O Bootgly fornece um sistema de validação fluente para verificar dados da requisição antes do seu handler executar. Ele gira em torno de três peças:

- [`Bootgly\ADI\Validation`](/manual/ADI/Validation/overview/) — a engine standalone: executa um conjunto de regras contra um array de dados de entrada, acumulando erros por campo. Ela vive na camada ADI, então as mesmas regras validam input de CLI, jobs e seeders.
- `Bootgly\ADI\Validators\*` — classes de regra built-in (`Required`, `Boolean`, `Integer`, `Minimum`, `Maximum`, `In`, `Email`, `URL`, `Date`, `Confirmed`, `Regex`, `Size`, `MIME`, `Extension`).
- Middleware `Validator` — aplica validação a uma fonte do Request e falha rapidamente (padrão `422 Unprocessable Entity`) se inválido. Veja [Middlewares → Validator](../Middlewares/#validator).

### Validação Standalone

Execute validação diretamente em qualquer array associativo — útil quando você precisa do resultado da validação dentro do handler:

```php
use Bootgly\ADI\Validation;
use Bootgly\ADI\Validators\Email;
use Bootgly\ADI\Validators\Integer;
use Bootgly\ADI\Validators\Maximum;
use Bootgly\ADI\Validators\Minimum;
use Bootgly\ADI\Validators\Required;

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

Os erros são armazenados como `array<campo, array<string>>` — um único campo pode acumular múltiplas mensagens (uma por regra falhada). A referência completa da engine — semântica opcional/implícita, mensagens customizadas e receitas não-HTTP — vive na página [ADI Validation](/manual/ADI/Validation/overview/).

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
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Validator\Sources;
```

### Validadores Built-in

Todas as regras built-in vivem em `Bootgly\ADI\Validators` — `Required`, `Boolean`, `Integer`, `Minimum`, `Maximum`, `In`, `Email`, `URL`, `Date`, `Confirmed`, `Regex`, `Size`, `MIME` e `Extension`. Cada uma aceita um argumento opcional `string $message` no construtor para sobrescrever a mensagem de erro padrão. O catálogo bloco-a-bloco (argumentos, semântica e mensagens padrão) vive na [referência ADI Validation](/manual/ADI/Validation/overview/).

### Regras Customizadas

Estenda `Bootgly\ADI\Validators` e implemente `validate()` (retorna `true` se válido) e `format()` (retorna a mensagem de erro):

```php
use Bootgly\ADI\Validators;

$InviteCode = new class extends Validators {
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
use Bootgly\ADI\Validators\Email;
use Bootgly\ADI\Validators\Required;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\BodyParser;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Validator;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Validator\Sources;

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

use Bootgly\ADI\Validation;
use Bootgly\ADI\Validators;
use Bootgly\ADI\Validators\Email;
use Bootgly\ADI\Validators\Extension;
use Bootgly\ADI\Validators\Integer;
use Bootgly\ADI\Validators\Maximum;
use Bootgly\ADI\Validators\MIME;
use Bootgly\ADI\Validators\Minimum;
use Bootgly\ADI\Validators\Regex;
use Bootgly\ADI\Validators\Required;
use Bootgly\ADI\Validators\Size;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\BodyParser;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Validator;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Validator\Sources;

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
