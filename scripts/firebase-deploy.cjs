const { execSync } = require("child_process");

const rawArgs = process.argv.slice(2);
if (!rawArgs.includes("--force")) {
  rawArgs.push("--force");
}
const args = rawArgs.join(" ");
process.env.FUNCTIONS_DISCOVERY_TIMEOUT = "60";

console.log(`[TikTak Deploy] Running: npx -y firebase-tools@latest deploy ${args}`);
execSync(`npx -y firebase-tools@latest deploy ${args}`, {
  stdio: "inherit",
  env: {
    ...process.env,
    FUNCTIONS_DISCOVERY_TIMEOUT: "60",
  },
});

