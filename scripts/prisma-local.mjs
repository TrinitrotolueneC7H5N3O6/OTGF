import { config } from "dotenv";
import { spawn } from "node:child_process";

config({ path: ".env.local" });
config({ path: ".env" });

const url = process.env.LOCAL_DATABASE_URL?.trim();
if (!url) {
  console.error("Set LOCAL_DATABASE_URL in .env.local (local Postgres).");
  process.exit(1);
}

process.env.DATABASE_URL = url;
process.env.DIRECT_URL = url;

const args = process.argv.slice(2);
const child = spawn("npx", ["prisma", ...args], {
  stdio: "inherit",
  env: process.env,
});
child.on("exit", (code) => process.exit(code ?? 1));
