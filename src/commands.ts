import path from "path";
import chalk from "chalk";
import execa, { ExecaChildProcess, Options, ExecaReturnValue } from "execa";
import { SharedContext } from "./context";

type Command = readonly string[];

type Line = string;

type OutputLine = (line: Line) => void;

type SyncRunResult = Line | void;
type AsyncRunResult = Promise<SyncRunResult>;
type RunResult = SyncRunResult | AsyncRunResult;

type SubprocessOptions = Options &
  Readonly<{
    silent?: true;
  }>;

const createSubprocess = (
  command: Command,
  context: SharedContext,
  options: SubprocessOptions = {},
): ExecaChildProcess => {
  const [file, ...arguments_] = command;
  const subprocess = execa(file, arguments_, options);
  if (context.debug && !options.silent) {
    if (subprocess.stdout) {
      subprocess.stdout.pipe(process.stdout);
    }

    if (subprocess.stderr) {
      subprocess.stderr.pipe(process.stderr);
    }
  }

  return subprocess;
};

const getEnvironmentString = ({ env }: Options) => {
  if (env === undefined || Object.keys(env).length === 0) {
    return "";
  }

  if (process.platform === "win32") {
    return `${Object.entries(env)
      .map(
        ([key, value]: readonly [string, string | undefined]) =>
          `SET ${key}=${value}`,
      )
      .join("&&")}&&`;
  }

  const bashEnvironmentString = `${Object.entries(env)
    .map(
      ([key, value]: readonly [string, string | undefined]) =>
        `${key}=${value}`,
    )
    .join(" ")} `;

  return process.env.SHELL && process.env.SHELL.endsWith("fish")
    ? `env ${bashEnvironmentString}`
    : bashEnvironmentString;
};

const getCommandString = (
  command: Command,
  options: Options = {},
  background = false,
) =>
  `${
    options.cwd ? `cd ${path.relative(process.cwd(), options.cwd)} && ` : ""
  }${getEnvironmentString(options)}${command
    .map((part) => (part.includes(" ") ? `"${part}"` : part))
    .join(" ")}${background ? " &" : ""}`;

type Exec = (
  command: Command,
  options?: SubprocessOptions,
) => Promise<ExecaReturnValue>;

const createExec = (
  context: SharedContext,
  outputLine: OutputLine,
): Exec => async (command, options = {}) => {
  if (!options.silent) {
    outputLine(getCommandString(command, options));
  }

  const subprocess = createSubprocess(command, context, options);
  const result = await subprocess;
  return result;
};

const processCommandError = (context: SharedContext, error: any) => {
  const log = context.debug
    ? () => {
        // NOP
      }
    : (message: string) => {
        // eslint-disable-next-line no-console
        console.error(message);
      };

  /* eslint-disable @typescript-eslint/no-unsafe-member-access */
  if (error.command) {
    log("");
    Reflect.deleteProperty(error, "all");
    log("Failed command:");
    log(chalk.green(error.command));
    Reflect.deleteProperty(error, "command");
    log("STDOUT:");
    log(chalk.gray(error.stdout));
    Reflect.deleteProperty(error, "stdout");
    log("STDERR:");
    log(chalk.red(error.stderr));
    Reflect.deleteProperty(error, "stderr");
    log("");
  }
  /* eslint-enable @typescript-eslint/no-unsafe-member-access */
};

const withBackgroundCommand = async ({
  command,
  context,
  // eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types
  kill = (process) => {
    process.kill("SIGTERM", { forceKillAfterTimeout: 30000 });
  },
  match,
  options,
  outputLine,
  runOnMatch,
}: Readonly<{
  command: Command;
  context: SharedContext;
  // eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types
  kill?: (process: ExecaChildProcess) => void;
  match: Readonly<RegExp>;
  options?: Readonly<Options>;
  outputLine: OutputLine;
  // eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types
  runOnMatch: (matches: RegExpExecArray) => RunResult;
}>): Promise<string | void> => {
  const commandString = getCommandString(command, options, true);
  outputLine(commandString);
  const process = createSubprocess(command, context, options);

  const stderrChunks: Buffer[] = [];
  const stdoutChunks: Buffer[] = [];

  const matches = await Promise.race([
    new Promise<RegExpExecArray>((resolve) => {
      [
        { chunks: stderrChunks, stream: process.stderr },
        { chunks: stdoutChunks, stream: process.stdout },
      ].forEach(
        // eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types
        ({ chunks, stream }) => {
          if (stream !== null) {
            // eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types
            const listener = (chunk: Buffer) => {
              chunks.push(chunk);
              const localMatches = match.exec(String(chunk));
              if (localMatches) {
                stream.removeListener("data", listener);
                resolve(localMatches);
              }
            };

            stream.addListener("data", listener);
          }
        },
      );
    }),
    process,
  ]);

  if (!Array.isArray(matches)) {
    const error = new Error(
      "The background process exited before we had a regexp match",
    ) as any;
    /* eslint-disable @typescript-eslint/no-unsafe-member-access */
    error.command = commandString;
    error.stderr = String(Buffer.concat(stderrChunks));
    error.stdout = String(Buffer.concat(stdoutChunks));
    /* eslint-enable @typescript-eslint/no-unsafe-member-access */
    throw error;
  }

  const result = await runOnMatch(matches);
  try {
    kill(process);
    await process;
  } catch {
    // Killed process nothing to do.
  }

  return result;
};

export {
  Command,
  Exec,
  createExec,
  getCommandString,
  Line,
  processCommandError,
  OutputLine,
  RunResult,
  withBackgroundCommand,
};
