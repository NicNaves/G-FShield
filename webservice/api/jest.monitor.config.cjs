// No globalSetup: these mocked lifecycle tests must never delete database rows.
module.exports = {
  testEnvironment: "node",
  testMatch: ["<rootDir>/teste/graspExecutionMonitorLifecycle.test.js"],
};
