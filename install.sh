#!/bin/sh
# Team Mate installer — copies the Team Mate overlay into a primary repository.
#
# Usage:
#   ./install.sh [options] [dir]
#
# One-liner (no local checkout):
#   curl -fsSL https://raw.githubusercontent.com/mohammadhprp/teammate/master/install.sh | sh -s -- --dir ~/my-primary

set -eu

REPO="mohammadhprp/teammate"
BRANCH="master"
TARBALL_URL="https://github.com/${REPO}/archive/refs/heads/${BRANCH}.tar.gz"

DEST="."
KIND=""
FORCE=0

info() { printf '  %s\n' "$1"; }
warn() { printf 'warning: %s\n' "$1" >&2; }
die() { printf 'error: %s\n' "$1" >&2; exit 1; }

usage() {
  cat <<'EOF'
Team Mate installer

Installs the Team Mate overlay into a primary repository:
  src/AGENTS.md       -> <dir>/AGENTS.md
  src/team-mate.toml  -> <dir>/team-mate.toml
  src/skills/         -> <dir>/.agents/skills/
  src/scripts/        -> <dir>/scripts/
  src/templates/      -> <dir>/templates/

Usage:
  install.sh [options] [dir]

Options:
  -d, --dir DIR    primary repository to install into (default: current dir)
  -k, --kind KIND  set the default worker_kind (for example: opencode, omp)
  -f, --force      overwrite existing files (keeps a .bak copy)
  -h, --help       show this help

Existing files are not overwritten unless --force is given.
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    -d|--dir)
      [ $# -ge 2 ] || die "--dir needs a value"
      DEST=$2
      shift 2
      ;;
    -k|--kind)
      [ $# -ge 2 ] || die "--kind needs a value"
      KIND=$2
      shift 2
      ;;
    -f|--force)
      FORCE=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    -*)
      die "unknown option: $1"
      ;;
    *)
      DEST=$1
      shift
      ;;
  esac
done

# Locate the overlay source, locally or from the repository.
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" 2>/dev/null && pwd || true)
src=""
if [ -n "$script_dir" ] && [ -f "$script_dir/src/AGENTS.md" ]; then
  src="$script_dir/src"
else
  command -v curl >/dev/null 2>&1 || die "curl is required to download Team Mate"
  command -v tar >/dev/null 2>&1 || die "tar is required to unpack Team Mate"
  tmp=$(mktemp -d)
  trap 'rm -rf "$tmp"' EXIT INT TERM
  printf 'Downloading Team Mate...\n'
  curl -fsSL "$TARBALL_URL" -o "$tmp/teammate.tar.gz" || die "download failed"
  tar -xzf "$tmp/teammate.tar.gz" -C "$tmp" || die "unpack failed"
  src=$(find "$tmp" -maxdepth 3 -type f -path '*/src/AGENTS.md' | sed 's|/AGENTS.md$||' | head -n 1)
  [ -n "$src" ] || die "could not find the overlay in the download"
fi

[ -d "$DEST" ] || die "target directory does not exist: $DEST"
DEST=$(CDPATH= cd -- "$DEST" && pwd)

printf 'Installing Team Mate into %s\n' "$DEST"

install_file() {
  file_src=$1
  file_dst=$2
  if [ -e "$file_dst" ]; then
    if cmp -s "$file_src" "$file_dst"; then
      info "= ${file_dst#"$DEST"/}"
      return 0
    fi
    if [ "$FORCE" -ne 1 ]; then
      info "! ${file_dst#"$DEST"/} exists (skipped)"
      return 0
    fi
    cp "$file_dst" "$file_dst.bak"
  fi
  mkdir -p "$(dirname -- "$file_dst")"
  cp "$file_src" "$file_dst"
  info "+ ${file_dst#"$DEST"/}"
}

copy_tree() {
  tree_src=$1
  tree_dst=$2
  [ -d "$tree_src" ] || return 0
  find "$tree_src" -type f \
    ! -path '*/__pycache__/*' ! -name '*.pyc' ! -name '.DS_Store' -print \
    | sort | while IFS= read -r f; do
    install_file "$f" "$tree_dst/${f#"$tree_src"/}"
  done
}

install_file "$src/AGENTS.md" "$DEST/AGENTS.md"
install_file "$src/team-mate.toml" "$DEST/team-mate.toml"
copy_tree "$src/skills" "$DEST/.agents/skills"
copy_tree "$src/scripts" "$DEST/scripts"
copy_tree "$src/templates" "$DEST/templates"

if [ -n "$KIND" ] && [ -f "$DEST/team-mate.toml" ]; then
  sed -i.bak "s/^worker_kind = .*/worker_kind = \"$KIND\"/" "$DEST/team-mate.toml"
  rm -f "$DEST/team-mate.toml.bak"
  info "worker_kind -> $KIND"
fi

command -v python3 >/dev/null 2>&1 || warn "python3 not found; the tm CLI needs Python 3"
command -v herdr >/dev/null 2>&1 || warn "herdr not found; install Herdr and put it on PATH"
[ "${HERDR_ENV:-}" = "1" ] || warn "not running inside a Herdr pane; start Team Mate from Herdr"

cat <<'EOF'

Done. Next:
  1. Open a coding agent in this directory inside Herdr; its AGENTS.md makes it Team Mate.
  2. Check workers:  python3 scripts/tm.py status
  3. Record a task:  python3 scripts/tm.py task new --project <name> --title <t> --goal <g> --acceptance <c>
  4. For accurate worker lifecycle, install the agent integration: herdr integration install <kind>
EOF
