#!/bin/sh
# Team Mate installer.
#
# Creates a primary repository, installs the Team Mate overlay into it, and
# distributes skills and worker agent definitions for the chosen coding harness.
#
# Usage:
#   ./install.sh [options]
#
# One-liner (no local checkout):
#   curl -fsSL https://raw.githubusercontent.com/mohammadhprp/teammate/master/install.sh | sh -s -- --harness opencode

set -eu

REPO="mohammadhprp/teammate"
BRANCH="master"
TARBALL_URL="https://github.com/${REPO}/archive/refs/heads/${BRANCH}.tar.gz"

DEST="teammate"
HARNESS=""
FORCE=0

info() { printf '  %s\n' "$1"; }
warn() { printf 'warning: %s\n' "$1" >&2; }
die() { printf 'error: %s\n' "$1" >&2; exit 1; }

usage() {
  cat <<'EOF'
Team Mate installer

Creates ./teammate, installs the Team Mate overlay into it, then distributes
skills and worker agent definitions for the chosen coding harness.

  src/AGENTS.md       -> teammate/<instructions file>
  src/team-mate.toml  -> teammate/team-mate.toml
  src/skills/         -> teammate/<harness skills dir>/
  src/agents/         -> teammate/agents/
  src/scripts/        -> teammate/scripts/
  src/templates/      -> teammate/templates/
  (opencode.json is created with the permissions the primary needs)

Usage:
  install.sh [options]

Options:
  -d, --dir DIR        directory to create/use (default: ./teammate)
      --harness NAME   coding harness: opencode, codex, claude, pi, or omp
                       (default: detected, else the installed config, else opencode)
  -f, --force          overwrite conflicting files (keeps a .bak copy)
  -h, --help           show this help

Existing files are not overwritten unless --force is given. A previous (legacy)
Team Mate install in the target directory is upgraded in place automatically:
its legacy runtime artifacts are removed and replaced files keep a .bak copy.
The Claude harness installs the Team Mate plugin from src/ automatically.
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    -d|--dir)
      [ $# -ge 2 ] || die "--dir needs a value"
      DEST=$2
      shift 2
      ;;
    --harness)
      [ $# -ge 2 ] || die "--harness needs a value"
      HARNESS=$2
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

# Resolve the harness in this order: --harness, then environment detection
# (TM_HARNESS or a harness marker), then the harness already recorded in the
# target's team-mate.toml, then opencode. Detection goes through the CLI with an
# empty config so its order can never diverge from harnesses.detect(); when
# python3 is unavailable the built-in mapping is used.
fields=""
have_python=0
if command -v python3 >/dev/null 2>&1; then
  have_python=1
  detect_state="${TMPDIR:-/tmp}/teammate-detect-$$"
  if [ -n "$HARNESS" ]; then
    fields=$(python3 "$src/scripts/tm.py" --config /dev/null --state-dir "$detect_state" \
      --harness "$HARNESS" harness 2>/dev/null) || fields=""
  else
    fields=$(python3 "$src/scripts/tm.py" --config /dev/null --state-dir "$detect_state" \
      harness 2>/dev/null) || fields=""
  fi
else
  warn "python3 not found; using built-in defaults (harness detection and agent sync are skipped)"
fi

resolved=$(printf '%s\n' "$fields" | awk -F'\t' '$1 == "harness" { print $2; exit }')
if [ -n "$HARNESS" ]; then
  if [ -n "$fields" ] && [ "$resolved" != "$HARNESS" ]; then
    die "unknown harness: $HARNESS (choose opencode, codex, claude, pi, omp)"
  fi
  case "$HARNESS" in
    opencode|codex|claude|pi|omp) ;;
    *) die "unknown harness: $HARNESS (choose opencode, codex, claude, pi, omp)" ;;
  esac
elif [ -n "$resolved" ]; then
  HARNESS=$resolved
else
  installed=""
  if [ -f "$DEST/team-mate.toml" ]; then
    installed=$(sed -n 's/^[[:space:]]*harness[[:space:]]*=[[:space:]]*"\([^"]*\)".*/\1/p' \
      "$DEST/team-mate.toml" | head -n 1)
  fi
  case "$installed" in
    opencode|codex|claude|pi|omp) HARNESS=$installed ;;
    *) HARNESS=opencode ;;
  esac
