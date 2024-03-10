# Mouse Reporting

Mouse Reporting ou Mouse Tracking é um recurso que permite que os terminais de interface de linha de comando (CLI) recebam eventos de entrada do mouse, como `movimento`, `clique` e `rolagem`. Isso pode ser útil para interagir com aplicações baseadas em texto que suportam o uso do mouse, como editores de texto, gerenciadores de arquivos, jogos e menus.

Para habilitar o Mouse Reporting, é necessário enviar uma sequência de controle especial para o terminal, que depende do tipo de terminal e do modo de rastreamento desejado. Existem vários modos de rastreamento, como `X10`, `X11`, `SGR` e `URXVT`, que diferem na forma como os eventos do mouse são codificados e reportados. Alguns terminais também suportam modos de rastreamento estendidos, que permitem coordenadas maiores do que 223 ou 95, dependendo do protocolo.

Para desabilitar o Mouse Reporting, é necessário enviar outra sequência de controle especial para o terminal, que também depende do tipo de terminal e do modo de rastreamento usado. É importante desabilitar o Mouse Reporting quando a aplicação não precisar mais dele, para evitar interferências com outros programas ou comandos.

Alguns exemplos de terminais que suportam Mouse Reporting são `xterm`, `Tabby`, `Konsole`, `gnome-terminal`, `eterm` e outros emuladores de terminal baseados no sistema X Window3. No console virtual do Linux, é necessário executar o gpm (8) para habilitar o Mouse Reporting. Algumas aplicações que usam Mouse Reporting são `midnight-commander`, `tmux`, `vim`, `emacs` e `htop`.

## Instância

No Bootgly, temos um Code API de fácil entendimento que abstrai os códigos de escape ANSI que são utilizados e enviados para o terminal para ativação e desativação do Mouse Reporting.

Antes de tudo, você precisará usar as classes Input e Output do CLI para usar como composição. Para isso, você pode usar a classe `Bootgly\CLI` para obter uma instância estática da classe CLI e então ter acesso às classes Input e Output. Em seguida, crie uma instância da classe Mouse conforme exemplo abaixo.

```php
use Bootgly\CLI;
use Bootgly\CLI\Terminal\Reporting\Mouse;

$Input = CLI::$Terminal->Input;
$Output = CLI::$Terminal->Output;

$Mouse = new Mouse($Input, $Output);
```

## Configurações

A classe Mouse possui duas propriedades booleanas que podem ser configuradas para estender sua funcionalidade:

### SGT

Trata-se de uma propriedade booleana que ativa ou desativa o modo de extensão `SGR`. Por padrão, é ativado.

```php
$Mouse = new Mouse($Input, $Output);
$Mouse->SGT = false;  // Desativa o modo de extensão SGR
```

### URXVT

É outra propriedade booleana que liga ou desliga o modo de extensão `URXVT`. Ela também é ativada por padrão.

```php
$Mouse = new Mouse($Input, $Output);
$Mouse->URXVT = false;  // Desativa o modo de extensão URXVT
```

## Uso

Agora, vamos explorar os métodos que essa classe fornece para uso.

### Habilitando ou desabilitando o Mouse Reporting

```php
report (bool $enabled)
```

Este método é usado para ligar ou desligar o Mouse Reporting e controlar o recebimento dos eventos do mouse. Ele recebe um valor booleano como argumento. Se o valor for `true`, o relatório de eventos do mouse será habilitado. Se `false`, será desabilitado.

```php
$Mouse = new Mouse($Input, $Output);
$Mouse->report(true); // Habilita relatórios de eventos do mouse
```

Ao ativar o modo `reporting` do Mouse, o Terminal passa a receber direto na entrada de dados do Terminal, os dados do mouse e com isso é possível monitorar em tempo real:

1) Movimentos do mouse e saber em qual coluna e linha ele está sobre o terminal;
2) Cliques do mouse realizados, bem como se o botão está sendo clicado ou não;
3) Rolagem do mouse e saber se está rolando para cima ou para baixo;
4) Todas as ações acima em conjunto com teclas.

### Mouse Reporting em tempo real

