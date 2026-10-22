import Clutter from 'gi://Clutter';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Background from 'resource:///org/gnome/shell/ui/background.js';
const EFFECT_NAME = 'mf-frosted-glass';

const SETTINGS = {
    BLUR_RADIUS: 'blur-radius',
    BLUR_BRIGHTNESS: 'blur-brightness',
    FROSTED_PANEL: 'frosted-panel',
    FROSTED_QUICK_SETTINGS: 'frosted-quick-settings',
    FROSTED_DATEMENU: 'frosted-datemenu',
    FROSTED_DASH: 'frosted-dash',
    FROSTED_OVERVIEW: 'frosted-overview',
    FROSTED_MENUS: 'frosted-menus',
    FROSTED_DIALOGS: 'frosted-dialogs',
    FROSTED_APPFOLDERS: 'frosted-appfolders',
    THEME_MODE: 'theme-mode',
};

const DEFAULT_RADIUS = 30;
const DEFAULT_BRIGHTNESS = 0.88;

const SURFACE_TARGET_CLASSES = [
    'modal-dialog',
    'run-dialog',
    'app-folder-dialog',
    'osd-window',
    'switcher-list',
    'workspace-switcher',
];

export class BlurManager {
    constructor(settings) {
        this._settings = settings;
        this._trackedActors = new Map();
        this._trackedContainers = new Set();
        this._trackedGroups = new Set();

        // Top bar panel wallpaper blur
        this._panelBgGroup = null;
        this._panelBgWidget = null;
        this._panelBgManager = null;

        // Overview full-screen wallpaper blur
        this._overviewBgGroup = null;
        this._overviewBgManagers = [];
        this._dockManager = null;
    }

    async enable() {
        this._themeContext = St.ThemeContext.get_for_stage(global.stage);
        this._themeContext.connectObject(
            'changed', () => this._updateAllEffects(),
            'notify::scale-factor', () => this._updateAllEffects(),
            this
        );

        this._settings.connectObject(
            `changed::${SETTINGS.BLUR_RADIUS}`, () => this._updateAllEffects(),
            `changed::${SETTINGS.BLUR_BRIGHTNESS}`, () => this._updateAllEffects(),
            `changed::${SETTINGS.FROSTED_PANEL}`, () => this._togglePanelBlur(),
            `changed::${SETTINGS.FROSTED_OVERVIEW}`, () => this._toggleOverviewBlur(),
            `changed::${SETTINGS.FROSTED_MENUS}`, () => this._toggleSurfacesBlur(),
            `changed::${SETTINGS.FROSTED_DIALOGS}`, () => this._toggleSurfacesBlur(),
            `changed::${SETTINGS.FROSTED_APPFOLDERS}`, () => this._toggleSurfacesBlur(),
            `changed::${SETTINGS.FROSTED_QUICK_SETTINGS}`, () => this._toggleQuickSettingsBlur(),
            `changed::${SETTINGS.FROSTED_DATEMENU}`, () => this._toggleDateMenuBlur(),
            `changed::${SETTINGS.FROSTED_DASH}`, () => this._toggleDashBlur(),
            this
        );

        this._applyAll();

        try {
            const cleanUri = import.meta.url.split('?')[0];
            const extDir = Gio.File.new_for_uri(cleanUri).get_parent().get_parent().get_parent();
            const ts = Date.now();
            const dockMod = await import(`./liquidGlassDock.js?t=${ts}`);
            this._dockManager = new dockMod.LiquidGlassDockManager(extDir, this._settings);
            this._dockManager.enable();
        } catch (e) {
            console.error(`[MF Theme] Failed to instantiate LiquidGlassDockManager: ${e}\n${e.stack}`);
            this._dockManager = null;
        }
    }

    disable() {
        this._dockManager?.disable();
        this._dockManager = null;

        this._removeAllEffects();

        if (this._themeContext) {
            this._themeContext.disconnectObject(this);
            this._themeContext = null;
        }

        if (this._settings) {
            this._settings.disconnectObject(this);
        }
    }

    _getRadius() {
        const radius = this._settings.get_int(SETTINGS.BLUR_RADIUS) || DEFAULT_RADIUS;
        const scale = this._themeContext?.scale_factor || 1;
        return Math.max(1, Math.round(radius * scale));
    }

