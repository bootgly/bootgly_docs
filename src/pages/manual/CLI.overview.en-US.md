# Command-Line Interface (CLI)

In the universe of programming, the `Command-Line Interface (CLI)` is an indispensable tool, allowing direct interaction with a computer through text commands in a terminal. In the realm of software development, an efficient CLI can be the difference between a smooth and a complicated user experience.

## Introduction to CLI

The CLI is a text-based interface where users interact with a program through manually typed commands. It's a powerful and efficient way to control and automate tasks, especially in the realms of development and system administration.

## Bootgly CLI

In the context of the Bootgly Framework, we are focused on simplifying and optimizing the development of command-line interfaces. Our mission is to provide robust and flexible components that allow developers to create intuitive and powerful CLIs for their applications.

### Command Parser

The Bootgly Command Parser allows the parsing and interpreting of arguments passed through the command line, making it easy to extract relevant information and take appropriate actions based on them.

### Options and Arguments Manager

With the Options Manager, developers can define and manage the available options for their commands, including short and long command-line options, default values, constraints, and automatic documentation.

### Intuitive User Interface

The Bootgly CLI's user interface is designed to be intuitive and user-friendly, with clear prompts and informative error messages to guide users through their interactions.

### Modern Visual (UI) Components

Our framework supports a wide variety of visual components to enhance the user experience, such as `Alert`, `Fieldset`, `Menu`, `Progress`, `Table`, etc.

## Benefits of Bootgly CLI

- `Enhanced Productivity`

With a clean and intuitive API, developers can create powerful CLIs in less time and with less effort.

- `Automatic Documentation`

Bootgly CLI automatically generates documentation for the commands and options, making it easier for users to understand and utilize them.

- `Flexibility and Extensibility`

With plugin support, developers can easily extend the functionality of the CLI to meet the specific needs of their projects.

- `Improved User Experience`

An intuitive user interface and clear messages ensure a pleasant and uncomplicated user experience.

## Environment

The CLI resolves its execution environment from a few well-known variables:

- **`BOOTGLY_SAPI`** — Bootgly gates its platform interfaces on the `BOOTGLY_SAPI` constant, defined at boot as `getenv('BOOTGLY_SAPI') ?: PHP_SAPI`. Embedded runtimes that behave as a console — such as PHP compiled to WebAssembly, where `PHP_SAPI` reports `embed` — export `BOOTGLY_SAPI=cli` to boot the Console platform. Capability checks (sockets, process control) intentionally keep using `PHP_SAPI`.
- **`COLUMNS` / `LINES`** — the Terminal resolves its size from these environment variables first (the ncurses convention), falling back to `tput cols` / `tput lines`, then to `80x30`. Pipes, CI runners and embedded runtimes can export them to control layout without a TTY.
- **`BOOTGLY_TTY`** — interactive components gate on the `BOOTGLY_TTY` constant, defined at boot as `1`/`0` from the environment or, by default, from `stream_isatty(STDIN)`. Emulated terminals that feed stdin programmatically — such as xterm.js driving a WASM runtime — export `BOOTGLY_TTY=1` so components like `Menu` stay interactive even though stdin is not a real TTY. Stream capabilities (like running `stty`) keep depending on the actual stream.

When the cursor position cannot be queried (no TTY on stdin), components degrade gracefully: `Progress` anchors its rendering with ANSI cursor save/restore instead of absolute positioning, and `Menu` renders its items once and returns the default selection when `BOOTGLY_TTY` resolves to false (pipes, CI).

These are the mechanics that power the [live CLI showcase](/manual/CLI/showcase) — every demo there runs the real framework on PHP 8.4 WebAssembly in your browser.
