import { Task, getCommand } from "../../index.js";
import { failingNodeScriptCommand } from "./utils.js";

const slowButSuccessfulTask: Task = {
  async run({ outputLine }) {
    await new Promise((resolve) => {
      setTimeout(resolve, 1000);
    });
    outputLine("Slow but successful");
  },
  title: "Slow successful task",
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
          slowButSuccessfulTask,
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
        command: failingNodeScriptCommand,
        title: "Run failing script",
      },
      {
        command: ["echo", "finally"],
        title: "Echo finally",
      },
    ],
    title: "Parent task",
  },
});
