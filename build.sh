#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "==> Building MF GNOME Theme..."

# 1. Compile SCSS
if command -v sassc >/dev/null 2>&1; then
    echo "Compiling SCSS with sassc..."
    sassc src/scss/stylesheet-dark.scss stylesheet-dark.css
    sassc src/scss/stylesheet-light.scss stylesheet-light.css
    # Default fallback
    cp stylesheet-dark.css stylesheet.css
else
    echo "Error: sassc is not installed. Please install sassc to compile stylesheets." >&2
    exit 1
fi

# 2. Compile GSettings schemas
if [ -d "schemas" ]; then
    echo "Compiling GSettings schemas..."
    glib-compile-schemas schemas/
fi

echo "==> Build complete successfully."
