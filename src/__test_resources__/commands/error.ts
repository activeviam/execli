import { getCommand, Task } from "../../index.js";

const runBrokenBackgroundCommand: Task<
  void,
  void,
  Readonly<{ nothing: string }>
> = {
  background: {
    command: ["cp", "unexisting-source", "target"],
    match: /\b(?<nothing>\w+)\b/,
  },
  children: [
    {
      command: ["ls"],
      title: "List files",
    },
  ],
  title: "Run broken background command",
};

const runUnmatchedBackgroundCommand: Task<
  void,
  void,
  Readonly<{ nomatch: string }>
> = {
  background: {
    command: ["ls"],
    match: /\b(?<nomatch>nomatch)\b/,
  },
  children: [
    {
      command: ["echo", "something"],
      title: "Echo something",
    },
  ],
  title: "Run unmatched background command",
};

export const error = getCommand({
  task: {
    children: [
      {
        command: ["pwd"],
        title: "Print current directory",
      },
      {
        children: [
          {
            run() {
              throw new Error("Something went wrong.");
            },
            title: "Throw exception",
          },
        ],
        title: "Nest task",
      },
      {
        command: ["cp", "unexisting-source", "target"],
        title: "Run broken copy command",
      },
      runBrokenBackgroundCommand,
      runUnmatchedBackgroundCommand,
      {
        command: ["echo", "finally"],
        title: "Echo finally",
      },
    ],
    title: "Parent task",
  },
});
