#!/usr/bin/env node

import path from "node:path";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { runCli, Command } from "./commands.js";
import { compile } from "./compile.js";

export const createCli = () =>
  yargs(hideBin(process.argv))
    .command(
      "compile <source> <target>",
      "Compile the commands at the given path to a single executable Node.js file, together with all the dependencies",
      // eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types
      (yargs) => {
        yargs
          .positional("source", {
            describe: "The path resolving to the file exporting the commands",
            normalize: true,
            type: "string",
          })
          .positional("target", {
            describe:
              "The path where the compiled Node.js file will be written to",
            normalize: true,
            type: "string",
          });
      },
      compile,
    )
    .command(
      "run <path>",
      "Run the commands at the given path, forwarding the command line arguments after --",
      // eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types
      (yargs) => {
        yargs.positional("path", {
          describe: "The path resolving to the file exporting the commands",
          normalize: true,
          type: "string",
        });
      },
      async ({
        _: [_, ...commandArgv],
        path: commandsPath,
      }: Readonly<{
        _: readonly string[];
        path: string;
      }>) => {
        const commandsAbsolutePath = path.isAbsolute(commandsPath)
          ? commandsPath
          : path.join(process.cwd(), commandsPath);
        const commands = (await import(commandsAbsolutePath)) as Readonly<{
          [key: string]: Command<any>;
        }>;
        await runCli(commands, commandArgv);
      },
    )
    .demandCommand(1)
    .strict()
    .version(false);
