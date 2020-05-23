import path from "path";
// @ts-expect-error
import ncc from "@zeit/ncc";
import fs from "fs-extra";

const getSource = (filePath: string) => `#!/usr/bin/env node

require("loud-rejection/register");

const { runCli } = require("../commands");
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
  // Check that the source can be resolved.
  require.resolve(sourcePath);
  // The temporary directory needs to be inside the package for imports to resolve correctly.
  const temporaryDirectory = await fs.mkdtemp(
    path.join(__dirname, "compiling-"),
  );
  try {
    const inputPath = path.join(temporaryDirectory, "input.js");
    await fs.writeFile(inputPath, getSource(sourcePath));
    const { code } = await ncc(inputPath, { minify: true, quiet: true });
    await fs.writeFile(target, code, { mode: 0o744 });
  } finally {
    await fs.remove(temporaryDirectory);
  }
};

export { compile };
