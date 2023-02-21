import { env, stdout } from "node:process";

import { Options } from "execa";
import {
  Listr,
  ListrGetRendererOptions,
  ListrTask,
  ListrTaskWrapper,
} from "listr2";

import {
  Context,
  ContextHolder,
  ContextLike,
  InternalContext,
  InternalOptionsContext,
  createContextHolder,
  getUserContext,
} from "./context.js";
import {
  Command,
  Exec,
  ExecError,
  Line,
  OutputLine,
  createExec,
  getCommandString,
} from "./exec.js";
import { getCpuCount } from "./get-cpu-count.js";

type BaseTask = Readonly<{
  title: Line;
}>;

type SkipResult = boolean | string | Promise<boolean | string>;

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

type RunnableTask<C> = Readonly<{
  run: (
    payload: Readonly<{
      context: Context<C>;
      exec: Exec;
      outputLine: OutputLine;
    }>,
  ) => Line | void | Promise<Line | void>;
}>;

type RegularTask<C> = BaseLeafTask<C> & RunnableTask<C>;

type LeafTask<C> = CommandTask<C> | RegularTask<C>;

type IntersectableContext<C> = C extends ContextLike<any> ? C : unknown;

type NestedChildrenMarker = false;

type ParentTask<C, A> = BaseTask &
  Readonly<{
    rollback?: RunnableTask<IntersectableContext<C>>["run"];
  }> &
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
  Readonly<{
    children: A extends NestedChildrenMarker
      ? any
      : ReadonlyArray<
          Task<
            IntersectableContext<C> & IntersectableContext<A>,
            NestedChildrenMarker
          >
        >;
    concurrent?: boolean | number;
  }>;

export type Task<C = void, A = void> = LeafTask<C> | ParentTask<C, A>;

type FlatTask = Readonly<{
  parentTitle?: string;
}> &
  (TaggedTask | Readonly<{ children: readonly string[] }>);

type MutableFlatTasks = Record<string, FlatTask>;
export type FlatTasks = Readonly<MutableFlatTasks>;

export const buildFlatTasks = (
  task: Task<any>,

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
    for (const childTask of Object.values(task.children)) {
      buildFlatTasks(childTask, flatTasks, task.title);
    }
  }

  return flatTasks;
};

type SkippedByOption = keyof Pick<
  InternalOptionsContext,
  "dryRun" | "from" | "only" | "skip" | "tag" | "until"
>;

type MutableStaticallySkippedTasks = Record<
  string,
  Exclude<SkippedByOption, "dryRun">
>;
type StaticallySkippedTasks = Readonly<MutableStaticallySkippedTasks>;

const getAncestorTitles = (
  flatTasks: FlatTasks,
  taskTitle: string,
): Set<string> => {
  const ancestorTitles = new Set<string>();
  let currentTitle: string | undefined = taskTitle;

  for (;;) {
    currentTitle = flatTasks[currentTitle].parentTitle;
    if (currentTitle === undefined) {
      break;
    } else {
      ancestorTitles.add(currentTitle);
    }
  }

  return ancestorTitles;
};

