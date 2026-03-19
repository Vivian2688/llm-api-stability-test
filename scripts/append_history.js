// scripts/append_history.js
// appends this run's analysis results to history/*.jsonl
// usage: node scripts/append_history.js

const fs = require("fs");
const path = require("path");

const REPORTS_DIR = "reports";
const HISTORY_DIR = "history";

const GROUPS = [
    { key: "wenxin_A", file: "wenxin_week11_A_run_analysis.json", histfile: "wenxin_A_history.jsonl" },
    { key: "wenxin_B", file: "wenxin_week11_B_run_analysis.json", histfile: "wenxin_B_history.jsonl" },
    { key: "xinghe_A", file: "xinghe_week11_A_run_analysis.json", histfile: "xinghe_A_history.jsonl" },
    { key: "xinghe_B", file: "xinghe_week11_B_run_analysis.json", histfile: "xinghe_B_history.jsonl" },
];

fs.mkdirSync(HISTORY_DIR, { recursive: true });

const run_date = new Date().toISOString().slice(0, 10);
const ci_run = parseInt(process.env.CI_RUN_NUMBER || "0");
const week = "week12";

for (const g of GROUPS) {
    const fp = path.join(REPORTS_DIR, g.file);
    if (!fs.existsSync(fp)) {
        console.warn("file not found, skipping: " + fp);
        continue;
    }

    const data = JSON.parse(fs.readFileSync(fp, "utf-8"));
    const entry = { run_date, ci_run, week, ...data };

    const histPath = path.join(HISTORY_DIR, g.histfile);

    // ensure existing content ends with newline before appending
    if (fs.existsSync(histPath)) {
        const existing = fs.readFileSync(histPath, "utf-8");
        if (existing.length > 0 && !existing.endsWith("\n")) {
            fs.appendFileSync(histPath, "\n", "utf-8");
        }
    }

    fs.appendFileSync(histPath, JSON.stringify(entry) + "\n", "utf-8");
    console.log("appended -> " + histPath);
}