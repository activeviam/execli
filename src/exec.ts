import path from "path";
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

export {
  Command,
  Exec,
  createExec,
  createSubprocess,
  getCommandString,
  Line,
  OutputLine,
  RunResult,
};