    _getBrightness() {
        return this._settings.get_double(SETTINGS.BLUR_BRIGHTNESS) || DEFAULT_BRIGHTNESS;
    }

    _createBlurEffect(mode = Shell.BlurMode.BACKGROUND) {
        try {
            const effect = new Shell.BlurEffect({
                name: EFFECT_NAME,
                mode: mode,
            });

            const radius = this._getRadius();
            const brightness = this._getBrightness();

            if (typeof effect.set === 'function') {
                effect.set({ radius, brightness });
            } else {
                effect.radius = radius;
                effect.brightness = brightness;
            }

            return effect;
        } catch (e) {
            console.error(`[MF Theme] Failed to instantiate Shell.BlurEffect: ${e}`);
            return null;
        }
    }

    _applyBlurToActor(actor, options = {}) {
        if (!actor) return;

        this._removeBlurFromActor(actor);

        const mode = options.mode ?? Shell.BlurMode.BACKGROUND;
        const effect = this._createBlurEffect(mode);
        if (!effect) return;

        if (options.initiallyDisabled) {
            effect.enabled = false;
        }

        try {
            actor.add_effect_with_name(EFFECT_NAME, effect);
            this._trackedActors.set(actor, effect);
            actor.connectObject('destroy', () => {
                this._trackedActors.delete(actor);
            }, this);
        } catch (e) {
            // Actor might have already been disposed
        }
    }

    _removeBlurFromActor(actor) {
        if (!actor) return;
        const effect = this._trackedActors.get(actor);
        this._trackedActors.delete(actor);
        try {
            actor.disconnectObject(this);
            if (typeof actor.get_effect === 'function' && actor.get_effect(EFFECT_NAME)) {
                actor.remove_effect_by_name(EFFECT_NAME);
            } else if (effect) {
                if (typeof actor.has_effect === 'function' && actor.has_effect(effect)) {
                    actor.remove_effect(effect);
                } else if (typeof actor.get_effects === 'function' && actor.get_effects()?.includes(effect)) {
                    actor.remove_effect(effect);
                }
            }
        } catch (e) {
            // Actor might have already been disposed
        }
    }

    _updateAllEffects() {
        const radius = this._getRadius();
        const brightness = this._getBrightness();

        for (const effect of this._trackedActors.values()) {
            try {
                if (typeof effect.set === 'function') {
                    effect.set({ radius, brightness });
                } else {
                    effect.radius = radius;
                    effect.brightness = brightness;
                }
            } catch (e) {
                // Ignore if effect was destroyed
            }
        }
    }

    _removeAllEffects() {
        this._cleanPanelBlur();
        this._cleanOverviewBlur();
        this._cleanSurfacesBlur();
        this._cleanQuickSettingsBlur();
        this._cleanDateMenuBlur();
        this._cleanDashBlur();

        for (const [actor, effect] of Array.from(this._trackedActors.entries())) {
            this._trackedActors.delete(actor);
            try {
                if (actor) {
                    actor.remove_effect(effect);
                    actor.disconnectObject(this);
                }
            } catch (e) {}
        }
        this._trackedActors.clear();

        Main.layoutManager?.disconnectObject(this);
        Main.overview?.disconnectObject(this);
        Main.panel?.disconnectObject(this);
    }

    _applyAll() {
        if (this._settings.get_boolean(SETTINGS.FROSTED_PANEL)) {
            this._setupPanelBlur();
        }
        if (this._settings.get_boolean(SETTINGS.FROSTED_OVERVIEW)) {
            this._setupOverviewBlur();
        }
        if (this._settings.get_boolean(SETTINGS.FROSTED_MENUS) ||
            this._settings.get_boolean(SETTINGS.FROSTED_DIALOGS) ||
            this._settings.get_boolean(SETTINGS.FROSTED_APPFOLDERS)) {
            this._setupSurfacesBlur();
        }
        if (this._settings.get_boolean(SETTINGS.FROSTED_QUICK_SETTINGS)) {
            this._setupQuickSettingsBlur();
        }
        if (this._settings.get_boolean(SETTINGS.FROSTED_DATEMENU)) {
            this._setupDateMenuBlur();
        }
        if (this._settings.get_boolean(SETTINGS.FROSTED_DASH)) {
            this._setupDashBlur();
        }
    }

