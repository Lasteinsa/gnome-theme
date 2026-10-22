import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import { Logger } from './liquid_glass/logger.js';
import { installGlassDiagnostics, removeGlassDiagnostics } from './liquid_glass/diagnostics/glass.js';
import { setUtilsLogger } from './liquid_glass/diagnostics/logging.js';
import { UIManager } from './liquid_glass/uiManager.js';
import { isActorValid } from './liquid_glass/actors/lifecycle.js';

export class LiquidGlassSettingsAdapter {
    constructor(mfSettings) {
        this._settings = mfSettings;
        this._extraMenus = [];
        this._listeners = new Map();
        this._nextListenerId = 1;

        try {
            this._interfaceSettings = new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' });
        } catch (e) {
            this._interfaceSettings = null;
        }

        if (this._interfaceSettings) {
            try {
                this._interfaceSettings.connect('changed::color-scheme', () => this._notifyThemeChanged());
            } catch (e) {}
        }
        if (this._settings) {
            try {
                this._settings.connect('changed::theme-mode', () => this._notifyThemeChanged());
            } catch (e) {}
        }
    }

    _isDarkMode() {
        if (this._settings) {
            try {
                const mode = this._settings.get_string('theme-mode');
                if (mode === 'dark') return true;
                if (mode === 'light') return false;
            } catch (e) {}
        }
        if (this._interfaceSettings) {
            try {
                return this._interfaceSettings.get_string('color-scheme') === 'prefer-dark';
            } catch (e) {}
        }
        return true;
    }

    _notifyThemeChanged() {
        for (const [signal, callbacks] of this._listeners.entries()) {
            if (signal.includes('tint-color') || signal.includes('tint-strength') || signal.includes('brightness')) {
                for (const cb of callbacks.values()) {
                    try { cb(); } catch (e) {}
                }
            }
        }
    }

    get_boolean(key) {
        if (key === 'enable-dock-glass') {
            return this._settings ? this._settings.get_boolean('liquid-glass-dock') : true;
        }
        if (key === 'enable-menu-glass') {
            return this._settings ? this._settings.get_boolean('frosted-datemenu') : true;
        }
        if (key === 'enable-quick-settings-glass') {
            return this._settings ? this._settings.get_boolean('frosted-quick-settings') : true;
        }
        if (key === 'enable-extra-menu-glass') {
            return this._settings ? (this._settings.get_boolean('frosted-menus') || this._settings.get_boolean('liquid-glass-dock')) : true;
        }
        if (key.includes('animation') || key.includes('adaptive') || key.includes('debug')) {
            return false;
        }
        if (key.includes('match-quick-settings-height')) {
            return false;
        }
        if (key === 'glass-backdrop-highlights') return true;
        if (key === 'output-logs') return false;
        return true;
    }

    get_int(key) {
        if (key === 'dock-blur-radius' || key === 'menu-blur-radius' ||
            key === 'quick-settings-blur-radius' || key === 'panel-menu-blur-radius') {
            return 4;
        }
        if (key === 'glass-blur-downscale') return 2;
        if (key === 'blur-method') return 1; // Dual Kawase
        if (key === 'quick-settings-apply-to') return 0; // background glass mode
        if (key.includes('interval-ms')) return 16;
        return 0;
    }