fi

# Ask the CLI where the harness keeps its skills and instructions; fall back to
# the same mapping when python3 is unavailable.
SKILLS_DIR=$(printf '%s\n' "$fields" | awk -F'\t' '$1 == "skills_dir" { print $2; exit }')
INSTRUCTIONS=$(printf '%s\n' "$fields" | awk -F'\t' '$1 == "instructions_file" { print $2; exit }')
if [ -z "$SKILLS_DIR" ] || [ -z "$INSTRUCTIONS" ]; then
  case "$HARNESS" in
    opencode) SKILLS_DIR=".opencode/skills"; INSTRUCTIONS="AGENTS.md" ;;
    codex) SKILLS_DIR=".agents/skills"; INSTRUCTIONS="AGENTS.md" ;;
    claude) SKILLS_DIR=".claude/skills"; INSTRUCTIONS="CLAUDE.md" ;;
    pi) SKILLS_DIR=".pi/skills"; INSTRUCTIONS="AGENTS.md" ;;
    omp) SKILLS_DIR=".omp/skills"; INSTRUCTIONS=".omp/AGENTS.md" ;;
  esac
fi

# A previous Team Mate release ran its own runtime and left files the new overlay
# no longer ships. Recognise that install so it can be upgraded in place. The
# old role file announced a Herdr runtime with a specific phrase; matching that
# phrase (never the bare word "Herdr") keeps a user's own AGENTS.md safe.
is_legacy_role_file() {
  role=$1
  [ -f "$role" ] || return 1
  for phrase in "Herdr is the default" "pluggable worker runtime" \
    "Herdr workspace" "Herdr as the agent runtime"; do
    if grep -Fq "$phrase" "$role"; then
      return 0
    fi
  done
  return 1
}

is_legacy_plugin() {
  plugin=$1
  [ -f "$plugin/team-mate.toml" ] || return 1
  grep -Eq '^[[:space:]]*(runtime|worker_kind|primary_workspace)[[:space:]]*=' \
    "$plugin/team-mate.toml"
}

# `.agents/skills/.teammate-managed.json` is deliberately NOT a signal: the
# current `tm skills sync` writes that manifest too, so a modern project that
# distributed skills must not look legacy.
is_legacy_install() {
  root=$1
  if [ -f "$root/team-mate.toml" ] \
    && grep -Eq '^[[:space:]]*(runtime|worker_kind|primary_workspace)[[:space:]]*=' "$root/team-mate.toml"; then
    return 0
  fi
  if [ -f "$root/scripts/runtimes.py" ]; then return 0; fi
  if [ -f "$root/scripts/tests/test_runtimes.py" ]; then return 0; fi
  if [ -d "$root/.agents/skills/herdr" ]; then return 0; fi
  if is_legacy_role_file "$root/AGENTS.md"; then return 0; fi
  if is_legacy_role_file "$root/CLAUDE.md"; then return 0; fi
  if is_legacy_plugin "$root/.claude/plugins/teammate"; then return 0; fi
  return 1
}

# The skill names a legacy manifest recorded as Team Mate's own. Printed one per
# line, from a manifest that JSON pretty-prints across lines.
legacy_skill_names() {
  tr -d '\n' < "$1" \
    | sed -n 's/.*"skills"[^[]*\[\([^]]*\)\].*/\1/p' \
    | tr ',' '\n' \
    | sed -n 's/^[[:space:]]*"\([^"]*\)".*/\1/p'
}

# rmdir only removes an empty directory; a failure means it still holds files.
prune_empty_dir() {
  if [ -d "$1" ]; then rmdir "$1" 2>/dev/null || true; fi
}

