import { start } from "./app";

start().catch((err) => {
  console.error("Failed to start API", err);
  process.exit(1);
});
