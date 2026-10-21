#!/usr/bin/env bash
# Runs every minigame's tests. Needs Node >= 22 and Chrome/Chromium (or CHROME=/path/to/chrome).
# Usage: ./run_tests.sh [game|changed]   e.g. ./run_tests.sh drinkmixer   (no argument = every game)
set -uo pipefail
cd "$(dirname "$0")"
# ./run_tests.sh changed  -> only what has uncommitted changes (vs HEAD): docs/<game>/ or tests/<game>/ -> that game;
#                            docs/index.html, templates/, tests/home/, a new game folder -> home; tests/lib/ -> everything
games=("${1:-}")
if [ "${games[0]}" = "changed" ]; then
  files=$( { git diff --name-only HEAD; git ls-files --others --exclude-standard; } 2>/dev/null)
  if echo "$files" | grep -q '^tests/lib/'; then games=($(ls tests | grep -v '^lib$'))
  else
    games=($(echo "$files" | sed -n 's#^\(docs\|tests\)/\([^/]*\)/.*#\2#p' | grep -v '^lib$' | sort -u))
    echo "$files" | grep -qE '^(docs/index\.html|templates/|tests/home/)' && games+=(home)
    git ls-files --others --exclude-standard docs | grep -qE '^docs/[^/]+/index\.html$' && games+=(home)   # a new game
    games=($(printf '%s\n' "${games[@]}" | sort -u))
  fi
  [ ${#games[@]} -eq 0 ] && { echo "nothing changed"; exit 0; }
  echo "changed: ${games[*]}"
fi
[ -z "${games[0]}" ] && games=($(ls tests | grep -v '^lib$'))
failed=0
for g in "${games[@]}"; do
  [ -d "tests/$g" ] || continue
  echo "=== $g ==="
  case "$g" in
    drinkmixer)
      node tests/drinkmixer/run_cujs.mjs all || failed=1
      node tests/drinkmixer/smoke_all_options.mjs || failed=1
      ;;
    *)
      if [ -f "tests/$g/run.mjs" ]; then node "tests/$g/run.mjs" || failed=1; else echo "no tests/$g/run.mjs"; failed=1; fi
      ;;
  esac
done
[ "$failed" = 0 ] && echo "ALL GAMES PASSED" || { echo "SOME TESTS FAILED"; exit 1; }
