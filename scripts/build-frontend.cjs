const { execSync } = require("child_process");

const projectId = process.env.GCLOUD_PROJECT || "tiktak-stg";
const mode = projectId === "tiktak2026" ? "production" : "staging";

console.log(`[TikTak Build] Building frontend for project '${projectId}' (Vite mode: '${mode}')...`);
execSync(`npm --prefix frontend run build:${mode === "production" ? "prod" : "stg"}`, {
  stdio: "inherit",
});

