# Terminal Input - showcase

Aqui você encontra exemplos de uso da classe `Input` do `Terminal`.

## Instância

Para utilizar a classe `Input`, é necessário acessá-la através da classe `CLI`, como demonstrado no exemplo abaixo:

```php
use const Bootgly\CLI;

$Input = CLI->Terminal->Input;
```

## Configurações

Exemplos de configurações:

### Modo blocking, canonical e echo desabilitados

```php
$Input->configure(blocking: false, canonical: false, echo: false);
```

Ao usar o Input dessa forma, você configura o Terminal para receber os dados de forma automática conforme eles vão sendo digitado pelo usuário. Cada caractere é recebido e já colocado na entrada sem passar por um buffer.

Utilize um loop para processar a entrada de dados (veja exemplo abaixo).

Para resetar todas as configurações do Terminal para o padrão, basta chamar o configure sem passar nenhum argumento:

```php
$Input->configure();
```

## Uso

### Lendo dados com reading()

```php
reading(\Closure $CAPI, \Closure $SAPI)
```

Exemplo de uma implementação do método `reading`:

```php
use const Bootgly\CLI;


$Input = CLI->Terminal->Input;
$Output = CLI->Terminal->Output;


$Output->render(<<<OUTPUT
/* @*:
 * @#green: Bootgly CLI Terminal (<<) - reading method @;
 * @#yellow: @@ Demo - Example #1 @;
 * {$location}
 */\n\n
OUTPUT);


$Input->reading(
   // Terminal Client API
   CAPI: function ($read, $write) // Client Input { $read, $write }
   use ($Output)
   {
      // * Config
      $expire = true;
      $timeout = 20; // total timeout in seconds since client was started
      // @ Mode
      $secret = false;
      $hidden = false;
      // * Data
      $line = '';
      $decoded = '';
      // * Meta
      $started = microtime(true);
      // @ ANSI Code
      $decoding = false;

      $Output->render("@:info: Type any character (even special characters)...\n");
      $Output->render("@:info: Type `enter` to send to Terminal Server... @;\n");
      $Output->render("@:info: Type `*` or `#` to toggle the input mode to secret/hidden... @;\n\n");

      while (true) {
         // @ Autoread each character from Terminal Input (in non-blocking mode)
         // This is as if the terminal input buffer is disabled
         $char = $read(length: 1); // Only length === 1 is acceptable (for now)

         // @ Check timeout
         if ($expire && (microtime(true) - $started) > $timeout) {
            echo "Client: `Terminal Input timeout! Closing Client...`\n\n";
            exit(0);
         }

         // @ Parse char
         // No data
         if ($char === '') {
            $write(data: $char); // No effect
            usleep(100000);
            continue;
         }
         // ANSI Code
         if ( $char === "\e" || ($decoding && $char === '[') ) {
            $decoding = true;
            $char = '';
            continue;
         }
         // EOL
         if ($char === "\n") {
            // @ Write user data to Terminal Input (Client => Server)
            $write(data: $line);
            $line = '';
            continue;
            #break;
         }
         // ...

         // @ Toggle modes
         if ($char === '*') {
            $secret = ! $secret;
            continue;
         } else if ($char === '#') {
            $hidden = ! $hidden;
            continue;
         }

         // @ Parse Output
         if ($line === '') {
            $Output->write("\nClient: ");
         }

         $line .= $char;

         if ($hidden) continue;
         else if ($secret) $char = '*';

         if ($decoding) {
            $decoded = match ($char) {
               'A' => '⬆️',
               'B' => '⬇️',
               'C' => '➡️',
               'D' => '⬅️',
               default => ''
            };

            $decoding = false;

            $decoded ? $Output->write($decoded) : $Output->metaencode($char);

            continue;
         }

         $Output->metaencode($char);
      }
   },
   // Terminal Server API
   SAPI: function ($reading) // Server Input { $reading }
   use ($Output)
   {
      // * Config
      $timeout = 12000000; // in microseconds (1 second = 1000000 microsecond)

      // You can use while before $reading!

      // @ Reading input data from the Client Terminal
      foreach ($reading(timeout: $timeout) as $data) {
         // @ Write user data to Terminal Output (Server => Client)
         if ($data === null) {
            $Output->write(data: "Server: `No data received from Client. Timeout reached?`\n");
         } else if ($data === false) {
            $Output->write(data: "Server: `Unexpected data! Client is dead?`\n");
         } else {
            $Output->render(data: "\nServer: `You entered: @#cyan:" . json_encode($data) . " @;`\n\n");
         }
      }

      $Output->write(data: "Closing Server...`\n\n");
   }
);
```
