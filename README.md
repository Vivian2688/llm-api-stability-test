# llm-api-stability-test

LLM API stability regression test suite for Wenxin and Xinghe models.

![CI](https://github.com/Vivian2688/llm-api-stability-test/actions/workflows/regression.yml/badge.svg)

---

## Quick Start

```bash
npm install -g newman newman-reporter-htmlextra
bash run_regression.sh all all
node scripts/generate_trend.js
```

---

## Threshold Reference

| Metric | Warning | Fail (CI blocked) |
|--------|---------|-------------------|
| failure_rate_pct | - | > 2% |
| timeout_rate_pct | > 5% | > 30% |
| P95_ms | - | > 20,000ms |
| has_burst_failure | - | true |

---

## History Tracking

Each CI run appends results to `history/*.jsonl`. Format per line:

```json
{ "run_date": "2026-03-12", "ci_run": 5, "week": "week11", "failure_rate_pct": 0, "timeout_rate_pct": 23.33, ... }
```

To generate a local trend report:

```bash
node scripts/generate_trend.js
# output: reports/trend_summary.md
```

History files are committed to the repository. Reports (HTML, JSON) are uploaded as CI artifacts and not committed.

---

## Directory Structure

```
collections/        postman collection and environment files
scripts/            analysis and reporting scripts
history/            cumulative jsonl history per model/phase
reports/            CI artifacts (not committed)
run_regression.sh   main entry point
```

---

## Secrets Required

Configure the following in GitHub → Settings → Secrets → Actions:

| Secret | Description |
|--------|-------------|
| WENXIN_BASE_URL | Wenxin API base URL |
| WENXIN_AUTH_TOKEN | Wenxin auth token |
| XINGHE_BASE_URL | Xinghe API base URL |
| XINGHE_AUTH_TOKEN | Xinghe auth token |