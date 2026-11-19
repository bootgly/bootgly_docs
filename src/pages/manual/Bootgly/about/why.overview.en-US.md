# Why Bootgly?

Because the modern PHP stack became a tax — and Bootgly's bet is that you should not have to pay it.

This page explains the problems Bootgly exists to solve, how its design answers them, the numbers that back the claims, and — just as important — the trade-offs of that bet.

## The problem

Making PHP fast and maintainable today usually costs you on four fronts:

1. **Too many external adapters** — to get performance, teams stack Nginx in front, PHP-FPM behind it, supervisors around it and C extensions (Swoole, event loops) underneath. Every extra piece is one more thing to configure, monitor, upgrade and adapt to — and pay for;
2. **Supply-chain surface** — a typical application ships hundreds of `vendor/` packages to production. Each one has its own author, style, release cadence and vulnerabilities to track. Patch reaction time is bounded by the slowest third party;
3. **Too much flexibility in the code API (more than one canonical way)** — competing servers, ORMs, template engines and test stacks mean every project starts with a round of plumbing decisions, every onboarding starts from zero, and AI-generated code guesses among patterns;
4. **An evolution and performance ceiling** — derived from the first two: every external piece the stack depends on is a boundary the framework has to adapt to, so each improvement or new feature waits on what those pieces allow, and every request crosses those adaptation layers — that is where the big performance bottlenecks form.

## The Bootgly answer

Bootgly attacks these costs directly, with three deliberate design decisions:

**One canonical way.** There is exactly one way to do each thing — one HTTP server, one config schema, one autoloader, one test framework, one template engine. When you ask "how do I do X in Bootgly?", there is one answer. Onboarding gets faster, reviews get faster, and AI-assisted development gets precise, because there is no ambiguity about which tool or pattern to use. The same rule makes Bootgly **Linux-native**: fully adapting it to other systems would mean a second way of doing core things. Windows lacks PHP's built-in process extensions (`pcntl`, `posix`), and the default macOS volume ignores case, so the `Bootgly/` platform folder and the `bootgly` launcher cannot sit side by side. Use WSL2 or Docker on Windows, and a case-sensitive volume on macOS (for development).

**Minimum dependency.** The core has zero third-party runtime packages: the server, router, ORM, sessions, cache and test framework are first-party code, designed together. That means full-stack integration, a much smaller supply-chain surface to audit, and patch reaction time that depends only on Bootgly itself. By design, that extends to code contracts: Bootgly follows its own conventions instead of implementing PHP's shared code contracts (PSRs), so there is one canonical contract for each concern. First-party does not mean closed: wherever Bootgly meets the outside world — HTTP/2, WebSocket, PostgreSQL, MySQL, Redis, SMTP — it speaks the protocol natively and to the specification ([Interoperability by Protocol](/manual/Bootgly/basic/architecture/overview/#interoperability-by-protocol)). See [What is in the box](/manual/Bootgly/about/what/overview/) for the concrete inventory.

**One core, two platforms.** The I2P (Interface-to-Platform) architecture organizes the framework into six interfaces with a strict one-way dependency direction — the same foundation serves the **Console** and **Web** platforms, so a CLI tool and an HTTP API share components instead of duplicating them. The layers are covered in depth in [Architecture](/manual/Bootgly/basic/architecture/overview/).

## Proof, not promises

All figures below come from published, reproducible runs — HTTP rows measured 2026-10-29 on 24 logical CPUs (Fedora 44, kernel mitigations off), PHP 8.5.12, 514 connections, TechEmpower-style routes (Laravel + PHP-FPM from the 2026-07-04 session):

| Scenario | Bootgly | Reference | Δ |
|---|---|---|---|
| HTTP plaintext | 1,100,393 req/s | Swoole — 1,086,952 req/s | +1.2% |
| HTTP single DB query | 133,882 req/s | Swoole — 71,843 req/s | +86.4% |
| HTTP plaintext | 1,100,393 req/s | Laravel + PHP-FPM — 6,959 req/s | ~158× |
| WebSocket echo (32B) | 873,804 msg/s | Autobahn conformance: 462 passed / 0 failed | — |
| CLI progress bar | ~7× | Laravel / Symfony progress bar | — |
| Template engine (`foreach`) | ~9× | Laravel Blade | — |

Same hardware, same date, reproducible scripts — read the methodology before quoting these numbers:

- **[Bootgly vs other runtimes](/manual/WPI/HTTP/HTTP_Server_CLI/vs/)** — full matrix across Swoole, Hyperf, ReactPHP, AMPHP and Laravel stacks;
- **[Benchmark repository](https://github.com/bootgly/bootgly_benchmarks)** — scripts, Docker images and published reports.

## The trade-offs

Honesty is part of the bet. Choosing to build everything first-party has real costs:

- **Features take longer to ship** — building a native component is slower than wiring a third-party package, so the roadmap moves deliberately;
- **Rolling support** — `1.0` is not a long-term-support line: fixes ship only as patch releases of the latest minor (with `1.3` current, in `1.3.x`), with no backports to older minors, so staying current is part of the deal (see [Versioning](/guide/versioning/overview/));
- **Young ecosystem** — there is no marketplace of community packages; what the core does not ship, you build.

Bootgly is probably **not** the right choice today if you need a large ecosystem of ready-made packages, long-term-support stability in production right now, or native Windows execution. If those are your constraints, a traditional full-stack framework will serve you better — and the comparison page above stays honest about that.

## Next steps

- **[What is Bootgly?](/manual/Bootgly/about/what/overview/)** — identity, inventory and requirements;
- **[Getting started](/guide/getting-started/overview/)** — from an empty directory to a running project;
- **[Architecture](/manual/Bootgly/basic/architecture/overview/)** — the I2P layers in depth.
