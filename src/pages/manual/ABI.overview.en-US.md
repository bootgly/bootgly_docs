# The base of Bootgly

ABI — the **Abstract Bootable Interface** — is the first layer of the framework and the one
everything else stands on. Files, processes, templates, events, caching, string and array
primitives: whatever the higher layers need before they can be a web server or a console
app lives here.

Its defining property is what it is *not* allowed to know. ABI depends on nothing above it —
not ACI, not ADI, not the API, not the CLI or the WPI. Dependencies flow one way
(`ABI → ACI → ADI → API → CLI → WPI`), so ABI can be read, tested and reasoned about on its
own, and a change in the HTTP server can never reach down into it.

## You mostly use it without naming it

This is the difference between ABI and the layers above. You open a database because you
decided to; you use ABI because rendering a view, reading a file or serving a request
already does. Most applications never write `use Bootgly\ABI\...` at all.

So read this page as a map of what the framework is made of, not as a list of things to go
and call.

## What is inside

| Area | What it covers |
|---|---|
| **Code** | Language primitives — `__Array` (chained array operations in one pass) and `__String` (encoding-aware strings, paths, markdown, themes, PHP tokenizing, ANSI escapes) |
| **Templates** | The template engine: directives, sections, loops and escaping |
| **IO** | The filesystem (`FS`) and inter-process pipes (`IPC`) |
| **Resources** | Cache and storage drivers behind one interface each |
| **Events** | The emitter every layer publishes through |
| **Data** | `Language` for i18n, `Registry`, and the `RESP` protocol codec |
| **Debugging** | Backtraces, the error page, the dumper and the shutdown handler |
| **Differ** | The text-diff engine, with pluggable calculators and outputs |
| **Syntax** | PHP builtins and import handling, used by the linter |
| **Configs** | The enum mixins configuration objects are built from |

## The part you do reach for

`__Array` is the one piece of ABI written to be called directly from application code,
because it is measurably faster than the native idiom it replaces:

```php
use Bootgly\ABI\Code\__Array;

new __Array($users)->filter($Active)->map($Name)->collect();
```

That chain runs every stage in a single pass — no intermediate array per stage — and stops
early when you only want the first match. See **[__Array](/manual/ABI/Code/__Array/overview/)**
for the full API and the measurements behind it.

## Reference

- **[__Array](/manual/ABI/Code/__Array/overview/)** — the array Code API: chained
  operations, early-exit terminals and reusable pipelines.

The remaining areas are documented as their pages land. Until then the source is the
reference: every entity lives under `Bootgly/ABI/` in the framework repository, mirroring
the table above.
