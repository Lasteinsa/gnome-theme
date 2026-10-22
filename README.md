# MF GNOME Theme Extension

All-in-one GNOME Shell theme and frosted glass effect extension.

## Features

- **Primary Accent**: `#FF5666` applied across Quick Settings, sliders, calendar indicators, running dots, and dialog accents.
- **Hardware-Accelerated Frosted Glass**: Built-in `Shell.BlurEffect` with `Shell.BlurMode.BACKGROUND` for top bar, Quick Settings, Calendar tray, and Dash.
- **Zero-Lag Architecture**: Menu and tray blur shaders automatically toggle off when closed, consuming 0 GPU cycles while hidden.
- **Dark & Light Modes**: Dynamic switching following GNOME's `color-scheme` setting.
- **Modern Radii**: Balanced 14px-24px surface radii and pill sliders.
- **GNOME Shell Compatibility**: GNOME Shell 45 through 50+.

## Requirements

- `sassc` (for compiling stylesheets)
- `glib-compile-schemas` (for settings schema)
- `gnome-shell` 45+

## Installation

### Standard Install / Upgrade

```bash
./install.sh
```

### Install and Enable

```bash
./install.sh --enable
```

### Development Mode (Symlink)

For making live edits in this repository without re-copying files:

```bash
./install.sh --dev
```

### Uninstall

```bash
./install.sh --uninstall
```

## Configuration

Settings can be changed via the GNOME Extensions application or via `gsettings`:

```bash
# Change blur radius (default: 26)
gsettings set org.gnome.shell.extensions.mf-theme blur-radius 28

# Change theme mode ('auto', 'dark', 'light')
gsettings set org.gnome.shell.extensions.mf-theme theme-mode 'auto'

# Toggle panel frosted glass
gsettings set org.gnome.shell.extensions.mf-theme frosted-panel true
```

## Project Structure

```
├── extension.js           # Extension entry point
├── prefs.js               # Libadwaita preferences UI
├── metadata.json          # GNOME Shell extension metadata
├── schemas/               # GSettings schema XML
├── src/
│   ├── js/
│   │   ├── blurManager.js     # Frosted glass manager
│   │   ├── themeManager.js    # Dark/light dynamic stylesheet manager
│   │   ├── liquidGlassDock.js # Liquid glass dock & menu settings adapter
│   │   ├── liquid_glass/      # Optical Snell refraction & dual Kawase blur engine
│   │   └── constants.js       # Shared keys and defaults
│   ├── scss/                  # SCSS source stylesheets
│   └── shaders/               # GLSL fragment shaders (glass, downsample, upsample)
├── build.sh               # SCSS & schema compiler
├── install.sh             # Upgradable installer
└── Makefile               # Task runner
```
