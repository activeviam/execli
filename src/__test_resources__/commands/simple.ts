import { getCommand, OptionsContext, Task } from "../../index.js";

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
      command: ["echo", "start"],
      tags: ["a"],
      title: "Echo start",
    },
    {
      command: ["echo", "mystery"],
      tags: ["b"],
      title: "Echo middle",
    },
    {
      command: ["echo", "end"],
      tags: ["c"],
      title: "Echo end",
    },
  ],
  title: "Parent task",
};

export const simple = getCommand({
  options,
  task,
});
