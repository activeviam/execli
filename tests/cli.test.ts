import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { describe, expect, test } from "@jest/globals";
import { execa } from "execa";
import { packageDirectorySync } from "pkg-dir";
import { temporaryFileTask } from "tempy";

const { bin } = JSON.parse(readFileSync("package.json", "utf8")) as Readonly<{
  bin: string;
}>;
const packageRootDirectory = packageDirectorySync()!;
const binPath = join(packageRootDirectory, bin);
const commandsFilePath = join(
  dirname(binPath),
  "__test_resources__",
  "commands",
  "index.js",
);

test("compile", async () => {
  // Use a temporary file path outside the package to make sure all the dependencies
  // are correctly bundled and are not required through the package's node_modules.
  await temporaryFileTask(
    async (targetPath) => {
      await execa("node", [binPath, "compile", commandsFilePath, targetPath]);
      const { stdout } = await execa(targetPath, [
        "simple",
        "--concurrency",
        "0",
      ]);
      expect(stdout).toContain("Echo middle");
      expect(stdout).toContain("mystery");
    },
    { extension: "mjs" },
  );
}, 15_000);

describe("run", () => {
  const runArguments = [binPath, "run", commandsFilePath];

  test.each([
    [
      "command required",
      {
        failing: true,
      } as const,
    ],
    [
      "option (existing)",
      {
        commandName: "simple",
        options: ["--flag"],
      },
    ],
    [
      "option (unexisting)",
      {
        commandName: "simple",
        failing: true,
        options: ["--unexisting-option"],
      },
    ],
    [
      "dryRun",
      {
        commandName: "simple",
        options: ["--dryRun"],
      },
    ],
    [
      "concurrent",
      {
        commandName: "simple",
        concurrency: 1,
      },
    ],
    [
      "from",
      {
        commandName: "simple",
        options: ["--from", "Echo middle"],
      },
    ],
    [
      "only (exact title)",
      {
        commandName: "simple",
        options: ["--only", "Echo start"],
      },
    ],
    [
      "only (slug)",
      {
        commandName: "simple",
        options: ["--only", "echo-start"],
      },
    ],
    [
      "only (neither exact title nor slug)",
      {
        commandName: "simple",
        failing: true,
        options: ["--only", "EcHo-StArt"],
      },
    ],
    [
      "skip (exact title)",
      {
        commandName: "simple",
        options: ["--skip", "Echo start"],
      },
    ],
    [
      "skip (slug)",
      {
        commandName: "simple",
        options: ["--skip", "echo-start"],
      },
    ],
    [
      "skip (neither exact title nor slug)",
      {
        commandName: "simple",
        failing: true,
        options: ["--skip", "EcHo-StArt"],
      },
    ],
    [
      "tag (existing)",
      {
        commandName: "simple",
        options: ["--tag", "a"],
      },
    ],
    [
      "tag (unexisting)",
      {
        commandName: "simple",
        failing: true,
        options: ["--tag", "d"],
      },
    ],
    [
      "until",
      {
        commandName: "simple",
        options: ["--until", "Echo middle"],
      },
    ],
    [
      "failed regular task",
      {
        commandName: "error",
        failing: true,
      },
    ],
    [
      "failed command task",
      {
        commandName: "error",
        failing: true,
        options: ["--from", "Run failing script"],
      },
    ],
    [
      "rollback",
      {
        commandName: "rollback",
        failing: true,
      },
    ],
  ])(
    "%s %j",
    async (
      _,
      {
        commandName,
        concurrency = 0,
        failing = false,
        options = [],
      }: Readonly<{
        commandName?: string;
        concurrency?: number;
        failing?: boolean;
        options?: readonly string[];
      }> = {},
    ) => {
      const result = await execa(
        "node",
        [
          ...runArguments,
          ...(commandName ? ["--", commandName] : []),
          "--concurrency",
          String(concurrency),
          ...options,
        ],
        {
          reject: !failing,
        },
      );

      expect(result.failed).toBe(failing);

      const outputs: Record<string, readonly string[]> = {};

      for (const outputType of ["stderr", "stdout"] as const) {
        if (result[outputType]) {
          outputs[outputType] = result[outputType]
            .replace(
              /(file:\/\/)?[\\\-/:.\w]*([/\\])execli[\\\-/:.\w]*/g,
              "SOME_EXECLI_PATH",
            )
            .replace(/node:[\\/\-:.\w]*/g, "SOME_NODE_PATH")
            .split(/\r?\n/);
        }
      }

      expect(outputs).toMatchSnapshot();
    },
    15_000,
  );
});
