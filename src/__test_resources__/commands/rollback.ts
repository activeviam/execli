import { getCommand, Task } from "../../index.js";

const task: Task = {
  children: [
    {
      command: ["cp", "unexisting-source", "target"],
      title: "Run broken copy command",
    },
  ],
  async rollback({ exec }) {
    await exec(["echo", "rollback"]);
  },
  title: "Parent task",
};

export const rollback = getCommand({
  task,
});
