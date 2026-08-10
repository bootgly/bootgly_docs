# Security

This page is for security researchers and engineers auditing Bootgly. It tells you where to
report, what is in scope, how to get a target running, and — most usefully — how to turn a
suspected issue into a reproducible PoC inside the framework's own test runner.

If you only need the reporting address: **cybersec@bootgly.com**, private, no public issue.

## Report a vulnerability

Send suspected vulnerabilities to **cybersec@bootgly.com**. Do not open a public GitHub issue
for anything exploitable.

Include:

- **Component** — layer + class, e.g. `WPI/Nodes/HTTP_Server_CLI/Decoders/Decoder_Chunked`
- **Reproduction** — steps, or better, a PoC (see below for the format we use internally)
- **Impact you assess** — DoS, info leak, auth/framing bypass, RCE, privilege escalation
- **Version/commit** tested against

You get an acknowledgement within 48 hours and progress updates while we investigate.

**Disclosure:** coordinated. We ask you to hold public disclosure until a fix ships, or
**90 days** from your report, whichever comes first. Once the fix is out we credit you in the
release notes unless you prefer anonymity.

There is no bug bounty today. A program may follow after 1.0.

## Scope

**In scope** — the framework core (`bootgly/bootgly`) and the platform repos
(`bootgly-console`, `bootgly-web`): protocol decoders/encoders, routing, middlewares,
session/auth, database drivers, and every other native component in those repositories.

**Out of scope** — `bootgly_website`, `bootgly_docs`, `bootgly_benchmarks`, `bootgly_awesome`
and tooling repos, unless the bug leads back into the framework core. Denial-of-service
testing against shared infrastructure (the website, benchmark hosts, CI) and
social-engineering or physical attacks are always out of scope.

## Get a target running

A local server is the fastest target. Nothing here needs Docker or root:

```bash
git clone https://github.com/bootgly/bootgly
cd bootgly
./bootgly project Demo/HTTP_Server_CLI start
```

That binds an HTTP/1.1 + h2c server you can drive with raw sockets. For the TLS and AutoTLS
surface, see the [Auto-TLS](/auto-tls) guide — `staging: true` points issuance at the Let's
Encrypt staging CA so you never burn rate limits while testing.

Two things worth knowing before you start poking:

- Bootgly is **zero-dependency**. There is no third-party package in the trust boundary, so
  every parser, every crypto call and every socket path is framework code you can read.
- The server is **multi-process and long-lived**. Workers persist across requests, so
  cross-request state bleed is a real and productive class to look for — several past
  findings were exactly that.

## Write the PoC as a native test

This is the part that matters most, and it is what makes a report actionable for us.

Bootgly has its own test framework, and every confirmed security finding lives as a
permanent regression in the HTTP server's security suite:

```text
Bootgly/WPI/Nodes/HTTP_Server_CLI/tests/Security/NN.MM-snake_case_description.Test.php
```

A security PoC there follows one rule: **it must fail on the vulnerable code with an explicit
finding diagnostic, and pass once the fix lands.** That single property is what separates a
finding from a hypothesis.

### Use the primitive API, not the advanced one

Bootgly's test suite exposes several API levels on purpose. For a PoC, use the **most
primitive one** — the `Test` form below, where you return a raw request string and
your assertion returns `true` or a failure message.

That is not a shortcut, it is the right tool. A PoC exists to *prove something, whatever it
takes*: you may need to open raw sockets, fork processes, write files, drive a second protocol,
or reproduce a race. The higher-level assertion API is expressive and tidy, but it constrains
you to what its vocabulary can express — and a proof that has to fight its own harness usually
ends up proving less than it should.

The primitive form gives you a plain closure with full freedom, and reduces the entire verdict
to two values:

- return `true` → the guarantee holds
- return a `string` → the guarantee is broken, and the string *is* your evidence

Write the diagnostic as the finding itself (`'CONFIRMED H1: ...'`), including the observed
bytes or state. When it fails, the runner prints exactly that — which is what a reviewer needs
in order to believe you.

Save the advanced API for ordinary feature tests, where the structure pays off. Here, freedom
of expression matters more than form.

The shape:

```php
<?php

use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Tests\Suite\Test;


$probe = ['error' => '', 'observed' => null];

return new Test(
   description: 'what the server must guarantee',

   // Runs client-side: drive raw sockets, spawn processes, record evidence.
   request: static function (string $hostPort, int $testIndex) use (&$probe): string {
      // ... open a socket to $hostPort, send your attack, record into $probe ...

      return "GET /harness HTTP/1.1\r\n"
         . "X-Bootgly-Test: {$testIndex}\r\n"
         . "Host: localhost\r\nConnection: close\r\n\r\n";
   },

   // The handler(s) this case installs.
   response: static function (Request $Request, Response $Response, Router $Router) {
      yield $Router->route('/harness', static function (Request $Request, Response $Response) {
         return $Response(body: 'HARNESS-OK');
      }, GET);
   },

   // Returns true to pass, or a string to fail with that message.
   test: static function (string $response) use (&$probe): bool|string {
      if (! str_contains($response, 'HARNESS-OK')) {
         return 'harness did not reach its handler';
      }

      if ($probe['observed'] === 'the-bad-thing') {
         return 'CONFIRMED: <what the server did that it must not>';
      }

      return true;
   },
);
```

