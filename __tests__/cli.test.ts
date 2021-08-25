import os from "os";
import path from "path";
import execa from "execa";
import pkgDir from "pkg-dir";
import tempy from "tempy";
import { bin } from "../package.json";

const binPath = path.join(pkgDir.sync()!, bin);
const commandsFilePath = path.join(
  path.dirname(binPath),
  "__test_resources__",
  "commands.js",
);

test("compile", async () => {
  // Use a temporary file path outside the package to make sure all the dependencies
  // are correctly bundled and are not required through the package's node_modules.
  const targetPath = tempy.file({ extension: "mjs" });
  await execa("node", [binPath, "compile", commandsFilePath, targetPath]);
  const { stdout } = await execa(targetPath, ["simpleCommand", "--debug"]);
  expect(stdout).toContain("Print current directory");
  expect(stdout).toContain(process.cwd());
}, 10_000);

describe("run", () => {
  const runArguments = [binPath, "run", commandsFilePath];
  const [
    runSimpleCommandArguments,
    runBackgroundCommandArguments,
    runErrorCommandArguments,
    runRollbackCommandArguments,
  ] = [
    "simpleCommand",
    "backgroundCommand",
    "errorCommand",
    "rollbackCommand",
  ].map((commandName) => [...runArguments, "--", commandName]);

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
      [...runSimpleCommandArguments, "--flag"],
      {
        outputs: ["[SUCCESS] Print current directory"],
      },
    ],
    [
      "strict (unexisting-option)",
      [...runSimpleCommandArguments, "--unexisting-option"],
      {
        failed: true,
        outputs: ["Unknown arguments: unexisting-option"],
      },
    ],
    [
      "debug",
      [...runSimpleCommandArguments, "--debug"],
      {
        outputs: ["[SUCCESS] Print current directory", process.cwd()],
      },
    ],
    [
      "debug forced in non interactive terminals",
      [...runSimpleCommandArguments, "--no-debug"],
      {
        failed: true,
        outputs: ["Cannot opt-out of debug mode in non interactive terminals."],
      },
    ],
    [
      "dryRun",
      [...runSimpleCommandArguments, "--dryRun"],
      {
        outputs: [
          [
            "[STARTED] Parent task",
            "[STARTED] Print current directory",
            "[TITLE] Print current directory ($ pwd)",
            "[SKIPPED] Skipped by --dryRun option",
            "[STARTED] List content of directory",
            "[TITLE] List content of directory ($ ls)",
            "[SKIPPED] Skipped by --dryRun option",
            "[STARTED] List current processes",
            "[TITLE] List current processes ($ ps)",
            "[SKIPPED] Skipped by --dryRun option",
            "[SUCCESS] Parent task",
          ],
        ],
      },
    ],
    [
      "from",
      [...runSimpleCommandArguments, "--from", "List content of directory"],
      {
        outputs: [
          [
            "[STARTED] Print current directory",
            "[SKIPPED] Skipped by --from option",
          ],
          "[SUCCESS] List content of directory",
          "[SUCCESS] List current processes",
        ],
      },
    ],
    [
      "only (exact)",
      [...runSimpleCommandArguments, "--only", "Print current directory"],
      {
        outputs: [
          "[SUCCESS] Print current directory",
          [
            "[STARTED] List content of directory",
            "[SKIPPED] Skipped by --only option",
          ],
          [
            "[STARTED] List current processes",
            "[SKIPPED] Skipped by --only option",
          ],
        ],
      },
    ],
    [
      "only (slug)",
      [...runSimpleCommandArguments, "--only", "print-current-directory"],
      {
        outputs: [
          "[SUCCESS] Print current directory",
          [
            "[STARTED] List content of directory",
            "[SKIPPED] Skipped by --only option",
          ],
          [
            "[STARTED] List current processes",
            "[SKIPPED] Skipped by --only option",
          ],
        ],
      },
    ],
    [
      "only (no-match)",
      [...runSimpleCommandArguments, "--only", "PrInt-CuRRenT-DirEctoRy"],
      {
        failed: true,
        outputs: ["Invalid values"],
      },
    ],
    [
      "skip (exact)",
      [...runSimpleCommandArguments, "--skip", "Print current directory"],
      {
        outputs: [
          [
            "[STARTED] Print current directory",
            "[SKIPPED] Skipped by --skip option",
          ],
          "[SUCCESS] List content of directory",
          "[SUCCESS] List current processes",
        ],
      },
    ],
    [
      "skip (slug)",
      [...runSimpleCommandArguments, "--skip", "print-current-directory"],
      {
        outputs: [
          [
            "[STARTED] Print current directory",
            "[SKIPPED] Skipped by --skip option",
          ],
          "[SUCCESS] List content of directory",
          "[SUCCESS] List current processes",
        ],
      },
    ],
    [
      "skip (no-match)",
      [...runSimpleCommandArguments, "--skip", "PrInt-CuRRenT-DirEctoRy"],
      {
        failed: true,
        outputs: ["Invalid values"],
      },
    ],
    [
      "tag (existing)",
      [...runSimpleCommandArguments, "--tag", "a"],
      {
        outputs: [
          "[SUCCESS] Print current directory",
          [
            "[STARTED] List content of directory",
            "[SKIPPED] Skipped by --tag option",
          ],
          [
            "[STARTED] List current processes",
            "[SKIPPED] Skipped by --tag option",
          ],
        ],
      },
    ],
    [
      "tag (unexisting)",
      [...runSimpleCommandArguments, "--tag", "d"],
      {
        failed: true,
        outputs: ["Invalid values"],
      },
    ],
    [
      "until",
      [...runSimpleCommandArguments, "--until", "List content of directory"],
      {
        outputs: [
          "[SUCCESS] Print current directory",
          "[SUCCESS] List content of directory",
          [
            "[STARTED] List current processes",
            "[SKIPPED] Skipped by --until option",
          ],
        ],
      },
    ],
    [
      "background command",
      runBackgroundCommandArguments,
      {
        outputs: [
          [
            "[STARTED] Parent task",
            "[STARTED] Parent task [starting background process]",
            `[DATA] node --eval "setTimeout(() => {console.log('f' + 'o' + 'o'); setTimeout(() => {}, 10000)}, 500)"`,
            "[SUCCESS] Parent task [starting background process]",
            "[STARTED] Parent task [with background process]",
            "[STARTED] Print matched output",
            "[DATA] echo foo",
            "foo",
            "[SUCCESS] Print matched output",
            "[SUCCESS] Parent task [with background process]",
            "[STARTED] Parent task [stopping background process]",
            "[SUCCESS] Parent task [stopping background process]",
            "[SUCCESS] Parent task",
          ],
        ],
      },
    ],
    [
      "failed regular task",
      runErrorCommandArguments,
      {
        failed: true,
        outputs: [
          [
            "[STARTED] Nest task",
            "[STARTED] Throw exception",
            "[FAILED] Something went wrong.",
            "[FAILED] Something went wrong.",
            "[FAILED] Something went wrong.",
          ],
        ],
      },
    ],
    [
      "failed command task",
      [...runErrorCommandArguments, "--from", "Run broken copy command"],
      {
        failed: true,
        outputs: [
          [
            "[STARTED] Run broken copy command",
            "[DATA] cp unexisting-source target",
          ],
          "No such file or directory",
          [
            "[FAILED] Command failed",
            "[FAILED] Command failed",
            "Error: Command failed with exit code 1: cp unexisting-source target",
          ],
        ],
      },
    ],
    [
      "command task not matching regexp",
      [
        ...runErrorCommandArguments,
        "--from",
        "Run unmatched background command",
      ],
      {
        failed: true,
        outputs: [
          [
            "[STARTED] Run unmatched background command",
            "[STARTED] Run unmatched background command [starting background process]",
            "[DATA] ls",
            "[FAILED] Command failed",
            "[FAILED] Command failed",
            "[FAILED] Command failed",
            "Error: Background process exited before matching the regexp. Command was: ls",
          ],
        ],
      },
    ],
    [
      "rollback",
      runRollbackCommandArguments,
      {
        failed: true,
        outputs: [
          "No such file or directory",
          ["[FAILED] Command failed", "[FAILED] Command failed"],
          ["[DATA] echo rollback", "rollback"],
          "[ROLLBACK] Parent task",
        ],
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
      }: {
        readonly failed?: boolean;
        readonly outputs: ReadonlyArray<string | readonly string[]>;
      },
    ) => {
      const result = await execa("node", commandArguments, {
        reject: !failed,
      });
      expect(result.failed).toBe(failed);
      for (const output of outputs) {
        expect(`${result.stdout}${os.EOL}${result.stderr}`).toContain(
          typeof output === "string" ? output : output.join("\n"),
        );
      }
    },
  );
});
