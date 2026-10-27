#!/usr/bin/env bash
# =============================================================================
# make-icons.sh: generate the `<R>` app icons (quest_log's icon script, in yellow).
#
# Draws `<R>` (R for rand) in JetBrains Mono Bold, accent yellow (#FFD60A), on
# pure black, matching quest_log's `<|->` mark.
# Produces a release set and a dev set (with a small DEV label), so the two
# installs are easy to tell apart on the home screen.
#
# Output (assets/icon/):
#   icon[-dev].png                1024×1024  general app icon (black bg)
#   adaptive-foreground[-dev].png 1024×1024  Android adaptive foreground (transparent;
#                                            content inside the 66% safe zone)
#   monochrome[-dev].png          1024×1024  Android 13+ themed icon (white on transparent)
#   splash.png                    1024×1024  splash image (transparent; splash bg is black)
#
# Replacing these files with your own design later needs no code changes.
# Requires: ImageMagick (`convert`), assets/fonts/JetBrainsMono-Bold.ttf
# (run scripts/subset-fonts.sh first).
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FONT="$ROOT/assets/fonts/JetBrainsMono-Bold.ttf"
OUT="$ROOT/assets/icon"
YELLOW="#FFD60A"
TEXT="<R>"

[ -f "$FONT" ] || { echo "missing $FONT; run scripts/subset-fonts.sh first" >&2; exit 1; }
mkdir -p "$OUT"

# render <bg> <fg> <pointsize> <dev:0|1> <outfile>
# Draws the mark centered on a 1024 canvas. With dev=1 it shifts the mark up
# slightly and adds "DEV" underneath. `-annotate` takes the text literally
# (only a leading `@` or `%` escapes are special), so `<R>` is safe as-is.
render() {
  local bg="$1" fg="$2" size="$3" dev="$4" out="$5"
  if [ "$dev" = "1" ]; then
    convert -size 1024x1024 "xc:$bg" \
      -font "$FONT" -fill "$fg" -gravity center \
      -pointsize "$size" -annotate +0-$((size / 4)) "$TEXT" \
      -pointsize $((size / 3)) -annotate +0+$((size * 3 / 5)) "DEV" \
      "$out"
  else
    convert -size 1024x1024 "xc:$bg" \
      -font "$FONT" -fill "$fg" -gravity center \
      -pointsize "$size" -annotate +0+0 "$TEXT" \
      "$out"
  fi
}

for dev in 0 1; do
  suffix=""; [ "$dev" = "1" ] && suffix="-dev"

  # Full icon: mark fills ~70% of the width on black.
  render "#000000" "$YELLOW" 260 "$dev" "$OUT/icon${suffix}.png"

  # Adaptive foreground: Android may crop the outer third, so the mark is
  # kept smaller (inside the 66% safe zone). Background color is set to black
  # in app.config.ts.
  render "none" "$YELLOW" 170 "$dev" "$OUT/adaptive-foreground${suffix}.png"

  # Monochrome: the launcher tints it with the user's theme color.
  render "none" "#FFFFFF" 170 "$dev" "$OUT/monochrome${suffix}.png"
done

# Splash: same mark, no DEV label, transparent so the black splash bg shows.
render "none" "$YELLOW" 260 0 "$OUT/splash.png"

ls -1 "$OUT"