Register the filename in that directory's `autoboot.php`, then run just your case:

```bash
AI_AGENT=1 bootgly test <suite> <case>
```

`AI_AGENT=1` prints machine-readable JSON, which is much easier to read than the TUI when you
are iterating. The suite index comes from the order in `tests/autoboot.php`.

### Controls are not optional

A PoC without controls proves nothing, and this is the most common weakness in a report.
Every case should answer: *if my attack leg had silently failed, would this test still look
like a confirmation?*

Include at minimum:

- **A positive control** — the legitimate version of the same operation must still succeed.
  If you propose a fix, this is what stops "reject everything" from passing.
- **A negative control** — a variant that the existing guards already handle must still be
  refused, so your finding is isolated to the actual gap.
- **A harness control** — the selected handler must have been reached, so a broken fixture
  cannot be mistaken for a vulnerable server.

A concrete example from a past finding: an overflowing chunk-size token smuggled a request,
but the case also proved that a *legitimate* chunked body still completed **and** still
pipelined its follower — otherwise a fix that simply broke pipelining would have "passed".

### Mutation-test your PoC

If your case passes on current code and you believe the issue is real, mutate the guard you
think is missing — delete the line, invert the condition — and re-run. If the case still
passes, the case is vacuous, not the code safe. We found one previously-reported issue that
was already closed exactly this way.

## What is already hardened

Before reporting, it is worth checking the closed audits — three holistic adversarial passes
have run against the network-facing surface, and their findings are listed with severities in
[`SECURITY.md`](https://github.com/bootgly/bootgly/blob/main/.github/SECURITY.md).

Broadly, these classes already have coverage and dedicated regressions:

- **Request framing** — `Content-Length`/`Transfer-Encoding` conflicts, chunk-size overflow,
  bare-LF in the head, non-`tchar` field names, request-head size caps, protocol-token
  validation
- **Cross-request state** — decoder caches, per-connection request reuse, deferred (Fiber)
  execution context, session regeneration and CSRF rotation
- **HTTP/2** — rapid reset (CVE-2023-44487) including flow-stalled streams, outbound backlog
  budgets, HPACK validation, pseudo-header and flow-control conformance
- **Resource exhaustion** — connection ceilings, body/multipart caps, aggregate upload disk
  budgets, byte-range amplification
- **Privileged boot** — the AutoTLS store handoff, helper process identity, and ACME egress
  (origin policy, redirect denial, address classification)

Finding a *new* angle on any of these is welcome — the point is that a report saying "there
is no rate limit" or "chunked bodies are unbounded" will already be covered.

## Reference

### Reporting

```text
cybersec@bootgly.com
```

Private disclosure address. Acknowledged within 48 hours; coordinated disclosure at fix
release or 90 days, whichever is first.

### Running the security suite

```bash
AI_AGENT=1 bootgly test <suite> <case>
```

Runs a single case in the framework's native runner. `AI_AGENT=1` switches the output to JSON.
Omit `<case>` to run the whole suite, or omit both to run every registered suite.

The HTTP server's security suite is registered **commented out** in `tests/autoboot.php` so a
plain `bootgly test` does not run adversarial payloads by default. Enable it locally while you
work, and restore the comment before committing.

### Hardening knobs worth reviewing in a deployment

```php
$Server->configure(
   host: '0.0.0.0',
   port: 443,
   workers: 8,
   maxConnections: 10000,
   maxConnectionsPerIP: 100,
   requestMaxBodySize: 8 * 1024 * 1024,
   requestMaxFileSize: 4 * 1024 * 1024,
   downloadsMaxBytesOnDisk: 512 * 1024 * 1024
);
```

Connection ceilings and body/upload caps are per-deployment capacity decisions. The framework
ships safe defaults, not infinite capacity — size them for your traffic profile.

```php
Request::$allowedHosts = ['example.com', 'www.example.com'];
```

Host allowlist. With it set, a request whose `Host` authority is not listed is refused before
routing, which also blocks host-header poisoning into absolute-URL generation.

```php
new TrustedProxy(/* ... */)
```

Only enable proxy-header trust for proxies you actually control. Left disabled,
`$Request->address` stays the kernel-observed peer and cannot be spoofed by a client header.

### Where the evidence lives

```text
Bootgly/WPI/Nodes/HTTP_Server_CLI/tests/Security/
```

Every confirmed finding's PoC, retained as a permanent regression. Reading these is the fastest
way to learn both the attack surface and the assertion style we expect in a report.

```text
docs/reports/security/
```

Full audit reports — threat model, per-finding analysis, the evidence class behind each claim,
and the remediation applied. Findings that closed a primary path while scoping out a narrower
related surface say so explicitly rather than absorbing it silently.
