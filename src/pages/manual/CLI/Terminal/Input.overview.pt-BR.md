# Terminal Input

A classe `Input` é responsável por prover métodos para lidar com a entrada de dados no Terminal. Ela é utilizada internamente pela classe `Terminal`, que por sua vez é acessada pela classe `CLI`.

## Instância

Para utilizar a classe `Input`, é necessário acessá-la através da classe `CLI`, como demonstrado abaixo:

```php
use const Bootgly\CLI;

$Input = CLI->Terminal->Input;
```

## Configurações

```php
configure (bool $blocking = true, bool $canonical = true, bool $echo = true, bool $signals = true) : Input
```

A classe `Input` pode ser configurada através do método `configure()`, que recebe quatro parâmetros booleanos para definir as configurações de entrada do terminal:

- `bool $blocking`:
define se a entrada deve ser bloqueante ou não;
- `bool $canonical`:
define se deve usar ou não o modo canonical de processamento da entrada. Em geral, o modo canonical permite que a entrada seja lida uma linha por vez. Quando o usuário pressiona Enter, todo o conteúdo digitado é retornado;
- `bool $echo`:
define se deve exibir o que o usuário digita na tela ou não;
- `bool $signals`:
define se o terminal gera sinais (`Ctrl+C` = SIGINT, ...) ou não. Quando desativado, essas teclas chegam como bytes raw (`\x03`, ...) legíveis pelo consumidor.

### Modo bloqueante

O modo `blocking` define se o fluxo de processamento do loop de leitura deve esperar ou não a leitura de dados do usuário antes de continuar. Caso a leitura seja bloqueante, o fluxo do loop é parado até que o usuário tenha feito alguma entrada de dados no Terminal.

### Modo canonical

O modo `canonical` permite a leitura de uma linha por vez e essa é a configuração padrão pra a maioria dos terminais. Com esse modo ativado, ao pressionar Enter, toda a linha digitada é colocada no Input. Porém, enquanto a linha não é completa, a função `read()` vai colocar cada caractere em um buffer, até que o usuário pressione Enter.

Caso o modo `canonical` esteja desativado (`false`), o método `read()` não vai esperar até que uma linha seja enviada pressionando Enter, e vai colocar cada caractere digitado na entrada de dados do terminal, ou seja, é como se o buffer de leitura da entrada do `Terminal` estivesse desativado.

### Modo echo

O modo `echo` trata a exibição do que o usuário digita na tela. Quando esse modo está ativado (`true`), tudo o que o usuário digita é exibido de volta na tela à medida em que ele digita. Quando esse modo está desativado (`false`), o que o usuário digita não é exibido na tela, ou seja, toda entrada de dados não é refletida de volta como um `echo`.

### Modo de teclado estendido

Algumas combinações não possuem nenhuma codificação legada: um terminal comum envia o mesmo byte CR para `Enter`, `Shift+Enter` e `Ctrl+Enter`, então nenhum parsing consegue distingui-las. A propriedade `extended` negocia o protocolo de teclado estendido — o `CSI u` do kitty mais o `modifyOtherKeys` do xterm — e é essa negociação que torna essas combinações reportáveis:

```php
$Input->extended = true;

$Input->configure(blocking: false, canonical: false, echo: false);
```

A propriedade é opt-in (padrão `false`) e deve ser definida **antes** de entrar em modo raw: é o `configure(canonical: false)` que escreve as sequências de habilitação, e a rede de restauração do terminal as desabilita novamente no shutdown — inclusive no `Ctrl+C`.

Ativá-la nunca muda o que o código existente compara: o `listen()` normaliza todo report estendido de volta à sua tecla legada, então `Ctrl+A` continua chegando como `\x01` e `↑` continua chegando como `\e[A`. Apenas as combinações que não possuem byte legado mantêm a forma do kitty — `Keystrokes::SHIFT_ENTER` (`\e[13;2u`) e `Keystrokes::CTRL_ENTER` (`\e[13;5u`), do [Keystrokes](/manual/CLI/Terminal/Input/Keystrokes/overview).

Ela permanece opt-in porque o suporte varia entre terminais e a negociação muda como o terminal codifica as teclas durante toda a sessão. Terminais que implementam um dos dois protocolos incluem kitty, ghostty, foot e WezTerm (`CSI u` do kitty) e xterm (`modifyOtherKeys`). Terminais que não implementam nenhum dos dois ignoram a negociação silenciosamente — ambas são sequências CSI de modo privado — então nenhuma consulta de capacidade é necessária.

