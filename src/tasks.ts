import { ExecaChildProcess, Options } from "execa";
import Listr, { ListrTask, ListrTaskWrapper } from "listr";
import slugify from "slugify";
import { runWithBackgroundCommand } from "./background-process";
import { Context, InternalContext } from "./context";
import {
  Command,
  createExec,
  Exec,
  getCommandString,
  Line,
  OutputLine,
  RunResult,
} from "./exec";

type BaseTask = Readonly<{
  title: Line;
}>;

type RequirableTask = Readonly<{
  // Ignore --only, --skip, and --tag options
  required?: true;
}>;

type SkipResult = boolean | string | void | Promise<boolean>;

type SkippableTask<C> = Readonly<{
  skip?: (context: Context<Readonly<C>>) => SkipResult;
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

const getSkipReason = (optionName: keyof InternalContext) =>
  `Skipped by --${optionName} option`;

const skipByOnlyOption = (
  ancestorWhitelisted: boolean,
  context: InternalContext,
  title: string,
) => {
  if (
    // A task with an ancester matching the --only option can run.
    ancestorWhitelisted ||
    // If the --only option isn't given, the task can run.
    context.only.length === 0 ||
    // If the task's title is one of the --only titles given, the task can run.
    context.only.includes(title)
  ) {
    return false;
  }

  // Otherwise, the task is skipped.
  return getSkipReason("only");
};

const skipByTagOption = (
  context: InternalContext,
  tags: readonly string[] = [],
) => {
  // If some --tag were given but the task includes none of them, it is skipped.
  if (
    context.tag.length > 0 &&
    context.tag.every((givenTag) => !tags.includes(givenTag))
  ) {
    return getSkipReason("tag");
  }

  return false;
};

const skipByOnlyOrTagOptions = (
  ancestorWhitelisted: boolean,
  context: InternalContext,
  title: string,
  tags?: readonly string[],
) =>
  skipByOnlyOption(ancestorWhitelisted, context, title) ||
  skipByTagOption(context, tags);

const shouldSkipByTaskProperty = <C>(
  context: Context<C>,
  {
    skip = async () => Promise.resolve(false),
  }: ListrTask<C> | SkippableTask<C>,
): SkipResult => {
  const result = skip(context);

  if (typeof result === "string") {
    return result;
  }

  if (!result) {
    return "Tasked skipped itself";
  }

  return result;
};

const skipCommandTask = <C extends InternalContext>(
  ancestorWhitelisted: boolean,
  context: C,
  task: CommandTask<C>,
): SkipResult => {
  if (task.required) {
    return false;
  }

  return (
    skipByOnlyOrTagOptions(
      ancestorWhitelisted,
      context,
      task.title,
      task.tags,
    ) || shouldSkipByTaskProperty(context, task)
  );
};

const addDetailsToTaskTitle = (title: string, details: string) =>
  `${title} (${details})`;

const dryRunCommandTask = <C extends InternalContext>(
  commandString: string,
  title: string,
  // eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types
  taskWrapper: ListrTaskWrapper<C>,
) => {
  taskWrapper.title = addDetailsToTaskTitle(title, `$ ${commandString}`);
  taskWrapper.skip(getSkipReason("dryRun"));
};

const getCommand = <C extends InternalContext>(
  context: C,
  { command }: CommandTask<C>,
) => (typeof command === "function" ? command(context) : command);

// eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types
const createOutputLine = (taskWrapper: ListrTaskWrapper): OutputLine => (
  line,
) => {
  if (/\r?\n/.test(line)) {
    throw new Error(`Output line cannot contain line break:\n\n: ${line}`);
  }

  taskWrapper.output = line;
};

const createSkippableTask = <C extends InternalContext>(
  task: Readonly<ListrTask<C>>,
): ListrTask<C> => ({
  ...task,
  skip(context) {
    // If the task's title is one of the --skip titles given, the task is skipped.
    if (context.skip.includes(task.title)) {
      return getSkipReason("skip");
    }

    return shouldSkipByTaskProperty(context, task);
  },
});

const createBackgroundCommandTask = <C extends InternalContext>(
  ancestorWhitelisted: boolean,
  task: BackgroundCommandTask<C>,
): ListrTask<C> =>
  createSkippableTask({
    skip: (context) => skipCommandTask(ancestorWhitelisted, context, task),
    // eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types
    async task(context, taskWrapper) {
      const command = getCommand(context, task);

      if (context.dryRun) {
        dryRunCommandTask(
          getCommandString(command, task.options, true),
          task.title,
          taskWrapper,
        );
      } else {
        const outputLine = createOutputLine(taskWrapper);
        return runWithBackgroundCommand({
          command,
          context,
          kill: task.kill,
          match: task.match,
          options: task.options,
          outputLine,
          // eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types
          async run(matches) {
            const exec = createExec(context, outputLine);
            const result = await task.runOnMatch({
              context,
              exec,
              matches,
              outputLine,
            });
            if (result) {
              outputLine(result);
            }
          },
        });
      }
    },
    title: task.title,
  });

const createCommandTask = <C extends InternalContext>(
  ancestorWhitelisted: boolean,
  task: CommandTask<C>,
): ListrTask<C> =>
  createSkippableTask({
    skip: (context) => skipCommandTask(ancestorWhitelisted, context, task),
    // eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types
    async task(context, taskWrapper) {
      const command = getCommand(context, task);

      if (context.dryRun) {
        dryRunCommandTask(
          getCommandString(command, task.options),
          task.title,
          taskWrapper,
        );
      } else {
        await createExec(context, createOutputLine(taskWrapper))(
          command,
          task.options,
        );
      }
    },
    title: task.title,
  });

const createRegularTask = <C extends InternalContext>(
  ancestorWhitelisted: boolean,
  task: RegularTask<C>,
): ListrTask<C> =>
  createSkippableTask({
    skip(context) {
      if (task.required) {
        return false;
      }

      if (context.dryRun) {
        return getSkipReason("dryRun");
      }

      return (
        skipByOnlyOrTagOptions(
          ancestorWhitelisted,
          context,
          task.title,
          task.tags,
        ) || shouldSkipByTaskProperty(context, task)
      );
    },
    // eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types
    async task(context, taskWrapper) {
      const outputLine = createOutputLine(taskWrapper);
      const exec = createExec(context, outputLine);
      const result = await task.run({ context, exec, outputLine });
      if (result) {
        outputLine(result);
      }
    },
    title: task.title,
  });

const createParentTask = <C extends InternalContext>(
  ancestorWhitelisted: boolean,
  { children, concurrent, skip, title }: ParentTask<C>,
): ListrTask<C> =>
  createSkippableTask({
    skip,
    task(context) {
      const tasks = children.map((childTask) =>
        createListrTask(
          childTask,
          ancestorWhitelisted || context.only.includes(title),
        ),
      );
      return new Listr(
        tasks,
        concurrent && !context.debug ? { concurrent: true } : undefined,
      );
    },
    title,
  });

const isBackgroundCommandTask = <C>(
  task: Task<C>,
): task is BackgroundCommandTask<C> =>
  ["match", "runOnMatch"].every((property) =>
    Object.prototype.hasOwnProperty.call(task, property),
  );

const isCommandTask = <C>(task: Task<C>): task is CommandTask<C> =>
  Object.prototype.hasOwnProperty.call(task, "command");

const isParentTask = <C>(task: Task<C>): task is ParentTask<C> =>
  Object.prototype.hasOwnProperty.call(task, "children");

const isRegularTask = <C>(task: Task<C>): task is RegularTask<C> =>
  Object.prototype.hasOwnProperty.call(task, "run");

// This function is called recursively in functions declared above
// so it has to be hoisted and declared with the "function" keyword.
// eslint-disable-next-line func-style
function createListrTask<C extends InternalContext>(
  task: Task<C>,
  ancestorWhitelisted = false,
): ListrTask<C> {
  if (isBackgroundCommandTask(task)) {
    return createBackgroundCommandTask(ancestorWhitelisted, task);
  }

  if (isCommandTask(task)) {
    return createCommandTask(ancestorWhitelisted, task);
  }

  if (isRegularTask(task)) {
    return createRegularTask(ancestorWhitelisted, task);
  }

  return createParentTask(ancestorWhitelisted, task);
}

const addAllTitleSlugsAndTags = <C>(
  task: Task<C>,
  // This function is called recursively to fill these arguments.
  /* eslint-disable @typescript-eslint/prefer-readonly-parameter-types */
  slugToTitle: { [TKey: string]: string },
  tags: string[],
  /* eslint-enable @typescript-eslint/prefer-readonly-parameter-types */
) => {
  // Slugs are useful on envrionments that don't support quotes in commands.
  // They are also easier and quicker to type.
  const slug = slugify(task.title.toLowerCase());

  if (slugToTitle[slug]) {
    throw new Error(`Two tasks have the same title slug: ${slug}`);
  }

  slugToTitle[slug] = task.title;

  if (isParentTask(task)) {
    task.children.forEach((childTask) => {
      addAllTitleSlugsAndTags(childTask, slugToTitle, tags);
    });
  } else {
    (task.tags ?? []).forEach((tag) => {
      if (!tags.includes(tag)) {
        tags.push(tag);
      }
    });
  }
};

export { addAllTitleSlugsAndTags, createListrTask, Task };
