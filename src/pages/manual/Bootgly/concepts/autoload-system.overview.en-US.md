# Bootgly's Autoload System

The Bootgly PHP Framework offers an efficient and flexible autoload system. First, the file that precedes and includes `autoload.php` must define your working directory based on the same folder where this file is located. The two files that include `autoload.php` are: `bootgly` and `index.php`. This working directory can be different from the root directory where the Bootgly platform is located as we will see in the following section.

The autoload system can work with up to two different base directories: the root directory and the working directory.

## Root Directory vs Working Directory

The root directory, defined by the `BOOTGLY_ROOT_DIR` constant is where the **Bootgly platform is located**. Meanwhile, the working directory, defined by the `BOOTGLY_WORKING_DIR` constant is **where you develop your projects** with Bootgly and will generally have a different path from the Bootgly root directory.

If you are using a starter kit to start your projects and you used `Composer` to manage your dependencies, the root directory of Bootgly will have the relative path `@imports/bootgly/bootgly/`. If you used `git submodules` to manage Bootgly's dependencies and you want to save `Composer` for later, the root directory of Bootgly will have the relative path `Bootgly/Bootgly`.

You also have the option to only use the basic Bootgly platform and then you will have to use the CLI and WPI interfaces to develop your apps and APIs and in this case, Bootgly's root and working directories will be the same, since the files that include `autoload.php` will be in the same folder as `autoload.php`!

To make it less theoretical, here is the source code with the logic of Bootgly's class autoload `spl_autoload_register`:

```php
spl_autoload_register (function (string $class) {
   $paths = explode('\\', $class);
   $file = implode('/', $paths) . '.php';

   $included = @include(BOOTGLY_WORKING_DIR . $file);

   if ($included === false && BOOTGLY_ROOT_DIR !== BOOTGLY_WORKING_DIR) {
      @include(BOOTGLY_ROOT_DIR . $file);
   }
});
```

## Extension and Substitution of Components

A powerful feature of Bootgly is to allow developers to easily extend or even replace core components of the framework and its autoload system could not fail to contribute to this. When loading the classes, the autoload system first checks if the file exists in the working directory, and if a class with the same namespace is found in the working directory, it will be loaded instead of the core class that is in its root folder.

This feature is particularly useful when developing projects with the Bootgly Framework, as developers can customize and tweak specific parts of the framework without directly modifying Bootgly’s main files.
