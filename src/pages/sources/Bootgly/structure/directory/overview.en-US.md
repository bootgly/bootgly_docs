The Bootgly PHP Framework has been very organized since its foundation and provides a solid framework for building your codes.

A key part of this framework is its root folder's directory organization, which has been carefully designed to ensure a clear and efficient organization to separate everything from the Framework itself from everything that was produced with it.

![Dir Structure](images/pages/Bootgly/Bootgly-directory_structure.png)

## Artifacts / Metadata folder

It`s a global folder of metadata and artifacts that can be used in its workables.
It is a place intended to store relevant information about the project, such as configuration files, general metadata files, documentation, autoloaders and other general files specific to the local context.

Because it's a global folder, you can create this folder in your projects produced with Bootgly.

## 'Bootables' folders

The "Bootables" folder is designed to contain everything related to the **initialization of the framework**.
This includes abstract codes, base codes, core codes, in short, everything that is needed to boot the development or production environment of the projects that is using the Bootgly PHP Framework.

This separation helps keep the startup files organized in a central location, making it easier to configure and manage deployment environments.

## 'Features' folders

The "Features" folder is intended to contain the files related to the **specific functionalities of framework**.

This may include source code files for interfaces, modules, nodes, platforms, and other development artifacts specific to each functionality offered by the Bootgly PHP Framework.

Organizing files in this way allows developers to easily find files relevant to a particular functionality, making maintenance and development more efficient.

## 'Workables' folders

Finally, the "Workables" folder is designed to contain **everything that is developed through of the framework**.

This folder should include specific projects, source folders, configuration files, and other resources related to the projects that are built using the Bootgly PHP Framework.
For example, it can contain folders for specific projects or folders for public resources such as images, CSS files, or JavaScript.

This separation allows developers to organize and manage work-in-progress artifacts, keeping them separate from the other framework directories and making it easier to share resources between different projects.
