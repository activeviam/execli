import { getCommand, Task } from "../../index.js";

type AddedContext = Readonly<{ bar: string }>;

const printMatchedOutput: Task<Readonly<{ bar: string }>> = {
  command: ({ bar }) => ["echo", bar],
  title: "Print matched output",
};

const task: Task<void, void, AddedContext> = {
  background: {
    command: [
      "node",
      "--eval",
      "setTimeout(() => {console.log('f' + 'o' + 'o'); setTimeout(() => {}, 5000)}, 500)",
    ],
    match: /\b(?<bar>\w+)\b/,
  },
  children: [printMatchedOutput],
  title: "Parent task",
};

export const background = getCommand({
  task,
});
