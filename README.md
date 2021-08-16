# Execli

Generate task-oriented CLIs declaratively.

Powered by [listr2](https://www.npmjs.com/package/listr2) and [yargs](https://www.npmjs.com/package/yargs).

## Usage

### Example file

```typescript
// commands.ts
import { getCommand, OptionsContext, Task } from "execli";

const options = {
  customFlag: {
    boolean: true,
    description: "A custom option",
  },
} as const;

type DemoContext = OptionsContext<typeof options>;

const parentTask: Task<DemoContext> = {
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
};

export const demo = getCommand({
  options,
  task: parentTask,
});
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
  --dryRun      Do not run tasks but show the shell commands that would have been run                                          [boolean] [default: false]
  --from        Skip tasks before the one with the given title (or title slug)
                              [choices: "Another command task", "Command task", "Nested task", "Parent task", "Regular task", "Yet another command task"]
  --only        Only run tasks with one of the given titles (or title slugs)
        [array] [choices: "Another command task", "Command task", "Nested task", "Parent task", "Regular task", "Yet another command task"] [default: []]
  --skip        Skip tasks with one of the given titles (or title slugs)
        [array] [choices: "Another command task", "Command task", "Nested task", "Parent task", "Regular task", "Yet another command task"] [default: []]
  --tag         Only run tasks with at least one of the given tags
        [array] [choices: "filesystem", "network", "regular"] [default: []]
  --until       Skip tasks after the one with the given title (or title slug)
                              [choices: "Another command task", "Command task", "Nested task", "Parent task", "Regular task", "Yet another command task"]
```

```
$ execli run commands.js -- demo --dryRun
✔ Parent task [0.0s]
  ⚠ Command task ($ pwd)
    ↓ Skipped by --dryRun option
  ⚠ Regular task
    ↓ Skipped by --dryRun option
  ✔ Nested task [0.0s]
    ⚠ Another command task ($ curl https://example.com)
      ↓ Skipped by --dryRun option
    ⚠ Yet another command task ($ touch file.txt)
      ↓ Skipped by --dryRun option
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
[STARTED] Parent task
[STARTED] Command task
[TITLE] Command task ($ pwd)
[SKIPPED] Skipped by --dryRun option
[STARTED] Regular task
[SKIPPED] Skipped by --dryRun option
[STARTED] Nested task
[STARTED] Another command task
[TITLE] Another command task ($ curl https://example.com)
[SKIPPED] Skipped by --dryRun option
[STARTED] Yet another command task
[TITLE] Yet another command task ($ touch file.txt)
[SKIPPED] Skipped by --dryRun option
[SUCCESS] Nested task
[SUCCESS] Parent task [0.0s]
```
