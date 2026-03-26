#!/usr/bin/env sh
# Best-effort cleanup of leaked local dev subprocesses (Cloudflare workerd, Playwright MCP).
#
# Usage:
#   sh scripts/cleanup-node-leaks.sh
#   sh scripts/cleanup-node-leaks.sh workerd-only   # skip Playwright MCP (e.g. fleet / CI-adjacent)

MODE=${1:-all}

# Orphan workerd: PPID 1 means the parent exited (launchd/init reparented the child).
# Typical source: nitro-cloudflare-dev / wrangler getPlatformProxy without a graceful Nitro close.
kill_orphan_workerd() {
  orphans=$(ps -axo ppid=,pid=,command= 2>/dev/null | awk '($1+0)==1 && /workerd/ { print $2 }')
  if [ -n "$orphans" ]; then
    echo "$orphans" | xargs kill -TERM 2>/dev/null || true
    sleep 1
    orphans=$(ps -axo ppid=,pid=,command= 2>/dev/null | awk '($1+0)==1 && /workerd/ { print $2 }')
    if [ -n "$orphans" ]; then
      echo "$orphans" | xargs kill -KILL 2>/dev/null || true
    fi
    echo "Killed reparented (orphan) workerd processes"
  fi
}

  # Leaked Playwright MCP: Cursor may spawn many copies of the same binary over reconnects.
# E2E uses @playwright/test/cli.js — not this path.
kill_leaked_playwright_mcp() {
  if ! command -v pkill >/dev/null 2>&1; then
    return 0
  fi
  # Match .../node_modules/.bin/playwright-mcp (project installs in this workspace)
  if pkill -TERM -f '[/]node_modules/\.bin/playwright-mcp' 2>/dev/null; then
    sleep 1
    pkill -KILL -f '[/]node_modules/\.bin/playwright-mcp' 2>/dev/null || true
    echo "Killed leaked playwright-mcp (MCP) processes"
  fi
}

kill_orphan_workerd

case "$MODE" in
workerd-only) ;;
*)
  kill_leaked_playwright_mcp
  ;;
esac
