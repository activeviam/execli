import chalk from "chalk";
import { ExecaChildProcess, Options } from "execa";
import Listr, { ListrTask, ListrTaskWrapper } from "listr";
import {
  stopBackgroundProcess,
  startBackgroundProcess,
} from "./background-process";
import {
  Context,
  ContextLike,
  ContextHolder,
  createContextHolder,
  InternalContext,
  InternalOptionsContext,
  getUserContext,
  SharedContext,
} from "./context";
import {
  Command,
  createExec,
  Exec,
  getCommandString,
  Line,
  OutputLine,
} from "./exec";

type BaseTask = Readonly<{
  title: Line;
}>;

type SkipResult = boolean | string | void | Promise<boolean>;

type SkippableTask<C> = Readonly<{
  skip?: (context: Context<C>) => SkipResult;
}>;

type TaggedTask = Readonly<{
  tags?: readonly Line[];
}>;

type BaseLeafTask<C> = BaseTask & SkippableTask<C> & TaggedTask;

type CommandGetter<C> = (context: Context<C>) => Command;

type OptionsGetter<C> = (context: Context<C>) => Options;

type CommandProperties<C> = Readonly<{
  command: Command | CommandGetter<C>;
  options?: Options | OptionsGetter<C>;
}>;

type CommandTask<C> = BaseLeafTask<C> & CommandProperties<C>;

type RegularTask<C> = BaseLeafTask<C> &
  Readonly<{
    run: (
      payload: Readonly<{
        context: Context<C>;
        exec: Exec;
        outputLine: OutputLine;
      }>,
    ) => Line | void | Promise<Line | void>;
  }>;

type LeafTask<C> = CommandTask<C> | RegularTask<C>;

type IntersectableContext<C, V = unknown> = C extends ContextLike<V>
  ? C
  : unknown;

type NestedChildrenMarker = false;

type ParentTask<C, A, B> = BaseTask &
  SkippableTask<IntersectableContext<C>> &
  (A extends ContextLike
    ? Readonly<{
        addContext: (
          payload: Readonly<{
            /**
             * Secrets will be redacted in displayed command strings.
             */
            addSecret: (secret: string) => void;
            context: Context<IntersectableContext<C>>;
            exec: Exec;
          }>,
        ) => A | Promise<A>;
      }>
    : unknown) &
  (B extends ContextLike<string>
    ? Readonly<{
        background: CommandProperties<
          IntersectableContext<C> & IntersectableContext<A>
        > &
          Readonly<{
            // eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types
            kill?: (backgroundProcess: ExecaChildProcess) => void;
            /**
             * Once this regexp matches the stderr or stdout of the background process,
             * the children tasks will start with the captured named groups in their context.
             * When running dry, the value of the named groups will be set to their name.
             */
            match: Readonly<RegExp>;
          }>;
      }>
    : unknown) &
  Readonly<{
    children: A extends NestedChildrenMarker
      ? any
      : B extends NestedChildrenMarker
      ? any
      : ReadonlyArray<
          Task<
            IntersectableContext<C> &
              IntersectableContext<A> &
              IntersectableContext<B, string>,
            NestedChildrenMarker,
            NestedChildrenMarker
          >
        >;
    concurrent?: boolean | number;
  }>;

type Task<C = void, A = void, B = void> = LeafTask<C> | ParentTask<C, A, B>;

type FlatTask = Readonly<{
  parentTitle?: string;
}> &
  (TaggedTask | Readonly<{ children: readonly string[] }>);

type MutableFlatTasks = { [title: string]: FlatTask };
type FlatTasks = Readonly<MutableFlatTasks>;

const buildFlatTasks = (
  task: Task<any>,
  // eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types
  flatTasks: MutableFlatTasks = {},
  parentTitle?: string,
): FlatTasks => {
  if (task.title in flatTasks) {
    throw new Error(`Two tasks have the same title: ${task.title}`);
  }

  flatTasks[task.title] = {
    ...(isParentTask(task)
      ? { children: task.children.map(({ title }) => title) }
      : {}),
    parentTitle,
    tags: "tags" in task ? task.tags : undefined,
  };

  if (isParentTask(task)) {
    Object.values(task.children).forEach((childTask) => {
      buildFlatTasks(childTask, flatTasks, task.title);
    });
  }

  return flatTasks;
};

type SkippedByOption = keyof Pick<
  InternalOptionsContext,
  "dryRun" | "only" | "skip" | "tag"
>;

type MutableStaticallySkippedTasks = {
  [title: string]: Exclude<SkippedByOption, "dryRun">;
};
type StaticallySkippedTasks = Readonly<MutableStaticallySkippedTasks>;