```php
reporting (\Closure $Callback) : void
```

Este método processa os dados de eventos do mouse gerados em tempo real. Ele recebe uma função callback que será invocada para cada evento relatado. A função callback recebe três argumentos: a ação do mouse, as coordenadas coluna, linha e um flag indicando se o botão do mouse está sendo pressionado ou liberado (`false`).

#### Callback

```php
function (Bootgly\CLI\Terminal\Input\Mousestrokes $Action, array $coordinate, bool $clicking) : bool
```

##### Parâmetros

`Mousestrokes $Action`

Recebe a ação do mouse mapeada pelo enum Mousestrokes.

`array $coordinate`

Recebe as coordenadas do mouse definidos por coluna e linha no Terminal.

`bool $clicking`

Recebe um booleano indicando se qualquer botão do mouse está sendo pressionado ou não.

##### Retorno

A função callback retorna um booleano indicando se o loop para o "reporting" deve continuar ou não. Esse controle é ideal caso você precise parar o reporting em algum momento da sua lógica.

##### Exemplo

```php
use Bootgly\CLI\Terminal\Input\Mousestrokes;

$Mouse->reporting(function (Mousestrokes $Action, array $coordinate, bool $clicking) {
   [$col, $row] = $coordinate;
   $action = $Action->name;

   echo "Mouse {$action} at [$col, $row], button is " . ($clicking ? "down" : "up") . PHP_EOL;

   if ($Action === Mousestrokes::RIGHT_CLICK) {
      return false;
   }

   return true;
});
```

O exemplo acima deverá ter como saída no terminal algo como:

```txt
Mouse NONE_CLICK_WITH_MOVEMENT at [58, 28], button is up
Mouse NONE_CLICK_WITH_MOVEMENT at [58, 27], button is up
Mouse NONE_CLICK_WITH_MOVEMENT at [57, 27], button is up
Mouse NONE_CLICK_WITH_MOVEMENT at [56, 27], button is up
Mouse NONE_CLICK_WITH_MOVEMENT at [55, 27], button is up
Mouse NONE_CLICK_WITH_MOVEMENT at [55, 26], button is up
Mouse NONE_CLICK_WITH_MOVEMENT at [54, 26], button is up
Mouse NONE_CLICK_WITH_MOVEMENT at [53, 26], button is up
Mouse NONE_CLICK_WITH_MOVEMENT at [52, 26], button is up
Mouse NONE_CLICK_WITH_MOVEMENT at [51, 26], button is up
Mouse NONE_CLICK_WITH_MOVEMENT at [50, 26], button is up
Mouse NONE_CLICK_WITH_MOVEMENT at [49, 26], button is up
Mouse NONE_CLICK_WITH_MOVEMENT at [49, 27], button is up
Mouse NONE_CLICK_WITH_MOVEMENT at [48, 27], button is up
Mouse LEFT_CLICK at [48, 27], button is down
Mouse LEFT_CLICK at [48, 27], button is up
Mouse LEFT_CLICK at [48, 27], button is down
Mouse LEFT_CLICK_WITH_MOVEMENT at [48, 27], button is down
Mouse LEFT_CLICK_WITH_MOVEMENT at [48, 28], button is down
Mouse LEFT_CLICK_WITH_MOVEMENT at [47, 28], button is down
Mouse LEFT_CLICK_WITH_MOVEMENT at [47, 29], button is down
Mouse LEFT_CLICK_WITH_MOVEMENT at [46, 29], button is down
Mouse LEFT_CLICK_WITH_MOVEMENT at [46, 30], button is down
Mouse LEFT_CLICK_WITH_MOVEMENT at [46, 31], button is down
Mouse LEFT_CLICK_WITH_MOVEMENT at [45, 31], button is down
Mouse LEFT_CLICK at [45, 31], button is up
Mouse NONE_CLICK_WITH_MOVEMENT at [45, 31], button is up
Mouse NONE_CLICK_WITH_MOVEMENT at [44, 31], button is up
Mouse NONE_CLICK_WITH_MOVEMENT at [43, 31], button is up
Mouse RIGHT_CLICK at [43, 31], button is down
```
