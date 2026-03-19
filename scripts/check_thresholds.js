// scripts/check_thresholds.js
// reads the 4 analysis json files and checks against thresholds
// exits with code 1 if any FAIL condition is met

const fs = require("fs");
const path = require("path");

const REPORTS_DIR = "reports";

const THRESHOLDS = {
    failure_rate_pct: { fail: 2 },
    timeout_rate_pct: { fail: 30, warn: 5 },
    P95_ms:           { fail: 20000 },
    has_burst_failure: { fail: true },
};

const GROUPS = [
    { key: "wenxin_A", label: "Wenxin-A", file: "wenxin_week11_A_run_analysis.json" },
    { key: "wenxin_B", label: "Wenxin-B", file: "wenxin_week11_B_run_analysis.json" },
    { key: "xinghe_A", label: "Xinghe-A", file: "xinghe_week11_A_run_analysis.json" },
    { key: "xinghe_B", label: "Xinghe-B", file: "xinghe_week11_B_run_analysis.json" },
];

let hasFail = false;
const checkResults = [];

for (const g of GROUPS) {
    const fp = path.join(REPORTS_DIR, g.file);
    if (!fs.existsSync(fp)) {
        console.warn("file not found, skipping: " + fp);
        continue;
    }

    const d = JSON.parse(fs.readFileSync(fp, "utf-8"));
    let status = "PASS";
    const reasons = [];

    // failure rate
    if (d.failure_rate_pct > THRESHOLDS.failure_rate_pct.fail) {
        status = "FAIL";
        reasons.push("failure_rate " + d.failure_rate_pct + "% > " + THRESHOLDS.failure_rate_pct.fail + "%");
    }

    // timeout rate
    if (d.timeout_rate_pct > THRESHOLDS.timeout_rate_pct.fail) {
        status = "FAIL";
        reasons.push("timeout_rate " + d.timeout_rate_pct + "% > " + THRESHOLDS.timeout_rate_pct.fail + "%");
    } else if (d.timeout_rate_pct > THRESHOLDS.timeout_rate_pct.warn) {
        if (status === "PASS") status = "WARN";
        reasons.push("timeout_rate " + d.timeout_rate_pct + "% > " + THRESHOLDS.timeout_rate_pct.warn + "% (warning)");
    }

    // P95
    if (d.P95_ms > THRESHOLDS.P95_ms.fail) {
        status = "FAIL";
        reasons.push("P95 " + d.P95_ms + "ms > " + THRESHOLDS.P95_ms.fail + "ms");
    }

    // burst
    if (d.has_burst_failure === true) {
        status = "FAIL";
        reasons.push("burst detected: " + JSON.stringify(d.burst_segments));
    }

    if (status === "FAIL") hasFail = true;

    const line = "[" + status + "] " + g.label +
        " failure=" + d.failure_rate_pct + "%" +
        " timeout=" + d.timeout_rate_pct + "%" +
        " P95=" + d.P95_ms + "ms" +
        " burst=" + (d.has_burst_failure ? "YES" : "NO");

    console.log(line);
    if (reasons.length) console.log("       -> " + reasons.join("; "));

    checkResults.push({
        group: g.label,
        status,
        failure_rate_pct: d.failure_rate_pct,
        timeout_rate_pct: d.timeout_rate_pct,
        P95_ms: d.P95_ms,
        has_burst_failure: d.has_burst_failure,
        reasons,
    });
}

// write threshold_check.json
const outPath = path.join(REPORTS_DIR, "threshold_check.json");
fs.mkdirSync(REPORTS_DIR, { recursive: true });
fs.writeFileSync(outPath, JSON.stringify({ results: checkResults, has_fail: hasFail }, null, 2));
console.log("\nthreshold check written -> " + outPath);

if (hasFail) {
    console.log("\nresult: FAIL - one or more groups exceeded thresholds");
    process.exit(1);
} else {
    console.log("\nresult: all groups passed threshold check");
}