    // ==========================================
    // 1. Top Bar Panel (Wallpaper Frosted Surface)
    // ==========================================
    _setupPanelBlur() {
        if (!Main.panel) return;
        const panelBox = Main.panel.get_parent() || Main.layoutManager?.panelBox;
        if (!panelBox) return;

        this._cleanPanelBlur();

        const monitor = Main.layoutManager.primaryMonitor || Main.layoutManager.monitors[0];
        if (!monitor) return;

        // Container that consumes 0 layout space inside panelBox
        const bgGroup = new Meta.BackgroundGroup({
            name: 'mf-panel-background-group',
            width: 0,
            height: 0,
        });

        // Source container for wallpaper (hidden, sampled by clone to prevent damage culling)
        const source = new St.Widget({
            name: 'mf-panel-blurred-source',
            visible: false,
        });

        // Widget containing the blurred wallpaper for the monitor
        const bgWidget = new St.Widget({
            name: 'mf-panel-blurred-widget',
            x: 0,
            y: 0,
            width: monitor.width,
            height: monitor.height,
        });

        source.add_constraint(new Clutter.BindConstraint({
            source: bgWidget,
            coordinate: Clutter.BindCoordinate.SIZE,
        }));
        bgWidget.add_child(source);

        const clone = new Clutter.Clone({
            source: source,
        });
        clone.add_constraint(new Clutter.BindConstraint({
            source: bgWidget,
            coordinate: Clutter.BindCoordinate.SIZE,
        }));
        bgWidget.add_child(clone);

        // Blur effect in ACTOR mode to directly blur the wallpaper image
        const effect = this._createBlurEffect(Shell.BlurMode.ACTOR);
        if (effect) {
            bgWidget.add_effect_with_name(EFFECT_NAME, effect);
            this._trackedActors.set(bgWidget, effect);
            bgWidget.connectObject('destroy', () => {
                this._trackedActors.delete(bgWidget);
            }, this);
        }

        const monitorIndex = monitor.index ?? Main.layoutManager.primaryIndex ?? 0;
        const bgManager = new Background.BackgroundManager({
            container: source,
            monitorIndex: monitorIndex,
            controlPosition: false,
        });

        // Ensure newly loaded background actors don't flash above existing ones
        source.connectObject('child-added', (container, child) => {
            if (child instanceof Meta.BackgroundActor) {
                container.set_child_below_sibling(child, null);
            }
        }, this);

        bgGroup.insert_child_at_index(bgWidget, 0);
        panelBox.insert_child_at_index(bgGroup, 0);

        this._panelBgGroup = bgGroup;
        this._panelBgWidget = bgWidget;
        this._panelBgManager = bgManager;

        // Clip wallpaper blur precisely to the panel's dimensions and align screen coordinates
        const updateClip = () => {
            if (!Main.panel || !this._panelBgWidget) return;
            const [panelW, panelH] = Main.panel.get_size();
            const panelBox = Main.panel.get_parent() || Main.layoutManager?.panelBox;
            if (!panelBox || panelW <= 0 || panelH <= 0) return;

            const [p_x, p_y] = panelBox.get_position();
            const [p_p_x, p_p_y] = panelBox.get_parent() ? panelBox.get_parent().get_position() : [0, 0];
            const [g_x, g_y] = Main.panel.get_position();

            const x = p_x + p_p_x - monitor.x + g_x;
            const y = p_y + p_p_y - monitor.y + g_y;
            this._panelBgWidget.set_clip(
                Math.floor(x), Math.floor(y), Math.ceil(panelW), Math.ceil(panelH)
            );
            this._panelBgWidget.x = g_x - x;
            this._panelBgWidget.y = g_y - y;
        };

        GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            updateClip();
            return GLib.SOURCE_REMOVE;
        });

        Main.panel.connectObject(
            'notify::allocation', () => updateClip(),
            'notify::size', () => updateClip(),
            this
        );

        Main.layoutManager.connectObject(
            'monitors-changed', () => this._setupPanelBlur(),
            this
        );

        Main.overview?.connectObject(
            'showing', () => {
                if (this._panelBgWidget) this._panelBgWidget.visible = false;
            },
            'hiding', () => {
                if (this._panelBgWidget) this._panelBgWidget.visible = true;
            },
            this
        );
    }

    _cleanPanelBlur() {
        if (this._panelBgManager) {
            try {
                this._panelBgManager.destroy();
            } catch (e) {}
            this._panelBgManager = null;
        }

        if (this._panelBgWidget) {
            this._panelBgWidget.disconnectObject(this);
            this._trackedActors.delete(this._panelBgWidget);
            try {
                this._panelBgWidget.destroy();
            } catch (e) {}
            this._panelBgWidget = null;
        }

        if (this._panelBgGroup) {
            const parent = this._panelBgGroup.get_parent();
            if (parent) {
                try {
                    parent.remove_child(this._panelBgGroup);
                } catch (e) {}
            }
            try {
                this._panelBgGroup.destroy();
            } catch (e) {}
            this._panelBgGroup = null;
        }

        Main.panel?.disconnectObject(this);
        Main.layoutManager?.disconnectObject(this);
        Main.overview?.disconnectObject(this);
    }

    _togglePanelBlur() {
        if (this._settings.get_boolean(SETTINGS.FROSTED_PANEL)) {
            this._setupPanelBlur();
        } else {
            this._cleanPanelBlur();
        }
    }

    // ==========================================
    // 2. Overview Desktop Background Blur
    // ==========================================
    _setupOverviewBlur() {
        if (!Main.layoutManager?.overviewGroup) return;

        this._cleanOverviewBlur();

        const overviewBgGroup = new Meta.BackgroundGroup({
            name: 'mf-overview-background-group',
        });

        const monitors = Main.layoutManager.monitors || [];
        for (let i = 0; i < monitors.length; i++) {
            const monitor = monitors[i];
            const source = new St.Widget({
                name: `mf-overview-blurred-source-${i}`,
                visible: false,
            });

            const bgWidget = new St.Widget({
                name: `mf-overview-blurred-widget-${i}`,
                x: monitor.x,
                y: monitor.y,
                width: monitor.width,
                height: monitor.height,
            });

            source.add_constraint(new Clutter.BindConstraint({
                source: bgWidget,
                coordinate: Clutter.BindCoordinate.SIZE,
            }));
            bgWidget.add_child(source);

            const clone = new Clutter.Clone({
                source: source,
            });
            clone.add_constraint(new Clutter.BindConstraint({
                source: bgWidget,
                coordinate: Clutter.BindCoordinate.SIZE,
            }));
            bgWidget.add_child(clone);

            const effect = this._createBlurEffect(Shell.BlurMode.ACTOR);
            if (effect) {
                bgWidget.add_effect_with_name(EFFECT_NAME, effect);
                this._trackedActors.set(bgWidget, effect);
                bgWidget.connectObject('destroy', () => {
                    this._trackedActors.delete(bgWidget);
                }, this);
            }

            const bgManager = new Background.BackgroundManager({
                container: source,
                monitorIndex: i,
                controlPosition: false,
            });

            source.connectObject('child-added', (container, child) => {
                if (child instanceof Meta.BackgroundActor) {
                    container.set_child_below_sibling(child, null);
                }
            }, this);

            overviewBgGroup.insert_child_at_index(bgWidget, 0);
            this._overviewBgManagers.push(bgManager);
        }

        Main.layoutManager.overviewGroup.insert_child_at_index(overviewBgGroup, 0);
        this._overviewBgGroup = overviewBgGroup;

        // Ensure the blurred background remains below any dynamically added overview layers
        Main.layoutManager.overviewGroup.connectObject('child-added', (_, child) => {
            if (child !== this._overviewBgGroup && this._overviewBgGroup) {
                if (this._overviewBgGroup.get_parent()) {
                    try {
                        Main.layoutManager.overviewGroup.remove_child(this._overviewBgGroup);
                    } catch (e) {}
                }
                Main.layoutManager.overviewGroup.insert_child_at_index(this._overviewBgGroup, 0);
            }
        }, this);

        Main.layoutManager.connectObject(
            'monitors-changed', () => this._setupOverviewBlur(),
            this
        );
    }

    _cleanOverviewBlur() {
        for (const bgManager of this._overviewBgManagers) {
            try {
                bgManager.destroy();
            } catch (e) {}
        }
        this._overviewBgManagers = [];

        if (this._overviewBgGroup) {
            Main.layoutManager.overviewGroup?.disconnectObject(this);
            const children = this._overviewBgGroup.get_children() || [];
            for (const child of children) {
                try {
                    child.disconnectObject(this);
                    this._trackedActors.delete(child);
                } catch (e) {}
            }
            const parent = this._overviewBgGroup.get_parent();
            if (parent) {
                try {
                    parent.remove_child(this._overviewBgGroup);
                } catch (e) {}
            }
            try {
                this._overviewBgGroup.destroy();
            } catch (e) {}
            this._overviewBgGroup = null;
        }
    }

    _toggleOverviewBlur() {
        if (this._settings.get_boolean(SETTINGS.FROSTED_OVERVIEW)) {
            this._setupOverviewBlur();
        } else {
            this._cleanOverviewBlur();
        }
    }

    // ==========================================
    // 3. Popup Surfaces, Dialogs, Menus & Banners
    // ==========================================
    _setupSurfacesBlur() {
        this._cleanSurfacesBlur();

        // 1. Scan and track Main.uiGroup (top-level popups, Alt+Tab, dialogs)
        if (Main.uiGroup) {
            this._trackContainer(Main.uiGroup);
        }

        // 2. Modal Dialog Group (Authentication, Run Dialog, Power Dialog)
        if (Main.layoutManager?.modalDialogGroup) {
            this._trackContainer(Main.layoutManager.modalDialogGroup);
        }

        // 3. OSD Windows (Volume, Brightness popups)
        if (Main.osdWindowManager?._osdWindows) {
            for (const win of Main.osdWindowManager._osdWindows) {
                this._trackContainer(win);
            }
        }
    }

    _trackContainer(container) {
        if (!container || this._trackedContainers.has(container)) return;
        this._trackedContainers.add(container);

        // Scan existing children
        if (typeof container.get_children === 'function') {
            for (const child of container.get_children()) {
                this._scanAndBlurActor(child);
            }
        }

        // Listen for new children being added dynamically
        container.connectObject('child-added', (_, child) => {
            this._scanAndBlurActor(child);
        }, this);
    }

    _isDockActor(actor) {
        let p = actor;
        while (p) {
            if (p.name === 'dashtodockContainer' ||
                p.name === 'dashtodockBox' ||
                p.name === 'dashtodockDashContainer' ||
                p.constructor?.name === 'DockDash' ||
                p.constructor?.name === 'DashToDock' ||
                (typeof p.has_style_class_name === 'function' && p.has_style_class_name('dashtodock'))) {
                return true;
            }
            p = p.get_parent ? p.get_parent() : null;
        }
        return false;
    }

    _scanAndBlurActor(actor) {
        if (!actor || this._trackedActors.has(actor)) return;
        if (actor.name && actor.name.startsWith('mf-')) return;
        if (this._isDockActor(actor)) return;

        // Manage stacked notification card opacity in message groups to prevent bleed-through
        if (actor.has_style_class_name && actor.has_style_class_name('message-notification-group')) {
            this._trackMessageGroup(actor);
        }

        // Check if actor itself is a blur target
        if (this._isTargetSurface(actor)) {
            this._applyBlurToActor(actor);
            actor.connectObject('destroy', () => this._removeBlurFromActor(actor), this);
            return;
        }

        // Check actor delegate box / dialog
        if (actor._delegate) {
            const delegate = actor._delegate;
            if (delegate._boxPointer) {
                try {
                    delegate._boxPointer.set_offscreen_redirect(0);
                } catch (e) {}
            }
            const candidates = [
                delegate.box,
                delegate.actor?.bin,
                delegate._boxPointer?.bin,
                delegate._dialog,
                delegate.dialog,
            ];
            for (const cand of candidates) {
                if (cand && this._isTargetSurface(cand) && !this._trackedActors.has(cand)) {
                    this._applyBlurToActor(cand);
                    cand.connectObject('destroy', () => this._removeBlurFromActor(cand), this);
                    return;
                }
            }
        }

        // If actor itself is a BoxPointer
        if (actor.constructor?.name === 'BoxPointer' || actor.constructor?.name === 'PopupMenuBoxPointer') {
            try {
                actor.set_offscreen_redirect(0);
            } catch (e) {}
        }

        // Check direct children
        if (typeof actor.get_children === 'function') {
            for (const child of actor.get_children()) {
                if (child.has_style_class_name && child.has_style_class_name('message-notification-group')) {
                    this._trackMessageGroup(child);
                }
                if (this._isTargetSurface(child) && !this._trackedActors.has(child)) {
                    this._applyBlurToActor(child);
                    child.connectObject('destroy', () => this._removeBlurFromActor(child), this);
                }
            }
        }
    }

    _trackMessageGroup(group) {
        if (!group || this._trackedGroups.has(group)) return;
        this._trackedGroups.add(group);

        const update = () => this._updateGroupMessages(group);
        GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            update();
            return GLib.SOURCE_REMOVE;
        });

        group.connectObject(
            'notify::expanded', () => update(),
            'child-added', () => update(),
            'child-removed', () => update(),
            'destroy', () => {
                this._trackedGroups.delete(group);
            },
            this
        );
    }

    _updateGroupMessages(group) {
        if (!group) return;
        const isExpanded = !!group.expanded;
        const messages = [];
        const collect = (act) => {
            if (act?.has_style_class_name && act.has_style_class_name('message')) {
                messages.push(act);
                return;
            }
            if (typeof act?.get_children === 'function') {
                for (const c of act.get_children()) collect(c);
            }
        };
        collect(group);

        messages.forEach((msg, idx) => {
            if (!isExpanded && idx > 0) {
                msg.opacity = 0;
            } else {
                msg.opacity = 255;
                const child = msg.get_first_child ? msg.get_first_child() : (msg.child || null);
                if (child) child.opacity = 255;
            }
        });
    }

    _restoreGroupMessages(group) {
        if (!group) return;
        const collect = (act) => {
            if (act?.has_style_class_name && act.has_style_class_name('message')) {
                act.opacity = 255;
                const ch = act.get_first_child ? act.get_first_child() : (act.child || null);
                if (ch) ch.opacity = 255;
                return;
            }
            if (typeof act?.get_children === 'function') {
                for (const c of act.get_children()) collect(c);
            }
        };
        collect(group);
    }

    _isTargetSurface(actor) {
        if (!actor || typeof actor.has_style_class_name !== 'function') return false;

        // Skip any actor handled by Liquid Glass shader pipeline
        if (actor.has_style_class_name('liquid-glass-transparent') ||
            actor.has_style_class_name('liquid-glass-menu-root') ||
            actor.has_style_class_name('liquid-glass-qs-root') ||
            actor.has_style_class_name('popup-menu-content') ||
            actor.has_style_class_name('popup-menu') ||
            actor.has_style_class_name('quick-toggle-menu') ||
            actor.has_style_class_name('datemenu-popover') ||
            actor.has_style_class_name('quick-settings')) {
            return false;
        }

        const isDialogsEnabled = this._settings.get_boolean(SETTINGS.FROSTED_DIALOGS);
        const isAppFoldersEnabled = this._settings.get_boolean(SETTINGS.FROSTED_APPFOLDERS);
        const isDashEnabled = this._settings.get_boolean(SETTINGS.FROSTED_DASH);

        for (const cls of SURFACE_TARGET_CLASSES) {
            if (actor.has_style_class_name(cls)) {
                if (cls === 'dash-background' && !isDashEnabled) {
                    return false;
                }
                if ((cls === 'popup-menu-content' || cls === 'popup-menu' || cls === 'quick-toggle-menu' || cls === 'datemenu-popover') && !isMenusEnabled) {
                    return false;
                }
                if ((cls === 'modal-dialog' || cls === 'run-dialog' || cls === 'osd-window' || cls === 'switcher-list' || cls === 'workspace-switcher') && !isDialogsEnabled) {
                    return false;
                }
                if (cls === 'app-folder-dialog' && !isAppFoldersEnabled) {
                    return false;
                }
                return true;
            }
        }
        return false;
    }

    _cleanSurfacesBlur() {
        for (const container of this._trackedContainers) {
            try {
                container.disconnectObject(this);
            } catch (e) {}
        }
        this._trackedContainers.clear();

        for (const group of this._trackedGroups) {
            try {
                group.disconnectObject(this);
                this._restoreGroupMessages(group);
            } catch (e) {}
        }
        this._trackedGroups.clear();

        if (Main.panel?.statusArea) {
            for (const [key, item] of Object.entries(Main.panel.statusArea)) {
                if (key === 'quickSettings' || key === 'dateMenu') continue;
                item?.menu?.disconnectObject(this);
                if (item?.menu?._boxPointer) {
                    try {
                        item.menu._boxPointer.set_offscreen_redirect(Clutter.OffscreenRedirect.ALWAYS);
                    } catch (e) {}
                }
                const targetActor = item?.menu?.box || item?.menu?._boxPointer?.bin || item?.menu?.actor;
                if (targetActor) {
                    this._removeBlurFromActor(targetActor);
                }
            }
        }
    }

    _toggleSurfacesBlur() {
        if (this._settings.get_boolean(SETTINGS.FROSTED_MENUS) ||
            this._settings.get_boolean(SETTINGS.FROSTED_DIALOGS) ||
            this._settings.get_boolean(SETTINGS.FROSTED_APPFOLDERS)) {
            this._setupSurfacesBlur();
        } else {
            this._cleanSurfacesBlur();
        }
    }

    // ==========================================
    // 4. Quick Settings Menu (Handled by LiquidGlassManager)
    // ==========================================
    _setupQuickSettingsBlur() {
        this._cleanQuickSettingsBlur();
    }

    _cleanQuickSettingsBlur() {
        const qsMenu = Main.panel?.statusArea?.quickSettings?.menu;
        if (qsMenu) {
            qsMenu.disconnectObject(this);
            const targetActor = qsMenu.box || qsMenu._boxPointer?.bin || qsMenu.actor;
            if (targetActor) {
                this._removeBlurFromActor(targetActor);
            }
        }
    }

    _toggleQuickSettingsBlur() {
        this._setupQuickSettingsBlur();
    }

    // ==========================================
    // 5. Date & Calendar Menu (Handled by LiquidGlassManager)
    // ==========================================
    _setupDateMenuBlur() {
        this._cleanDateMenuBlur();
    }

    _cleanDateMenuBlur() {
        const dateMenu = Main.panel?.statusArea?.dateMenu?.menu;
        if (dateMenu) {
            dateMenu.disconnectObject(this);
            const targetActor = dateMenu.box || dateMenu._boxPointer?.bin || dateMenu.actor;
            if (targetActor) {
                this._removeBlurFromActor(targetActor);
            }
        }
    }

    _toggleDateMenuBlur() {
        this._setupDateMenuBlur();
    }

    // ==========================================
    // 6. Native Overview Dash
    // ==========================================
    _setupDashBlur() {
        this._cleanDashBlur();
        if (!this._settings.get_boolean(SETTINGS.FROSTED_DASH)) return;

        // Native Overview Dash only — never touch Dash to Dock
        const overviewDash = Main.overview?.dash;
        if (!overviewDash || this._isDockActor(overviewDash)) {
            return;
        }

        const overviewTarget = overviewDash._background || overviewDash._container || overviewDash;
        if (overviewTarget) {
            this._applyBlurToActor(overviewTarget, {
                initiallyDisabled: !Main.overview?.visible,
            });

            Main.overview.connectObject(
                'showing', () => {
                    const effect = this._trackedActors.get(overviewTarget);
                    if (effect) effect.enabled = true;
                },
                'hiding', () => {
                    const effect = this._trackedActors.get(overviewTarget);
                    if (effect) effect.enabled = false;
                },
                this
            );
        }
    }

    _cleanDashBlur() {
        Main.overview?.disconnectObject(this);

        const overviewDash = Main.overview?.dash;
        if (overviewDash) {
            const targets = [
                overviewDash,
                overviewDash._background,
                overviewDash._container,
            ];
            for (const t of targets) {
                if (t) {
                    this._removeBlurFromActor(t);
                    try {
                        if (typeof t.get_effect === 'function' && t.get_effect(EFFECT_NAME)) {
                            t.remove_effect_by_name(EFFECT_NAME);
                        }
                    } catch (e) {}
                }
            }
        }
    }

    _toggleDashBlur() {
        if (this._settings.get_boolean(SETTINGS.FROSTED_DASH)) {
            this._setupDashBlur();
        } else {
            this._cleanDashBlur();
        }
    }
}
