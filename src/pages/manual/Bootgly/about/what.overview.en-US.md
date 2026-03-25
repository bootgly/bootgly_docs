# What is Bootgly?

Bootgly is a PHP framework designed to build Apps and APIs for the Web and the Command Line (CLI).

Bootgly is the first PHP framework to use the I2P (interface-to-platform) architecture and is primarily focused on **efficiency**, for adopting a minimum dependency policy.

Due to this policy, its unique I2P architecture, and some unusual Code Conventions and Design Patterns, Bootgly has superior performance and versatility, and has easy-to-understand Code API.

From a single codebase, Bootgly targets both the **CLI** (Console platform) and **Web** (Web platform), sharing foundational layers (ABI, ACI, ADI, API) while specializing at the top-level interfaces. It requires PHP 8.2+ and runs natively on Linux, with Docker support for other operating systems.

Our goal is to help you build high-quality, scalable Web and CLI Apps/APIs quickly and easily. Whether you're a seasoned developer or just getting started, Bootgly PHP Framework has everything you need.

## Key features

- **High efficiency** — all components are built-in and fully integrated, eliminating third-party overhead and maximizing internal cohesion;
- **High performance** — optimized for Opcache + JIT (up to +50% performance), the HTTP Server CLI benchmarks +7% faster than Workerman in the plain text test;
- **Versatile** — build CLI tools and Web servers from the same framework, reusing shared interfaces and components across both platforms;
- **Easy-to-understand Code APIs** — consistent naming conventions, clear I2P structure and one-way policy make the codebase predictable and learnable;
- **Scalable** — multi-worker HTTP server with event-driven architecture, built-in middleware pipeline (CORS, RateLimit, Compression, ETag, SecureHeaders, and more).
