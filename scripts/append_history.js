// scripts/generate_trend.js
// reads history/*.jsonl and generates trend_summary.md
// usage: node scripts/generate_trend.js

const fs = require("fs");
const path = require("path");

const HISTORY_DIR = "history";
const REPORTS_DIR = "reports";
const N = 5;
const DEGRADATION_THRESHOLD = 0.2;

const GROUPS = [
    { key: "wenxin_A", label: "Wenxin A", file: "wenxin_A_history.jsonl" },
    { key: "wenxin_B", label: "Wenxin B", file: "wenxin_B_history.jsonl" },
    { key: "xinghe_A", label: "Xinghe A", file: "xinghe_A_history.jsonl" },
    { key: "xinghe_B", label: "Xinghe B", file: "xinghe_B_history.jsonl" },
];

const METRICS = ["failure_rate_pct", "timeout_rate_pct", "P50_ms", "P95_ms"];

function readHistory(file) {
    const fp = path.join(HISTORY_DIR, file);
    if (!fs.existsSync(fp)) return [];
    const lines = fs.readFileSync(fp, "utf-8").split("\n").filter(l => l.trim());
    const records = [];
    for (const line of lines) {
        try {
            records.push(JSON.parse(line));
        } catch (e) {
            console.warn("skipping malformed line in " + file + ": " + line.slice(0, 50));
        }
    }
    return records;
}

function mean(arr) {
    if (!arr.length) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function markDegradation(val, avg) {
    if (avg === 0) return "";
    return val > avg * (1 + DEGRADATION_THRESHOLD) ? " (**)" : "";
}

fs.mkdirSync(REPORTS_DIR, { recursive: true });

const now = new Date().toISOString().slice(0, 10);
let md = "# Trend Summary\n\n**generated**: " + now + "\n\n";
md += "> (**) = degradation detected (value > mean + 20%)\n\n---\n\n";

const trendData = {};

for (const g of GROUPS) {
    const records = readHistory(g.file);
    if (!records.length) {
        md += "## " + g.label + "\n\nno history data available.\n\n";
        continue;
    }

    const recent = records.slice(-N);
    const all = records;

    md += "## " + g.label + "\n\n";
    md += "| run_date | ci_run | failure_rate% | timeout_rate% | P50_ms | P95_ms |\n";
    md += "|----------|--------|--------------|--------------|--------|--------|\n";

    for (const r of recent) {
        const avgs = {};
        for (const m of METRICS) {
            avgs[m] = mean(all.map(x => x[m] || 0));
        }
        md += "| " + r.run_date +
            " | " + (r.ci_run || "-") +
            " | " + r.failure_rate_pct + markDegradation(r.failure_rate_pct, avgs.failure_rate_pct) +
            " | " + r.timeout_rate_pct + markDegradation(r.timeout_rate_pct, avgs.timeout_rate_pct) +
            " | " + r.P50_ms + markDegradation(r.P50_ms, avgs.P50_ms) +
            " | " + r.P95_ms + markDegradation(r.P95_ms, avgs.P95_ms) +
            " |\n";
    }

    const last = recent[recent.length - 1];
    md += "\n7-run mean: ";
    const meanVals = [];
    for (const m of METRICS) {
        const avg = mean(all.slice(-7).map(x => x[m] || 0));
        const dev = last ? (((last[m] || 0) - avg) / (avg || 1) * 100).toFixed(1) : "N/A";
        meanVals.push(m + "=" + avg.toFixed(1) + " (last deviation: " + dev + "%)");
    }
    md += meanVals.join(", ") + "\n\n";

    trendData[g.key] = recent.map(r => ({
        run_date: r.run_date,
        ci_run: r.ci_run,
        failure_rate_pct: r.failure_rate_pct,
        timeout_rate_pct: r.timeout_rate_pct,
        P50_ms: r.P50_ms,
        P95_ms: r.P95_ms,
    }));
}

const mdPath = path.join(REPORTS_DIR, "trend_summary.md");
fs.writeFileSync(mdPath, md, "utf-8");
console.log("generated: " + mdPath);

const jsonPath = path.join(REPORTS_DIR, "trend_data.json");
fs.writeFileSync(jsonPath, JSON.stringify(trendData, null, 2), "utf-8");
console.log("generated: " + jsonPath);