# Bootstrap files

There are two main bootstrap files for Bootgly: `bootgly` and `index.php`. The `bootgly` file is used by the CLI interface and Console platform. The `index.php` file, as is quite evident, is used by some external server such as an `Apache`, `Nginx`, `Litespeed`, etc. HTTP server, and serves to bridge the connection from Bootgly to a non-CLI Server API (SAPI).

## Bootstrap files in Resource dirs

In addition to the main bootstrap files, there are other files that are used to initialize or index some other internal resource of Bootgly like test suites for example. These resource bootstrap files have a fixed pattern in their name and must start with an at sign: `@.php`. These bootstrap files can be found at the first level of the Bootgly Resource dirs.
