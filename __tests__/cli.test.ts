import { EOL } from "node:os";
import { dirname, join } from "node:path";
import execa from "execa";
import pkgDir from "pkg-dir";
import tempy from "tempy";
import { bin } from "../package.json";

const packageRootDirectory = pkgDir.sync()!;
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
  const targetPath = tempy.file({ extension: "mjs" });
  await execa("node", [binPath, "compile", commandsFilePath, targetPath]);
  const { stdout } = await execa(targetPath, ["simple", "--debug"]);
  expect(stdout).toContain("Echo middle");
  expect(stdout).toContain("mystery");
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
      "debug",
      {
        commandName: "simple",
        options: ["--debug"],
      },
    ],
    [
      "debug forced in non interactive terminals",
      {
        commandName: "simple",
        failing: true,
        options: ["--no-debug"],
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
      "background command",
      {
        commandName: "background",
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
      "command task not matching regexp",
      {
        commandName: "error",
        failing: true,
        options: ["--from", "Run unmatched background command"],
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
        failing = false,
        options = [],
      }: Readonly<{
        commandName?: string;
        failing?: boolean;
        options?: readonly string[];
      }> = {},
    ) => {
      const result = await execa(
        "node",
        [
          ...runArguments,
          ...(commandName ? ["--", commandName] : []),
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
            .replaceAll(packageRootDirectory, "EXECLI_DIRECTORY")
            .split(EOL);
        }
      }

      expect(outputs).toMatchSnapshot();
    },
  );
});
