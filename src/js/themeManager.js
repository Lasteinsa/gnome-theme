import Gio from 'gi://Gio';
import St from 'gi://St';

const SETTINGS = {
    THEME_MODE: 'theme-mode',
};


export class ThemeManager {
    constructor(extensionDir, settings) {
        this._dir = extensionDir;
        this._settings = settings;
        this._interfaceSettings = new Gio.Settings({
            schema_id: 'org.gnome.desktop.interface',
        });
        this._currentLoadedFile = null;
    }

    enable() {
        this._interfaceSettings.connectObject(
            'changed::color-scheme', () => this._onColorSchemeChanged(),
            this
        );

        this._settings.connectObject(
            `changed::${SETTINGS.THEME_MODE}`, () => this._onColorSchemeChanged(),
            this
        );

        this._applyTheme();
    }

    disable() {
        this._unloadCurrentStylesheet();

        if (this._interfaceSettings) {
            this._interfaceSettings.disconnectObject(this);
        }

        if (this._settings) {
            this._settings.disconnectObject(this);
        }
    }

    _onColorSchemeChanged() {
        this._applyTheme();
    }

    _isDarkMode() {
        const mode = this._settings.get_string(SETTINGS.THEME_MODE);
        if (mode === 'dark') return true;
        if (mode === 'light') return false;

        // Auto mode: check GNOME interface color-scheme
        const scheme = this._interfaceSettings.get_string('color-scheme');
        return scheme === 'prefer-dark';
    }

    _applyTheme() {
        const isDark = this._isDarkMode();
        const filename = isDark ? 'stylesheet-dark.css' : 'stylesheet-light.css';
        const file = this._dir.get_child(filename);

        if (!file.query_exists(null)) {
            console.error(`[MF Theme] Stylesheet not found: ${file.get_path()}`);
            return;
        }

        const themeContext = St.ThemeContext.get_for_stage(global.stage);
        const theme = themeContext.get_theme();

        // If the same stylesheet is already loaded, nothing to do
        if (this._currentLoadedFile && this._currentLoadedFile.equal(file)) {
            return;
        }

        // Unload previous
        this._unloadCurrentStylesheet();

        // Load new
        try {
            theme.load_stylesheet(file);
            this._currentLoadedFile = file;
            console.log(`[MF Theme] Loaded stylesheet: ${filename}`);
        } catch (e) {
            console.error(`[MF Theme] Failed to load stylesheet: ${e}`);
        }
    }

    _unloadCurrentStylesheet() {
        if (!this._currentLoadedFile) return;

        try {
            const themeContext = St.ThemeContext.get_for_stage(global.stage);
            const theme = themeContext.get_theme();
            theme.unload_stylesheet(this._currentLoadedFile);
        } catch (e) {
            console.error(`[MF Theme] Failed to unload stylesheet: ${e}`);
        } finally {
            this._currentLoadedFile = null;
        }
    }
}
