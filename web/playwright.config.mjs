// @ts-check
import process from "node:process";

const baseURL = process.env.E2E_BASE_URL || "http://server:8080";

export default {
  testDir: "./e2e",
  testMatch: "**/*.spec.js",
  globalSetup: "./e2e/global-setup.js",
  timeout: 30000,
  outputDir: "../artifacts/e2e/results",
  fullyParallel: false,
  use: {
    baseURL,
    trace: process.env.E2E_TRACE === "1" ? "retain-on-failure" : "off",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  reporter: [["line"], ["html", { outputFolder: "../artifacts/e2e/report", open: "never" }]],
};
