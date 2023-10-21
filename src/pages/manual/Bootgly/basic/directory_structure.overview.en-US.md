# Estrutura de diretórios

The Bootgly PHP Framework has been very organized since its inception and offers a solid structure for building your code.

A fundamental part of this structure is the arrangement of directories in its root folder, which has been carefully designed to ensure clear and efficient organization in increasing order of dependencies. One of the reasons for this pattern is to separate everything that belongs to the Framework itself from everything that was produced through it.

![Dir Structure](images/pages/Bootgly/basic/directory_structure-bootgly3.png)

## Global folder @

The `@/` folder is a global folder for artifacts and metadata. It can be found in Bootgly directories.

It is a location intended to store relevant information about the project, such as configuration files, metadata files, and other general files specific to the local context where this folder is located.

As a global folder, you can create it in your projects produced with Bootgly.

## Class folders and namespaces

In Bootgly projects and repositories, the first node of a namespace starts with a capital letter and should be placed directly within the root folder. You might be used to seeing source code within the `src/` folder that resides in the root of a project, but due to Bootgly's autoloader system, the source code is loaded with its own simple and efficient pattern and should not be placed inside the `src/` folder because it should be considered a resource folder (see "Resource Folders" section).

### Interfaces

Within the `Bootgly/` folder, which represents the base platform of Bootgly, are the initial interfaces and they are:

The `ABI` interface (Abstract Bootable Interface) brings together _everything that is "bootable"_, in a context related to the booting or initial loading of components and contains abstractions that are more aimed at the OS (Operating System).

The `ACI` interface (Abstract Common Interface) brings together _everything that is common_ in software: a Debugger, Events, Logs, Tests, etc.

The `ADI` interface (Abstract Data Interface) brings together _everything related to data_ and this interface will have many implementations and may give rise to another platform in the future.

The `API` interface (Application Programming Interface) _brings together what is intrinsic to Bootgly_ and its environment: Project class, Environment class, etc.

The `CLI` interface (Command Line Interface) is an interface to interact with a computer or operating system through text and commands typed in a _command line_. It is used for Console platform building.

The `WPI` interface (Web Programming Interface) is an interface that _represents the Web at a more base level_ where protocol implementations are defined for example, and it should contain base clients and servers like a TCP Server/Client, a UDP Server/Client, an HTTP Server/Client and so on. It is used for Web platform building.

## Resource folders

Resource folders must start with a lowercase letter and are well known in any programming project. In Bootgly these folders have simply been "formalized"!

These resource folders are used to store resources standardized by some "Resource" class, for example, a class called "Scripts" could standardize a "scripts/" folder that will serve to store Bootgly scripts. A class called "Tests" could formalize a resource folder called "tests/" that will serve to store the test files for Bootgly, and so on!

The `projects/` folder will be used by developer users to store their projects developed from Bootgly such as APIs, Apps, etc. This folder should only be created in the root folder.

The `public/` folder will serve to store Web files and should only be placed in the root folder.

The `scripts/` folder stores scripts for the CLI/Console and should only be placed in the root folder.

The `tests/` folders store bootstrap test files and files that define a "test case". These folders should be created in the same namespace as what is being tested.

The `workdata/` folder contains data generated, collected, or used in the work environment, such as cache files, log files, temporary files, information about projects, tasks, and so on.
