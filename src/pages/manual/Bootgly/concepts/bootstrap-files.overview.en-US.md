# Bootstrap files

Bootgly has three kinds of bootstrap files — and one naming convention that tells you what each file loads and what it returns before you open it:

- **Global bootstrap** — the root `autoboot.php`: boots the process once (constants, autoloader, layers).
- **Directory-entry bootstrap** — one `autoboot.php` per Resource dir: indexes that directory's internal resources.
- **Specific bootstrap** — one `<stem>.<Suffix>.php` per entity: returns one object or one resource.

## Global bootstrap

A Bootgly process starts through one launcher: `bootgly`. The CLI interface, the Console platform and the Web platform (served by Bootgly's own CLI HTTP server) all begin there, and its first act is to require the root `autoboot.php`. There is no web-SAPI launcher — booting under a non-CLI SAPI (Apache, Nginx + FPM) is refused with an explicit exception.

The root `autoboot.php` defines the `BOOTGLY_*` constants, registers the autoloader and boots the six layers in dependency order (`ABI → ACI → ADI → API → CLI → WPI`). It runs once per process — an idempotency guard makes any later `require` a no-op.

## Directory-entry bootstrap (`autoboot.php`)

Beyond the global bootstrap, every Bootgly directory that needs to initialize or index an internal resource — test suites, command registries, template directives, and so on — has its own entry file with a single, canonical name: `autoboot.php`. This is the one file Bootgly automatically loads when it reaches a directory, so there is exactly one name to remember across the whole framework.

These `autoboot.php` files live at the first level of each Bootgly Resource dir. The name is fixed and exposed as the `Bootgly\ABI\BOOTSTRAP_FILENAME` constant, so framework code never hardcodes it. The lowercase name is deliberate: it sorts *after* the uppercase entity files of a directory, so a directory's entities are defined before its `autoboot.php` runs.

What a directory-entry bootstrap returns is that directory's **container or registry** — the index of resources the framework will load next:

- the root `tests/autoboot.php` returns a `Suites` (the suite registry);
- a suite's `tests/autoboot.php` returns a `Suite` (its case stems, listed without suffix);
- a `commands/autoboot.php` registers the directory's command instances;
- a template `directives/autoboot.php` returns the directive manifest.

## Specific bootstrap (`<stem>.<Suffix>.php`)

While `autoboot.php` indexes a directory, a **specific bootstrap file** defines one entity. Its name is a variable stem plus a fixed suffix — and the case of the suffix tells you the return type upfront:

- **Uppercase-initial suffix ⇒ the file returns an object of the homonymous class.**
- **Lowercase suffix ⇒ the file returns a resource — data that is not an object.**

### Objects (uppercase suffix)

A `1.1-basic.Test.php` returns a `Test`; a `MyApp.Project.php` returns a `Project`; a `cache.Config.php` returns a `Config`. The suffix names the class the file must return, and the loader enforces it with `instanceof` — returning anything else aborts the load:

```php
use Bootgly\ACI\Tests\Suite\Test;

return new Test(
   description: 'It should sum',
   test: function () {
      return 1 + 1 === 2;
   }
);
```

### Resources (lowercase suffix)

A lowercase suffix says upfront there is no object to instantiate — the file returns plain data or a callable: `Bootgly.projects.php` returns the projects allow-list registry (an array); a `*.directive.php` returns a map of directive compiler closures; a `router.index.php` returns the route-set names (an array of strings); a `*.routes.php` returns a route-set generator-closure.

Acronym suffixes are the one exception to the case signal: acronyms are always UPPERCASE in Bootgly, so a `*.SAPI.php` keeps its uppercase name even though it returns a `Closure`, not a `SAPI` object.

Files whose return value is ignored — templates (`*.template.php`), demos (`*.demo.php`) — are include-for-side-effect files, not bootstrap files, and stay fully lowercase.

## Reference

| Suffix | Returns | Consumed by |
|--------|---------|-------------|
| `.Test.php` | `Test` object (`Bootgly\ACI\Tests\Suite\Test`) | test suites and E2E runners |
| `.Project.php` | `Project` object | project loading and `bootgly projects import` |
| `.Config.php` | `Config` object | `Configs` — per-scope configuration |
| `.projects.php` | `array` — projects allow-list registry | `Projects` |
| `.directive.php` | `array<string,Closure>` — directive compilers | template `Directives` |
| `.index.php` | `array<string>` — route-set names | HTTP `Router` |
| `.routes.php` | `Closure` — route set `(Request, Response, Router): Generator` | HTTP `Router` |
| `.SAPI.php` | `Closure` — generator handler (acronym: stays uppercase) | project SAPI scripts |
| `autoboot.php` | container/registry (`Suites`, `Suite`, commands, directives) | directory loading |
