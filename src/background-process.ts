import { ExecaChildProcess, Options } from "execa";
import { ContextLike, InternalContext } from "./context.js";
import {
  Command,
  ExecError,
  OutputLine,
  getCommandString,
  createSubprocess,
} from "./exec.js";

export const startBackgroundProcess = async <C extends ContextLike<string>>({
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
      for (const { chunks, stream } of [
        { chunks: stderrChunks, stream: backgroundProcess.stderr },
        { chunks: stdoutChunks, stream: backgroundProcess.stdout },
      ]) {
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
      }
    }),
    backgroundProcess,
  ]);

  if (!Array.isArray(matches)) {
    throw new ExecError({
      error: `Background process exited before matching the regexp. Command was: ${command}`,
      stderr: String(Buffer.concat(stderrChunks)),
      stdout: String(Buffer.concat(stdoutChunks)),
    });
  }

  return {
    backgroundProcess,
    namedCapturedGroups: (matches.groups as C) || {},
  };
};

// eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types
export const stopBackgroundProcess = ({
  backgroundProcess,
  // eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types
  kill = (backgroundProcess) => {
    backgroundProcess.kill("SIGTERM", { forceKillAfterTimeout: 30_000 });
  },
}: Readonly<{
  backgroundProcess: ExecaChildProcess;
  // eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types
  kill?: (backgroundProcess: ExecaChildProcess) => void;
}>) => {
  kill(backgroundProcess);
};