const buildStaticallySkippedTasks = (
  context: InternalOptionsContext,
  flatTasks: FlatTasks,
  taskTitle: string,

  staticallySkippedTasks: MutableStaticallySkippedTasks = {},
  ancestorMatchedOnlyOption = false,
  isRootCall = true,
  // eslint-disable-next-line max-params
): StaticallySkippedTasks => {
  const matchedOnlyOption =
    ancestorMatchedOnlyOption || context.only.includes(taskTitle);
  const task = flatTasks[taskTitle];

  if (
    isRootCall &&
    (context.from !== undefined || context.until !== undefined)
  ) {
    const orderedTaskTitles = Object.keys(flatTasks);

    if (context.until !== undefined) {
      for (const title of orderedTaskTitles.slice(
        orderedTaskTitles.indexOf(context.until) + 1,
      )) {
        staticallySkippedTasks[title] = "until";
      }
    }

    if (context.from !== undefined) {
      const ancestorTitles = getAncestorTitles(flatTasks, context.from);

      for (const title of orderedTaskTitles
        .slice(0, orderedTaskTitles.indexOf(context.from))
        .filter(
          (title) =>
            !staticallySkippedTasks[title] && !ancestorTitles.has(title),
        )) {
        staticallySkippedTasks[title] = "from";
      }
    }
  }

  if (staticallySkippedTasks[taskTitle]) {
    // NOP
  } else if (context.skip.length > 0 && context.skip.includes(taskTitle)) {
    staticallySkippedTasks[taskTitle] = "skip";
  } else if ("children" in task) {
    for (const childTaskTitle of task.children) {
      buildStaticallySkippedTasks(
        context,
        flatTasks,
        childTaskTitle,
        staticallySkippedTasks,
        matchedOnlyOption,
        false,
      );
    }
  } else if (context.only.length > 0 && !matchedOnlyOption) {
    staticallySkippedTasks[taskTitle] = "only";
  } else if (
    context.tag.length > 0 &&
    context.tag.every((givenTag) => !(task?.tags ?? []).includes(givenTag))
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

const skipByOnlyOrTagOptions = (
  skippedTasks: StaticallySkippedTasks,
  title: string,
) =>
  skipByOnlyOption(skippedTasks, title) || skipByTagOption(skippedTasks, title);

const shouldSkipByTaskProperty = <C>(
  context: Context<C> & InternalContext,
  task: Readonly<ListrTask<void>> | SkippableTask<C>,
): SkipResult => {
  if (!task.skip) {
    return false;
  }

  let result;

  if ("task" in task) {
    // Task is a ListrTask.
    result = typeof task.skip === "function" ? task.skip() : task.skip;
  } else {
    // Task is as SkippableTask.
    result = task.skip(getUserContext(context));
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

  taskWrapper: ListrTaskWrapper<void, any>,
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
          // @ts-expect-error: The line above ensures that key is in proxied.
          return proxied[key] as unknown;
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

const isUsingVerboseRenderer = ({
  concurrency,
}: Pick<InternalContext, "concurrency">): boolean =>
  concurrency === 0 || !stdout.isTTY;

const processLine = (
  line: string,
  {
    concurrency,
    taskTitle,
  }: Pick<InternalContext, "concurrency"> &
    Readonly<{
      taskTitle: string;
    }>,
): string => {
  if (/\r?\n/.test(line)) {
    throw new Error(
      `Expected single line but got some line breaks in:\n\n: ${line}`,
    );
  }

  return concurrency > 0 && isUsingVerboseRenderer({ concurrency })
    ? `${taskTitle}: ${line}`
    : line;
};

const createOutputLine =
  (
    taskWrapper: ListrTaskWrapper<void, any>,
    { concurrency }: Pick<InternalContext, "concurrency">,
  ): OutputLine =>
  (line) => {
    if (/\r?\n/.test(line)) {
      throw new Error(`Output line cannot contain line break:\n\n: ${line}`);
    }

    taskWrapper.output = processLine(line, {
      concurrency,
      taskTitle: taskWrapper.title,
    });
  };

const createSkippableTask = <C>(
  context: Context<C> & InternalContext,
  skippedTasks: StaticallySkippedTasks,
  task: Readonly<ListrTask<void>>,
): ListrTask<void> => ({
  ...task,
  async skip() {
    const taskTitle = task.title!;

    const option = skippedTasks[taskTitle];

    if (option === "from" || option === "skip" || option === "until") {
      return processLine(getSkipReason(option), {
        concurrency: context.concurrency,
        taskTitle,
      });
    }

    const skipResult = await shouldSkipByTaskProperty(context, task);

    return (
      skipResult &&
      processLine(skipResult === true ? "Task skipped itself" : skipResult, {
        concurrency: context.concurrency,
        taskTitle,
      })
    );
  },
});

const isCommandTask = <C>(task: Task<C>): task is CommandTask<C> =>
  "command" in task;

const isRegularTask = <C>(task: Task<C>): task is RegularTask<C> =>
  "run" in task;

const isParentTask = <C, A>(task: Task<C, A>): task is ParentTask<C, A> =>
  "children" in task;

const runRegularTask = async <C>(
  contextHolder: ContextHolder<C>,
  run: RunnableTask<C>["run"],

  taskWrapper: ListrTaskWrapper<void, any>,
) => {
  const context = contextHolder.get();
  const outputLine = createOutputLine(taskWrapper, {
    concurrency: context.concurrency,
  });
  const exec = createExec(context, outputLine);
  const result = await run({
    context: getUserContext(context),
    exec,
    outputLine,
  });
  if (result) {
    outputLine(result);
  }
};

const createCommandTask = <C>(
  contextHolder: ContextHolder<C>,
  skippedTasks: StaticallySkippedTasks,
  task: CommandTask<C>,
): ListrTask<void> =>
  createSkippableTask(contextHolder.get(), skippedTasks, {
    skip: () => skipCommandTask(contextHolder.get(), skippedTasks, task),

    async task(_, taskWrapper) {
      const context = contextHolder.get();
      const commandProperties = processCommandProperties(
        task,
        context,
        task.title,
        taskWrapper,
      );

      if (commandProperties) {
        const exec = createExec(
          context,
          createOutputLine(taskWrapper, {
            concurrency: context.concurrency,
          }),
        );
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

    async task(_, taskWrapper) {
      await runRegularTask(contextHolder, task.run, taskWrapper);
    },
    title: task.title,
  });

const getStaticParentTaskSkipReason = <A, B, C>(
  skippedTasks: StaticallySkippedTasks,
  task: ParentTask<C, A>,
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

const cpuCount = getCpuCount();

const createParentTask = <C, A>(
  contextHolder: ContextHolder<C>,
  skippedTasks: StaticallySkippedTasks,
  task: ParentTask<C, A>,
): ListrTask<void> =>
  createSkippableTask(contextHolder.get(), skippedTasks, {
    rollback: task.rollback
      ? async (
          _,

          taskWrapper,
        ) => {
          await runRegularTask(
            contextHolder,
            // @ts-expect-error: The check above ensures that rollback is defined.
            task.rollback!,
            taskWrapper,
          );
        }
      : undefined,
    skip() {
      const staticSkipReason = getStaticParentTaskSkipReason(
        skippedTasks,
        task,
      );

      if (staticSkipReason) {
        return staticSkipReason;
      }

      if (!task.skip) {
        return false;
      }

      const context = contextHolder.get();
      const userContext = getUserContext(context) as Context<
        IntersectableContext<C>
      >;
      return task.skip(userContext);
    },
    task() {
      const ownContextHolder: ContextHolder<C> = contextHolder.copy();
      const { concurrency } = ownContextHolder.get();

      let childrenTask = new Listr(
        task.children.map((childTask) =>
          createListrTask(
            ownContextHolder,
            skippedTasks,
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-expect-error
            childTask,
          ),
        ),
        {
          concurrent:
            task.concurrent && concurrency > 0
              ? Math.round(cpuCount * concurrency)
              : false,
        },
      );

      if ("addContext" in task) {
        const childrenTaskWithAddedContext = childrenTask;
        const { addContext, title } = task as ParentTask<C, A & ContextLike>;
        childrenTask = new Listr([
          {
            async task(_, taskWrapper) {
              const context = ownContextHolder.get();
              const outputLine = createOutputLine(taskWrapper, {
                concurrency: context.concurrency,
              });
              const exec = createExec(context, outputLine);
              const addedContext = await addContext({
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
            title: `${title} [adding context]`,
          },
          {
            task: () => childrenTaskWithAddedContext,
            title: `${title} [with added context]`,
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

const isTesting = env.NODE_ENV === "test";

const showTimer = !isTesting;

const defaultRendererOptions: ListrGetRendererOptions<"default"> = {
  collapse: false,
  collapseErrors: false,
  collapseSkips: false,
  showTimer,
};

const verboseRendererOptions: ListrGetRendererOptions<"verbose"> = {
  showTimer,
  useIcons: !isTesting,
};

export const runTask = async <C>(
  task: Task<C>,
  context: Context<C> & InternalOptionsContext,
  flatTasks: FlatTasks,
): Promise<void> => {
  const internalContext: Context<C> & InternalContext = {
    ...context,
    secrets: [],
  };

  try {
    await new Listr(
      [
        createListrTask(
          createContextHolder(internalContext),
          buildStaticallySkippedTasks(context, flatTasks, task.title),
          task,
        ),
      ],
      isUsingVerboseRenderer(context)
        ? {
            renderer: "verbose",
            rendererOptions: verboseRendererOptions,
          }
        : {
            renderer: "default",
            rendererOptions: defaultRendererOptions,
          },
    ).run();
  } catch (error: unknown) {
    if (error instanceof ExecError) {
      throw error.toDetailedError({
        // When `concurrency` is 0, stdout and stderr were already streamed to the terminal.
        withOutputs: context.concurrency > 0,
      });
    }

    throw error;
  }
};
