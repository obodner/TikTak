const { execSync } = require("child_process");

const rawArgs = process.argv.slice(2);
if (!rawArgs.includes("--force")) {
  rawArgs.push("--force");
}
const args = rawArgs.join(" ");
process.env.FUNCTIONS_DISCOVERY_TIMEOUT = "60";

function hasGlobalFirebaseCli() {
  try {
    execSync("firebase --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const cliPrefix = hasGlobalFirebaseCli() ? "firebase" : "npx firebase-tools";
const cmd = `${cliPrefix} deploy ${args}`;

console.log(`[TikTak Deploy] Running: ${cmd}`);
execSync(cmd, {
  stdio: "inherit",
  env: {
    ...process.env,
    FUNCTIONS_DISCOVERY_TIMEOUT: "60",
  },
});
