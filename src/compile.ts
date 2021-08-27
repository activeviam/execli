import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
// @ts-expect-error: No type declarations available.
import ncc from "@vercel/ncc";

const packageLibDirectory = dirname(fileURLToPath(import.meta.url));

const getSource = (filePath: string) => `#!/usr/bin/env node

import {runCli} from "../commands.js";

import * as commands from "${filePath}";

runCli(commands);`;

export const compile = async ({
  source,
  target,
}: Readonly<{
  source: string;
  target: string;
}>) => {
  // The temporary directory needs to be inside the package for imports to resolve correctly.
  const temporaryDirectory = await mkdtemp(
    join(packageLibDirectory, "compiling-"),
  );
  const inputPath = join(temporaryDirectory, "input.js");
  const sourcePath = resolve(source);
  try {
    await writeFile(inputPath, getSource(sourcePath));
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    const { code } = (await ncc(inputPath, {
      minify: true,
      quiet: true,
    })) as Readonly<{ code: string }>;
    await writeFile(target, code, { mode: 0o744 });
  } finally {
    await rm(temporaryDirectory, { recursive: true });
  }
};
