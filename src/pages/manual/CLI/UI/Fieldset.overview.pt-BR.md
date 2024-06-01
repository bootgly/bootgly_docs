# Documentação da Classe Fieldset

A classe `Fieldset` oferece uma maneira elegante e simples de criar quadros com título e conteúdo no terminal. Este componente é uma excelente escolha para apresentar informações de forma estruturada e clara.

## Instância

Para utilizar a classe `Fieldset`, é necessário acessar uma instância da classe `Output`, que faz parte da classe `Terminal`, que por sua vez pode ser acessada através da classe estática `CLI`, como mostrado a seguir:

```php
use const Bootgly\CLI;
use Bootgly\CLI\UI\Fieldset\Fieldset;

$Output = CLI->Terminal->Output;

$Fieldset = new Fieldset($Output);
```

## Configurações

### Propriedades

A classe `Fieldset` permite que você personalize várias configurações para criar um quadro personalizado no terminal. Seguem as configurações disponíveis:

`width`: Define a largura do quadro.

`color`: Define a cor do quadro e do texto.

`borders`: Contém os caracteres usados para desenhar as bordas do quadro.

## Uso

### Definindo o Título

A propriedade `title` pode ser configurada para dar um título ao seu fieldset. O título é exibido na parte superior do quadro. Ao definir o título, ele é automaticamente tratado e escapado para ser exibido corretamente no terminal.

Exemplo:

```php
$Fieldset->title = "Meu Título";
```

### Configurando Bordas

```php
public function border(string $position, ? int $length = null)
```

Com este método, você pode renderizar bordas individuais do fieldset. Especifique a posição (`'top'`, `'left'`, `'right'`, `'bottom'`) e opcionalmente um comprimento.

Exemplo:

```php
$Fieldset->border('top', 20);
```

### Separando Conteúdo

```php
public function separate(int $length)
```

Utilize o método `separate` para inserir uma linha de separação horizontal dentro do conteúdo do seu fieldset. O parâmetro `$length` especifica o comprimento da linha de separação.

Exemplo:

```php
$Fieldset->separate(20);
```

### Renderizando o Fieldset

```php
public function render(int $mode = self::WRITE_OUTPUT)
```

O método `render` é o responsável por desenhar o quadro no terminal, com todas as configurações aplicadas. Este é o momento onde seu fieldset realmente ganha vida. Ao chamá-lo, todas as bordas, título e conteúdo são apresentados no terminal.

Exemplo:

```php
$Fieldset->render();
```

### Exemplo Completo

Aqui está um exemplo completo de uso da classe `Fieldset`, do início ao fim:

```php
use const Bootgly\CLI;
use Bootgly\CLI\UI\Fieldset\Fieldset;

$Output = CLI->Terminal->Output;

$Fieldset = new Fieldset($Output);
$Fieldset->title = "Meu Fieldset";
$Fieldset->content = "Este é o conteúdo do meu fieldset.\nPosso ter várias linhas.\n@---;\nE incluso linhas separadoras.";
$Fieldset->width = 50;
$Fieldset->color = '@#Green:';
$Fieldset->render();
```
