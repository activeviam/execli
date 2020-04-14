import { Options } from "execa";
import { Command, SetOutput } from "./commands";
import { Context } from "./context";

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

type SkippableTask<C> = Readonly<{
  skip?: (context: Context<Readonly<C>>) => boolean | Promise<boolean>;
}>;

type BaseLeafTask<C> = BaseTask & TaggedTask & SkippableTask<C>;

type CommandGetter<C> = (
  context: Context<Readonly<C>>,
) => Command | Promise<Command>;

type CommandTask<C> = BaseLeafTask<C> &
  Readonly<{
    command: Command | CommandGetter<C>;
    options?: Options;
  }>;

type RegularTask<C> = BaseLeafTask<C> &
  RequirableTask &
  Readonly<{
    run(
      // C is not readonly here because regular tasks have the right to modify it.
      context: Context<C>,
      setOutput: SetOutput,
    ): unknown | Promise<unknown>;
  }>;

type LeafTask<C> = CommandTask<C> | RegularTask<C>;

type ChildTask<C> = LeafTask<C> | ParentTask<C>;

type ParentTask<C> = BaseTask &
  SkippableTask<C> &
  Readonly<{
    children: ReadonlyArray<ChildTask<C>>;
    concurrent?: true;
  }>;

type Task<C> = LeafTask<C> | ParentTask<C>;

export { CommandTask, ParentTask, RegularTask, SetOutput, Task };