    get_double(key) {
        const isDark = this._isDarkMode();

        // Corner radii matching theme SCSS
        if (key === 'menu-corner-radius') return 26.0; // .datemenu-popover 26px
        if (key === 'quick-settings-corner-radius') return 24.0; // .quick-settings 24px
        if (key === 'dock-corner-radius') return 18.0;
        if (key === 'panel-menu-corner-radius') return 18.0; // .popup-menu-content 18px
        if (key === 'quick-settings-toggle-corner-radius') return 16.0;

        // Tint strength: in dark mode, menus need sufficient dark tint so that
        // when open over white windows (e.g. Chrome/docs), text remains legible.
        if (key === 'dock-tint-strength') return isDark ? 0.30 : 0.15;
        if (key === 'menu-tint-strength' || key === 'quick-settings-tint-strength' || key === 'panel-menu-tint-strength') {
            return isDark ? 0.62 : 0.35;
        }
        if (key === 'quick-settings-toggle-tint-strength') return 0.10;

        if (key.endsWith('-brightness')) {
            if (key.startsWith('dock-')) return isDark ? 0.90 : 1.0;
            return isDark ? 0.78 : 1.0;
        }
        if (key.endsWith('-contrast')) return 1.0;
        if (key.endsWith('-saturation')) return 1.5;
        if (key.endsWith('-scale')) return 1.0;

        if (key.endsWith('-spring-stiffness')) return 120.0;
        if (key.endsWith('-spring-damping')) return 8.0;
        if (key.endsWith('-spring-mass')) return 1.0;

        switch (key) {
            case 'glass-max-z': return 88.0;
            case 'glass-displacement-scale': return 10.5;
            case 'glass-edge-smoothing': return 0.5;
            case 'glass-profile-shape-n': return 3.6;
            case 'glass-ior': return 2.40;
            case 'glass-chroma-strength': return 0.0;
            case 'glass-corner-smoothing': return 0.6;
            case 'glass-specular-intensity': return 0.0;
            case 'glass-shininess': return 42.0;
            case 'glass-rim-width': return 2.3;
            case 'glass-rim-intensity': return 0.5;
            case 'glass-rim-directional-power': return 1.9;
            case 'glass-rim-power': return 3.0;
            case 'glass-rim-light-color-intensity': return 1.0;
            case 'glass-sheen-intensity': return 0.0;
            case 'glass-light-angle-deg': return 230.0;
            case 'shadow-radius': return 50.0;
            case 'shadow-intensity': return 0.07;
            case 'glass-ao-intensity': return 0.65;
            case 'glass-ao-radius': return 1.0;
            default: return 1.0;
        }
    }

    get_string(key) {
        if (key.endsWith('-tint-color')) {
            return this._isDarkMode() ? '#0e0e14' : '#ffffff';
        }
        return '';
    }

    get_strv(key) {
        if (key === 'detected-extra-menus') return this._extraMenus;
        return [];
    }

    set_strv(key, val) {
        if (key === 'detected-extra-menus') this._extraMenus = val || [];
    }

    connect(signal, callback) {
        if (signal === 'changed::enable-dock-glass') {
            return this._settings ? this._settings.connect('changed::liquid-glass-dock', callback) : 0;
        }
        if (signal === 'changed::enable-menu-glass') {
            return this._settings ? this._settings.connect('changed::frosted-datemenu', callback) : 0;
        }
        if (signal === 'changed::enable-quick-settings-glass') {
            return this._settings ? this._settings.connect('changed::frosted-quick-settings', callback) : 0;
        }
        if (signal === 'changed::enable-extra-menu-glass') {
            return this._settings ? this._settings.connect('changed::frosted-menus', callback) : 0;
        }
        if (signal.includes('blur-radius')) {
            return this._settings ? this._settings.connect('changed::blur-radius', callback) : 0;
        }
        if (signal.includes('brightness')) {
            const id = this._registerListener(signal, callback);
            if (this._settings) {
                this._settings.connect('changed::blur-brightness', callback);
            }
            return id;
        }
        if (signal.includes('tint-color') || signal.includes('tint-strength')) {
            return this._registerListener(signal, callback);
        }
        return 0;
    }

    _registerListener(signal, callback) {
        const id = this._nextListenerId++;
        if (!this._listeners.has(signal)) {
            this._listeners.set(signal, new Map());
        }
        this._listeners.get(signal).set(id, callback);
        return id;
    }

    disconnect(id) {
        if (id <= 0) return;
        for (const map of this._listeners.values()) {
            if (map.has(id)) {
                map.delete(id);
                return;
            }
        }
        if (this._settings) {
            try { this._settings.disconnect(id); } catch (e) {}
        }
    }
}

