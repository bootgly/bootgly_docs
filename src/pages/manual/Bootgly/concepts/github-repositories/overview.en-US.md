# Git repositories

Bootgly's repositories follow a naming standard associated with its I2P software architecture. There are 4 types of repositories:

- Project repositories
- Bootable repositories
- Template repositories
- Extension repositories

## Project repositories

Project repositories are the main ones and serve as a base for other repositories.

They have the following syntax: `^[a-z]+$`.

Project repositories do not have separators:

- [bootgly](https://github.com/bootgly/bootgly)

## Bootable repositories

Bootable repositories are Bootgly's submodules and serve to extend its functionalities by adding other platforms to Bootgly.

These repositories have the following pattern in their name: `^[a-z]+-[a-z]+$`.

All bootable repositories have a `-` (dash) as a separator:

- [bootgly-console](https://github.com/bootgly/bootgly-console)
- [bootgly-web](https://github.com/bootgly/bootgly-web)

## Template repositories

Bootgly's template repositories function as starter kits and serve to help provide an initial structure for development based on some platform.

These repositories have the following pattern in their name: `^[a-z]+.[a-z]+$`.

All template repositories have a `.` (dot) as a separator:

- [bootgly.console](https://github.com/bootgly/bootgly.console)
- [bootgly.web](https://github.com/bootgly/bootgly.web)

## Extension repositories

Extension repositories are used to store additional information about projects such as Awesome Lists, Documentations, etc.

They have the following pattern in their name: `^[a-z]+_[a-z]+$`.

All extension repositories have a `_` (underscore) as a separator:

- [bootgly_awesome](https://github.com/bootgly/bootgly_awesome)
- [bootgly_docs](https://github.com/bootgly/bootgly_docs)
