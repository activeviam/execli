import "any-observable/register/zen";
import chalk from "chalk";
import isInteractive from "is-interactive";
import Listr from "listr";
import { CommandModule, Options } from "yargs";
import createYargs from "yargs/yargs";
import { InternalContext, SharedContext } from "./context";
import { addAllTitleSlugsAndTags, createListrTask, Task } from "./tasks";

type Command<C> = Readonly<{
  options?: Readonly<{ [Tkey in keyof Partial<C>]: Options }>;
  task: Task<C>;
}>;

type Commands = Readonly<{ [TKey: string]: Command<any> }>;

const handleError = (context: SharedContext, error: any) => {
  const log = context.debug
    ? () => {
        // NOP
      }
    : (message: string) => {
        // eslint-disable-next-line no-console
        console.error(message);
      };

  /* eslint-disable @typescript-eslint/no-unsafe-member-access */
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
  /* eslint-enable @typescript-eslint/no-unsafe-member-access */
};

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
    handleError(context, error);
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
        "Run all tasks sequentially, switch to verbose renderer, and stream the output of shell commands",
    },
    dryRun: {
      boolean: true,
      default: false,
      description:
        "Don't run tasks but show the shell commands that would have been run",
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
