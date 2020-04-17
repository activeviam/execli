import "any-observable/register/zen";
import isInteractive from "is-interactive";
import Listr, { ListrTask, ListrTaskWrapper } from "listr";
import slugify from "slugify";
import { CommandModule, Options } from "yargs";
import createYargs from "yargs/yargs";
import {
  createExec,
  getCommandString,
  OutputLine,
  processCommandError,
  withBackgroundCommand,
} from "./commands";
import { InternalContext } from "./context";
import {
  BackgroundCommandTask,
  CommandTask,
  ParentTask,
  RegularTask,
  Task,
} from "./tasks";

type Command<C> = Readonly<{
  options?: Readonly<{ [Tkey in keyof Partial<C>]: Options }>;
  task: Task<C>;
}>;

type Commands = Readonly<{ [TKey: string]: Command<any> }>;

const shouldSkipByOnlyOrTagOption = (
  ancestorWhitelisted: boolean,
  context: InternalContext,
  tags: readonly string[] | undefined,
  title: string,
): boolean =>
  (!ancestorWhitelisted &&
    context.only.length > 0 &&
    !context.only.includes(title)) ||
  (tags !== undefined &&
    context.tag.length > 0 &&
    !context.tag.some((givenTag) => tags.includes(givenTag)));

// eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types
const createOutputLine = (taskWrapper: ListrTaskWrapper): OutputLine => (
  line,
) => {
  if (/\r?\n/.test(line)) {
    throw new Error(`Output line cannot contain line break:\n\n: ${line}`);
  }

  taskWrapper.output = line;
};

const addDetailsToTaskTitle = (title: string, details: string) =>
  `${title} (${details})`;

const createSkippableTask = <C extends InternalContext>(
  task: Readonly<ListrTask<C>>,
): ListrTask<C> => ({
  ...task,
  async skip(context) {
    if (task.skip) {
      const skip = await task.skip(context);
      if (skip) {
        return true;
      }
    }

    return context.skip.includes(task.title);
  },
});

const skipCommandTask = async <C extends InternalContext>(
  ancestorWhitelisted: boolean,
  context: C,
  { required, skip: skipTask, tags, title }: CommandTask<C>,
) => {
  if (skipTask) {
    const skip = await skipTask(context);
    if (skip) {
      return true;
    }
  }

  if (required) {
    return false;
  }

  return shouldSkipByOnlyOrTagOption(ancestorWhitelisted, context, tags, title);
};

const getCommand = <C extends InternalContext>(
  context: C,
  { command }: CommandTask<C>,
) => (typeof command === "function" ? command(context) : command);

const dryRunCommandTask = <C extends InternalContext>(
  commandString: string,
  title: string,
  // eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types
  taskWrapper: ListrTaskWrapper<C>,
) => {
  taskWrapper.title = addDetailsToTaskTitle(title, `$ ${commandString}`);
  taskWrapper.skip("");
};

const createBackgroundCommandTask = <C extends InternalContext>(
  ancestorWhitelisted: boolean,
  task: BackgroundCommandTask<C>,
): ListrTask<C> =>
  createSkippableTask({
    skip: async (context) =>
      skipCommandTask(ancestorWhitelisted, context, task),
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
        return withBackgroundCommand({
          command,
          context,
          kill: task.kill,
          match: task.match,
          options: task.options,
          outputLine,
          // eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types
          async runOnMatch(matches) {
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
    skip: async (context) =>
      skipCommandTask(ancestorWhitelisted, context, task),
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
  { required, run, skip: taskSkip, tags, title }: RegularTask<C>,
): ListrTask<C> =>
  createSkippableTask({
    async skip(context) {
      if (taskSkip) {
        const skip = await taskSkip(context);
        if (skip) {
          return true;
        }
      }

      return (
        !required &&
        (context.dryRun ||
          shouldSkipByOnlyOrTagOption(
            ancestorWhitelisted,
            context,
            tags,
            title,
          ))
      );
    },
    // eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types
    async task(context, taskWrapper) {
      const outputLine = createOutputLine(taskWrapper);
      const exec = createExec(context, outputLine);
      const result = await run({ context, exec, outputLine });
      if (result) {
        outputLine(result);
      }
    },
    title,
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

const runTask = async <C extends InternalContext>(
  task: Task<C>,
  context: C,
): Promise<void> => {
  try {
    await new Listr(
      [createListrTask(task)],
      context.debug
        ? {
            renderer: "verbose",
          }
        : {
            // @ts-ignore
            collapse: false,
            renderer: "update",
          },
    ).run(context);
  } catch (error) {
    processCommandError(context, error);
    throw error;
  }
};

const createYargsCommand = <C extends InternalContext>(
  name: string,
  task: Task<C>,
  options: Readonly<{ [Tkey in keyof Partial<C>]: Options }>,
): CommandModule => ({
  builder: options,
  command: name,
  describe: task.title,
  async handler(context: any) {
    await runTask(task, context);
  },
});

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

const getInternalOptions = <C>(
  task: Task<C>,
): { [TKey in keyof InternalContext]: Options } => {
  const slugToTitle: { [TKey: string]: string } = {};
  const tags: string[] = [];
  addAllTitleSlugsAndTags(task, slugToTitle, tags);
  const allTaskTitles = Object.values(slugToTitle).sort();
  const coerceSlugToTitle = (elements: readonly string[]): string[] =>
    elements.map((element) => slugToTitle[element] || element);

  return {
    debug: {
      boolean: true,
      default: !isInteractive(),
      defaultDescription: "false if terminal is interactive, true otherwise",
      description:
        "Run all tasks sequentially, switch to verbose renderer, and show the output of shell commands",
    },
    dryRun: {
      boolean: true,
      default: false,
      description:
        "Don't run tasks but display the shell commands that would have been run",
    },
    only: {
      array: true,
      choices: allTaskTitles,
      coerce: coerceSlugToTitle,
      default: [],
      description: "Only run the CLI task with this title (or title slug)",
    },
    skip: {
      array: true,
      choices: allTaskTitles,
      coerce: coerceSlugToTitle,
      default: [],
      description: "Skip the CLI task with this title (or title slug)",
    },
    tag: {
      array: true,
      choices: tags.sort(),
      default: [],
      description: "Only run the CLI task with this tag",
    },
  };
};

const runCli = async (commands: Commands, argv?: string[]) => {
  const yargs = createYargs(argv ?? process.argv.slice(2));
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  Object.entries(commands)
    .reduce(
      // eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types
      (accumulator, [commandName, { options, task }]) =>
        accumulator.command(
          createYargsCommand(commandName, task, {
            ...(options ?? {}),
            ...getInternalOptions(task),
          }),
        ),
      yargs,
    )
    .completion("completion", "Print completion script")
    .demandCommand(1)
    .help()
    .strict()
    .version(false)
    .wrap(yargs.terminalWidth()).argv;
};

export { Command, runCli, runTask };
