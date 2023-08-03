# TCP Client

## Exemplo de Uso

```php
use Bootgly\Web\TCP;
use Bootgly\Event\Timer;

$TCPClient = new TCP\Client(
   TCP\Client::MODE_MONITOR
);

$TCPClient->configure(
   host: '127.0.0.1',
   port: getenv('PORT') ? getenv('PORT') : 8080,
   workers: 1
);

$TCPClient->on(
   instance: function ($Client) {
      $Socket = $Client->connect();

      if ($Socket) {
         TCP\Client::$Event->loop();
      }
   },

   connect: function ($Socket, $Connection) {
      Timer::add(
         interval: 10,
         handler: function ($Connection) {
            $Connection->close();
         },
         args: [$Connection],
         persistent: false
      );

      $Connection::$output = "GET / HTTP/1.1\r\nHost: localhost:8080\r\n\r\n";

      TCP\Client::$Event->add($Socket, TCP\Client::$Event::EVENT_WRITE, $Connection);
   },

   disconnect: function ($Connection) use($TCPClient) {
      $TCPClient->log('Connection #' . $Connection->id . ' (' . $Connection->ip . ':' . $Connection->port . ')'
                      . ' from Worker with PID @_' . $TCPClient->Process->id . '_@ was closed! @\;');
   },

   write: function ($Socket, $Connection, $Package) {
      TCP\Client::$Event->add($Socket, TCP\Client::$Event::EVENT_READ, $Connection);
   },

   read: null,
);

$TCPClient->start();
```
