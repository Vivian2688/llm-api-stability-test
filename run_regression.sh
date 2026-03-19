#!/bin/bash
# run_regression.sh
# Usage:
#   bash run_regression.sh all all       - run all 4 groups
#   bash run_regression.sh A wenxin      - run wenxin phase A only
#   bash run_regression.sh B xinghe      - run xinghe phase B only

PHASE=${1:-all}
MODEL=${2:-all}

COLLECTION="collections/Week11_Stability_Test.postman_collection.json"
WENXIN_ENV="collections/Wenxin_LMAPI.postman_environment.json"
XINGHE_ENV="collections/Xinghe_LMAPI.postman_environment.json"
REPORTS_DIR="reports"

if ! command -v newman &> /dev/null; then
    echo "newman is not installed. Run: npm install -g newman newman-reporter-htmlextra"
    exit 1
fi

if ! newman run --help 2>&1 | grep -q "htmlextra"; then
    echo "installing newman-reporter-htmlextra..."
    npm install -g newman-reporter-htmlextra
fi

mkdir -p "$REPORTS_DIR"

if [ ! -f "$COLLECTION" ]; then
    echo "collection file not found: $COLLECTION"
    exit 1
fi

run_group() {
    local MODEL_NAME=$1
    local PHASE_NAME=$2
    local ENV_FILE=$3
    local FOLDER=$4
    local ITERATIONS=$5
    local RUN_ID=$6
    local OUTPUT_BASE="${REPORTS_DIR}/${MODEL_NAME}_week11_${PHASE_NAME}_run"

    echo ""
    echo "running: ${MODEL_NAME} x ${PHASE_NAME} | iterations=${ITERATIONS} | run_id=${RUN_ID}"

    newman run "$COLLECTION" \
        --environment "$ENV_FILE" \
        --folder "$FOLDER" \
        --iteration-count "$ITERATIONS" \
        --delay-request 500 \
        --timeout-request 120000 \
        --reporters "cli,json,htmlextra" \
        --reporter-json-export "${OUTPUT_BASE}.json" \
        --reporter-htmlextra-export "${OUTPUT_BASE}.html" \
        --env-var "run_id=${RUN_ID}" \
        --env-var "phase=${FOLDER}" \
        --suppress-exit-code

    echo "done: ${MODEL_NAME} x ${PHASE_NAME}"

    if [ -f "scripts/analyze_results.js" ] && [ -f "${OUTPUT_BASE}.json" ]; then
        node scripts/analyze_results.js "${OUTPUT_BASE}.json"
    fi
}

DATE=$(date +%Y%m%d)

run_wenxin_A() { run_group "wenxin" "A" "$WENXIN_ENV" "A_same_case_loop" 300 "week11_${DATE}_01"; }
run_wenxin_B() { run_group "wenxin" "B" "$WENXIN_ENV" "B_suite_cycling"  50  "week11_${DATE}_02"; }
run_xinghe_A() { run_group "xinghe" "A" "$XINGHE_ENV" "A_same_case_loop" 300 "week11_${DATE}_03"; }
run_xinghe_B() { run_group "xinghe" "B" "$XINGHE_ENV" "B_suite_cycling"  50  "week11_${DATE}_04"; }

PHASE_LOWER=$(echo "$PHASE" | tr '[:upper:]' '[:lower:]')
MODEL_LOWER=$(echo "$MODEL" | tr '[:upper:]' '[:lower:]')

echo "starting regression | phase=${PHASE} model=${MODEL}"

if [[ "$MODEL_LOWER" == "wenxin" || "$MODEL_LOWER" == "all" ]]; then
    [[ "$PHASE_LOWER" == "a" || "$PHASE_LOWER" == "all" ]] && run_wenxin_A
    [[ "$PHASE_LOWER" == "b" || "$PHASE_LOWER" == "all" ]] && run_wenxin_B
fi

if [[ "$MODEL_LOWER" == "xinghe" || "$MODEL_LOWER" == "all" ]]; then
    [[ "$PHASE_LOWER" == "a" || "$PHASE_LOWER" == "all" ]] && run_xinghe_A
    [[ "$PHASE_LOWER" == "b" || "$PHASE_LOWER" == "all" ]] && run_xinghe_B
fi

echo ""
echo "generating summary..."
if [ -f "scripts/generate_summary.js" ]; then
    node scripts/generate_summary.js
else
    echo "generate_summary.js not found, skipping"
fi

echo ""
echo "all done. output files in reports/"