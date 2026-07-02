# What is Bootgly?

Bootgly is a PHP framework designed to build Apps and APIs for the Web and the Command Line (CLI).

Bootgly is the first PHP framework to use the I2P (interface-to-platform) architecture and is primarily focused on **efficiency**, for adopting a minimum dependency policy.

In I2P, module separation is explicit: each module is a folder named after the acronym of the Interface it represents — `ABI`, `ACI`, `ADI`, `API`, `CLI` and `WPI` — and the interfaces later give rise to platforms.

Due to this policy, its unique I2P architecture, and some unusual Code Conventions and Design Patterns, Bootgly has superior performance and versatility, and has easy-to-understand Code API.

From a single foundation, Bootgly targets both the **CLI** and the **Web**: the `bootgly` repository is the **base platform**, containing the base interfaces shared by everything built on top of it, while the **working platforms** — **Console** (`bootgly-console`) and **Web** (`bootgly-web`) — emerge from the `CLI` and `WPI` interfaces. It requires PHP 8.4+ and runs natively on Linux, with Docker support for other operating systems.

Our goal is to help you build high-quality, scalable Web and CLI Apps/APIs quickly and easily. Whether you're a seasoned developer or just getting started, Bootgly PHP Framework has everything you need.

## Key features

- **High efficiency** — all components are built-in and fully integrated, eliminating third-party overhead and maximizing internal cohesion;
- **High performance** — optimized for Opcache + JIT (up to +50% performance), the HTTP Server CLI benchmarks +7% faster than Workerman in the plain text test;
- **Versatile** — build CLI tools and Web servers from the same framework, reusing shared interfaces and components across both platforms;
- **Easy-to-understand Code APIs** — consistent naming conventions, clear I2P structure and one-way policy make the codebase predictable and learnable;
- **Scalable** — multi-worker HTTP server with event-driven architecture, built-in middleware pipeline (CORS, RateLimit, Compression, ETag, SecureHeaders, and more).
