import { defineConfig } from "react-doctor/api";

export default defineConfig({
  ignore: {},
  rules: {
    "react-doctor/no-autofocus": "off",
    "react-doctor/no-placeholder-only-field": "off",
  },
});
