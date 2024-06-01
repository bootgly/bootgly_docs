# Classe Alert

A classe Alert é responsável por exibir alertas coloridos no Terminal.

## Instância

Para utilizar a classe Alert, é necessário instanciar um objeto da própria classe passando como parâmetro uma referência ao objeto Output da classe Terminal:

```php
use const Bootgly\CLI;
use Bootgly\CLI\UI\Alert\Alert;

$Output = CLI->Terminal->Output;

$Alert = new Alert($Output);
```

## Configurações

A classe Alert pode ser configurada com as seguintes opções:

### Style

O estilo do alerta a ser exibido. Pode ser "Default" ou "Fullcolor".

Example:

```php
// Definindo o estilo do alerta para Fullcolor
$Alert->Style::Fullcolor->set();
```

### Type

O tipo de alerta que será exibido. Pode ser do tipo "Default", "Success", "Attention" ou "Failure".

Exemplo:

```php
// Definindo o tipo do alerta para Success
$Alert->Type::Success->set();
```

### width

A largura em caracteres do alerta que será exibido.

Exemplo:

```php
// Definindo a largura do alerta para 100 caracteres
$Alert->width = 100;
```

## Uso

### Definindo a mensagem do alerta

A propriedade message é utilizada para definir a mensagem que deve ser exibida no alerta.

Exemplo:

```php
$Alert->message = 'Isso é um alerta de sucesso!
```
