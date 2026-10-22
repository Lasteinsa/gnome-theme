import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import { SETTINGS } from './src/js/constants.js';

export default class MFThemePreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        const page = new Adw.PreferencesPage({
            title: 'MF Theme',
            icon_name: 'preferences-desktop-theme-symbolic',
        });
        window.add(page);

        // Group: Theme Style
        const styleGroup = new Adw.PreferencesGroup({
            title: 'Theme Style',
            description: 'Variant mode and primary accent (#FF5666).',
        });
        page.add(styleGroup);

        const modeRow = new Adw.ComboRow({
            title: 'Theme Mode',
            subtitle: 'Choose between following GNOME system preference or forced mode',
            model: new Gtk.StringList({
                strings: ['Auto (System)', 'Dark Mode', 'Light Mode'],
            }),
        });

        const modeMap = ['auto', 'dark', 'light'];
        const currentMode = settings.get_string(SETTINGS.THEME_MODE);
        const selectedIndex = modeMap.indexOf(currentMode);
        modeRow.selected = selectedIndex >= 0 ? selectedIndex : 0;

        modeRow.connect('notify::selected', () => {
            settings.set_string(SETTINGS.THEME_MODE, modeMap[modeRow.selected]);
        });
        styleGroup.add(modeRow);

        // Group: Frosted Glass Effects
        const blurGroup = new Adw.PreferencesGroup({
            title: 'Frosted Glass Engine',
            description: 'Configure hardware-accelerated background blur shaders.',
        });
        page.add(blurGroup);

        const radiusRow = new Adw.SpinRow({
            title: 'Blur Radius',
            subtitle: 'Zero-lag recommendation: 20px - 32px',
            adjustment: new Gtk.Adjustment({
                lower: 5,
                upper: 80,
                step_increment: 1,
                page_increment: 5,
                value: settings.get_int(SETTINGS.BLUR_RADIUS),
            }),
        });
        settings.bind(SETTINGS.BLUR_RADIUS, radiusRow, 'value', 0);
        blurGroup.add(radiusRow);

        const brightnessRow = new Adw.SpinRow({
            title: 'Blur Brightness Multiplier',
            subtitle: 'Adjust transparency exposure',
            digits: 2,
            adjustment: new Gtk.Adjustment({
                lower: 0.1,
                upper: 2.0,
                step_increment: 0.05,
                page_increment: 0.1,
                value: settings.get_double(SETTINGS.BLUR_BRIGHTNESS),
            }),
        });
        settings.bind(SETTINGS.BLUR_BRIGHTNESS, brightnessRow, 'value', 0);
        blurGroup.add(brightnessRow);

        // Group: Frosted Components
        const componentsGroup = new Adw.PreferencesGroup({
            title: 'Frosted Components',
            description: 'Toggle frosted glass per interface surface.',
        });
        page.add(componentsGroup);

        const panelRow = new Adw.SwitchRow({
            title: 'Top Bar Panel',
            subtitle: 'Apply frosted glass shader behind the top bar',
        });
        settings.bind(SETTINGS.FROSTED_PANEL, panelRow, 'active', 0);
        componentsGroup.add(panelRow);

        const qsRow = new Adw.SwitchRow({
            title: 'Quick Settings Menu',
            subtitle: 'Zero-lag: only renders blur when popup is open',
        });
        settings.bind(SETTINGS.FROSTED_QUICK_SETTINGS, qsRow, 'active', 0);
        componentsGroup.add(qsRow);

        const dateRow = new Adw.SwitchRow({
            title: 'Calendar & Notifications Tray',
            subtitle: 'Zero-lag: only renders blur when tray is open',
        });
        settings.bind(SETTINGS.FROSTED_DATEMENU, dateRow, 'active', 0);
        componentsGroup.add(dateRow);

        const overviewRow = new Adw.SwitchRow({
            title: 'Overview Desktop Background',
            subtitle: 'Apply frosted glass wallpaper blur across the workspace overview',
        });
        settings.bind(SETTINGS.FROSTED_OVERVIEW, overviewRow, 'active', 0);
        componentsGroup.add(overviewRow);

        const menusRow = new Adw.SwitchRow({
            title: 'Popup & Context Menus',
            subtitle: 'Apply frosted glass shader to all popup and context menus',
        });
        settings.bind(SETTINGS.FROSTED_MENUS, menusRow, 'active', 0);
        componentsGroup.add(menusRow);

        const dialogsRow = new Adw.SwitchRow({
            title: 'Modal Dialogs & Run Dialog',
            subtitle: 'Apply frosted glass shader to dialogs, Alt+F2 prompt, and OSD popups',
        });
        settings.bind(SETTINGS.FROSTED_DIALOGS, dialogsRow, 'active', 0);
        componentsGroup.add(dialogsRow);

        const appfoldersRow = new Adw.SwitchRow({
            title: 'App Folders in Overview',
            subtitle: 'Apply frosted glass shader to app folder dialogs in the app grid',
        });
        settings.bind(SETTINGS.FROSTED_APPFOLDERS, appfoldersRow, 'active', 0);
        componentsGroup.add(appfoldersRow);

        const dashRow = new Adw.SwitchRow({
            title: 'Overview Dash',
            subtitle: 'Apply frosted glass shader behind native overview dash',
        });
        settings.bind(SETTINGS.FROSTED_DASH, dashRow, 'active', 0);
        componentsGroup.add(dashRow);

        const dockGlassRow = new Adw.SwitchRow({
            title: 'Dash to Dock Liquid Glass',
            subtitle: 'Physical Snell refraction, chromatic dispersion, and specular rim optics',
        });
        settings.bind(SETTINGS.LIQUID_GLASS_DOCK, dockGlassRow, 'active', 0);
        componentsGroup.add(dockGlassRow);
    }
}
