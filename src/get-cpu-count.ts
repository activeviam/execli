import { cpus } from "node:os";
import { env } from "node:process";

export const getCpuCount = (): number => {
  const cpuCountFromEnv = env.VCPU_COUNT;

  if (!cpuCountFromEnv) {
    return cpus().length;
  }

  const convertedCpuCountFromEnv = Number(cpuCountFromEnv);

  if (Number.isNaN(convertedCpuCountFromEnv)) {
    throw new TypeError(`Expected a number but got \`${cpuCountFromEnv}\`.`);
  }

  if (
    !Number.isInteger(convertedCpuCountFromEnv) ||
    convertedCpuCountFromEnv <= 0
  ) {
    throw new TypeError(
      `Expected a positive integer but got \`${convertedCpuCountFromEnv}\`.`,
    );
  }

  return convertedCpuCountFromEnv;
};
