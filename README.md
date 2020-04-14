# Execli

Genenerate task-oriented CLIs declaratively.

Powered by [listr](https://www.npmjs.com/package/listr) and [yargs](https://www.npmjs.com/package/yargs).

## Usage

### Example file

```javascript
// commands.js
module.exports = {
  options: {
    customFlag: {
      boolean: true,
      description: "A custom option",
    },
  },
  task: {
    children: [
      {
        command: ["pwd"],
        title: "Command task",
      },
      {
        run(context) {
          if (context.debug && context.customFlag) {
            console.log("flag given");
          }
        },
        tags: ["regular"],
        title: "Regular task",
      },
      {
        children: [
          {
            command: ["curl", "https://example.com"],
            tags: ["network"],
            title: "Another command task",
          },
          {
            command: ["touch", "file.txt"],
            tags: ["filesystem"],
            title: "Yet another command task",
          },
        ],
        title: "Nested task",
      },
    ],
    title: "Parent task",
  },
};
```

### Running the CLI

```
$ execli run commands.js
execli run <path>

Run the commands at the given path, forwarding it the command line arguments after --

Positionals:
  path  The path resolving to the file exporting the commands     [string] [required]

Options:
  --help  Show help                                                         [boolean]

Not enough non-option arguments: got 0, need at least 1
```

```
$ execli run commands.js -- demo --help
execli demo

Parent task

Options:
  --help        Show help                                                                                                                       [boolean]
  --customFlag  A custom option                                                                                                                 [boolean]
  --debug       Run all tasks sequentially, switch to verbose renderer, and show the output of shell commands
                                                                                                      [boolean] [default: true on CI and false elsewhere]
  --dryRun      Don't run tasks but display the shell commands that would have been run                                        [boolean] [default: false]
  --only        Only run the CLI task with this title (or title slug)
        [array] [choices: "Another command task", "Command task", "Nested task", "Parent task", "Regular task", "Yet another command task"] [default: []]
  --skip        Skip the CLI task with this title (or title slug)
        [array] [choices: "Another command task", "Command task", "Nested task", "Parent task", "Regular task", "Yet another command task"] [default: []]
  --tag         Only run the CLI task with this tag                                   [array] [choices: "filesystem", "network", "regular"] [default: []]

```

```
$ execli run commands.js -- demo --dryRun
✔ Parent task
↓ Command task ($ pwd) [skipped]
↓ Regular task [skipped]
✔ Nested task
    ↓ Another command task ($ curl https://example.com) [skipped]
    ↓ Yet another command task ($ touch file.txt) [skipped]
```

### Compiling the CLI

```
$ execli compile
execli compile <source> <target>

Compile the commands at the given path to a single executable Node.js file, together with all its dependencies

Positionals:
  source  The path resolving to the file exporting the commands        [string] [required]
  target  The path where the compiled Node.js file will be written to  [string] [required]

Options:
  --help  Show help                                                              [boolean]

Not enough non-option arguments: got 0, need at least 2
```

```
$ execli compile commands.js cli.js
$ ./cli.js demo --debug  --dryRun
[13:37:42] Parent task [started]
[13:37:42] Command task [started]
[13:37:42] Command task ($ pwd) [title changed]
[13:37:42] Command task ($ pwd) [skipped]
[13:37:42] Regular task [started]
[13:37:42] Regular task [skipped]
[13:37:42] Nested task [started]
[13:37:42] Another command task [started]
[13:37:42] Another command task ($ curl https://example.com) [title changed]
[13:37:42] Another command task ($ curl https://example.com) [skipped]
[13:37:42] Yet another command task [started]
[13:37:42] Yet another command task ($ touch file.txt) [title changed]
[13:37:42] Yet another command task ($ touch file.txt) [skipped]
[13:37:42] Nested task [completed]
[13:37:42] Parent task [completed]
```
