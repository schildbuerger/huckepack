#!/bin/zsh
# A worktree for building one trail beside others (2026-11-06; docs/trail-building.md, "Several
# trails at once"): branch trail/<slug> from main, checked out outside the synced project folder
# (Proton Drive copies files it sees change at once), sharing the project's node_modules.
#   scripts/trail-worktree.sh <slug>          create it; prints its path
#   scripts/trail-worktree.sh <slug> --remove remove it (the branch stays until merged)
set -e
slug=$1
root=${0:A:h:h}
base=${HUCKEPACK_CACHE:-$HOME/.cache/huckepack}/worktrees
dir=$base/$slug
if [[ $2 == --remove ]]; then
  git -C "$root" worktree remove --force "$dir"
  exit 0
fi
mkdir -p "$base"
git -C "$root" worktree add -q -b "trail/$slug" "$dir" main
ln -s "$root/node_modules" "$dir/node_modules"
echo "$dir"
