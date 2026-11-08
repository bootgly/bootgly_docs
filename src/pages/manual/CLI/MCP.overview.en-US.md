# MCP over stdio

`Bootgly\CLI\MCP` serves an **[MCP server](/manual/API/RPC/MCP/overview/)** over the Model Context
Protocol's **stdio** transport — the one an MCP client (an IDE, a desktop assistant) uses when it
launches your server as a child process: it writes JSON-RPC messages to the process's stdin and
reads the answers from its stdout, one message per line.

## Serve MCP from a command

Build the server core with your tools and hand it to the transport inside a
**[command](/manual/CLI/Commands/overview/)**. `serving()` answers every line until the client
closes stdin:

```php
<?php
namespace projects\commands;

use stdClass;

use Bootgly\API\RPC;
use Bootgly\CLI\Command;
use Bootgly\CLI\MCP;


class MCPCommand extends Command
{
   // * Data
   public string $name = 'mcp';
   public string $description = 'Serve the MCP tools over stdio';


   public function run (array $arguments = [], array $options = []): bool
   {
      $Server = new RPC\MCP(
         name: 'Notes',
         version: '1.0.0',
         Lister: fn (): array => [
            ['name' => 'count', 'description' => 'How many notes there are.', 'inputSchema' => ['type' => 'object', 'properties' => new stdClass]]
         ],
         Caller: fn (string $name, array $arguments): array => [
            'content' => [['type' => 'text', 'text' => '3 notes.']],
            'isError' => false
         ]
      );

      // @ Until the client closes stdin
      return (new MCP($Server))->serving() === 0;
   }
}
```

Register the command as any other, then tell the client how to start it — your project's
`bootgly` script with the command name. For example, in a client's `mcpServers` configuration:

```json
{
   "mcpServers": {
      "notes": {
         "command": "/path/to/your/project/bootgly",
         "args": ["mcp"]
      }
   }
}
```

The class is named `MCP`, like the server core. Import the core's namespace instead of its
class — `use Bootgly\API\RPC;` and `new RPC\MCP(…)` — and both names stay free of aliases.

## What goes where

- **stdin** carries newline-delimited JSON-RPC: one message (or batch) per line, `\n` or `\r\n`.
  Blank lines are skipped; the last line may end without a newline.
- **stdout** carries the answers, one line each, and nothing else. Notifications get no line.
- **stderr** carries every diagnostic.

Anything a tool prints while it runs — `echo`, `print`, `var_dump`, an output buffer it left
open, flushed or tried to end, an error printed before the process dies — is captured and moved
to stderr, so a stray debug line can never corrupt the protocol. Errors PHP displays are
displayed on stderr too (with `display_errors` off they stay hidden), and the capture stays in
place after `serving()` returns: whatever the command prints next lands on stderr as well. What bypasses PHP's output is not captured: writes to the
`STDOUT` stream or to `php://stdout` (`fwrite(STDOUT, …)`, a log handler built on them) and child
processes that inherit stdout (`proc_open`/`exec` without redirecting it). Point loggers at
`STDERR` in a stdio process and redirect what a child prints.

```bash
printf '%s\n' \
   '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"shell","version":"1"}}}' \
   '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
   '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"count"}}' \
   | bootgly mcp
# {"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2025-06-18","capabilities":{"tools":{"listChanged":false}},"serverInfo":{"name":"Notes","version":"1.0.0"}}}
# {"jsonrpc":"2.0","id":2,"result":{"content":[{"type":"text","text":"3 notes."}],"isError":false}}
```

## Who is calling

A stdio process serves one client: the user who started it. Resolve who that is once — from an
environment variable the client configuration sets, for instance — and pass it as `context`. It
reaches each of your closures as its last argument:

```php
use Bootgly\API\Security\Identity;

$Identity = Tokens::resolve((string) getenv('NOTES_TOKEN'));
// ? No valid token: refuse to start
if ($Identity === null) {
   fwrite(STDERR, "NOTES_TOKEN is missing or invalid\n");

   return false;
}

return (new MCP($Server, context: $Identity))->serving() === 0;
```

## Limits and shutdown

- A line longer than `line` bytes (4 MiB by default; the `\n` or `\r\n` ending is not counted)
  is discarded whole and answered once with `-32600 Invalid Request` (`id: null`), with a note
  on stderr; the next line is served.
- End of stdin ends the loop: `serving()` returns `0`. When stdout can no longer be written
  (the client went away), it stops and returns `1`.
- The loop blocks on stdin: the process serves its one client and nothing else.

## Reference

```php
public function __construct (
   RPC\MCP $Server,
   mixed $context = null,
   int $line = 4_194_304,
   $input = STDIN,
   $output = STDOUT,
   $error = STDERR
)
```

Creates the transport for one server core. `$context` is handed to every call; `$line` is the
longest line accepted, in bytes; `$input`, `$output` and `$error` are the message, answer and
diagnostic streams — the process's own by default, any stream resource otherwise (an in-memory
stream in a test). Throws `InvalidArgumentException` for a `$line` below `1` or a stream that is
not a resource.

```php
public function serving (): int
```

Serves the client until stdin ends: reads one line at a time, answers it through the server core
and writes the answer line to stdout. Returns `0` at end of input, `1` when stdout cannot be
written.

```php
public private(set) RPC\MCP $Server;
```

The server core this process serves.

```php
public private(set) mixed $context;
```

What every call receives as its context.

```php
public private(set) int $line;
```

The longest line accepted, in bytes (the newline excluded).
