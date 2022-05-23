#!/usr/bin/env node

import { isAbsolute, join } from "node:path";
import { argv, cwd } from "node:process";
import { pathToFileURL } from "node:url";
import yargs, { CommandModule } from "yargs";
import { hideBin } from "yargs/helpers";
import { Command, runCli } from "./commands.js";
import { compile } from "./compile.js";

// `"true"` instead of `true` because of https://github.com/DefinitelyTyped/DefinitelyTyped/issues/37797.
const required = "true";

const compileCommand: CommandModule<
  unknown,
  Readonly<{ source: string; target: string }>
> = {
  builder: (args) =>
    args
      .positional("source", {
        describe: "The path resolving to the file exporting the commands",
        normalize: true,
        required,
        type: "string",
      })
      .positional("target", {
        describe: "The path where the compiled Node.js file will be written to",
        normalize: true,
        required,
        type: "string",
      }),
  command: "compile <source> <target>",
  describe:
    "Compile the commands at the given path to a single executable Node.js file, together with all the dependencies",
  handler: compile,
};

const runCommand: CommandModule<unknown, Readonly<{ path: string }>> = {
  builder: (args) =>
    args.positional("path", {
      describe: "The path resolving to the file exporting the commands",
      normalize: true,
      required,
      type: "string",
    }),
  command: "run <path>",
  describe:
    "Run the commands at the given path, forwarding the command line arguments after --",
  async handler({ _: [_, ...commandArgv], path: commandsPath }) {
    const commandsAbsolutePath = isAbsolute(commandsPath)
      ? commandsPath
      : join(cwd(), commandsPath);
    const commandsUrl = pathToFileURL(commandsAbsolutePath);
    // eslint-disable-next-line node/no-unsupported-features/es-syntax
    const commands = (await import(commandsUrl.href)) as Readonly<
      Record<string, Command<any>>
    >;
    await runCli(commands, commandArgv.map(String));
  },
};

export const createCli = () =>
  yargs(hideBin(argv))
    .command(compileCommand)
    .command(runCommand)
    .demandCommand(1)
    .strict()
    .version(false);
