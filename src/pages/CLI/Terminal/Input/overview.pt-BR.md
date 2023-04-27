# Terminal Input

A classe `Input` é responsável por prover métodos para lidar com a entrada de dados no Terminal. Ela é utilizada internamente pela classe `Terminal`, que por sua vez é acessada pela classe `CLI`.

## Instância

Para utilizar a classe `Input`, é necessário acessá-la através da classe `CLI`, como demonstrado abaixo:

```php
use Bootgly\CLI;

$Input = CLI::$Terminal->Input;
```

## Configurações

```php
configure (bool $blocking = true, bool $canonical = true, bool $echo = true) : Input
```

A classe `Input` pode ser configurada através do método `configure()`, que recebe três parâmetros booleanos para definir as configurações de entrada do terminal:

- `bool $blocking`:
define se a entrada deve ser bloqueante ou não;
- `bool $canonical`:
define se deve usar ou não o modo canonical de processamento da entrada. Em geral, o modo canonical permite que a entrada seja lida uma linha por vez. Quando o usuário pressiona Enter, todo o conteúdo digitado é retornado;
- `bool $echo`:
define se deve exibir o que o usuário digita na tela ou não.

### Modo bloqueante

O modo `blocking` define se o fluxo de processamento do loop de leitura deve esperar ou não a leitura de dados do usuário antes de continuar. Caso a leitura seja bloqueante, o fluxo do loop é parado até que o usuário tenha feito alguma entrada de dados no Terminal.

### Modo canonical

O modo `canonical` permite a leitura de uma linha por vez e essa é a configuração padrão pra a maioria dos terminais. Com esse modo ativado, ao pressionar Enter, toda a linha digitada é colocada no Input. Porém, enquanto a linha não é completa, a função `read()` vai colocar cada caractere em um buffer, até que o usuário pressione Enter.

Caso o modo `canonical` esteja desativado (`false`), o método `read()` não vai esperar até que uma linha seja enviada pressionando Enter, e vai colocar cada caractere digitado na entrada de dados do terminal, ou seja, é como se o buffer de leitura da entrada do `Terminal` estivesse desativado.

### Modo echo

O modo `echo` trata a exibição do que o usuário digita na tela. Quando esse modo está ativado (`true`), tudo o que o usuário digita é exibido de volta na tela à medida em que ele digita. Quando esse modo está desativado (`false`), o que o usuário digita não é exibido na tela, ou seja, toda entrada de dados não é refletida de volta como um `echo`.

## Uso

### Ler dados com read()

```php
read(int $length) : string | false
```

O método `read()` é responsável por ler os dados digitados pelo usuário. Ele recebe como parâmetro um inteiro que representa a quantidade máxima de bytes que devem ser lidos. O valor retornado pode ser uma string com os dados digitados ou `false` caso ocorra algum erro na operação.

### Lendo dados com reading()

```php
reading(\Closure $CAPI, \Closure $SAPI)
```

A classe `Input` também possui um método chamado `reading()`, que é utilizada para interagir com o usuário em tempo real.
No Bootgly se o nome do método estiver usando o gerúndio, é sinal que o método implementa um loop dentro dele.

Esse método recebe duas funções de callback:

- `$CAPI`, que é a função de entrada (API do Client);
- `$SAPI`, que é a função de saída (API do Servidor);

O callback `CAPI` deve chamar a função de leitura `read()` assim que houver entrada de dados.
O callback `SAPI` deve ler o que o cliente envia e processar esses dados exibindo o conteúdo na tela ou não.

Este método cria uma interface básica local Client <-> Servidor, mas não possui implementação para roteamento de recursos, por isso no Bootgly ele é considerado uma interface somente, e não um node.

### O dado $stream

Representa o recurso stream do PHP que é utilizado pelo `Input` para gerenciar a entrada de dados do usuário.

Esta propriedade é utilizada nos argumentos de construção da classe Input, mas você não precisa se preocupar por passar o recurso na construção da classe porque por padrão é passado o recurso `STDIN` que é a entrada padrão do terminal no modo CLI.
