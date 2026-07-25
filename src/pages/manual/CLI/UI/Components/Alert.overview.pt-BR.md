# Classe Alert

A classe Alert é responsável por exibir alertas coloridos no Terminal.

## Instância

Para utilizar a classe Alert, é necessário instanciar um objeto da própria classe passando como parâmetro uma referência ao objeto Output da classe Terminal:

```php
use const Bootgly\CLI;
use Bootgly\CLI\UI\Components\Alert;

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
$Alert->message = 'Isso é um alerta de sucesso!';
```

### Mensagens longas são cortadas

A mensagem do alerta sempre ocupa uma única linha. Uma mensagem mais larga que o terminal é cortada com reticências (`…`) antes de ser escrita, descontando o badge (` SUCCESS `, ` ATTENTION `, ` FAIL `, ` ALERT `) das colunas disponíveis:

```php
$Alert->message = str_repeat('Uma mensagem de validação bem longa. ', 10);

// @ Renderizado como: FAIL  Uma mensagem de validação bem longa. Uma mensage…
$Alert->render();
```

Um alerta quebrado transbordaria para uma segunda linha, e isso quebra tanto os repaints em bloco de que os componentes ao redor dependem quanto a contagem de linhas de qualquer [Region](/manual/CLI/Terminal/Output/Region/overview) que o hospede — uma região conta as linhas que emite pelas quebras de linha que passam por ela, e uma linha quebrada é uma que ela nunca vê.

O corte depende de `Terminal::$width` ser conhecida; quando não é (saída em pipe, por exemplo), a mensagem é escrita inteira.

## Veja ao vivo

O demo oficial de Alert roda no [showcase ao vivo](/manual/CLI/UI/Components/Alert/showcase) — código real do framework em PHP 8.4 WebAssembly, no seu navegador, direto desta página.
