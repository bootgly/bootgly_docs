# Estrutura de diretórios

The Bootgly PHP Framework has been very organized since its inception and offers a solid structure for building your code.

A fundamental part of this structure is the arrangement of directories in its root dir, which has been carefully designed to ensure clear and efficient organization in increasing order of dependencies. One of the reasons for this pattern is to separate everything that belongs to the Framework itself from everything that was produced through it.

![Dir Structure](/images/pages/Bootgly/basic/directory_structure-bootgly3.png)

## Global dir @

The `@/` dir is a global dir for artifacts and metadata. It can be found in Bootgly directories.

It is a location intended to store relevant information about the project, such as configuration files, metadata files, and other general files specific to the local context where this dir is located.

As a global dir, you can create it in your projects produced with Bootgly.

## Class dirs and namespaces

In Bootgly projects and repositories, the first node of a namespace starts with a capital letter and should be placed directly within the root dir. You might be used to seeing source code within the `src/` dir that resides in the root of a project, but due to Bootgly's autoloader system, the source code is loaded with its own simple and efficient pattern and should not be placed inside the `src/` dir because it should be considered a resource dir (see "Resource Dirs" section).

### Interfaces

Within the `Bootgly/` dir, which represents the base platform of Bootgly, are the initial interfaces and they are:

The `ABI` interface (Abstract Bootable Interface) brings together _everything that is "bootable"_, in a context related to the booting or initial loading of components and contains abstractions that are more aimed at the OS (Operating System).

The `ACI` interface (Abstract Common Interface) brings together _everything that is common_ in software: a Debugger, Events, Logs, Tests, etc.

The `ADI` interface (Abstract Data Interface) brings together _everything related to data_ and this interface will have many implementations and may give rise to another platform in the future.

The `API` interface (Application Programming Interface) _brings together what is intrinsic to Bootgly_ and its environment: Project class, Environment class, etc.

The `CLI` interface (Command Line Interface) is an interface to interact with a computer or operating system through text and commands typed in a _command line_. It is used for Console platform building.

The `WPI` interface (Web Programming Interface) is an interface that _represents the Web at a more base level_ where protocol implementations are defined for example, and it should contain base clients and servers like a TCP Server/Client, a UDP Server/Client, an HTTP Server/Client and so on. It is used for Web platform building.

## Resource dirs

Resource dirs must start with a lowercase letter and are well known in any programming project. In Bootgly these dirs have simply been "formalized"!

"These resource dirs are used to store standardized resources by the `Resources` interface found in the `ABI` interface. For example, a class called 'Scripts' may standardize a 'scripts/' dir that will be used to store Bootgly scripts. A class called 'Tests' may formalize a resource dir called 'tests/' to store files for testing in Bootgly, and so on!"

The `projects/` dir will be used by developer users to store their projects developed from Bootgly such as APIs, Apps, etc. This dir should only be created in the root dir.

The `public/` dir will serve to store Web files and should only be placed in the root dir.

The `scripts/` dir stores scripts for the CLI/Console and should only be placed in the root dir.

The `tests/` dirs store bootstrap test files and files that define a "test case". These dirs should be created in the same namespace as what is being tested.

The `workdata/` dir contains data generated, collected, or used in the work environment, such as cache files, log files, temporary files, information about projects, tasks, and so on.
