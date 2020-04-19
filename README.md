# Execli

Genenerate task-oriented CLIs declaratively.

Powered by [listr](https://www.npmjs.com/package/listr) and [yargs](https://www.npmjs.com/package/yargs).

## Usage

### Example file

```typescript
// commands.ts
import { Command } from "execli";

type DemoContext = {
  customFlag: boolean;
};

const demo: Command<DemoContext> = {
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
        run({ context: { customFlag, debug } }) {
          if (debug && customFlag) {
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

export { demo };
```

This file is written in TypeScript to showcase the built-in types.
Compile it down to JavaScript to use it with the following commands.

### Running the CLI

```
$ execli run --help
execli run <path>

Run the commands at the given path, forwarding the command line arguments after --

Positionals:
  path  The path resolving to the file exporting the commands  [string] [required]

Options:
  --help  Show help                                                      [boolean]
```

```
$ execli run commands.js -- demo --help
execli demo

Parent task

Options:
  --help        Show help                                                                                                                       [boolean]
  --customFlag  A custom option                                                                                                                 [boolean]
  --debug       Run all tasks sequentially, switch to verbose renderer, and stream the output of shell commands
                                                                                    [boolean] [default: false if terminal is interactive, true otherwise]
  --dryRun      Don't run tasks but show the shell commands that would have been run                                           [boolean] [default: false]
  --only        Only run the required tasks or those with one of the given titles (or title slugs)
        [array] [choices: "Another command task", "Command task", "Nested task", "Parent task", "Regular task", "Yet another command task"] [default: []]
  --skip        Skip the tasks with one of the given titles (or title slugs)
        [array] [choices: "Another command task", "Command task", "Nested task", "Parent task", "Regular task", "Yet another command task"] [default: []]
  --tag         Only run the required tasks or those with at least one of the given tags
        [array] [choices: "filesystem", "network", "regular"] [default: []]
```

```
$ execli run commands.js -- demo --dryRun
✔ Parent task
  ↓ Command task ($ pwd) [skipped]
    → Skipped by --dryRun option
  ↓ Regular task [skipped]
    → Skipped by --dryRun option
  ✔ Nested task
    ↓ Another command task ($ curl https://example.com) [skipped]
      → Skipped by --dryRun option
    ↓ Yet another command task ($ touch file.txt) [skipped]
      → Skipped by --dryRun option
```

### Compiling the CLI

```
$ execli compile --help
execli compile <source> <target>

Compile the commands at the given path to a single executable Node.js file, together with all the dependencies

Positionals:
  source  The path resolving to the file exporting the commands        [string] [required]
  target  The path where the compiled Node.js file will be written to  [string] [required]

Options:
  --help  Show help                                                              [boolean]
```

```
$ execli compile commands.js cli.js
$ ./cli.js demo --debug  --dryRun
[13:37:42] Parent task [started]
[13:37:42] Command task [started]
[13:37:42] Command task ($ pwd) [title changed]
[13:37:42] Command task ($ pwd) [skipped]
[13:37:42] → Skipped by --dryRun option
[13:37:42] Regular task [started]
[13:37:42] Regular task [skipped]
[13:37:42] → Skipped by --dryRun option
[13:37:42] Nested task [started]
[13:37:42] Another command task [started]
[13:37:42] Another command task ($ curl https://example.com) [title changed]
[13:37:42] Another command task ($ curl https://example.com) [skipped]
[13:37:42] → Skipped by --dryRun option
[13:37:42] Yet another command task [started]
[13:37:42] Yet another command task ($ touch file.txt) [title changed]
[13:37:42] Yet another command task ($ touch file.txt) [skipped]
[13:37:42] → Skipped by --dryRun option
[13:37:42] Nested task [completed]
[13:37:42] Parent task [completed]
```
