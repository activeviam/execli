// eslint-disable-next-line import/no-default-export
export default {
  testEnvironment: "node",
  transform: {
    "^.+\\.ts$": [
      "babel-jest",
      {
        presets: [
          ["@babel/preset-env", { targets: { node: "current" } }],
          "@babel/preset-typescript",
        ],
      },
    ],
  },
};
