import { Task, getCommand } from "../../index.js";
import { failingNodeScriptCommand } from "./utils.js";

const task: Task = {
  children: [
    {
      command: failingNodeScriptCommand,
      title: "Run failing script",
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
