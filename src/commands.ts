import path from "path";
import chalk from "chalk";
import execa from "execa";
import { SharedContext } from "./context";

const cwd = process.cwd();

type Command = readonly string[];

type SetOutput = (output: string) => void;

type BackgroundProcess<T> = Readonly<{
  // eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types
  callback: (matches: RegExpExecArray) => Promise<T>;
  command: Command;
  context: SharedContext;
  // eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types
  kill?: (process: execa.ExecaChildProcess) => void;
  options?: Readonly<execa.Options>;
  regexp: Readonly<RegExp>;
  setOutput: SetOutput;
  stream: "stderr" | "stdout";
}>;

const createSubprocess = (
  command: Command,
  context: SharedContext,
  options: execa.Options = {},
): execa.ExecaChildProcess => {
  const [file, ...arguments_] = command;
  const subprocess = execa(file, arguments_, {
    ...options,
    cwd: options.cwd ?? cwd,
  });
  if (context.debug) {
    if (subprocess.stdout) {
      subprocess.stdout.pipe(process.stdout);
    }

    if (subprocess.stderr) {
      subprocess.stderr.pipe(process.stderr);
    }
  }

  return subprocess;
};

const getEnvironmentString = ({ env }: execa.Options) => {
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

const getCommandString = (command: Command, options: execa.Options = {}) =>
  `${
    options.cwd ? `cd ${path.relative(cwd, options.cwd)} && ` : ""
  }${getEnvironmentString(options)}${command
    .map((part) => (part.includes(" ") ? `"${part}"` : part))
    .join(" ")}`;

const exec = async (
  command: Command,
  context: SharedContext,
  setOutput: SetOutput,
  options: execa.Options = {},
) => {
  setOutput(getCommandString(command, options));
  const subprocess = createSubprocess(command, context, options);
  const { stdout } = await subprocess;
  return stdout;
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

const withBackgroundProcess = async <T>({
  callback,
  command,
  context,
  // eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types
  kill = (process) => {
    process.kill("SIGTERM", { forceKillAfterTimeout: 30000 });
  },
  options,
  regexp,
  setOutput,
  stream,
}: BackgroundProcess<T>): Promise<T> => {
  const commandString = getCommandString(command, options);
  setOutput(commandString);
  const process = createSubprocess(command, context, options);
  const outputStream = process[stream];
  if (!outputStream) {
    throw new Error(`Missing stream ${stream} on process.`);
  }

  const chunks: Buffer[] = [];
  const matches = await Promise.race([
    new Promise<RegExpExecArray>((resolve) => {
      // eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types
      const listener = (chunk: Buffer) => {
        chunks.push(chunk);
        const localMatches = regexp.exec(String(chunk));
        if (localMatches) {
          outputStream.removeListener("data", listener);
          resolve(localMatches);
        }
      };

      outputStream.addListener("data", listener);
    }),
    process,
  ]);

  if (!Array.isArray(matches)) {
    const error = new Error(
      "The background process exited before we had a regexp match",
    ) as any;
    /* eslint-disable @typescript-eslint/no-unsafe-member-access */
    error.command = commandString;
    error[stream] = String(Buffer.concat(chunks));
    /* eslint-enable @typescript-eslint/no-unsafe-member-access */
    throw error;
  }

  const result = await callback(matches);
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
  exec,
  getCommandString,
  processCommandError,
  SetOutput,
  withBackgroundProcess,
};
