#!/usr/bin/env bash
# tools/db-migrate.sh — Tracked D1 migration runner
# --------------------------------------------------
# Runs one or more migration directories in order, skipping any migrations that
# have already been applied. Tracks state in an `_applied_migrations` table
# inside D1.
#
# Usage:
#   bash tools/db-migrate.sh <db-name> --local  [--dir <path>]...
#   bash tools/db-migrate.sh <db-name> --remote [--dir <path>]...
#   bash tools/db-migrate.sh <db-name> --local  --dir <path> [--dir <path>]... --reset
#
# Flags:
#   --reset   Wipe local D1 state before migrating. REFUSES --remote.
#
# Designed to be called from package.json scripts:
#   "db:migrate": "bash ../../tools/db-migrate.sh my-db --local --dir node_modules/@narduk-enterprises/narduk-nuxt-template-layer/drizzle --dir drizzle"
#   "db:reset":   "bash ../../tools/db-migrate.sh my-db --local --dir node_modules/@narduk-enterprises/narduk-nuxt-template-layer/drizzle --dir drizzle --reset"
set -euo pipefail

DB_NAME="${1:?Usage: db-migrate.sh <db-name> --local|--remote [--dir <path>]...}"
shift

LOCATION_FLAG="--local"
declare -a DRIZZLE_DIRS=()
RESET=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --local)  LOCATION_FLAG="--local";  shift ;;
    --remote) LOCATION_FLAG="--remote"; shift ;;
    --dir)    DRIZZLE_DIRS+=("$2");     shift 2 ;;
    --reset)  RESET=true;               shift ;;
    *)        shift ;;
  esac
done

