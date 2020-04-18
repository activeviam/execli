import { ExecaChildProcess, Options } from "execa";
import { SharedContext } from "./context";
import {
  Command,
  OutputLine,
  RunResult,
  getCommandString,
  createSubprocess,
} from "./exec";

const runWithBackgroundCommand = async ({
  command,
  context,
  // eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types
  kill = (process) => {
    process.kill("SIGTERM", { forceKillAfterTimeout: 30000 });
  },
  match,
  options,
  outputLine,
  run,
}: Readonly<{
  command: Command;
  context: SharedContext;
  // eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types
  kill?: (process: ExecaChildProcess) => void;
  match: Readonly<RegExp>;
  options?: Readonly<Options>;
  outputLine: OutputLine;
  // eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types
  run: (matches: RegExpExecArray) => RunResult;
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

  const result = await run(matches);
  try {
    kill(process);
    await process;
  } catch {
    // Killed process nothing to do.
  }

  return result;
};

export { runWithBackgroundCommand };
