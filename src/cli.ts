#!/usr/bin/env node

import { resolve } from "path";
import createYargs from "yargs/yargs";
import { runCli } from "./commands";
import { compile } from "./compile";

const createCli = () =>
  createYargs(process.argv.slice(2))
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
        path,
      }: Readonly<{
        _: readonly string[];
        path: string;
      }>) => {
        const commandPath = resolve(path);
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const commands = require(commandPath);
        await runCli(commands, commandArgv);
      },
    )
    .demandCommand(1)
    .help()
    .strict()
    .version(false);

export { createCli };
