import { EOL } from "node:os";
import { relative } from "node:path";
import { cwd, platform, stderr, stdout } from "node:process";
import {
  execa,
  ExecaChildProcess,
  ExecaError,
  ExecaReturnValue,
  Options,
} from "execa";
import { hideSecrets, InternalContext, SharedContext } from "./context.js";

export type Command = readonly string[];

export type Line = string;

export type OutputLine = (line: Line) => void;

type SubprocessOptions = Options &
  Readonly<{
    /** Does not pipe the IO in debug mode and does not output a line for the running command in the corresponding task. */
    silent?: true;
  }>;

const isExecaError = (error: unknown): error is ExecaError =>
  error instanceof Error && "command" in error && "isCanceled" in error;

export class ExecError extends Error {
  static fromExecaError({ shortMessage: error, stderr, stdout }: ExecaError) {
    return new ExecError({
      error,
      stderr,
      stdout,
    });
  }

  readonly error: string;
  readonly stderr: string;
  readonly stdout: string;

  constructor({
    error,
    stderr,
    stdout,
  }: Readonly<{
    error: string;
    exitCode?: number;
    stderr: string;
    stdout: string;
  }>) {
    super("Command failed");
    this.error = error;
    this.stderr = stderr.trim();
    this.stdout = stdout.trim();
  }

  toDetailedError({ withOutputs }: Readonly<{ withOutputs: boolean }>) {
    return new Error(
      [
        this.error,
        ...(withOutputs
          ? [
              ...(this.stdout.length > 0 ? ["STDOUT:", this.stdout] : []),
              ...(this.stderr.length > 0 ? ["STDERR:", this.stderr] : []),
            ]
          : []),
      ].join(EOL),
    );
  }
}

export const createSubprocess = (
  command: Command,
  context: SharedContext,
  options: SubprocessOptions = {},
): ExecaChildProcess => {
  const [file, ...arguments_] = command;

  try {
    const subprocess = execa(file, arguments_, options);

    if (context.debug && !options.silent) {
      if (subprocess.stdout) {
        subprocess.stdout.pipe(stdout);
      }

      if (subprocess.stderr) {
        subprocess.stderr.pipe(stderr);
      }
    }

    return subprocess;
  } catch (error: unknown) {
    if (isExecaError(error)) {
      throw ExecError.fromExecaError(error);
    }

    throw error;
  }
};

const getEnvironmentString = ({ env }: Options) => {
  if (env === undefined || Object.keys(env).length === 0) {
    return "";
  }

  return `${Object.entries(env)
    .map(
      ([key, value]) =>
        `${platform === "win32" ? "SET " : ""}${key}=${
          value === undefined ? "false" : value
        }`,
    )
    .join(platform === "win32" ? "&&" : " ")}${
    platform === "win32" ? "&&" : " "
  }`;
};

const getCommandRelativeDirectory = (
  commandDirectory: string | URL,
): string | undefined => {
  if (commandDirectory instanceof URL) {
    throw new TypeError(
      `Directories of type URL are not supported: ${commandDirectory}`,
    );
  }

  return relative(cwd(), commandDirectory);
};

export const getCommandString = (
  command: Command,
  context: InternalContext,
  options: Options = {},
) =>
  hideSecrets(
    context,
    `${
      options.cwd ? `cd ${getCommandRelativeDirectory(options.cwd)} && ` : ""
    }${getEnvironmentString(options)}${command
      .map((part) => (part.includes(" ") ? `"${part}"` : part))
      .join(" ")}`,
  );

export type Exec = (
  command: Command,
  options?: SubprocessOptions,
) => Promise<ExecaReturnValue>;

export const createExec =
  (context: InternalContext, outputLine: OutputLine): Exec =>
  async (command, options = {}) => {
    if (!options.silent) {
      outputLine(getCommandString(command, context, options));
    }

    const subprocess = createSubprocess(command, context, options);

    try {
      const result = await subprocess;
      return result;
    } catch (error: unknown) {
      if (isExecaError(error)) {
        throw ExecError.fromExecaError(error);
      }

      throw error;
    }
  };
