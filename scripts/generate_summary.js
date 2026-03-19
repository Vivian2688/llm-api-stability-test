// generate_summary.js
// reads 4 analysis JSON files and generates CSV + markdown report
// usage: node generate_summary.js

const fs = require("fs");
const path = require("path");

const REPORTS_DIR = "reports";

const WEEK10_BASELINE = {
    "wenxin_A": { failure_rate_pct: 0.33, timeout_rate_pct: 17.67, P50_ms: 6730,  P95_ms: 14069, drift_ms: 286  },
    "wenxin_B": { failure_rate_pct: 0.0,  timeout_rate_pct: 7.4,   P50_ms: 2110,  P95_ms: 11198, drift_ms: -88  },
    "xinghe_A": { failure_rate_pct: 3.67, timeout_rate_pct: 25.33, P50_ms: 8000,  P95_ms: 17547, drift_ms: 85   },
    "xinghe_B": { failure_rate_pct: 0.2,  timeout_rate_pct: 8.8,   P50_ms: 2830,  P95_ms: 11414, drift_ms: 623  },
};

const GROUPS = [
    { key: "wenxin_A", label: "Wenxin A", file: "wenxin_week11_A_run_analysis.json", model: "Wenxin", phase: "A_same_case_loop" },
    { key: "wenxin_B", label: "Wenxin B", file: "wenxin_week11_B_run_analysis.json", model: "Wenxin", phase: "B_suite_cycling"  },
    { key: "xinghe_A", label: "Xinghe A", file: "xinghe_week11_A_run_analysis.json", model: "Xinghe", phase: "A_same_case_loop" },
    { key: "xinghe_B", label: "Xinghe B", file: "xinghe_week11_B_run_analysis.json", model: "Xinghe", phase: "B_suite_cycling"  },
];

const results = [];
for (const g of GROUPS) {
    const fp = path.join(REPORTS_DIR, g.file);
    if (!fs.existsSync(fp)) {
        console.warn("file not found, skipping: " + fp);
        continue;
    }
    const d = JSON.parse(fs.readFileSync(fp, "utf-8"));
    results.push({ ...g, ...d });
}

if (results.length === 0) {
    console.error("no analysis files found. run analyze_results.js first.");
    process.exit(1);
}

// CSV
const CSV_COLS = [
    "model", "phase", "total_requests", "success_count",
    "failure_count", "failure_rate_pct",
    "four_xx_count", "assertion_fail_count",
    "timeout_count", "timeout_rate_pct",
    "avg_ms", "P50_ms", "P95_ms", "max_ms", "min_ms",
    "jitter_SD_ms", "drift_ms", "drift_direction",
    "has_burst_failure", "risk_level", "risk_reasons",
];

const csvHeader = CSV_COLS.join(",");
const csvRows = results.map(r => CSV_COLS.map(col => {
    if (col === "model") return r.model;
    if (col === "phase") return r.phase;
    if (col === "risk_reasons") return '"' + (r.risk_reasons || []).join("; ") + '"';
    if (col === "has_burst_failure") return r.has_burst_failure ? "TRUE" : "FALSE";
    return r[col] !== undefined ? r[col] : "";
}).join(","));

const csvContent = [csvHeader, ...csvRows].join("\n");
fs.writeFileSync("week11_stability_summary.csv", "\uFEFF" + csvContent, "utf-8");
console.log("generated: week11_stability_summary.csv");

// markdown
function delta(now, before, unit) {
    if (before === undefined) return "N/A";
    const d = now - before;
    return (d >= 0 ? "+" : "") + d + (unit || "ms");
}

function deltaRate(now, before) {
    if (before === undefined) return "N/A";
    const d = (now - before).toFixed(2);
    return (d >= 0 ? "+" : "") + d + "%";
}

const tableRows = results.map(r => {
    const b = WEEK10_BASELINE[r.key] || {};
    return `| ${r.label} | ${r.failure_rate_pct}% (${deltaRate(r.failure_rate_pct, b.failure_rate_pct)}) | ${r.timeout_rate_pct}% (${deltaRate(r.timeout_rate_pct, b.timeout_rate_pct)}) | ${r.P50_ms}ms (${delta(r.P50_ms, b.P50_ms)}) | ${r.P95_ms}ms (${delta(r.P95_ms, b.P95_ms)}) | ${r.drift_ms}ms | ${r.drift_direction} | ${r.has_burst_failure ? "YES" : "NO"} | **${r.risk_level}** |`;
}).join("\n");

const riskRows = results.map(r =>
    `| ${r.label} | **${r.risk_level}** | ${(r.risk_reasons || []).join("; ")} |`
).join("\n");

const burstNotes = results
    .filter(r => r.has_burst_failure)
    .map(r => `- ${r.label}: burst detected at ${JSON.stringify(r.burst_segments)}`)
    .join("\n") || "- no burst failures detected in either model";

const now = new Date().toISOString().slice(0, 10);

const md = `# Week 11 Stability Regression Report

**date**: ${now}
**test plan**: A_same_case_loop (R=300) x 2 models + B_suite_cycling (10 cases x 50 iterations) x 2 models
**timeout threshold**: 10,000ms | **burst definition**: 3 or more consecutive CONN_ERR / 5xx

---

## 1. Key Metrics vs Week10

| Group | Failure Rate (delta) | Timeout Rate (delta) | P50 (delta) | P95 (delta) | Drift | Direction | Burst | Risk |
|-------|---------------------|---------------------|-------------|-------------|-------|-----------|-------|------|
${tableRows}

> delta = week11 - week10. positive = worse, negative = improved.

---

## 2. Risk Level

| Group | Risk | Reason |
|-------|------|--------|
${riskRows}

---

## 3. Burst Analysis

${burstNotes}

---

## 4. Recommendations

| Priority | Action | Target |
|----------|--------|--------|
| P0 | if xinghe A still shows CONN_ERR burst, add exponential backoff on client side (initial 500ms, max 10s, max 3 retries) | Xinghe |
| P1 | for groups with timeout_rate > 5%, set separate timeout threshold of 15s for 08_random_noise and 06_long_prompt | both |
| P1 | add circuit breaker for requests with P95 > 15s, fall back to cached or default response | Xinghe |
| P2 | monitor latency drift continuously, escalate to P1 if drift_direction = degrading | both |

---

*source: reports/*_week11_*_run_analysis.json*
`;

fs.writeFileSync("week11_stability_report.md", md, "utf-8");
console.log("generated: week11_stability_report.md");
console.log("\nrisk summary:");
results.forEach(r => {
    console.log("  " + r.label.padEnd(10) + " -> " + r.risk_level + "  failure=" + r.failure_rate_pct + "%  timeout=" + r.timeout_rate_pct + "%  burst=" + r.has_burst_failure);
});