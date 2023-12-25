module.exports = {
  env: {
    node: true,
    es2023: true,
  },
  extends: ["google", "prettier"],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 13,
    sourceType: "module",
    project: "./tsconfig.json",
  },
  plugins: ["@typescript-eslint", "prettier"],
  rules: {
    "max-len": ["error", 120],
    "no-console": "warn",
    "object-curly-spacing": ["error", "always"],
    "require-jsdoc": "off",
    "valid-jsdoc": "off",
    "new-cap": "off",
    "no-unused-vars": "off",
    "@typescript-eslint/no-unused-vars": "warn",
    indent: "off",
    "prettier/prettier": "error",
  },
};
