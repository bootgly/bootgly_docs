# Bootstrap files

There are two main bootstrap files for Bootgly: `bootgly` and `index.php`. The `bootgly` file is used by the CLI interface and Console platform. The `index.php` file, as is quite evident, is used by some external server such as an `Apache`, `Nginx`, `Litespeed`, etc. HTTP server, and serves to bridge the connection from Bootgly to a non-CLI Server API (SAPI).

## Bootstrap files in Resource dirs

In addition to the main bootstrap files, every Bootgly directory that needs to initialize or index an internal resource — test suites, command registries, template directives, and so on — has its own entry file with a single, canonical name: `autoboot.php`. This is the one file Bootgly automatically loads when it reaches a directory, so there is exactly one name to remember across the whole framework — from the platform bootstrap down to each resource dir.

These `autoboot.php` files live at the first level of each Bootgly Resource dir. The name is fixed and exposed as the `Bootgly\ABI\BOOTSTRAP_FILENAME` constant, so framework code never hardcodes it. The lowercase name is deliberate: it sorts *after* the uppercase entity files of a directory, so a directory's entities are defined before its `autoboot.php` runs.