// Backward compatibility alias
export const DockSettingsAdapter = LiquidGlassSettingsAdapter;

export class LiquidGlassDockManager {
    constructor(extensionDir, settings) {
        this._dir = extensionDir;
        this._settings = settings;
        this._adapter = new LiquidGlassSettingsAdapter(settings);
        this._logger = new Logger(this._adapter);
        this._dashDocks = [];
        this._dashSearchId = 0;
        this._dashRescanId = 0;
        this._monitorsChangedId = 0;
        this._settingsChangedIds = [];

        this._dateMenuManager = null;
        this._quickSettingsManager = null;
        this._panelMenuManager = null;

        this._dynamicMenuManagers = new Map();
        this._uiGroupChildAddedId = 0;
    }

    enable() {
        console.log('[MF Theme] Enabling LiquidGlassManager (Dock & Menus)...');
        setUtilsLogger(this._logger);
        try {
            installGlassDiagnostics();
        } catch (e) {
            console.warn(`[MF Theme] installGlassDiagnostics warning: ${e}`);
        }

        this._monitorsChangedId = Main.layoutManager.connect('monitors-changed', () => this._scheduleDashRescan());

        // Connect dock glass toggle
        this._settingsChangedIds.push(this._settings.connect('changed::liquid-glass-dock', () => {
            const enabled = this._settings.get_boolean('liquid-glass-dock');
            console.log(`[MF Theme] liquid-glass-dock setting changed: ${enabled}`);
            if (enabled) {
                this._findDashToDock();
            } else {
                for (const entry of [...this._dashDocks]) {
                    this._releaseDashDock(entry);
                }
                this._dashDocks = [];
            }
            this._updateDynamicMenusState();
        }));

        // Connect menu glass toggles
        this._settingsChangedIds.push(this._settings.connect('changed::frosted-datemenu', () => {
            const enabled = this._settings.get_boolean('frosted-datemenu');
            if (enabled && !this._dateMenuManager) {
                this._setupDateMenuGlass();
            } else if (!enabled && this._dateMenuManager) {
                this._dateMenuManager.cleanup();
                this._dateMenuManager = null;
            }
        }));

        this._settingsChangedIds.push(this._settings.connect('changed::frosted-quick-settings', () => {
            const enabled = this._settings.get_boolean('frosted-quick-settings');
            if (enabled && !this._quickSettingsManager) {
                this._setupQuickSettingsGlass();
            } else if (!enabled && this._quickSettingsManager) {
                this._quickSettingsManager.cleanup();
                this._quickSettingsManager = null;
            }
        }));

        this._settingsChangedIds.push(this._settings.connect('changed::frosted-menus', () => {
            const enabled = this._settings.get_boolean('frosted-menus');
            if (enabled && !this._panelMenuManager) {
                this._setupPanelMenusGlass();
            } else if (!enabled && this._panelMenuManager) {
                this._panelMenuManager.cleanup();
                this._panelMenuManager = null;
            }
            this._updateDynamicMenusState();
        }));

        // Initial setup for menus
        this._setupDateMenuGlass();
        this._setupQuickSettingsGlass();
        this._setupPanelMenusGlass();
        this._setupDynamicMenus();

        // Search for Dash to Dock containers after shell layout stabilizes
        this._dashSearchId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
            this._dashSearchId = 0;
            this._findDashToDock();
            this._scheduleDashRescan();
            return GLib.SOURCE_REMOVE;
        });
    }

    async _setupDateMenuGlass() {
        if (!Main.panel?.statusArea?.dateMenu?.menu) return;
        const isEnabled = this._settings.get_boolean('frosted-datemenu');
        if (!isEnabled) return;
        try {
            const path = this._dir.get_path();
            const ts = Date.now();
            const uiMod = await import(`./liquid_glass/uiManager.js?t=${ts}`);
            this._dateMenuManager = new uiMod.UIManager(
                path,
                this._adapter,
                this._logger,
                Main.panel.statusArea.dateMenu,
                true,
                'enable-menu-glass',
                'menu',
                'dateMenu',
                true
            );
            this._dateMenuManager.setup();
            console.log('[MF Theme] Attached Liquid Glass shader to DateMenu');
        } catch (e) {
            console.error(`[MF Theme] Failed to setup DateMenu Liquid Glass: ${e}\n${e.stack}`);
        }
    }

    async _setupQuickSettingsGlass() {
        if (!Main.panel?.statusArea?.quickSettings?.menu) return;
        const isEnabled = this._settings.get_boolean('frosted-quick-settings');
        if (!isEnabled) return;
        try {
            const path = this._dir.get_path();
            const ts = Date.now();
            const qsMod = await import(`./liquid_glass/quickSettingsManager.js?t=${ts}`);
            this._quickSettingsManager = new qsMod.QuickSettingsManager(
                path,
                this._adapter,
                this._logger
            );
            this._quickSettingsManager.setup();
            console.log('[MF Theme] Attached Liquid Glass shader to QuickSettings');
        } catch (e) {
            console.error(`[MF Theme] Failed to setup QuickSettings Liquid Glass: ${e}\n${e.stack}`);
        }
    }

    async _setupPanelMenusGlass() {
        if (!Main.panel?.statusArea) return;
        const isEnabled = this._settings.get_boolean('frosted-menus');
        if (!isEnabled) return;
        try {
            const path = this._dir.get_path();
            const ts = Date.now();
            const pmMod = await import(`./liquid_glass/panelMenuManager.js?t=${ts}`);
            this._panelMenuManager = new pmMod.PanelMenuManager(
                path,
                this._adapter,
                this._logger
            );
            this._panelMenuManager.setup();
            console.log('[MF Theme] Attached Liquid Glass shader to PanelMenus');
        } catch (e) {
            console.error(`[MF Theme] Failed to setup PanelMenus Liquid Glass: ${e}\n${e.stack}`);
        }
    }

    _collectDashContainers() {
        const found = [];
        const walk = actor => {
            if (!actor || actor === global.window_group || actor === global.windowGroup)
                return;
            const name = (typeof actor.get_name === 'function' ? actor.get_name() : null) || actor.name;
            if (name === 'dashtodockDashContainer') {
                const parent = actor.get_parent ? actor.get_parent() : null;
                const parentName = parent && ((typeof parent.get_name === 'function' ? parent.get_name() : null) || parent.name);
                if (parent && parentName === 'dash') {
                    if (!found.includes(parent)) found.push(parent);
                } else {
                    if (!found.includes(actor)) found.push(actor);
                }
                return;
            }
            if (typeof actor.get_children === 'function') {
                for (const child of actor.get_children()) {
                    walk(child);
                }
            }
        };
        if (Main.layoutManager?.uiGroup) {
            walk(Main.layoutManager.uiGroup);
        }
        if (found.length === 0 && Main.uiGroup) {
            walk(Main.uiGroup);
        }
        return found;
    }

    async _findDashToDock() {
        const isEnabled = this._settings.get_boolean('liquid-glass-dock');
        if (!isEnabled) return;

        const path = this._dir.get_path();
        const containers = this._collectDashContainers();
        for (const container of containers) {
            if (this._dashDocks.some(entry => entry.container === container))
                continue;

            console.log('[MF Theme] Attached Liquid Glass pipeline to Dash to Dock');
            try {
                const ts = Date.now();
                const dockMod = await import(`./liquid_glass/dockManager.js?t=${ts}`);
                const manager = new dockMod.DashManager(path, container, this._adapter, this._logger);
                manager.setup();
                const entry = { container, manager, destroyId: 0 };
                entry.destroyId = container.connect('destroy', () => {
                    entry.destroyId = 0;
                    this._releaseDashDock(entry);
                    this._scheduleDashRescan();
                });
                this._dashDocks.push(entry);
            } catch (e) {
                console.error(`[MF Theme] Failed to setup DashManager: ${e}\n${e.stack}`);
            }
        }
    }

    _scheduleDashRescan() {
        if (this._dashRescanId) return;
        this._dashRescanId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1500, () => {
            this._dashRescanId = 0;
            this._findDashToDock();
            return GLib.SOURCE_REMOVE;
        });
    }

    _releaseDashDock(entry) {
        if (entry.destroyId > 0 && entry.container) {
            try { entry.container.disconnect(entry.destroyId); } catch (e) {}
            entry.destroyId = 0;
        }
        if (entry.manager) {
            try { entry.manager.cleanup(); } catch (e) {}
            entry.manager = null;
        }
        const idx = this._dashDocks.indexOf(entry);
        if (idx >= 0) this._dashDocks.splice(idx, 1);
    }

    _setupDynamicMenus() {
        if (!Main.uiGroup) return;

        this._uiGroupChildAddedId = Main.uiGroup.connect('child-added', (_, actor) => {
            this._onUiGroupChildAdded(actor);
        });

        this._scanUiGroupMenus();
    }

    _scanUiGroupMenus() {
        if (!Main.uiGroup) return;
        const children = Main.uiGroup.get_children();
        for (const child of children) {
            this._checkDynamicMenuActor(child);
        }
    }

    _onUiGroupChildAdded(actor) {
        if (!actor) return;
        this._checkDynamicMenuActor(actor);
        if (!this._findPopupMenuFromActor(actor)) {
            GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
                if (actor && isActorValid(actor)) {
                    this._checkDynamicMenuActor(actor);
                }
                return GLib.SOURCE_REMOVE;
            });
        }
    }

    _findPopupMenuFromActor(actor) {
        if (!actor || !isActorValid(actor)) return null;

        // 1. Direct delegate
        if (actor._delegate) {
            const d = actor._delegate;
            if (this._isValidPopupMenu(d)) return d;
            if (d.menu && this._isValidPopupMenu(d.menu)) return d.menu;
            if (d._menu && this._isValidPopupMenu(d._menu)) return d._menu;
        }

        // 2. Direct property on actor
        if (actor.menu && this._isValidPopupMenu(actor.menu)) return actor.menu;
        if (actor._menu && this._isValidPopupMenu(actor._menu)) return actor._menu;

        return null;
    }

    _isValidPopupMenu(menu) {
        if (!menu) return false;
        if (menu instanceof PopupMenu.PopupMenu) {
            return !!(menu.actor && menu.box);
        }
        return !!(menu.actor && menu.box && typeof menu.open === 'function' && typeof menu.close === 'function');
    }

    _isPanelStatusAreaMenu(menu) {
        if (!menu || !Main.panel?.statusArea) return false;
        if (menu === Main.panel.statusArea.dateMenu?.menu) return true;
        if (menu === Main.panel.statusArea.quickSettings?.menu) return true;
        for (const button of Object.values(Main.panel.statusArea)) {
            if (button?.menu === menu) return true;
        }
        return false;
    }

    _checkDynamicMenuActor(actor) {
        if (!actor || !isActorValid(actor)) return;

        const menu = this._findPopupMenuFromActor(actor);
        if (!menu) return;

        // Skip DateMenu and QuickSettings (handled by dedicated managers)
        if (menu === Main.panel?.statusArea?.dateMenu?.menu ||
            menu === Main.panel?.statusArea?.quickSettings?.menu) {
            return;
        }

        // Skip panel status area menus (handled by PanelMenuManager)
        if (this._isPanelStatusAreaMenu(menu)) {
            return;
        }

        // Check if already managed
        if (this._dynamicMenuManagers.has(menu)) return;

        // Check settings
        const isDockEnabled = this._settings.get_boolean('liquid-glass-dock');
        const isMenuEnabled = this._settings.get_boolean('frosted-menus');
        if (!isDockEnabled && !isMenuEnabled) return;

        this._attachDynamicMenu(menu, actor);
    }

    _attachDynamicMenu(menu, actor) {
        if (this._dynamicMenuManagers.has(menu)) return;

        try {
            const path = this._dir.get_path();
            const targetActor = menu.actor || actor;
            const name = (typeof targetActor.has_style_class_name === 'function' && targetActor.has_style_class_name('dock-app-menu'))
                ? 'dock-app-menu'
                : 'popup-menu';

            const manager = new UIManager(
                path,
                this._adapter,
                this._logger,
                { menu },
                false,
                'enable-extra-menu-glass',
                'panel-menu',
                `menu:${name}`,
                false
            );
            manager.setup();

            const entry = {
                menu,
                actor: targetActor,
                manager,
                destroyId: 0,
            };

            entry.destroyId = targetActor.connect('destroy', () => {
                entry.destroyId = 0;
                this._cleanupDynamicMenu(menu);
            });

            this._dynamicMenuManagers.set(menu, entry);
            console.log(`[MF Theme] Attached Liquid Glass shader to dynamic menu (${name})`);

            // If already open, trigger render immediately
            if (menu.isOpen) {
                manager._applyMenuScale?.();
                manager._startAnimation?.(1);
            }
        } catch (e) {
            console.error(`[MF Theme] Failed to attach dynamic menu Liquid Glass: ${e}\n${e.stack}`);
        }
    }

    _cleanupDynamicMenu(menu) {
        const entry = this._dynamicMenuManagers.get(menu);
        if (!entry) return;
        this._dynamicMenuManagers.delete(menu);
        if (entry.destroyId > 0 && entry.actor) {
            try { entry.actor.disconnect(entry.destroyId); } catch (e) {}
            entry.destroyId = 0;
        }
        if (entry.manager) {
            try { entry.manager.cleanup(); } catch (e) {}
            entry.manager = null;
        }
    }

    _updateDynamicMenusState() {
        const isDockEnabled = this._settings.get_boolean('liquid-glass-dock');
        const isMenuEnabled = this._settings.get_boolean('frosted-menus');
        if (!isDockEnabled && !isMenuEnabled) {
            for (const menu of [...this._dynamicMenuManagers.keys()]) {
                this._cleanupDynamicMenu(menu);
            }
        } else {
            this._scanUiGroupMenus();
        }
    }

    disable() {
        if (this._uiGroupChildAddedId > 0 && Main.uiGroup) {
            try { Main.uiGroup.disconnect(this._uiGroupChildAddedId); } catch (e) {}
            this._uiGroupChildAddedId = 0;
        }

        for (const menu of [...this._dynamicMenuManagers.keys()]) {
            this._cleanupDynamicMenu(menu);
        }
        this._dynamicMenuManagers.clear();

        for (const sigId of this._settingsChangedIds) {
            try { this._settings.disconnect(sigId); } catch (e) {}
        }
        this._settingsChangedIds = [];

        if (this._monitorsChangedId > 0 && Main.layoutManager) {
            try { Main.layoutManager.disconnect(this._monitorsChangedId); } catch (e) {}
            this._monitorsChangedId = 0;
        }
        if (this._dashSearchId > 0) {
            GLib.Source.remove(this._dashSearchId);
            this._dashSearchId = 0;
        }
        if (this._dashRescanId > 0) {
            GLib.Source.remove(this._dashRescanId);
            this._dashRescanId = 0;
        }

        if (this._dateMenuManager) {
            try { this._dateMenuManager.cleanup(); } catch (e) {}
            this._dateMenuManager = null;
        }
        if (this._quickSettingsManager) {
            try { this._quickSettingsManager.cleanup(); } catch (e) {}
            this._quickSettingsManager = null;
        }
        if (this._panelMenuManager) {
            try { this._panelMenuManager.cleanup(); } catch (e) {}
            this._panelMenuManager = null;
        }

        for (const entry of [...this._dashDocks]) {
            this._releaseDashDock(entry);
        }
        this._dashDocks = [];

        try {
            removeGlassDiagnostics();
        } catch (e) {}
        setUtilsLogger(null);
        this._logger.cleanup();
    }
}
