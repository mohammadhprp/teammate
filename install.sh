#!/bin/sh
# Team Mate installer.
#
# Creates a primary repository, installs the Team Mate overlay into it, checks
# for Herdr, and launches Herdr.
#
# Usage:
#   ./install.sh [options]
#
# One-liner (no local checkout):
#   curl -fsSL https://raw.githubusercontent.com/mohammadhprp/teammate/master/install.sh | sh -s -- --kind opencode

set -eu

REPO="mohammadhprp/teammate"
BRANCH="master"
TARBALL_URL="https://github.com/${REPO}/archive/refs/heads/${BRANCH}.tar.gz"
HERDR_URL="https://herdr.dev"
HERDR_INSTALL_URL="https://herdr.dev/install.sh"

DEST="teammate"
KIND=""
FORCE=0
LAUNCH=1

info() { printf '  %s\n' "$1"; }
warn() { printf 'warning: %s\n' "$1" >&2; }
die() { printf 'error: %s\n' "$1" >&2; exit 1; }

usage() {
  cat <<'EOF'
Team Mate installer

Creates ./teammate, installs the Team Mate overlay into it, then launches Herdr.

  src/AGENTS.md       -> teammate/AGENTS.md
  src/team-mate.toml  -> teammate/team-mate.toml
  src/skills/         -> teammate/.agents/skills/
  src/scripts/        -> teammate/scripts/
  src/templates/      -> teammate/templates/
  (opencode.json is created with the permissions the primary needs)

Usage:
  install.sh [options]

Options:
  -d, --dir DIR    directory to create/use (default: ./teammate)
  -k, --kind KIND  set the default worker_kind (for example: opencode, omp)
  -f, --force      overwrite existing files (keeps a .bak copy)
      --no-launch  set up only; do not launch Herdr
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
    --no-launch)
      LAUNCH=0
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

# Create the primary repository.
if [ -e "$DEST" ] && [ ! -d "$DEST" ]; then
  die "$DEST exists and is not a directory"
fi
mkdir -p "$DEST"
DEST=$(CDPATH= cd -- "$DEST" && pwd)
printf 'Setting up Team Mate in %s\n' "$DEST"

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
    ! -path '*/__pycache__/*' ! -path '*/tests/*' \
    ! -name '*.pyc' ! -name '.DS_Store' -print \
    | sort | while IFS= read -r f; do
    install_file "$f" "$tree_dst/${f#"$tree_src"/}"
  done
}

install_file "$src/AGENTS.md" "$DEST/AGENTS.md"
install_file "$src/team-mate.toml" "$DEST/team-mate.toml"
copy_tree "$src/skills" "$DEST/.agents/skills"
copy_tree "$src/scripts" "$DEST/scripts"
copy_tree "$src/templates" "$DEST/templates"

# Provision OpenCode permissions so a fresh primary can read and write its own
# state dir without an external-directory dialog. Target projects are added
# later with `tm permissions allow --cwd <root>` (bootstrap-project).
case "${KIND:-opencode}" in
  opencode)
    if ! command -v python3 >/dev/null 2>&1; then
      warn "python3 not found; skipping opencode.json permissions"
    elif python3 "$DEST/scripts/tm.py" --config "$DEST/team-mate.toml" \
      permissions init >/dev/null 2>&1; then
      info "opencode.json allows the state dir"
    else
      warn "could not provision opencode.json permissions"
    fi
    ;;
esac


if [ -n "$KIND" ] && [ -f "$DEST/team-mate.toml" ]; then
  sed -i.bak "s/^worker_kind = .*/worker_kind = \"$KIND\"/" "$DEST/team-mate.toml"
  rm -f "$DEST/team-mate.toml.bak"
  info "worker_kind -> $KIND"
fi

# A git repository makes the directory a project root for skill discovery.
if [ ! -d "$DEST/.git" ] && command -v git >/dev/null 2>&1; then
  git -C "$DEST" init -q && info "initialized git repository"
fi

# Check for Herdr before launching, offering to install it when missing.
if ! command -v herdr >/dev/null 2>&1; then
  answer=""
  if ( : <>/dev/tty ) 2>/dev/null; then
    printf 'Install Herdr now? [y/N] ' >/dev/tty
    read answer </dev/tty || answer=""
  fi
  case "$answer" in
    y|Y|yes|Yes|YES)
      printf 'Installing Herdr...\n'
      if curl -fsSL "$HERDR_INSTALL_URL" | sh; then
        PATH="$HOME/.local/bin:$PATH"
        export PATH
        hash -r 2>/dev/null || true
      fi
      ;;
  esac
  if ! command -v herdr >/dev/null 2>&1; then
    warn "herdr is not installed; Team Mate uses it as its agent runtime"
    printf '\nInstall Herdr from %s, then re-run this script.\n' "$HERDR_URL"
    exit 1
  fi
fi
command -v python3 >/dev/null 2>&1 || warn "python3 not found; the tm CLI needs Python 3"

label=$(basename -- "$DEST")

if [ "$LAUNCH" -ne 1 ]; then
  printf '\nDone. Start Team Mate with: cd %s && herdr\n' "$DEST"
  exit 0
fi

# Already inside Herdr: open the primary workspace instead of nesting a TUI.
if [ "${HERDR_ENV:-}" = "1" ]; then
  existing=""
  if command -v python3 >/dev/null 2>&1; then
    existing=$(herdr workspace list 2>/dev/null | python3 -c "import sys,json;print(next((w['workspace_id'] for w in json.load(sys.stdin)['result']['workspaces'] if w['label']=='$label'),''))" 2>/dev/null || true)
  fi
  if [ -n "$existing" ]; then
    info "Herdr workspace '$label' already exists ($existing)"
  else
    herdr workspace create --cwd "$DEST" --label "$label" --no-focus >/dev/null 2>&1 \
      && info "created Herdr workspace '$label'" \
      || warn "could not create the Herdr workspace"
  fi
  printf '\nDone. Team Mate is set up in %s.\n' "$DEST"
  exit 0
fi

if [ -t 0 ] && [ -t 1 ]; then
  printf '\nLaunching Herdr in %s ...\n' "$DEST"
  cd "$DEST"
  exec herdr
fi

printf '\nDone. Start Team Mate with: cd %s && herdr\n' "$DEST"
