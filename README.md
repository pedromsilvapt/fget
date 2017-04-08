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
# Interactive Mode
Sometimes it might be desirable to perform several sequential actions in the same server. As such, it can be contrived to use the main commands like fetch, list and find, having to repeat the server ip in all commands. As such, the client has an interactive version that launches a virtual shell that remembers the state between commands.

```shell
fget connect localhost:8099
```
This will launch the virtual shell. The commands behave in a similar way to the native ones, minus the server argument. The shell also has the notion of a working (remote) directory and a working local directory, both can be shown/changed with the commands `cd` and `cld`, respectively.

Any relative path used in the fetch, list and find commands will take those working directories into account.

```shell
fget~/> cd Folder
fget~/Folder> ls
```

Is the equivalent of:

```shell
fget~/> ls Folder
```

# Help
Run --help in order to get a comprehensive list of all available commands and options.


```shell
fget --help
fget fetch --help
```