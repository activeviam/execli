module.exports = {
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
  testPathIgnorePatterns: ["/node_modules/", "commands.js"],
};
