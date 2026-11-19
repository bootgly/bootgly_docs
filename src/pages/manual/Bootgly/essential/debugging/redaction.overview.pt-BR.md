# Redação

Um dump é o jeito mais rápido de olhar dentro de um objeto — e o jeito mais rápido de imprimir uma senha, uma chave de API ou um token num terminal, num log ou num relato de bug. `Bootgly\ABI\Debugging\Data\Vars\Redactable` mantém esses valores fora dos dumps de debug: uma classe que guarda um segredo usa o trait e marca a propriedade com `#[Secret]`, e `var_dump()`, `print_r()`, `debug_zval_dump()` e o [Dumper](/manual/CLI/UI/Atoms/Dumper/overview/) (`dump()` / `dd()`) mostram `[redacted]` no lugar dele.

Três ferramentas cobrem os três lugares por onde um segredo passa:

| Um segredo em… | Use | Para que |
|---|---|---|
| uma propriedade | `use Redactable;` + `#[Secret]` | dumps de debug do objeto o mostrem mascarado |
| um parâmetro | o `#[SensitiveParameter]` do PHP | stack traces mostrem um `SensitiveParameterValue` no lugar |
| uma URL num texto | `URI::redact()` | o userinfo (`user:password@`) saia antes de ser exibido |

## Marque uma classe que guarda um segredo

Use o trait na classe e coloque `#[Secret]` em cada propriedade que **guarda** um segredo:

```php :filename="app/Gateway.php";
<?php

use Bootgly\ABI\Debugging\Data\Vars\Redactable;
use Bootgly\ABI\Debugging\Data\Vars\Redactable\Secret;

final class Gateway
{
   use Redactable;

   public string $merchant;
   #[Secret]
   private string $key;
   #[Secret(['password', 'token'])]
   public array $options;
   #[Secret(URI: true)]
   public string $webhook;

   public function __construct (string $merchant, string $key, array $options, string $webhook)
   {
      $this->merchant = $merchant;
      $this->key = $key;
      $this->options = $options;
      $this->webhook = $webhook;
   }
}

$Gateway = new Gateway(
   merchant: 'Shop',
   key: 'SYNTH-KEY',
   options: [
      'region' => 'eu',
      'Password' => 'SYNTH-PASSWORD',
      'retry' => ['token' => 'SYNTH-TOKEN', 'times' => 3]
   ],
   webhook: 'https://shop:SYNTH-PASS@hooks.example.com/paid'
);

print_r($Gateway);
```

Sem o `use Redactable;` os atributos não fazem nada, e o dump carrega todos os segredos:

```text :toolbar="false";
Gateway Object
(
    [merchant] => Shop
    [key:Gateway:private] => SYNTH-KEY
    [options] => Array
        (
            [region] => eu
            [Password] => SYNTH-PASSWORD
            [retry] => Array
                (
                    [token] => SYNTH-TOKEN
                    [times] => 3
                )

        )

    [webhook] => https://shop:SYNTH-PASS@hooks.example.com/paid
)
```

Com ele, a mesma chamada imprime:

```text :toolbar="false";
Gateway Object
(
    [merchant] => Shop
    [key:Gateway:private] => [redacted]
    [options] => Array
        (
            [region] => eu
            [Password] => [redacted]
            [retry] => Array
                (
                    [token] => [redacted]
                    [times] => 3
                )

        )

    [webhook] => https://hooks.example.com/paid
)
```

As três formas do atributo:

- `#[Secret]` mascara o **valor inteiro** — `key` vira `[redacted]`.
- `#[Secret(['password', 'token'])]` mascara só as **entradas sob essas chaves** de um valor array, em qualquer caixa de letra e em qualquer profundidade — `Password` e o `token` aninhado somem, `region` e `times` ficam.
- `#[Secret(URI: true)]` mantém o valor e remove o **userinfo de toda URL** numa string (ou em cada string dentro de um array), via [`URI::redact()`](/manual/ABI/Data/URI/overview/) — o webhook mantém host e path.

Todo o resto aparece como o PHP mostraria: cada propriedade inicializada sob sua visibilidade, na sua ordem. `var_dump()` e `debug_zval_dump()` imprimem os mesmos valores mascarados.

### Em `dump()` e `dd()`

O Dumper renderiza um objeto `Redactable` como qualquer outro objeto — sigilos de visibilidade, marcas `readonly`, as linhas sem valor das propriedades não inicializadas e virtuais — com os valores mascarados:

