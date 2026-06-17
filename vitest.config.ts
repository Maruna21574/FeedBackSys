import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globalSetup: "./tests/global-setup.ts",
    fileParallelism: false,
    env: {
      NODE_ENV: "test",
      DATABASE_URL: "file:./test.db",
      SESSION_SECRET: "test-session-secret",
      APP_URL: "http://localhost:3000",
      ADMIN_NOTIFICATION_EMAIL: "",
      SMTP_HOST: "",
      STORAGE_DIR: "storage/test",
    },
  },
});
