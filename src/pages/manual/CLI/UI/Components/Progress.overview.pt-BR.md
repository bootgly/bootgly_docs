# Progress

A classe `Progress` é utilizada para mostrar o progresso de uma operação em tempo real no terminal.

## Instância

Para utilizar a classe, primeiro é necessário criar uma instância dela:

```php
use const Bootgly\CLI;
use Bootgly\CLI\UI\Components\Progress;

$Output = CLI->Terminal->Output;

$Progress = new Progress($Output);
```

Ao criar uma nova instância, caso nenhum parâmetro seja passado, será utilizado os valores padrões.

## Configurações

### Limitando a taxa de atualização

```php
float $throttle
```

Intervalo de atualização (em segundos). Padrão: `0.1`.

Esse parâmetro determina a frequência com que a barra de progresso é atualizada (renderizada), ou seja, com que frequência é exibido o progresso da tarefa em andamento. Se o `throttle` for definido como um valor baixo, a barra de progresso será atualizada com mais frequência, o que pode aumentar a precisão da estimativa de tempo e dar uma sensação de progresso mais fluida.

Por outro lado, se o `throttle` for definido como um valor alto, a barra de progresso será atualizada com menos frequência, o que pode reduzir o overhead de processamento e tornar a execução do código mais eficiente.

Geralmente, o valor do `throttle` é ajustado de acordo com as características da tarefa em questão e do ambiente de execução, de forma a encontrar um equilíbrio entre precisão, eficiência e suavidade da atualização.

Exemplo:

```php
$Progress->throttle = 0.2;
```

### Precisão dos números exibidos

```php
object $Precision
```

É possível definir a quantidade de casas decimais da precisão dos números exibidos através da propriedade Objeto `Precision` que contém as seguintes propriedades:

`percent: int`: Quantidade de casas decimais para o percentual. Padrão: `2`.

`seconds: int`: Quantidade de casas decimais para os tempos decorridos e estimados. Padrão: `1`.

`rate: int`: Quantidade de casas decimais para a taxa de dados. Padrão: `0`.

Exemplos:

```php
$Progress->Precision->percent = 2;
$Progress->Precision->seconds = 1;
$Progress->Precision->rate = 0;
```

## Templating

É possível compor um modelo (Template) de cada parte do componente Progress que será exibida na saída do Terminal.

Essa composição é feita definindo a posição onde cada parte irá ficar usandos os tokens de templates como mostrado no exemplo abaixo:

```php
$Progress->template = <<<'TEMPLATE'
@described;
@current;/@total; [@bar;] @percent;%
⏱️ @elapsed;s - 🏁 @eta;s - 📈 @rate; loops/s
TEMPLATE;
```

Cada token deve começar com o caractere `@` e terminar com o caractere `;`.

### Tokens de template

Segue abaixo o que cada token representa:

`@described;`: última descrição chamada pelo método `describe()`.

`@current;`: quantidade atual da operação em andamento.

`@total;`: quantidade total da operação em andamento.

`@percent;`: porcentagem atual alcançada da operação em andamento.

`@elapesed;`: tempo decorrido da operação em andamento.

`@eta;`: é uma sigla para "estimated time of arrival" que é o tempo estimado para completar a operação.

`@rate;`: taxa de dados da operação por segundo.

`@bar;`: subcomponente Bar do componente Progress.

## Uso

### Iniciando um novo progresso

O método `start()` deve ser chamado para iniciar um novo progresso:

```php
$Progress->start();
```

### Atualizando o progresso

```php
advance (int $amount = 1)
```

O método `advance()` deve ser chamado sempre que houver uma mudança no progresso da operação.
Seu uso é comum dentro de um loop `while`, `for`, etc.

Exemplo:

```php
$Progress->advance(2);
```

### Descrevendo o progresso

```php
describe (string $description)
```

O método `describe()` pode ser chamado a qualquer momento para atualizar a descrição do progresso.

Exemplo:

```php
$Progress->describe('Processando arquivo 3...');
```

### Finalizando o progresso

```php
finish ()
```

O método `finish()` deve ser chamado para finalizar o progresso da operação:

```php
$Progress->finish();
```

Ao chamar este método, o cursor, que fica oculto durante a renderição do progresso, é mostrado novamente.
