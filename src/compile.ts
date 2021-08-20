import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
// @ts-expect-error: No type declarations available.
import ncc from "@vercel/ncc";

const packageLibDirectory = path.resolve(
  import.meta.url.replace("file:", ""),
  "..",
);

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
    path.join(packageLibDirectory, "compiling-"),
  );
  const inputPath = path.join(temporaryDirectory, "input.js");
  const sourcePath = path.resolve(source);
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
