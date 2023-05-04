# Classe Alert

A classe Alert é responsável por exibir alertas coloridos na terminal.

## Instância

Para utilizar a classe Alert, é necessário instanciar um objeto da própria classe passando como parâmetro uma referência ao objeto Output da classe Terminal:

```php
use Bootgly\CLI;

$Output = CLI::$Terminal->Output;
$Alert = new Alert($Output);
```

## Configurações

A classe Alert pode ser configurada com as seguintes opções:

### Type

O tipo de alerta que será exibido. Pode ser do tipo "DEFAULT", "SUCCESS", "ATTENTION" ou "FAILURE".

Exemplo:

```php
use Bootgly\CLI;

// Definindo o tipo do alerta para SUCCESS
$Alert->Type::Success->set();
```

### width

A largura em caracteres do alerta que será exibido.

Exemplo:

```php
use Bootgly\CLI;

// Definindo a largura do alerta para 100 caracteres
$Alert->width = 100;
```

## Uso

### emit

O método `emit` é utilizado para exibir um alerta na tela. Ele recebe como parâmetro a mensagem que deverá ser exibida no alerta.

Cabeçalho do método:

```php
emit (string $message) : void
```

Exemplo:

```php
use Bootgly\CLI;

$Output = CLI::$Terminal->Output;
$Alert = new Alert($Output);

$Alert->Type::Success->set(); // define o tipo de alerta como success
$Alert->width = 60; // define a largura do alerta como 60 caracteres

$message = 'Este é um alerta de sucesso!';

$Alert->emit(message: $message); // chama o método para exibir o alerta
```
