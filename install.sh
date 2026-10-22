#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Target configuration
UUID=$(grep -o '"uuid"[^,]*' metadata.json | head -1 | cut -d '"' -f 4 || echo "mf-theme@einsa")
EXT_BASE_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions"
TARGET_DIR="${EXT_BASE_DIR}/${UUID}"

print_usage() {
    cat <<EOF
Usage: ./install.sh [OPTIONS]

Options:
  --enable       Install/upgrade and enable the extension immediately
  --dev          Symlink repository to extension folder for live development
  --uninstall    Remove the installed extension completely
  --help         Show this help message
EOF
}

do_build() {
    echo "==> Compiling stylesheets and schemas..."
    ./build.sh
}

do_install() {
    local dev_mode="${1:-false}"
    do_build

    mkdir -p "$EXT_BASE_DIR"

    if [ -d "$TARGET_DIR" ] || [ -L "$TARGET_DIR" ]; then
        echo "==> Upgrading existing installation at ${TARGET_DIR}..."
    else
        echo "==> Performing new installation to ${TARGET_DIR}..."
    fi

    if [ "$dev_mode" = true ]; then
        rm -rf "$TARGET_DIR"
        ln -s "$SCRIPT_DIR" "$TARGET_DIR"
        echo "==> Symlinked ${SCRIPT_DIR} -> ${TARGET_DIR} (Dev mode active)."
    else
        # If it was previously a symlink, remove it first
        if [ -L "$TARGET_DIR" ]; then
            rm -f "$TARGET_DIR"
        fi
        mkdir -p "$TARGET_DIR"

        # Copy extension files cleanly
        cp -f metadata.json extension.js prefs.js stylesheet*.css "$TARGET_DIR/"
        rm -rf "${TARGET_DIR}/src" "${TARGET_DIR}/schemas" "${TARGET_DIR}/shaders" "${TARGET_DIR}/build_"*
        cp -r src "$TARGET_DIR/"
        cp -r schemas "$TARGET_DIR/"
        cp -r src/shaders "$TARGET_DIR/shaders" 2>/dev/null || true

        # Write unique build ID directory to bust SpiderMonkey ESM cache on live reload
        BUILD_ID=$(date +%s)
        echo "$BUILD_ID" > "$TARGET_DIR/build_id.txt"
        cp -r src "${TARGET_DIR}/build_${BUILD_ID}"

        # Ensure target schema and user glib schemas are compiled
        if [ -d "${TARGET_DIR}/schemas" ]; then
            glib-compile-schemas "${TARGET_DIR}/schemas"
        fi
        mkdir -p "${XDG_DATA_HOME:-$HOME/.local/share}/glib-2.0/schemas"
        cp "${SCRIPT_DIR}/schemas/"*.xml "${XDG_DATA_HOME:-$HOME/.local/share}/glib-2.0/schemas/" 2>/dev/null || true
        glib-compile-schemas "${XDG_DATA_HOME:-$HOME/.local/share}/glib-2.0/schemas" 2>/dev/null || true
    fi

    echo "==> Installed version $(grep -o '"version"[^,]*' metadata.json | head -1 | tr -dc '0-9' || echo '1') successfully."

    # Check if extension is already enabled; if so, trigger a reload via DBus
    if command -v busctl >/dev/null 2>&1; then
        local enabled_json
        enabled_json=$(gsettings get org.gnome.shell enabled-extensions 2>/dev/null || echo "")
        if echo "$enabled_json" | grep -q "$UUID"; then
            echo "==> Reloading active extension in GNOME Shell via DBus..."
            busctl --user call org.gnome.Shell.Extensions /org/gnome/Shell/Extensions org.gnome.Shell.Extensions DisableExtension s "$UUID" >/dev/null 2>&1 || true
            sleep 0.5
            busctl --user call org.gnome.Shell.Extensions /org/gnome/Shell/Extensions org.gnome.Shell.Extensions EnableExtension s "$UUID" >/dev/null 2>&1 || true
            sleep 0.5
            echo "==> Extension successfully reloaded."
        fi
    fi
}

do_enable() {
    do_install false
    if command -v gnome-extensions >/dev/null 2>&1; then
        echo "==> Enabling extension ${UUID}..."
        gnome-extensions enable "$UUID" || true
        echo "==> Extension enabled! Frosted glass and #FF5666 theme are active."
    else
        echo "Notice: gnome-extensions command not found. Enable manually via GNOME Extensions app."
    fi
}

do_uninstall() {
    if [ -d "$TARGET_DIR" ] || [ -L "$TARGET_DIR" ]; then
        echo "==> Disabling and removing ${TARGET_DIR}..."
        if command -v gnome-extensions >/dev/null 2>&1; then
            gnome-extensions disable "$UUID" 2>/dev/null || true
        fi
        rm -rf "$TARGET_DIR"
        echo "==> Uninstalled successfully."
    else
        echo "==> Extension ${UUID} is not installed."
    fi
}

# Main option handling
case "${1:-}" in
    --enable)
        do_enable
        ;;
    --dev)
        do_install true
        ;;
    --uninstall)
        do_uninstall
        ;;
    --help|-h)
        print_usage
        ;;
    "")
        do_install false
        ;;
    *)
        echo "Unknown option: $1"
        print_usage
        exit 1
        ;;
esac
