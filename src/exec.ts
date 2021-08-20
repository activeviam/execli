import os from "node:os";
import path from "node:path";
import execa, {
  ExecaChildProcess,
  Options,
  ExecaReturnValue,
  ExecaError,
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
      ].join(os.EOL),
    );
  }

  // eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types
  static fromExecaError({ shortMessage: error, stderr, stdout }: ExecaError) {
    return new ExecError({
      error,
      stderr,
      stdout,
    });
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
        subprocess.stdout.pipe(process.stdout);
      }

      if (subprocess.stderr) {
        subprocess.stderr.pipe(process.stderr);
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

  if (process.platform === "win32") {
    return `${Object.entries(env)
      .map(
        ([key, value]: readonly [string, string | undefined]) =>
          `SET ${key}=${value}`,
      )
      .join("&&")}&&`;
  }

  const environmentString = `${Object.entries(env)
    .map(
      ([key, value]: readonly [string, string | undefined]) =>
        `${key}=${value}`,
    )
    .join(" ")} `;

  return environmentString;
};

export const getCommandString = (
  command: Command,
  context: InternalContext,
  options: Options = {},
) =>
  hideSecrets(
    context,
    `${
      options.cwd ? `cd ${path.relative(process.cwd(), options.cwd)} && ` : ""
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