# Remove Team Mate's own legacy artifacts. Runs only when is_legacy_install
# confirmed the tree is legacy, and never touches a user's own files or skills.
migrate_legacy() {
  root=$1
  printf 'Found a previous Team Mate install; upgrading it.\n'
  rm -f "$root/scripts/runtimes.py"
  rm -f "$root/scripts/tests/test_runtimes.py"
  manifest="$root/.agents/skills/.teammate-managed.json"
  if [ -f "$manifest" ]; then
    legacy_skill_names "$manifest" | while IFS= read -r name || [ -n "$name" ]; do
      case "$name" in
        ""|..|.*|*/*) continue ;; # never let a manifest name escape the dir
      esac
      rm -rf "$root/.agents/skills/$name"
    done
    rm -f "$manifest"
  fi
  rm -rf "$root/.agents/skills/herdr"
  prune_empty_dir "$root/.agents/skills"
  prune_empty_dir "$root/.agents"
  prune_empty_dir "$root/scripts/tests"
  plugin="$root/.claude/plugins/teammate"
  if [ -d "$plugin" ] && is_legacy_plugin "$plugin"; then
    if [ ! -e "$plugin.bak" ]; then
      mv "$plugin" "$plugin.bak"
    else
      rm -rf "$plugin"
    fi
  fi
}

# Create the primary repository.
if [ -e "$DEST" ] && [ ! -d "$DEST" ]; then
  die "$DEST exists and is not a directory"
fi
mkdir -p "$DEST"
DEST=$(CDPATH= cd -- "$DEST" && pwd)
LEGACY=0
if is_legacy_install "$DEST"; then
  LEGACY=1
  migrate_legacy "$DEST"
fi
printf 'Setting up Team Mate in %s (%s)\n' "$DEST" "$HARNESS"

# Keep a .bak of a file we are about to replace, but never rewrite an identical
# one, so repeated runs cannot pile up backups.
backup_file() {
  bf=$1
  if [ -e "$bf.bak" ] && cmp -s "$bf" "$bf.bak"; then
    return 0
  fi
  cp -p "$bf" "$bf.bak"
}

# A conflicting file is skipped (and warned about) unless --force or a legacy
# upgrade is replacing it; then it is backed up to .bak first. Identical files
# are silent, so a re-run is a no-op.
install_file() {
  file_src=$1
  file_dst=$2
  if [ -e "$file_dst" ]; then
    if cmp -s "$file_src" "$file_dst"; then
      return 0
    fi
    if [ "$FORCE" -ne 1 ] && [ "$LEGACY" -ne 1 ]; then
      warn "${file_dst#"$DEST"/} exists (skipped; use --force to overwrite)"
      return 0
    fi
    backup_file "$file_dst"
  fi
  mkdir -p "$(dirname -- "$file_dst")"
  cp "$file_src" "$file_dst"
}

# Write the Team Mate config with the resolved harness. team-mate.toml is a
# managed overlay file, so an existing Team Mate config (one with a `harness`
# key) is updated silently and a plain re-run is a no-op. A user's own
# team-mate.toml is preserved and warned about like any other conflicting file.
install_config() {
  config_src=$1
  config_dst=$2
  config_tmp="$config_dst.tmp"
  mkdir -p "$(dirname -- "$config_dst")"
  sed "s/^harness = .*/harness = \"$HARNESS\"/" "$config_src" > "$config_tmp"
  if [ -e "$config_dst" ]; then
    if cmp -s "$config_tmp" "$config_dst"; then
      rm -f "$config_tmp"
      return 0
    fi
    if grep -Eq '^[[:space:]]*harness[[:space:]]*=' "$config_dst" \
      || [ "$FORCE" -eq 1 ] || [ "$LEGACY" -eq 1 ]; then
      backup_file "$config_dst"
      mv "$config_tmp" "$config_dst"
      return 0
    fi
    warn "${config_dst#"$DEST"/} exists (skipped; use --force to overwrite)"
    rm -f "$config_tmp"
    return 0
  fi
  mv "$config_tmp" "$config_dst"
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

# The plugin root is the overlay source directory src/ itself, so there is no
# build step. Claude loads it with --plugin-dir; the plugin carries the skills
# and agent definitions, so they are not copied into .claude/ directly.
install_claude_plugin() {
  [ -f "$src/.claude-plugin/plugin.json" ] || die "the plugin source is missing from this checkout"
  plugin_dest="$DEST/.claude/plugins/teammate"
  rm -rf "$plugin_dest"
  copy_tree "$src" "$plugin_dest"
  # The overlay README documents the source tree, not the plugin; keep it out.
  rm -f "$plugin_dest/README.md"
  info "Claude plugin installed; load it with: claude --plugin-dir \"$plugin_dest\""
}

install_file "$src/AGENTS.md" "$DEST/$INSTRUCTIONS"
install_config "$src/team-mate.toml" "$DEST/team-mate.toml"
if [ "$HARNESS" = "claude" ]; then
  copy_tree "$src/scripts" "$DEST/scripts"
  copy_tree "$src/templates" "$DEST/templates"
  install_claude_plugin
else
  copy_tree "$src/skills" "$DEST/$SKILLS_DIR"
  copy_tree "$src/agents" "$DEST/agents"
  copy_tree "$src/scripts" "$DEST/scripts"
  copy_tree "$src/templates" "$DEST/templates"
fi

# Provision OpenCode permissions so a fresh primary can read and write its own
# state dir without an external-directory dialog. Target projects are added
# later with `tm permissions allow --cwd <root>` (bootstrap-project).
if [ "$HARNESS" = "opencode" ]; then
  if [ "$have_python" -eq 0 ]; then
    warn "python3 not found; skipping opencode.json permissions"
  elif python3 "$DEST/scripts/tm.py" --config "$DEST/team-mate.toml" \
    permissions init >/dev/null 2>&1; then
    info "opencode.json allows the state dir"
  else
    warn "could not provision opencode.json permissions"
  fi
fi

# A git repository makes the directory a project root for skill discovery.
if [ ! -d "$DEST/.git" ] && command -v git >/dev/null 2>&1; then
  git -C "$DEST" init -q && info "initialized git repository"
fi

# Install the worker agent definitions by calling the CLI, so the installer and
# a later `tm agents sync` agree. The skills were copied above, so there is no
# separate distribution step for the primary. Claude's agent definitions come
# from the installed plugin.
if [ "$have_python" -eq 0 ]; then
  warn "python3 not found; the tm CLI needs Python 3"
  warn "install Python 3, then run 'tm agents sync --cwd $DEST' if needed"
elif [ "$HARNESS" = "claude" ]; then
  :
elif python3 "$DEST/scripts/tm.py" --config "$DEST/team-mate.toml" \
  --harness "$HARNESS" agents sync --cwd "$DEST" >/dev/null 2>&1; then
  info "agent definitions -> $DEST for $HARNESS"
else
  warn "could not install agent definitions"
fi

# A short, non-technical wrap-up: where it landed, what it installed, and the
# one prompt that hands the setup to the harness.
case "$HARNESS" in
  opencode) open_cmd="opencode" ;;
  codex) open_cmd="codex" ;;
  claude) open_cmd="claude" ;;
  pi) open_cmd="pi" ;;
  omp) open_cmd="omp" ;;
  *) open_cmd="$HARNESS" ;;
esac
skill_count=$(find "$src/skills" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l | tr -d '[:space:]')
agent_count=$(find "$src/agents" -maxdepth 1 -type f -name '*.md' 2>/dev/null | wc -l | tr -d '[:space:]')

printf '\nTeam Mate is ready.\n'
printf '  location : %s\n' "$DEST"
printf '  harness  : %s\n' "$HARNESS"
printf '  skills   : %s   agents : %s\n' "$skill_count" "$agent_count"
if [ "$LEGACY" -eq 1 ]; then
  printf '  upgraded : yes (removed the legacy runtime, replaced the config)\n'
else
  printf '  upgraded : no (fresh install)\n'
fi

printf 'Next steps:\n'
printf '  1. cd "%s"\n' "$DEST"
printf '  2. open %s   (the primary introduces Team Mate on first contact)\n' "$open_cmd"

printf 'Then give your harness this prompt:\n'
cat <<'EOF'
Set up Team Mate and tell me what it can do.

1. Run:
   curl -fsSL https://raw.githubusercontent.com/mohammadhprp/teammate/master/install.sh | sh -s --
2. Read the installed `teammate/AGENTS.md`.
3. Introduce Team Mate and give me 3 example prompts I can try.
EOF
