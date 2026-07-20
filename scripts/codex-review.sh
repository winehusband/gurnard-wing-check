#!/bin/bash
# Codex Adversarial Review Script
# Called by Claude Code when Hamish asks for a review
# Accepts specific files and context rather than reviewing the full git diff

set -e

# Usage: codex-review.sh -c "context about what we built" file1.js file2.js file3.js
# Or:    codex-review.sh -c "context" -d file1.js file2.js  (uses git diff for listed files)

CONTEXT=""
USE_DIFF=false
FILES=()
MAX_PAYLOAD_KB=50

while [[ $# -gt 0 ]]; do
  case $1 in
    -c|--context)
      CONTEXT="$2"
      shift 2
      ;;
    -d|--diff)
      USE_DIFF=true
      shift
      ;;
    *)
      FILES+=("$1")
      shift
      ;;
  esac
done

if [ ${#FILES[@]} -eq 0 ]; then
  echo "ERROR: No files specified."
  echo "Usage: codex-review.sh -c \"what we were building\" file1.js file2.js"
  echo "       codex-review.sh -c \"what we were building\" -d file1.js file2.js  (uses git diff for those files)"
  exit 1
fi

# Build the code payload
CODE=""
if [ "$USE_DIFF" = true ]; then
  # Git diff for specific files, with fallback for new/untracked files
  for f in "${FILES[@]}"; do
    DIFF=$(git diff HEAD -- "$f" 2>/dev/null)
    if [ -z "$DIFF" ]; then
      # File is new/untracked or unchanged - show full contents
      if [ -f "$f" ]; then
        CODE+="--- NEW FILE: $f ---"$'\n'
        CODE+=$(cat "$f" 2>/dev/null || echo "(file not found)")
        CODE+=$'\n\n'
      else
        CODE+="--- FILE: $f --- (not found)"$'\n\n'
      fi
    else
      CODE+="--- DIFF: $f ---"$'\n'
      CODE+="$DIFF"
      CODE+=$'\n\n'
    fi
  done
else
  # Full file contents
  for f in "${FILES[@]}"; do
    if [ -f "$f" ]; then
      CODE+="--- FILE: $f ---"$'\n'
      CODE+=$(cat "$f")
      CODE+=$'\n\n'
    else
      CODE+="--- FILE: $f --- (not found)"$'\n\n'
    fi
  done
fi

# Check payload size
PAYLOAD_SIZE=$(echo "$CODE" | wc -c)
PAYLOAD_KB=$((PAYLOAD_SIZE / 1024))
if [ "$PAYLOAD_KB" -gt "$MAX_PAYLOAD_KB" ]; then
  echo "WARNING: Payload is ${PAYLOAD_KB}KB (limit: ${MAX_PAYLOAD_KB}KB)."
  echo "Codex may truncate or struggle with this much code."
  echo "Consider reviewing fewer files at a time."
  echo ""
fi

# Build the review prompt
REVIEW_PROMPT="You are a hostile senior engineer conducting a thorough code review.

OBJECTIVE: The developer was trying to achieve the following:
${CONTEXT:-No context provided - review the code on its own merits.}

Review ONLY the code below. This is the specific work from this session - ignore everything else in the repo.

Be ruthless. Check for:
- **Bugs**: Logic errors, off-by-one, null/undefined handling, race conditions
- **Security**: Injection, auth bypasses, exposed secrets, insecure defaults
- **Edge cases**: Empty inputs, large inputs, concurrent access, error paths
- **Performance**: N+1 queries, unnecessary loops, memory leaks, missing indexes
- **Type safety**: Missing validation, incorrect types, unsafe casts
- **Error handling**: Swallowed errors, missing try/catch, unhelpful error messages
- **API design**: Inconsistent naming, missing validation, breaking changes
- **Does it achieve the objective?**: Given the stated objective above, does this code actually deliver it? Are there gaps or missing pieces?

For each issue found, rate it:
- CRITICAL: Will cause failures in production
- HIGH: Likely to cause problems
- MEDIUM: Should fix but won't break things
- LOW: Nitpick / style

At the end, give a verdict:
- PASS: No critical or high issues remaining
- FAIL: Critical or high issues found (list them)

Be specific. Reference file names and line numbers. Don't be nice about it.

CODE TO REVIEW:
$CODE"

# Run Codex review
echo "========================================="
echo "CODEX ADVERSARIAL REVIEW"
echo "========================================="
echo "Context: ${CONTEXT:-none provided}"
echo "Files: ${FILES[*]}"
echo "Mode: $([ "$USE_DIFF" = true ] && echo 'diff' || echo 'full file')"
if [ "$PAYLOAD_KB" -gt 0 ]; then
  echo "Payload: ${PAYLOAD_KB}KB"
fi
echo "========================================="
echo ""

codex exec "$REVIEW_PROMPT" 2>&1

echo ""
echo "========================================="
echo "END OF CODEX REVIEW"
echo "========================================="