const buildStaticallySkippedTasks = (
  context: InternalOptionsContext,
  flatTasks: FlatTasks,
  taskTitle: string,
  // eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types
  staticallySkippedTasks: MutableStaticallySkippedTasks = {},
  ancestorMatchedOnlyOption = false,
  // eslint-disable-next-line max-params
): StaticallySkippedTasks => {
  const matchedOnlyOption =
    ancestorMatchedOnlyOption || context.only.includes(taskTitle);
  const task = flatTasks[taskTitle];

  if (staticallySkippedTasks[taskTitle]) {
    // NOP
  } else if (context.skip.length > 0 && context.skip.includes(taskTitle)) {
    staticallySkippedTasks[taskTitle] = "skip";
  } else if ("children" in task) {
    task.children?.forEach((childTaskTitle) => {
      buildStaticallySkippedTasks(
        context,
        flatTasks,
        childTaskTitle,
        staticallySkippedTasks,
        matchedOnlyOption,
      );
    });
  } else if (context.only.length > 0 && !matchedOnlyOption) {
    staticallySkippedTasks[taskTitle] = "only";
  } else if (
    context.tag.length > 0 &&
    context.tag.every(
      (givenTag) => !(("tags" in task && task.tags) || []).includes(givenTag),
    )
  ) {
    staticallySkippedTasks[taskTitle] = "tag";
  }

  return staticallySkippedTasks;
};

const getSkipReason = (option: SkippedByOption) =>
  `Skipped by --${option} option`;

const skipByOnlyOption = (
  skippedTasks: StaticallySkippedTasks,
  title: string,
) => (skippedTasks[title] === "only" ? getSkipReason("only") : false);

const skipByTagOption = (skippedTasks: StaticallySkippedTasks, title: string) =>
  skippedTasks[title] === "tag" ? getSkipReason("tag") : false;

const skipByOnlyOrTagOptions = <C>(
  skippedTasks: StaticallySkippedTasks,
  title: string,
) =>
  skipByOnlyOption(skippedTasks, title) || skipByTagOption(skippedTasks, title);

const shouldSkipByTaskProperty = <C>(
  context: Context<C> & InternalContext,
  task: Readonly<ListrTask<void>> | SkippableTask<C>,
): SkipResult => {
  let result;

  if (task.skip) {
    result = "task" in task ? task.skip() : task.skip(getUserContext(context));
  }

  if (typeof result === "string") {
    return result;
  }

  if (result === true) {
    return "Tasked skipped itself";
  }

  return result;
};

const skipCommandTask = <C>(
  context: Context<C> & InternalContext,
  skippedTasks: StaticallySkippedTasks,
  task: CommandTask<C>,
): SkipResult =>
  skipByOnlyOrTagOptions(skippedTasks, task.title) ||
  shouldSkipByTaskProperty(context, task);

const addDetailsToTaskTitle = (title: string, details: string) =>
  `${title} (${details})`;

const processCommandProperties = <C>(
  commandProperties: CommandProperties<C>,
  context: Context<C> & InternalContext,
  title: string,
  // eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types
  taskWrapper: ListrTaskWrapper<void>,
): Readonly<{ command: Command; options: Options }> | void => {
  const userContext = getUserContext(context);

  let command: Command | undefined;
  let options: Options | undefined;

  if (
    context.dryRun &&
    (typeof commandProperties.command === "function" ||
      typeof commandProperties.options === "function")
  ) {
    const proxiedUserContext = new Proxy(userContext, {
      get(proxied, key) {
        if (key in proxied) {
          // @ts-expect-error
          return proxied[key];
        }

        return "__contextual";
      },
    });

    try {
      command =
        typeof commandProperties.command === "function"
          ? commandProperties.command(proxiedUserContext)
          : commandProperties.command;
      options =
        typeof commandProperties.options === "function"
          ? commandProperties.options(proxiedUserContext)
          : commandProperties.options ?? {};
    } catch {
      taskWrapper.title = addDetailsToTaskTitle(title, "contextual command");

      taskWrapper.skip(getSkipReason("dryRun"));
      return;
    }
  }

  if (command === undefined) {
    command =
      typeof commandProperties.command === "function"
        ? commandProperties.command(userContext)
        : commandProperties.command;
  }

  if (options === undefined) {
    options =
      typeof commandProperties.options === "function"
        ? commandProperties.options(userContext)
        : commandProperties.options ?? {};
  }

  if (context.dryRun) {
    const commandString = getCommandString(command, context, options);
    taskWrapper.title = addDetailsToTaskTitle(title, `$ ${commandString}`);
    taskWrapper.skip(getSkipReason("dryRun"));
    return;
  }

  return { command, options };
};

// eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types
const createOutputLine = (taskWrapper: ListrTaskWrapper<void>): OutputLine => (
  line,
) => {
  if (/\r?\n/.test(line)) {
    throw new Error(`Output line cannot contain line break:\n\n: ${line}`);
  }

  taskWrapper.output = line;
};

const createSkippableTask = <C>(
  context: Context<C> & InternalContext,
  skippedTasks: StaticallySkippedTasks,
  task: Readonly<ListrTask<void>>,
): ListrTask<void> => ({
  ...task,
  skip() {
    if (skippedTasks[task.title] === "skip") {
      return getSkipReason("skip");
    }

    return shouldSkipByTaskProperty(context, task);
  },
});

const isCommandTask = <C>(task: Task<C>): task is CommandTask<C> =>
  "command" in task;

const isRegularTask = <C>(task: Task<C>): task is RegularTask<C> =>
  "run" in task;

const isParentTask = <C, A, B>(
  task: Task<C, A, B>,
): task is ParentTask<C, A, B> => "children" in task;

const createCommandTask = <C>(
  contextHolder: ContextHolder<C>,
  skippedTasks: StaticallySkippedTasks,
  task: CommandTask<C>,
): ListrTask<void> =>
  createSkippableTask(contextHolder.get(), skippedTasks, {
    skip: () => skipCommandTask(contextHolder.get(), skippedTasks, task),
    // eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types
    async task(_, taskWrapper) {
      const context = contextHolder.get();
      const commandProperties = processCommandProperties(
        task,
        context,
        task.title,
        taskWrapper,
      );

      if (commandProperties) {
        const exec = createExec(context, createOutputLine(taskWrapper));
        await exec(commandProperties.command, commandProperties.options);
      }
    },
    title: task.title,
  });

const createRegularTask = <C>(
  contextHolder: ContextHolder<C>,
  skippedTasks: StaticallySkippedTasks,
  task: RegularTask<C>,
): ListrTask<void> =>
  createSkippableTask(contextHolder.get(), skippedTasks, {
    skip() {
      const context = contextHolder.get();
      if (context.dryRun) {
        return getSkipReason("dryRun");
      }

      return (
        skipByOnlyOrTagOptions(skippedTasks, task.title) ||
        shouldSkipByTaskProperty(context, task)
      );
    },
    // eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types
    async task(_, taskWrapper) {
      const context = contextHolder.get();
      const outputLine = createOutputLine(taskWrapper);
      const exec = createExec(context, outputLine);
      const result = await task.run({
        context: getUserContext(context),
        exec,
        outputLine,
      });
      if (result) {
        outputLine(result);
      }
    },
    title: task.title,
  });

const getStaticParentTaskSkipReason = <A, B, C>(
  skippedTasks: StaticallySkippedTasks,
  task: ParentTask<C, A, B>,
): false | string => {
  const selfSkipReason = skippedTasks[task.title];
  if (selfSkipReason) {
    return getSkipReason(selfSkipReason);
  }

  if (
    task.children.every((childTask) =>
      isParentTask(childTask)
        ? getStaticParentTaskSkipReason(skippedTasks, childTask)
        : skippedTasks[childTask.title],
    )
  ) {
    return "All children are skipped";
  }

  return false;
};

