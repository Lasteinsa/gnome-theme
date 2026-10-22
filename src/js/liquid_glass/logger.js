// Writes only while the `output-logs` setting is on.
export class Logger {
    _settings;
    _outputLogs;
    _settingsIds = [];
    constructor(settings) {
        this._settings = settings;
        this._outputLogs = false;
        try {
            if (this._settings && typeof this._settings.get_boolean === 'function') {
                this._outputLogs = this._settings.get_boolean('output-logs');
                this._bindSettings();
            }
        } catch (e) {
            this._outputLogs = false;
        }
    }
    _bindSettings() {
        const connectSetting = (key, callback) => {
            try {
                let id = this._settings.connect(`changed::${key}`, callback.bind(this));
                this._settingsIds.push(id);
            } catch (e) {}
        };
        connectSetting('output-logs', () => {
            try {
                this._outputLogs = this._settings.get_boolean('output-logs');
            } catch (e) {
                this._outputLogs = false;
            }
        });
    }
    // Check this before building an expensive message only to log it.
    get enabled() {
        return this._outputLogs;
    }
    log(...args) {
        if (!this._outputLogs)
            return;
        console.log(...args);
    }
    error(...args) {
        if (!this._outputLogs)
            return;
        console.error(...args);
    }
    warn(...args) {
        if (!this._outputLogs)
            return;
        console.warn(...args);
    }
    debug(...args) {
        if (!this._outputLogs)
            return;
        console.debug(...args);
    }
    cleanup() {
        for (const id of this._settingsIds)
            this._settings.disconnect(id);
        this._settingsIds = [];
    }
}
