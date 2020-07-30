import path from "path";
import execa from "execa";
import pkgDir from "pkg-dir";
import tempy from "tempy";
import { bin } from "../package.json";

const binPath = path.join(pkgDir.sync() as string, bin);
const commandFilePath = path.join(__dirname, "command.json");

test("compile", async () => {
  // Use a temporary file path outside the package to make sure all the dependencies
  // are correctly bundled and are not required through the package's node_modules.
  const targetPath = tempy.file({ extension: "js" });
  await execa("node", [binPath, "compile", commandFilePath, targetPath]);
  const { stdout } = await execa("node", [
    targetPath,
    "test-command",
    "--debug",
  ]);
  expect(stdout).toContain("Print current directory");
  expect(stdout).toContain(process.cwd());
}, 10000);

describe("run", () => {
  const runArguments = [binPath, "run", commandFilePath];
  const runTestCommandArguments = [...runArguments, "--", "test-command"];

  test.each([
    [
      "command required",
      runArguments,
      {
        failed: true,
        outputs: ["Not enough non-option arguments: got 0, need at least 1"],
      },
    ],
    [
      "strict (existing-option)",
      [...runTestCommandArguments, "--flag"],
      {
        outputs: ["Print current directory"],
      },
    ],
    [
      "strict (unexisting-option)",
      [...runTestCommandArguments, "--unexisting-option"],
      {
        failed: true,
        outputs: ["Unknown arguments: unexisting-option"],
      },
    ],
    [
      "debug",
      [...runTestCommandArguments, "--debug"],
      {
        outputs: ["Print current directory", process.cwd()],
      },
    ],
    [
      "only (exact)",
      [...runTestCommandArguments, "--only", "Print current directory"],
      {
        outputs: [
          "Print current directory [completed]",
          "List content of directory [skipped]",
          "List current processes [skipped]",
        ],
      },
    ],
    [
      "only (slug)",
      [...runTestCommandArguments, "--only", "print-current-directory"],
      {
        outputs: [
          "Print current directory [completed]",
          "List content of directory [skipped]",
          "List current processes [skipped]",
        ],
      },
    ],
    [
      "only (no-match)",
      [...runTestCommandArguments, "--only", "PrInt-CuRRenT-DirEctoRy"],
      {
        failed: true,
        outputs: ["Invalid values"],
      },
    ],
    [
      "skip (exact)",
      [...runTestCommandArguments, "--skip", "Print current directory"],
      {
        outputs: [
          "Print current directory [skipped]",
          "List content of directory [completed]",
          "List current processes [completed]",
        ],
      },
    ],
    [
      "skip (slug)",
      [...runTestCommandArguments, "--skip", "print-current-directory"],
      {
        outputs: [
          "Print current directory [skipped]",
          "List content of directory [completed]",
          "List current processes [completed]",
        ],
      },
    ],
    [
      "skip (no-match)",
      [...runTestCommandArguments, "--skip", "PrInt-CuRRenT-DirEctoRy"],
      {
        failed: true,
        outputs: ["Invalid values"],
      },
    ],
    [
      "tag (existing)",
      [...runTestCommandArguments, "--tag", "a"],
      {
        outputs: [
          "Print current directory [completed]",
          "List content of directory [skipped]",
          "List current processes [skipped]",
        ],
      },
    ],
    [
      "tag (unexisting)",
      [...runTestCommandArguments, "--tag", "d"],
      {
        failed: true,
        outputs: ["Invalid values"],
      },
    ],
  ])(
    "%s %j",
    async (
      _,
      commandArguments: readonly string[],
      {
        failed = false,
        outputs,
      }: { readonly failed?: boolean; readonly outputs: readonly string[] },
    ) => {
      const result = await execa("node", commandArguments, {
        reject: !failed,
      });
      expect(result.failed).toBe(failed);
      outputs.forEach((output) => {
        expect(failed ? result.stderr : result.stdout).toContain(output);
      });
    },
  );
});