```php :filename="app/Mailer.php";
<?php

use Bootgly\ABI\Debugging\Data\Vars\Redactable;
use Bootgly\ABI\Debugging\Data\Vars\Redactable\Secret;

final class Mailer
{
   use Redactable;

   public string $host = 'smtp.example.com';
   #[Secret]
   protected string $password = 'SYNTH-PASSWORD';
   #[Secret]
   public null|string $token = null;
   public int $port;
   public string $sender {
      get => "orders@{$this->host}";
   }
}

dump(new Mailer);
```

```text :toolbar="false";
 in call number: 1
 1 app/Mailer.php:21
Mailer {
   +host: 'smtp.example.com'
   #password: '[redacted]'
   +token: null
   +port: uninitialized
   +sender: virtual
}
```

`token` está marcado mas mostra `null`: `null` e `''` nunca são mascarados, então um dump ainda distingue um segredo *não configurado* de um configurado.

Nada roda até o objeto ser dumpado, e o dump não muda nada: nenhum get hook de propriedade roda (um hook pode criar um diretório ou montar uma chave), os valores são copiados, e uma propriedade que guarda uma referência mantém seu valor vivo.

## Marque os parâmetros que carregam um segredo

Uma propriedade não é o único lugar onde um segredo fica. Enquanto uma chamada está na stack, os argumentos dela também estão, e um stack trace pode mostrá-los — o trace de uma exceção quando `zend.exception_ignore_args` é `0`, a página de debug de desenvolvimento, um `Backtrace` que captura argumentos. O atributo `#[SensitiveParameter]` do próprio PHP troca esse argumento por um objeto `SensitiveParameterValue` em todo trace.

Marque o parâmetro em **todo** frame por onde o segredo passa. O atributo pertence só àquela função: uma função para a qual o valor é repassado, ou um método que sobrescreve outro com um parâmetro marcado, volta a mostrá-lo a menos que também seja marcado. Isso inclui as closures que você entrega ao framework — um resolver de autenticação recebe a senha que o cliente enviou:

```php :filename="app/Login.php";
<?php

namespace Shop;


use SensitiveParameter;

use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authentication\Basic;


function verify (string $username, #[SensitiveParameter] string $password): bool
{
   // ... busque o usuário e confira o hash da senha
}

$Guard = new Basic(
   function (string $username, #[SensitiveParameter] string $password, Request $Request): bool {
      return verify($username, $password);
   },
   realm: 'Shop'
);
```

Se `verify()` lançar, os dois frames do trace mostram `SensitiveParameterValue` no lugar da senha. Tire o atributo de `verify()` e o frame dela mostra a senha em claro, mesmo que o frame da closure não mostre.

> [!NOTE]
> Importe o atributo (`use SensitiveParameter;`) num arquivo com namespace. Sem o import, `#[SensitiveParameter]` dentro de `namespace Shop;` nomeia `Shop\SensitiveParameter`, uma classe que o PHP não conhece: nenhum erro é lançado, e o argumento aparece em claro.

## Mostre URLs via `URI::redact()`

Uma connection string ou um remote git muitas vezes carrega suas credenciais na URL (`redis://:password@host:6379/0`). Guarde a URL original para conectar; sempre que uma — ou qualquer texto que possa conter uma, como uma mensagem de erro — for exibida, gravada em log ou impressa num relatório, passe-a por `URI::redact()`:

```php
use Bootgly\ABI\Data\URI;

echo URI::redact('redis://:SYNTH-PASSWORD@127.0.0.1:6379/0');
// redis://127.0.0.1:6379/0
```

