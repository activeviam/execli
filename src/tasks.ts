import { ExecaChildProcess, Options } from "execa";
import { Command, Exec, Line, OutputLine, RunResult } from "./commands";
import { Context } from "./context";

type BaseTask = Readonly<{
  title: Line;
}>;

type RequirableTask = Readonly<{
  // Ignore --only, --skip, and --tag options
  required?: true;
}>;

type SkippableTask<C> = Readonly<{
  skip?: (context: Context<Readonly<C>>) => boolean | Promise<boolean>;
}>;

type TaggedTask = Readonly<{
  tags?: readonly Line[];
}>;

type BaseLeafTask<C> = BaseTask &
  RequirableTask &
  SkippableTask<C> &
  TaggedTask;

type CommandGetter<C> = (context: Context<Readonly<C>>) => Command;

type CommandTask<C> = BaseLeafTask<C> &
  Readonly<{
    command: Command | CommandGetter<C>;
    options?: Options;
  }>;

type RegularPayload<C> = Readonly<{
  context: Context<C>;
  exec: Exec;
  outputLine: OutputLine;
}>;

type RegularTask<C> = BaseLeafTask<C> &
  Readonly<{
    run(payload: RegularPayload<C>): RunResult;
  }>;

type BackgroundCommandPayload<C> = RegularPayload<C> &
  Readonly<{
    matches: RegExpExecArray;
  }>;

type BackgroundCommandTask<C> = CommandTask<C> &
  Readonly<{
    // eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types
    kill?: (process: ExecaChildProcess) => unknown;
    match: Readonly<RegExp>;
    // eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types
    runOnMatch(payload: BackgroundCommandPayload<C>): RunResult;
  }>;

type LeafTask<C> = BackgroundCommandTask<C> | CommandTask<C> | RegularTask<C>;

type ChildTask<C> = LeafTask<C> | ParentTask<C>;

type ParentTask<C> = BaseTask &
  SkippableTask<C> &
  Readonly<{
    children: ReadonlyArray<ChildTask<C>>;
    concurrent?: true;
  }>;

type Task<C> = LeafTask<C> | ParentTask<C>;

export { BackgroundCommandTask, CommandTask, ParentTask, RegularTask, Task };
