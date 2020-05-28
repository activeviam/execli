import { ExecaChildProcess, Options } from "execa";
import { ContextLike, InternalContext } from "./context";
import {
  Command,
  OutputLine,
  getCommandString,
  createSubprocess,
} from "./exec";

const startBackgroundProcess = async <C extends ContextLike<string>>({
  command,
  context,
  match,
  options,
  outputLine,
}: Readonly<{
  command: Command;
  context: InternalContext;
  match: Readonly<RegExp>;
  options?: Readonly<Options>;
  outputLine: OutputLine;
}>): Promise<{
  backgroundProcess: ExecaChildProcess;
  namedCapturedGroups: C;
}> => {
  const commandString = getCommandString(command, context, options);
  outputLine(commandString);
  const backgroundProcess = createSubprocess(command, context, {
    ...options,
    silent: true,
  });

  const stderrChunks: Buffer[] = [];
  const stdoutChunks: Buffer[] = [];

  const matches = await Promise.race([
    new Promise<RegExpExecArray>((resolve) => {
      [
        { chunks: stderrChunks, stream: backgroundProcess.stderr },
        { chunks: stdoutChunks, stream: backgroundProcess.stdout },
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
    backgroundProcess,
  ]);

  if (!Array.isArray(matches)) {
    const error = new Error(
      "The background process exited before matching the given regexp",
    ) as any;
    error.command = commandString;
    error.stderr = String(Buffer.concat(stderrChunks));
    error.stdout = String(Buffer.concat(stdoutChunks));
    throw error;
  }

  return {
    backgroundProcess,
    namedCapturedGroups: (matches.groups as C) || {},
  };
};

// eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types
const stopBackgroundProcess = ({
  backgroundProcess,
  // eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types
  kill = (backgroundProcess) => {
    backgroundProcess.kill("SIGTERM", { forceKillAfterTimeout: 30000 });
  },
}: Readonly<{
  backgroundProcess: ExecaChildProcess;
  // eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types
  kill?: (backgroundProcess: ExecaChildProcess) => void;
}>) => {
  kill(backgroundProcess);
};

export { startBackgroundProcess, stopBackgroundProcess };
