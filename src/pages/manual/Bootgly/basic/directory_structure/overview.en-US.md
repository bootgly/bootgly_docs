# Estrutura de diretórios

The Bootgly PHP Framework has been very organized since its inception and offers a solid structure for building your code.

A fundamental part of this structure is the arrangement of directories in its root folder, which has been carefully designed to ensure clear and efficient organization in increasing order of dependencies. One of the reasons for this pattern is to separate everything that belongs to the Framework itself from everything that was produced through it.

![Dir Structure](images/pages/Bootgly/basic/directory_structure.png)

## Global folder @

The `@` folder is a global folder for artifacts and metadata. It can be found in Bootgly directories.

It is a location intended to store relevant information about the project, such as configuration files, metadata files, and other general files specific to the local context where this folder is located.

As a global folder, you can create it in your projects produced with Bootgly.

## 'Bootables' folders

The 'Bootables' folders are designed to contain everything related to **Bootgly initialization**.

It includes the `abstract/`, `base/`, `core/` folders and contains everything needed to initialize the minimum of the Bootgly PHP Framework or some dependency that is indirectly used.

This separation helps keep initialization files organized in a central location, and also allows the use of primary Bootgly dependencies in projects that do not use the Framework in its entirety.

## 'Features' folders

The 'Features' folders are intended for all content related to **specific Framework functionalities** and they are: `interfaces/`, `modules/`, `nodes/`, `platforms/` and `plugins/`.

It contains dependencies that are directly used by the developer who uses Bootgly.

Organizing in this way facilitates learning for contributors and helps in the maintenance and development of Bootgly by separating the main features from the "boot".

## 'Workables' folders

Finally, the 'Workables' folders are designed to contain **everything developed through Bootgly** and they are work folders.

These folders should include specific projects, source code folders for Apps, APIs, project configuration and boot files, among other resources related to projects built using the Bootgly PHP Framework. Additionally, it can contain public and static files for the web such as images, CSS or JavaScript files.

This separation allows developers to organize and manage work artifacts in progress, keeping them separate from other Framework directories and facilitating the sharing of resources between different projects.