if [ ${#DRIZZLE_DIRS[@]} -eq 0 ]; then
  DRIZZLE_DIRS=("drizzle")
fi

# Safety: --reset is LOCAL-ONLY. Refuse to wipe a production database.
if [ "$RESET" = true ] && [ "$LOCATION_FLAG" = "--remote" ]; then
  echo "🚫  REFUSED: --reset cannot be used with --remote. This would destroy production data."
  exit 1
fi

if [ "$RESET" = true ]; then
  echo "🗑️  Resetting local D1 state..."
  rm -rf .wrangler/state/v3/d1
fi

# 1. Ensure tracking table exists
wrangler d1 execute "$DB_NAME" "$LOCATION_FLAG" \
  --command "CREATE TABLE IF NOT EXISTS _applied_migrations (filename TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')));" \
  > /dev/null 2>&1

# 2. Fetch already-applied filenames
APPLIED=$(wrangler d1 execute "$DB_NAME" "$LOCATION_FLAG" \
  --command "SELECT filename FROM _applied_migrations;" --json 2>/dev/null \
  | node -e "
    let buf = '';
    process.stdin.on('data', c => buf += c);
    process.stdin.on('end', () => {
      try {
        const d = JSON.parse(buf);
        (d[0]?.results || []).forEach(r => console.log(r.filename));
      } catch {}
    });
  " 2>/dev/null || echo "")

SKIP=0
APPLY=0

append_applied() {
  local migration_id="$1"
  if [ -n "$APPLIED" ]; then
    APPLIED="${APPLIED}"$'\n'"${migration_id}"
  else
    APPLIED="${migration_id}"
  fi
}

is_applied() {
  local migration_id="$1"
  if [ -z "$APPLIED" ]; then
    return 1
  fi

  printf '%s\n' "$APPLIED" | grep -qxF "$migration_id"
}

record_migration() {
  local migration_id="$1"
  local escaped_migration_id="${migration_id//\'/\'\'}"

  wrangler d1 execute "$DB_NAME" "$LOCATION_FLAG" \
    --command "INSERT OR IGNORE INTO _applied_migrations (filename) VALUES ('$escaped_migration_id');" \
    > /dev/null 2>&1

  append_applied "$migration_id"
}

is_schema_already_applied_output() {
  local output="$1"
  echo "$output" | grep -qiE "duplicate column name|already exists"
}

split_sql_file() {
  local source_file="$1"
  local output_dir="$2"

  sed 's/--> statement-breakpoint/\n--__BREAKPOINT__\n/g' "$source_file" | awk -v out_dir="$output_dir" '
    function flush() {
      gsub(/^[[:space:]\r\n]+|[[:space:]\r\n]+$/, "", statement)
      if (statement == "") {
        statement = ""
        return
      }

      count += 1
      path = sprintf("%s/%04d.sql", out_dir, count)
      print statement > path
      close(path)
      statement = ""
    }

    /^--__BREAKPOINT__$/ {
      flush()
      next
    }

    {
      if (statement != "") {
        statement = statement ORS $0
      } else {
        statement = $0
      }

      if ($0 ~ /;[[:space:]]*$/) {
        flush()
      }
    }

    END {
      flush()
    }
  '
}

reconcile_migration_file() {
  local migration_id="$1"
  local source_file="$2"
  local temp_dir
  local statement_file
  local statement_output
  local statement_exit
  local saw_statement=false

  temp_dir=$(mktemp -d)
  split_sql_file "$source_file" "$temp_dir"

  for statement_file in "$temp_dir"/*.sql; do
    [ -f "$statement_file" ] || continue
    saw_statement=true

    statement_output=""
    set +e
    statement_output=$(wrangler d1 execute "$DB_NAME" "$LOCATION_FLAG" --file="$statement_file" 2>&1)
    statement_exit=$?
    set -e

    if [ $statement_exit -eq 0 ]; then
      continue
    fi

    if is_schema_already_applied_output "$statement_output"; then
      continue
    fi

    echo "❌  ${migration_id} failed during statement reconciliation:"
    echo "$statement_output"
    rm -rf "$temp_dir"
    return 1
  done

  rm -rf "$temp_dir"

  if [ "$saw_statement" = false ]; then
    echo "❌  ${migration_id} could not be split into statements"
    return 1
  fi

  return 0
}

scope_for_dir() {
  local dir="$1"
  dir="${dir#./}"
  dir="${dir%/}"

  case "$dir" in
    drizzle) echo "app" ;;
    node_modules/@narduk-enterprises/narduk-nuxt-template-layer/drizzle) echo "layer" ;;
    layers/narduk-nuxt-layer/drizzle) echo "layer" ;;
    *)
      dir="${dir//\//:}"
      dir="${dir//[^A-Za-z0-9:_-]/_}"
      echo "$dir"
      ;;
  esac
}

# 3. Process each migration file in order
for dir in "${DRIZZLE_DIRS[@]}"; do
  if [ ! -d "$dir" ]; then
    echo "❌  Migration directory not found: $dir"
    exit 1
  fi

  scope=$(scope_for_dir "$dir")

  for f in "$dir"/0*.sql; do
    [ -f "$f" ] || continue
    filename=$(basename "$f")
    migration_id="${scope}:${filename}"

    if is_applied "$migration_id"; then
      SKIP=$((SKIP + 1))
      continue
    fi

    # Backfill older tracker rows that used bare filenames before migrations were
    # namespaced by ownership scope. Only the shared layer uses this compatibility
    # path so downstream app migrations remain independent.
    if [ "$scope" = "layer" ] && is_applied "$filename"; then
      echo "↪️  ${migration_id}: already tracked by legacy filename entry"
      record_migration "$migration_id"
      SKIP=$((SKIP + 1))
      continue
    fi

    echo "⏳  Applying ${migration_id}..."
    MIGRATE_OUTPUT=""
    set +e
    MIGRATE_OUTPUT=$(wrangler d1 execute "$DB_NAME" "$LOCATION_FLAG" --file="$f" 2>&1)
    MIGRATE_EXIT=$?
    set -e

    if [ $MIGRATE_EXIT -eq 0 ]; then
      : # Success — record normally below
    elif is_schema_already_applied_output "$MIGRATE_OUTPUT"; then
      echo "⚠️  ${migration_id}: schema overlap detected — reconciling statement by statement"
      reconcile_migration_file "$migration_id" "$f"
    else
      echo "❌  ${migration_id} failed:"
      echo "$MIGRATE_OUTPUT"
      exit 1
    fi

    record_migration "$migration_id"
    APPLY=$((APPLY + 1))
  done
done

echo "✅  Migrations complete: $APPLY applied, $SKIP skipped"
