import { Options } from "execa";
import { Command, SetOutput } from "./commands";
import { SharedContext } from "./context";

type BaseTask = Readonly<{
  title: string;
}>;

type TaggedTask = Readonly<{
  tags?: readonly string[];
}>;

type RequirableTask = Readonly<{
  // Ignore --only, --skip, and --tag options
  required?: true;
}>;

type SkippableTask<Context extends SharedContext> = Readonly<{
  skip?: (context: Readonly<Context>) => boolean;
}>;

type BaseLeafTask<Context extends SharedContext> = BaseTask &
  TaggedTask &
  SkippableTask<Context>;

type CommandGetter<Context extends SharedContext> = (
  context: Readonly<Context>,
) => Command;

type CommandTask<Context extends SharedContext> = BaseLeafTask<Context> &
  Readonly<{
    command: Command | CommandGetter<Context>;
    options?: Options;
  }>;

type RegularTask<Context extends SharedContext> = BaseLeafTask<Context> &
  RequirableTask &
  Readonly<{
    // Context is not readonly here because regular tasks have the right to modify it.
    run(context: Context, setOutput: SetOutput): void | Promise<unknown>;
  }>;

type LeafTask<Context extends SharedContext> =
  | CommandTask<Context>
  | RegularTask<Context>;

type ChildTask<Context extends SharedContext> =
  | LeafTask<Context>
  | ParentTask<Context>;

type ParentTask<Context extends SharedContext> = BaseTask &
  SkippableTask<Context> &
  Readonly<{
    children: ReadonlyArray<ChildTask<Context>>;
    concurrent?: true;
  }>;

type Task<Context extends SharedContext> =
  | LeafTask<Context>
  | ParentTask<Context>;

export { CommandTask, ParentTask, RegularTask, SetOutput, Task };