const createParentTask = <C, A, B>(
  contextHolder: ContextHolder<C>,
  skippedTasks: StaticallySkippedTasks,
  task: ParentTask<C, A, B>,
): ListrTask<void> =>
  createSkippableTask(contextHolder.get(), skippedTasks, {
    skip() {
      const staticSkipReason = getStaticParentTaskSkipReason(
        skippedTasks,
        task,
      );

      if (staticSkipReason) {
        return staticSkipReason;
      }

      if (task.skip) {
        const context = contextHolder.get();
        const userContext = getUserContext(context) as Context<
          IntersectableContext<C>
        >;
        return task.skip(userContext);
      }
    },
    task() {
      const ownContextHolder: ContextHolder<C> = contextHolder.copy();
      const { debug, dryRun } = ownContextHolder.get();

      let childrenTask = new Listr(
        task.children.map((childTask) =>
          createListrTask(
            ownContextHolder,
            skippedTasks,
            // @ts-expect-error
            childTask,
          ),
        ),
        {
          concurrent: !debug && task.concurrent,
        },
      );

      if ("background" in task) {
        const childrenTaskWithBackgroundProcess = childrenTask;
        const {
          command: commandOrCommandGetter,
          kill,
          match,
          options: optionsOrOptionsGetter,
        } = (task as ParentTask<C, A, B & ContextLike<string>>).background;
        const backgroundProcessStartingTaskTitle = `${task.title} [starting background process]`;

        let backgroundProcess: ExecaChildProcess;

        childrenTask = new Listr([
          {
            // eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types
            async task(_, taskWrapper) {
              const context = ownContextHolder.get() as Context<
                IntersectableContext<C> & IntersectableContext<A>
              > &
                InternalContext;

              const commandProperties = processCommandProperties(
                {
                  command: commandOrCommandGetter,
                  options: optionsOrOptionsGetter,
                },
                context,
                task.title,
                taskWrapper,
              );

              if (!commandProperties) {
                return;
              }

              const outputLine = createOutputLine(taskWrapper);
              const startedBackgroundProcess = await startBackgroundProcess({
                command: commandProperties.command,
                context,
                match,
                options: commandProperties.options,
                outputLine,
              });

              backgroundProcess = startedBackgroundProcess.backgroundProcess;

              ownContextHolder.add(
                startedBackgroundProcess.namedCapturedGroups,
              );
            },
            title: backgroundProcessStartingTaskTitle,
          },
          {
            task: () =>
              new Listr(
                [
                  {
                    task: () => childrenTaskWithBackgroundProcess,
                    title: `${task.title} [with background process main]`,
                  },
                  {
                    // eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types
                    task(_, taskWrapper) {
                      if (dryRun) {
                        taskWrapper.skip(getSkipReason("dryRun"));
                        return;
                      }

                      // eslint-disable-next-line @typescript-eslint/no-misused-promises
                      if (backgroundProcess) {
                        stopBackgroundProcess({ backgroundProcess, kill });
                      }
                    },
                    title: `${task.title} [stopping background process]`,
                  },
                ],
                {
                  // To cleanly stop the background process even when the main task failed.
                  exitOnError: false,
                },
              ),
            title: `${task.title} [with background process group]`,
          },
        ]);
      }

      if ("addContext" in task) {
        const childrenTaskWithAdddedContext = childrenTask;
        childrenTask = new Listr([
          {
            // eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types
            async task(_, taskWrapper) {
              if (dryRun) {
                taskWrapper.skip(getSkipReason("dryRun"));
                return;
              }

              const context = ownContextHolder.get();
              const outputLine = createOutputLine(taskWrapper);
              const exec = createExec(context, outputLine);
              const addedContext = await (task as ParentTask<
                C,
                A & ContextLike,
                B
              >).addContext({
                addSecret(secret) {
                  ownContextHolder.addSecret(secret);
                },
                context: getUserContext(
                  context as Context<IntersectableContext<C>> & InternalContext,
                ),
                exec,
              });
              ownContextHolder.add(addedContext);
            },
            title: `${task.title} [adding context]`,
          },
          {
            task: () => childrenTaskWithAdddedContext,
            title: `${task.title} [with added context]`,
          },
        ]);
      }

      return childrenTask;
    },
    title: task.title,
  });

// This function is called recursively in functions declared above
// so it has to be hoisted and declared with the "function" keyword.
// eslint-disable-next-line func-style
function createListrTask<C>(
  contextHolder: ContextHolder<C>,
  skippedTasks: StaticallySkippedTasks,
  task: Task<C>,
): ListrTask<void> {
  if (isCommandTask(task)) {
    return createCommandTask(contextHolder, skippedTasks, task);
  }

  if (isRegularTask(task)) {
    return createRegularTask(contextHolder, skippedTasks, task);
  }

  return createParentTask(contextHolder, skippedTasks, task);
}

const handleError = (context: SharedContext, error: any) => {
  const log = context.debug
    ? () => {
        // NOP
      }
    : (message: string) => {
        // eslint-disable-next-line no-console
        console.error(message);
      };

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
};

const runTask = async <C>(
  task: Task<C>,
  context: Context<C> & InternalOptionsContext,
  flatTasks: FlatTasks,
): Promise<void> => {
  try {
    await new Listr(
      [
        createListrTask(
          createContextHolder(context),
          buildStaticallySkippedTasks(context, flatTasks, task.title),
          task,
        ),
      ],
      context.debug
        ? {
            renderer: "verbose",
          }
        : {
            // @ts-expect-error
            collapse: false,
            renderer: "update",
          },
    ).run();
  } catch (error) {
    handleError(context, error);
    throw error;
  }
};

export { buildFlatTasks, FlatTasks, runTask, Task };
