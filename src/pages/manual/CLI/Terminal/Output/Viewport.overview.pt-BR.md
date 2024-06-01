# Viewport

A classe Viewport é responsável pela manipulação do viewport (área visível) do Terminal.

## Instância

Para utilizar a classe Viewport, é necessário acessar o objeto Terminal, que por sua vez contém o objeto Output que contém o objeto Viewport.

```php
use const Bootgly\CLI;

$Output = CLI->Terminal->Output;

$Viewport->Output;
```

## Configurações

Esta classe não possui configurações adicionais.

## Uso

### Panorâmica para baixo

```php
panDown (int $lines = null) : Output
```

Método utilizado para rolar a tela do Terminal para baixo.

Exemplo:

```php
$Viewport->panDown(lines: 5);
```

### Panorâmica para cima

```php
panUp (int $lines = null) : Output
```

Método utilizado para rolar a tela do Terminal para cima.

Exemplo:

```php
$Viewport->panUp(lines: 3);
```

**Observações:**

Diferenças entre o pan down / up e o scroll do mouse:

Suponhamos que você utiliza o método para realizar um "pan down" (ou scroll up) no viewport do Terminal. Quando esse método é utilzado, o Terminal move o conteúdo da janela para cima, expondo uma nova área vazia na parte inferior da janela. Esse movimento da janela cria a ilusão de que o conteúdo do Terminal está se movendo para baixo, mas na realidade, é a janela que está se movendo para cima. Isso permite que o usuário veja o conteúdo anterior que estava oculto na parte inferior da janela. Essa é a razão pela qual o movimento para cima da janela é às vezes chamado de "pan down", mesmo que o conteúdo anterior esteja sendo exibido na parte superior da janela.

É importante notar que esse método não rola o conteúdo do Terminal como uma rolagem com o scroll do mouse. Em vez disso, ele move a janela do Terminal para cima, expondo conteúdo anterior que estava oculto na parte inferior da janela. Se houver mais conteúdo do que a janela pode exibir, o conteúdo mais antigo pode ser perdido à medida que é movido para fora da janela.

Por outro lado, a rolagem com o scroll do mouse permite que o usuário role o conteúdo do Terminal para cima ou para baixo de forma suave e controlada. Isso permite que o usuário visualize todo o conteúdo do Terminal, incluindo o conteúdo mais antigo que está fora da janela atual.
