// analyze_results.js
// reads a single newman export JSON and writes _analysis.json
// usage: node analyze_results.js reports/wenxin_week11_A_run.json

const fs = require("fs");
const path = require("path");

const inputFile = process.argv[2];
if (!inputFile) {
    console.error("usage: node analyze_results.js <newman_run.json>");
    process.exit(1);
}
if (!fs.existsSync(inputFile)) {
    console.error("file not found: " + inputFile);
    process.exit(1);
}

const data = JSON.parse(fs.readFileSync(inputFile, "utf-8"));
const executions = data.run.executions;
const failures = data.run.failures || [];

const TIMEOUT_MS = 10000;
const total = executions.length;

// stability failure: only CONN_ERR and 5xx
const connErrList = executions.filter(e => !e.response);
const fiveXxList = executions.filter(e =>
    e.response && String(e.response.code).startsWith("5")
);
const failureCount = connErrList.length + fiveXxList.length;
const failureRate = (failureCount / total * 100).toFixed(2);

// 4xx and assertion failures tracked separately
const fourXxCount = executions.filter(e =>
    e.response && String(e.response.code).startsWith("4")
).length;
const assertionFailCount = executions.reduce((acc, e) => {
    return acc + (e.assertions || []).filter(a => a.error).length;
}, 0);

// http code distribution
const codeDist = {};
for (const e of executions) {
    const code = e.response ? String(e.response.code) : "CONN_ERR";
    codeDist[code] = (codeDist[code] || 0) + 1;
}

// latency stats
const latencies = executions
    .filter(e => e.response)
    .map(e => e.response.responseTime);

const sorted = [...latencies].sort((a, b) => a - b);
const n = sorted.length;

function pct(arr, p) {
    if (!arr.length) return 0;
    return arr[Math.max(0, Math.floor(arr.length * p / 100) - 1)];
}

const avg_ms = n ? Math.round(latencies.reduce((a, b) => a + b, 0) / n) : 0;
const P50_ms = pct(sorted, 50);
const P95_ms = pct(sorted, 95);
const max_ms = n ? Math.max(...latencies) : 0;
const min_ms = n ? Math.min(...latencies) : 0;
const jitter_SD_ms = n > 1
    ? Math.round(Math.sqrt(latencies.reduce((s, v) => s + (v - avg_ms) ** 2, 0) / n))
    : 0;

// timeout
const timeoutList = latencies.filter(l => l > TIMEOUT_MS);
const timeout_count = timeoutList.length;
const timeout_rate_pct = parseFloat((timeout_count / total * 100).toFixed(2));

// drift: last 20% P50 - first 20% P50
const allLat = executions.map(e => e.response ? e.response.responseTime : null);
const cut = Math.max(1, Math.floor(n * 0.2));
const first20 = allLat.slice(0, cut).filter(v => v !== null).sort((a, b) => a - b);
const last20 = allLat.slice(-cut).filter(v => v !== null).sort((a, b) => a - b);
const drift_ms = pct(last20, 50) - pct(first20, 50);
const drift_direction = drift_ms > 200 ? "degrading" : drift_ms < -200 ? "improving" : "stable";

// burst detection: 3 or more consecutive failures
let has_burst_failure = false;
const burst_segments = [];
let streak = 0;
let streakStart = -1;

for (let i = 0; i < executions.length; i++) {
    const e = executions[i];
    const isFail = !e.response || String(e.response.code).startsWith("5");
    if (isFail) {
        if (streak === 0) streakStart = i + 1;
        streak++;
    } else {
        if (streak >= 3) {
            has_burst_failure = true;
            burst_segments.push({ start: streakStart, end: i, count: streak });
        }
        streak = 0;
    }
}
if (streak >= 3) {
    has_burst_failure = true;
    burst_segments.push({ start: streakStart, end: executions.length, count: streak });
}

// risk level
let risk_level = "P2";
const risk_reasons = [];

if (parseFloat(failureRate) > 2 || has_burst_failure) {
    risk_level = "P0";
    if (parseFloat(failureRate) > 2) risk_reasons.push("failure_rate " + failureRate + "% > 2%");
    if (has_burst_failure) risk_reasons.push("burst detected: " + JSON.stringify(burst_segments));
} else if (timeout_rate_pct > 5 || P95_ms > 15000 || Math.abs(drift_ms) > 2000) {
    risk_level = "P1";
    if (timeout_rate_pct > 5) risk_reasons.push("timeout_rate " + timeout_rate_pct + "% > 5%");
    if (P95_ms > 15000) risk_reasons.push("P95 " + P95_ms + "ms > 15000ms");
    if (Math.abs(drift_ms) > 2000) risk_reasons.push("drift " + drift_ms + "ms > 2000ms");
} else {
    risk_reasons.push("jitter only or occasional 4xx, no burst");
}

const outputFile = inputFile.replace(/\.json$/, "_analysis.json");

const result = {
    source_file: path.basename(inputFile),
    total_requests: total,
    success_count: total - failureCount,
    failure_count: failureCount,
    failure_rate_pct: parseFloat(failureRate),
    four_xx_count: fourXxCount,
    assertion_fail_count: assertionFailCount,
    timeout_count,
    timeout_rate_pct,
    avg_ms,
    P50_ms,
    P95_ms,
    max_ms,
    min_ms,
    jitter_SD_ms,
    drift_ms,
    drift_direction,
    has_burst_failure,
    burst_segments,
    http_code_dist: codeDist,
    risk_level,
    risk_reasons,
};

fs.writeFileSync(outputFile, JSON.stringify(result, null, 2), "utf-8");
console.log("  analysis written -> " + outputFile);
console.log("  failure=" + failureRate + "% timeout=" + timeout_rate_pct + "% P50=" + P50_ms + "ms P95=" + P95_ms + "ms drift=" + drift_ms + "ms risk=" + risk_level);
if (has_burst_failure) {
    console.log("  burst detected: " + JSON.stringify(burst_segments));
}