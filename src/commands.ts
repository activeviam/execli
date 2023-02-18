import { cpus } from "node:os";
import { argv } from "node:process";

import slugify from "@sindresorhus/slugify";
import yargs, { CommandModule, InferredOptionTypes, Options } from "yargs";
import { hideBin } from "yargs/helpers";

import { InternalOptionsContext } from "./context.js";
import { FlatTasks, Task, buildFlatTasks, runTask } from "./tasks.js";

type CommandOptions = Readonly<Record<string, Options>>;

export type OptionsContext<O extends CommandOptions | void = void> =
  O extends CommandOptions ? Readonly<InferredOptionTypes<O>> : void;

export type Command<
  O extends CommandOptions | void = void,
  A = void,
> = Readonly<
  O extends CommandOptions
    ? {
        options: O;
      }
    : unknown
> &
  Readonly<{
    task: Task<OptionsContext<O>, A>;
  }>;

// Used to infer the generic parameters.
// See https://stackoverflow.com/questions/50509952/dynamic-generic-type-inference-for-object-literals-in-typescript.
export const getCommand = <O extends CommandOptions | void = void, A = void>(
  command: Command<O, A>,
): Command<O, A> => command;

type Commands = Readonly<Record<string, Command<any>>>;

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
  const slugToTitle: Record<string, string> = {};

  for (const [title, taskNode] of Object.entries(flatTasks)) {
    // Slugs are useful on environments that don't support quotes in commands.
    // They are also easier and quicker to type.
    const slug = slugify(title.toLowerCase());

    if (slug in slugToTitle) {
      throw new Error(`Two tasks have the same title slug: \`${slug}\`.`);
    }

    slugToTitle[slug] = title;

    if ("tags" in taskNode) {
      for (const tag of taskNode.tags ?? []) {
        availableTags.add(tag);
      }
    }
  }

  const availableTitles = Object.values(slugToTitle).sort();

  const coerceSlugToTitle = (element: string): string =>
    slugToTitle[element] || element;

  const coerceSlugToTitleArray = (elements: readonly string[]): string[] =>
    elements.map((element) => coerceSlugToTitle(element));

  return {
    concurrency: {
      coerce(value) {
        if (value < 0) {
          throw new Error("Must be greater than 0.");
        }

        return Number(value);
      },
      default: 1,
      defaultDescription: "Use all the available CPUs.",
      description: [
        "How many concurrent tasks should be executed at the same time.",
        "0 means 1 task, 1 means as much as there are CPUs on the machine, 0.5 means half the CPUs, etc.",
        "If 0, the verbose renderer will be used and the output of shell commands will be streamed to the terminal.",
      ].join("\n"),
      number: true,
    },
    dryRun: {
      boolean: true,
      default: false,
      description:
        "Do not run tasks but show the shell commands that would have been run.",
    },
    from: {
      choices: availableTitles,
      coerce: coerceSlugToTitle,
      description:
        "Skip tasks before the one with the given title (or title slug).",
    },
    only: {
      array: true,
      choices: availableTitles,
      coerce: coerceSlugToTitleArray,
      default: [],
      description:
        "Only run tasks with one of the given titles (or title slugs).",
    },
    skip: {
      array: true,
      choices: availableTitles,
      coerce: coerceSlugToTitleArray,
      default: [],
      description: "Skip tasks with one of the given titles (or title slugs).",
    },
    tag: {
      array: true,
      choices: [...availableTags].sort(),
      default: [],
      description: "Only run tasks with at least one of the given tags.",
    },
    until: {
      choices: availableTitles,
      coerce: coerceSlugToTitle,
      description:
        "Skip tasks after the one with the given title (or title slug).",
    },
  };
};

export const runCli = async (
  commands: Commands,
  commandArguments?: string[],
) => {
  let yargsInstance = yargs(commandArguments ?? hideBin(argv));

  for (const [commandName, command] of Object.entries(commands)) {
    const flatTasks = buildFlatTasks(command.task);
    yargsInstance = yargsInstance.command(
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

  await yargsInstance
    .completion("completion", "Print completion script.")
    .demandCommand()
    .recommendCommands()
    .showHelpOnFail(false)
    .strict()
    .version(false)
    .wrap(yargsInstance.terminalWidth()).argv;
};
