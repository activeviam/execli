import { OptionsContext } from "../commands.js";
import { getCommand, Task } from "../index.js";

const options = {
  flag: {
    boolean: true,
    description: "A flag option",
  },
} as const;

type Context = OptionsContext<typeof options>;

const task: Task<Context> = {
  children: [
    {
      command: ["pwd"],
      tags: ["a"],
      title: "Print current directory",
    },
    {
      command: ["ls"],
      tags: ["b"],
      title: "List content of directory",
    },
    {
      command: ["ps"],
      tags: ["c"],
      title: "List current processes",
    },
  ],
  title: "Parent task",
};

export const simpleCommand = getCommand({
  options,
  task,
});
