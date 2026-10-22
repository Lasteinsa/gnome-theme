import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';


export default class MFThemeExtension extends Extension {
    async enable() {
        console.log(`[MF Theme] Enabling ${this.metadata.name}...`);
        this._settings = this.getSettings();

        try {
            let buildSubdir = 'src';
            try {
                const buildIdFile = this.dir.get_child('build_id.txt');
                if (buildIdFile.query_exists(null)) {
                    const [ok, bytes] = buildIdFile.load_contents(null);
                    if (ok) {
                        const id = new TextDecoder().decode(bytes).trim();
                        if (id && this.dir.get_child(`build_${id}`).query_exists(null)) {
                            buildSubdir = `build_${id}`;
                        }
                    }
                }
            } catch (e) {}

            const baseUri = `${this.dir.get_uri()}/${buildSubdir}`;
            const themeMod = await import(`${baseUri}/js/themeManager.js`);
            const blurMod = await import(`${baseUri}/js/blurManager.js`);

            this._themeManager = new themeMod.ThemeManager(this.dir, this._settings);
            this._themeManager.enable();

            this._blurManager = new blurMod.BlurManager(this._settings);
            this._blurManager.enable();
        } catch (e) {
            console.error(`[MF Theme] Error enabling extension: ${e}\n${e.stack}`);
        }
    }

    disable() {
        console.log(`[MF Theme] Disabling ${this.metadata.name}...`);
        this._blurManager?.disable();
        this._blurManager = null;

        this._themeManager?.disable();
        this._themeManager = null;

        this._settings = null;
    }
}
