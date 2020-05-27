import "any-observable/register/zen";
import isInteractive from "is-interactive";
import slugify from "slugify";
import { CommandModule, InferredOptionTypes, Options } from "yargs";
import createYargs from "yargs/yargs";
import { InternalOptionsContext } from "./context";
import { buildFlatTasks, FlatTasks, runTask, Task } from "./tasks";

type CommandOptions = Readonly<{ [key: string]: Options }>;

type OptionsContext<
  O extends CommandOptions | void = void
> = O extends CommandOptions ? Readonly<InferredOptionTypes<O>> : void;

type Command<
  O extends CommandOptions | void = void,
  A = void,
  B = void
> = Readonly<
  O extends CommandOptions
    ? {
        options: O;
      }
    : unknown
> &
  Readonly<{
    task: Task<OptionsContext<O>, A, B>;
  }>;

// Used to infer the generic parameters.
// See https://stackoverflow.com/questions/50509952/dynamic-generic-type-inference-for-object-literals-in-typescript.
const getCommand = <O extends CommandOptions | void = void, A = void, B = void>(
  command: Command<O, A, B>,
): Command<O, A, B> => command;

type Commands = Readonly<{ [key: string]: Command<any> }>;

const createYargsCommand = <C>(
  name: string,
  task: Task<C>,
  options: Readonly<{ [key in keyof C]: Options }>,
  flatTasks: FlatTasks,
): CommandModule => ({
  builder: options,
  command: name,
  describe: task.title,
  async handler(options: any) {
    await runTask(task, options, flatTasks);
  },
});

const getInternalOptions = (
  flatTasks: FlatTasks,
): { [TKey in keyof InternalOptionsContext]: Options } => {
  const availableTags = new Set<string>();
  const slugToTitle: { [slug: string]: string } = {};

  for (const [title, taskNode] of Object.entries(flatTasks)) {
    // Slugs are useful on envrionments that don't support quotes in commands.
    // They are also easier and quicker to type.
    const slug = slugify(title.toLowerCase());

    if (slug in slugToTitle) {
      throw new Error(`Two tasks have the same title slug: ${slug}`);
    }

    slugToTitle[slug] = title;

    if ("tags" in taskNode) {
      (taskNode.tags ?? []).forEach((tag) => {
        availableTags.add(tag);
      });
    }
  }

  const availableTitles = Object.values(slugToTitle).sort();

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
        "Do not run tasks but show the shell commands that would have been run",
    },
    only: {
      array: true,
      choices: availableTitles,
      coerce: coerceSlugToTitle,
      default: [],
      description:
        "Only run tasks with one of the given titles (or title slugs)",
    },
    skip: {
      array: true,
      choices: availableTitles,
      coerce: coerceSlugToTitle,
      default: [],
      description: "Skip tasks with one of the given titles (or title slugs)",
    },
    tag: {
      array: true,
      choices: [...availableTags].sort(),
      default: [],
      description: "Only run tasks with at least one of the given tags",
    },
  };
};

const runCli = async (commands: Commands, argv?: string[]) => {
  let yargs = createYargs(argv ?? process.argv.slice(2));
  for (const [commandName, command] of Object.entries(commands)) {
    const flatTasks = buildFlatTasks(command.task);
    yargs = yargs.command(
      createYargsCommand(
        commandName,
        command.task,
        {
          ...("options" in command
            ? // eslint-disable-next-line @typescript-eslint/ban-types
              (command as Command<{}>).options
            : {}),
          ...getInternalOptions(flatTasks),
        },
        flatTasks,
      ),
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  yargs
    .completion("completion", "Print completion script")
    .demandCommand(1)
    .help()
    .strict()
    .version(false)
    .wrap(yargs.terminalWidth()).argv;
};

export { Command, getCommand, OptionsContext, runCli, runTask };