`#[Secret(URI: true)]` aplica o mesmo método a uma propriedade. As regras que ele segue (toda URL de um texto, o último `@` da autoridade, URLs `file:`) estão no manual de [URI](/manual/ABI/Data/URI/overview/#ocultar-credenciais).

## O que é mascarado, e o que não é

`Redactable` funciona via `__debugInfo()`, o hook que os dumps de debug do PHP chamam. Os canais que o chamam estão cobertos; os que não chamam, não:

| Canal | Valor `#[Secret]` |
|---|---|
| `var_dump()` | mascarado |
| `print_r()` | mascarado |
| `debug_zval_dump()` | mascarado |
| `dump()` / `dd()` / o Dumper | mascarado |
| `var_export()` | **exibido** |
| cast `(array)`, `get_object_vars()` | **exibido** |
| `json_encode()`, `serialize()` | **exibido** |
| `$Object->property` (uma propriedade pública lida diretamente) | **exibido** |

Até a 2.0, as quatro últimas linhas ficam como estão: o atributo protege o que é dumpado para um humano, não o que é convertido, serializado ou lido por código. Não entregue um objeto que guarda um segredo ao `json_encode()` ou ao `var_export()` para exibir — monte o array que você quer mostrar.

As classes do próprio framework que guardam segredos usam o trait, então um dump delas já sai mascarado:

- as configurações de banco de dados, cache, filas, e-mail e storage (senhas, tokens, o `secret` de um disk), e as passphrases TLS de servidores e clientes;
- as configs de ambiente: os valores do `.env` que um loader guarda e todo valor ligado numa árvore de config;
- segredos e chaves JWT, tokens de refresh e de remember, e o material da chave de criptografia;
- os campos de header de credencial de requisições e respostas — no servidor, no cliente HTTP e no cliente WebSocket — com os blocos raw de headers, os cookies, as linhas `Set-Cookie`, o password Basic, o token Bearer e o id de sessão;
- os buffers de rede de uma conexão TCP de servidor ou de cliente: o que ela leu, o que está escrevendo e o que guarda para a próxima leitura ou escrita.

Os campos de header de credencial são os nomes em `HTTP::SECRET_HEADERS`: `authorization`, `proxy-authorization`, `cookie`, `set-cookie`, `x-csrf-token`, `x-api-key` e `x-auth-token`. Uma credencial sob outro nome de header é sua para mascarar. Corpos de requisição e resposta, dados de sessão e contextos de log guardam dados da aplicação e não são mascarados: mantenha um segredo fora deles, ou fora do dump deles.

## Regras práticas

- **Marque a propriedade que guarda o valor.** Uma propriedade virtual (um hook `get` sem armazenamento) não faz parte de um dump; marcá-la não mascara nada, e a propriedade por trás dela é impressa em claro. Coloque `#[Secret]` na propriedade de backing.
- **`null` e `''` continuam visíveis.** De propósito — "sem senha" e "uma senha" precisam ser distinguíveis num dump.
- **Seu próprio `__debugInfo()` substitui a redação.** O método do trait é declarado sem tipo de retorno, então uma subclasse ainda pode declarar o seu (sem tipo, `: array` ou `: null|array`) — mas aí esse corpo é o que todo dump mostra, e as marcas `#[Secret]` deixam de valer. Mascare os segredos nele você mesmo.
- **Enums não podem usá-lo.** O PHP proíbe `__debugInfo()` num enum.
- **O Dumper não mascara nada sozinho.** Ele renderiza o que o `__debugInfo()` do objeto retorna; um objeto sem `Redactable` é dumpado por inteiro.

## Referência

### Redactable

```php
public function __debugInfo ()
```

Retorna as propriedades do objeto como o cast `(array)` do PHP as lista — nomes mangled para as privadas e protegidas, valores copiados — com cada propriedade `#[Secret]` passada por `Secret::redact()`. Propriedades privadas e protegidas são cobertas, e também as propriedades privadas dos ancestrais. Nenhum get hook roda, e propriedades não inicializadas e virtuais ficam de fora, como de qualquer cast `(array)`. Declarado sem tipo de retorno, então uma subclasse ainda pode declarar o seu próprio `__debugInfo()`, que então substitui este.

### Redactable\Secret

```php
public const string MASK = '[redacted]';
```

O que um dump mostra no lugar de um segredo.

```php
public function __construct (array $keys = [], bool $URI = false)
```

O atributo (`#[Attribute(Attribute::TARGET_PROPERTY)]`). Sem argumentos, o valor inteiro é mascarado. `$keys` lista as chaves de array a mascarar dentro do valor — casadas em qualquer caixa de letra, em qualquer profundidade. `$URI: true` remove o userinfo das URLs de um valor string (ou de cada string dentro de um array) em vez de mascará-lo. Os dois ficam expostos como propriedades somente leitura: `keys` (em minúsculas) e `URI`.

```php
public function redact (mixed $value): mixed
```

Redige um valor para um dump e nunca o escreve: arrays são reconstruídos, então uma referência guardada dentro de um mantém seu valor vivo. Retorna `null` e `''` como estão; uma string via `URI::redact()` quando `URI` está ligado; `Secret::MASK` quando nenhuma chave é dada; um array com suas entradas chaveadas mascaradas (uma entrada sob uma chave que guarda `null` ou `''` também fica como está); qualquer outro valor sem mudança — uma string sob um `#[Secret]` chaveado não carrega chaves, então volta inteira.
