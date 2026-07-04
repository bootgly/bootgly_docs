# Why Bootgly?

Because the modern PHP stack became a tax — and Bootgly's bet is that you should not have to pay it.

This page explains the problems Bootgly exists to solve, how its design answers them, the numbers that back the claims, and — just as important — the trade-offs of that bet.

## The problem

Making PHP fast and maintainable today usually costs you on three fronts:

1. **Infrastructure sprawl** — to get performance, teams stack Nginx in front, PHP-FPM behind it, supervisors around it and C extensions (Swoole, event loops) underneath. Every extra piece is one more thing to configure, monitor, upgrade — and pay for;
2. **Supply-chain surface** — a typical application ships hundreds of `vendor/` packages to production. Each one has its own author, style, release cadence and vulnerabilities to track. Patch reaction time is bounded by the slowest third party;
3. **Too many ways to do everything** — competing servers, ORMs, template engines and test stacks mean every project starts with a round of plumbing decisions, every onboarding starts from zero, and AI-generated code guesses among patterns.

## The Bootgly answer

Bootgly attacks the three costs directly, with three deliberate design decisions:

**One canonical way.** There is exactly one way to do each thing — one HTTP server, one config schema, one autoloader, one test framework, one template engine. When you ask "how do I do X in Bootgly?", there is one answer. Onboarding gets faster, reviews get faster, and AI-assisted development gets precise, because there is no ambiguity about which tool or pattern to use.

**Minimum dependency.** The core has zero third-party runtime packages: the server, router, ORM, sessions, cache and test framework are first-party code, designed together. That means full-stack integration, a much smaller supply-chain surface to audit, and patch reaction time that depends only on Bootgly itself. See [What is in the box](/manual/Bootgly/about/what/overview/) for the concrete inventory.

**One core, two platforms.** The I2P (Interface-to-Platform) architecture organizes the framework into six interfaces with a strict one-way dependency direction — the same foundation serves the **Console** and **Web** platforms, so a CLI tool and an HTTP API share components instead of duplicating them. The layers are covered in depth in [Architecture](/manual/Bootgly/basic/architecture/overview/).

## Proof, not promises

All figures below come from published, reproducible runs — measured 2026-07-04 on 24 logical CPUs (WSL2), PHP 8.4.22, 514 connections, TechEmpower-style routes:

| Scenario | Bootgly | Reference | Δ |
|---|---|---|---|
| HTTP plaintext | 1,030,930 req/s | Swoole — 964,908 req/s | +7.3% |
| HTTP single DB query | 166,746 req/s | Swoole — 95,718 req/s | +93.8% |
| HTTP plaintext | 1,030,930 req/s | Laravel + PHP-FPM — 6,959 req/s | ~148× |
| WebSocket echo (32B) | 873,804 msg/s | Autobahn conformance: 462 passed / 0 failed | — |
| CLI progress bar | ~7× | Laravel / Symfony progress bar | — |
| Template engine (`foreach`) | ~9× | Laravel Blade | — |

Same hardware, same date, reproducible scripts — read the methodology before quoting these numbers:

- **[Bootgly vs other runtimes](/manual/WPI/HTTP/HTTP_Server_CLI/vs/)** — full matrix across Swoole, Hyperf, ReactPHP, AMPHP and Laravel stacks;
- **[Benchmark repository](https://github.com/bootgly/bootgly_benchmarks)** — scripts, Docker images and published reports.

## The trade-offs

Honesty is part of the bet. Choosing to build everything first-party has real costs:

- **Features take longer to ship** — building a native component is slower than wiring a third-party package, so the roadmap moves deliberately;
- **Beta status** — Bootgly is pre-1.0: the public API is still being finalized, and production use is not yet recommended;
- **Linux-native** — Windows and other systems are supported through Docker only;
- **Young ecosystem** — there is no marketplace of community packages; what the core does not ship, you build.

Bootgly is probably **not** the right choice today if you need a large ecosystem of ready-made packages, long-term-support stability in production right now, or native Windows execution. If those are your constraints, a traditional full-stack framework will serve you better — and the comparison page above stays honest about that.

## Next steps

- **[What is Bootgly?](/manual/Bootgly/about/what/overview/)** — identity, inventory and requirements;
- **[Getting started](/guide/getting-started/overview/)** — from an empty directory to a running HTTP server;
- **[Architecture](/manual/Bootgly/basic/architecture/overview/)** — the I2P layers in depth.