## Uso

### Ler dados com read()

```php
read (int $length) : string | false
```

O método `read()` é responsável por ler os dados digitados pelo usuário. Ele recebe como parâmetro um inteiro que representa a quantidade máxima de bytes que devem ser lidos. O valor retornado pode ser uma string com os dados digitados ou `false` caso ocorra algum erro na operação.

### Lendo uma linha com scan()

```php
public function scan (): string|false
```

O método `scan()` lê uma única linha do stream de entrada — os bytes são consumidos até um terminador de linha (`\n` ou `\r`) ou EOF. Ele retorna a linha sem o terminador, ou `false` em EOF imediato. Funciona em TTYs e pipes, o que o torna a primitiva de leitura de linha por trás de componentes interativos como o [Question](/manual/CLI/UI/Components/Question/overview) e o [Form](/manual/CLI/UX/Components/Form/overview).

O `scan()` também atua como a line discipline do stream: teclas de apagar (Backspace / Delete) editam o buffer e, em terminais emulados — onde `BOOTGLY_TTY=1` é forçado pelo ambiente mas o stream não é um TTY real, então nenhum kernel ecoa o que você digita — ele faz self-echo da entrada conforme digitada (caracteres UTF-8 inteiros, sequências de apagar e quebras de linha). TTYs reais continuam ecoando no kernel e pipes permanecem silenciosos; a propriedade `Input->echo` sobrescreve a detecção automática.

### Lendo uma tecla com listen()

```php
public function listen (): string|false
```

O método `listen()` lê uma tentativa de tecla do stream e é o que todo componente interativo da CLI usa para ler teclas em modo raw. Ele retorna `false` quando o canal está fechado, uma string vazia quando o stream está drenado (nada digitado ainda, em streams não bloqueantes) e os bytes da tecla nos demais casos:

```php
use const Bootgly\CLI;
use Bootgly\CLI\Terminal\Input\Keystrokes;

$Input = CLI->Terminal->Input;

$Input->configure(blocking: false, canonical: false, echo: false);

while (true) {
   $key = $Input->listen();

   // ? Canal fechado
   if ($key === false) {
      break;
   }
   // ? Drenado — nada digitado ainda
   if ($key === '') {
      usleep(50000);

      continue;
   }
   // ? Ctrl+D finaliza
   if ($key === Keystrokes::CTRL_D->value) {
      break;
   }
}

$Input->configure(blocking: true, canonical: true, echo: true);
```

As teclas sempre chegam inteiras: sequências de escape CSI e SS3 são lidas até seu byte final e bytes líderes UTF-8 montam seus bytes de continuação. É por isso que sequências maiores que três bytes — `Delete` (`\e[3~`), `Page Up` / `Page Down` (`\e[5~` / `\e[6~`), `Ctrl`+setas (`\e[1;5A`, ...) — e `Home` / `End` em modo de aplicação (`\eOH` / `\eOF`) nunca são divididas entre leituras.

O stream deve ser não bloqueante (veja [Configurações](#configuracoes)) — em um stream bloqueante um `Escape` puro trava a desambiguação até o próximo byte chegar. Reports do protocolo de teclado estendido são normalizados de volta à sua tecla legada antes de serem retornados (veja [Modo de teclado estendido](#modo-de-teclado-estendido)).

### Lendo dados com reading()

```php
reading (\Closure $CAPI, \Closure $SAPI)
```

A classe `Input` também possui um método chamado `reading()`, que é utilizada para interagir com o usuário em tempo real.
No Bootgly se o nome do método estiver usando o gerúndio, é sinal que o método implementa um loop dentro dele.

Esse método recebe duas funções de callback:

- `$CAPI`, que é a função de entrada (API do Client);
- `$SAPI`, que é a função de saída (API do Servidor);

O callback `CAPI` deve chamar a função de leitura `read()` assim que houver entrada de dados.
O callback `SAPI` deve ler o que o cliente envia e processar esses dados exibindo o conteúdo na tela ou não.

Este método cria uma interface básica local Client <-> Servidor, mas não possui implementação para roteamento de recursos, por isso no Bootgly ele é considerado uma interface somente, e não um node.
