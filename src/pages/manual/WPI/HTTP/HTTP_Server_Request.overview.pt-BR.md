# Documentação da Classe HTTP Request

Esta classe representa uma requisição HTTP feita a um servidor web. Ela fornece uma estrutura concisa para acessar parâmetros comuns de requisição, tais como cabeçalhos, URI, strings de consulta e conteúdo do corpo. Esta documentação descreve as propriedades acessíveis dentro da classe, fornecendo exemplos em PHP para cada uma.

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
