# fget

> Simple cli tool that allows to share files between multiple computers over LAN or the Internet

# Installation
You can install this package globally, so that it is accessible everywhere in your system.

```shell
npm install -g fget-cli
```

# Usage
This module has two main components: the server and the client. For simplicity's sake (and security's) this module is read-only, meaning that the server only publishes files, but cannot be remotely modified. That is not the purpose of this module.

# Server
First, you have to launch a server and specify the folder(s) that you wish to serve:
```shell
fget serve -p 8099 "C:\Path\To\Folder"
```

# Client
After the server has been launched, you can download what has been shared by running:
```shell
fget fetch localhost:8099
```

Additionally, it is possible to selectivly download only some folders/files by passing their relative path after the command
```shell
fget fetch localhost:8099 "Folder/Subfolder" "Folder/Subfile"
```

> **Note** When sharing a folder/file, it's name is still part of what the client will see.

# Listing
When in doubt of what will be downloaded, the `list` command is available.

```shell
fget list localhost:8099
fget list localhost:8099 "Folder/Subfolder"
```

# Help
Run --help in order to get a comprehensive list of all available commands and options.

```shell
fget --help
fget fetch --help
```