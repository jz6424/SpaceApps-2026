#!/usr/bin/env bash
# Builds the whole website into _site/: the landing page at the root and the game at play/.
# Used by the GitHub Pages workflow. Local preview: python3 -m http.server -d _site 5175
set -euo pipefail
cd "$(dirname "$0")"

(cd game && { [ -d node_modules ] || npm ci; } && npm run build)

rm -rf _site
mkdir -p _site/img
cp site/index.html site/site.css site/site.js _site/
cp -R game/dist _site/play
for shot in 14-warning 12-map 16-outside; do
  cp "docs/screenshots/$shot.png" _site/img/
done
touch _site/.nojekyll
echo "Website ready in _site/"
