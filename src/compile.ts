import fs from "fs-extra";
import path from "path";
// @ts-ignore
import ncc from "@zeit/ncc";

const getSource = (filePath: string) => `#!/usr/bin/env node

const { runCli } = require("../run");
const commands = require("${filePath}");

runCli(commands);`;

const compile = async ({
  source,
  target,
}: Readonly<{
  source: string;
  target: string;
}>) => {
  const sourcePath = path.resolve(source);
  // The temporary directory needs to be inside the package for imports to resolve correctly.
  const temporaryDirectory = await fs.mkdtemp(
    path.join(__dirname, "compiling-"),
  );
  try {
    const inputPath = path.join(temporaryDirectory, "input.js");
    await fs.writeFile(inputPath, getSource(sourcePath));
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    const { code } = await ncc(inputPath, { minify: true, quiet: true });
    await fs.writeFile(target, code, { mode: 0o744 });
  } finally {
    await fs.remove(temporaryDirectory);
  }
};

export { compile };
