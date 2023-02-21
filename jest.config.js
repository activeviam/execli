// eslint-disable-next-line import/no-default-export
export default {
  extensionsToTreatAsEsm: [".ts"],
  transform: {
    "^.+\\.[jt]s$": "@swc/jest",
  },
};
