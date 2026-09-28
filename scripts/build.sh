#!/usr/bin/env bash
# Baut alle Profil-Grafiken nach dist/. Läuft lokal genauso wie in GitHub Actions.
# Fällt ein Teil aus, wird die aktuell veröffentlichte Version übernommen.
set -uo pipefail
cd "$(dirname "$0")/.."

export OUT_DIR="${OUT_DIR:-dist}"
export GITHUB_USERNAME="${GITHUB_USERNAME:-Plattnericus}"
SITE_URL="${SITE_URL:-https://plattnericus.github.io/Plattnericus}"

warn() { echo "::warning::$1"; }

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

node scripts/generate-contribution-graph.mjs || warn "Contribution graph fehlgeschlagen"
node scripts/generate-activity-graph.mjs || warn "Activity graph fehlgeschlagen"
node scripts/generate-terminal.mjs || warn "Terminal-Karte fehlgeschlagen"

if command -v gh-space-shooter >/dev/null; then
  gh-space-shooter "$GITHUB_USERNAME" --output "$OUT_DIR/game.gif" --strategy random --fps 30 \
    || warn "Space shooter fehlgeschlagen"
else
  echo "gh-space-shooter nicht installiert, GIF übersprungen"
fi

# Fehlende Dateien: letzte veröffentlichte Version behalten statt sie zu verlieren
for f in contribution-graph.svg activity-graph.svg terminal.svg game.gif; do
  [ -s "$OUT_DIR/$f" ] && continue
  if curl -fsSL "$SITE_URL/$f" -o "$OUT_DIR/$f" 2>/dev/null; then
    echo "↺ $f: letzte veröffentlichte Version übernommen"
  else
    rm -f "$OUT_DIR/$f"
  fi
done

if [ ! -s "$OUT_DIR/contribution-graph.svg" ] || [ ! -s "$OUT_DIR/activity-graph.svg" ]; then
  echo "::error::Graphen konnten weder erzeugt noch übernommen werden"
  exit 1
fi

# Startseite der Pages-Site leitet aufs GitHub-Profil weiter
cat > "$OUT_DIR/index.html" <<EOF
<!doctype html>
<meta charset="utf-8">
<meta http-equiv="refresh" content="0; url=https://github.com/$GITHUB_USERNAME">
<title>$GITHUB_USERNAME</title>
<a href="https://github.com/$GITHUB_USERNAME">github.com/$GITHUB_USERNAME</a>
EOF

ls -l "$OUT_DIR"
