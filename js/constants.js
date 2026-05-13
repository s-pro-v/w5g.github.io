/** Stałe aplikacji — moduł ESM (bez mutowalnego stanu runtime). */

/**
 * W repozytorium każdy plik `w5g-{nazwa-miesiaca}.json` = jeden miesiąc / cykl grafiku.
 * Nazwa pliku (slug, bez polskich znaków) mapuje się na etykietę i kolejność w roku.
 */
export const W5G_MONTH_SLUGS = {
    styczen: { label: 'Styczeń', order: 1 },
    luty: { label: 'Luty', order: 2 },
    marzec: { label: 'Marzec', order: 3 },
    kwiecien: { label: 'Kwiecień', order: 4 },
    maj: { label: 'Maj', order: 5 },
    czerwiec: { label: 'Czerwiec', order: 6 },
    lipiec: { label: 'Lipiec', order: 7 },
    sierpien: { label: 'Sierpień', order: 8 },
    wrzesien: { label: 'Wrzesień', order: 9 },
    pazdziernik: { label: 'Październik', order: 10 },
    listopad: { label: 'Listopad', order: 11 },
    grudzien: { label: 'Grudzień', order: 12 }
};

/** Usuwa znaki diakrytyczne z fragmentu nazwy pliku (np. kwiecień → kwiecien). */
function slugToAsciiKey(slug) {
    try {
        return slug.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase();
    } catch {
        return slug.toLowerCase();
    }
}

/**
 * @param {string} fileName np. w5g-marzec.json
 * @returns {{ id: string, label: string, file: string, monthOrder: number }}
 */
export function w5gFilenameToMonthMeta(fileName) {
    const rawSlug = fileName.replace(/^w5g-/i, '').replace(/\.json$/i, '');
    const slug = slugToAsciiKey(rawSlug);
    const known = W5G_MONTH_SLUGS[slug];
    const id = slug.replace(/[^a-z0-9]+/gi, '_').toUpperCase() || 'UNKNOWN';
    if (known) {
        return { id, label: known.label, file: fileName, monthOrder: known.order };
    }
    const label = slug
        .split(/[-_]+/)
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ') || fileName;
    return { id, label, file: fileName, monthOrder: 99 };
}

export const LS_KEYS = {
    CONFIG: 'w5g_sys_cfg_v2',
    DATA: 'w5g_sys_data_v2',
    ACTIVE_MODULE: 'w5g_active_module',
    GROUPS: 'w5g_sys_groups_v2',
    JSON_DISPLAY: 'w5g_json_display_mode'
};

export const defaultGroupSettings = {
    D: { from: 0, label: 'D', cssVar: 'bg-d', colorDark: '#cc8a28', colorLight: '#d35400', icon: 'https://api.iconify.design/game-icons:rank-3.svg' },
    S: { from: 5, label: 'S', cssVar: 'bg-s', colorDark: '#0052cc', colorLight: '#0056b3', icon: 'https://api.iconify.design/game-icons:rank-2.svg' },
    L: { from: 10, label: 'L', cssVar: 'bg-l', colorDark: '#5981cc', colorLight: '#3178c6', icon: 'https://api.iconify.design/game-icons:rank-1.svg' },
    K: { from: 12, label: 'K', cssVar: 'bg-k', colorDark: '#cc6f44', colorLight: '#c0392b', icon: 'https://api.iconify.design/game-icons:rank-1.svg' },
    M: { from: 25, label: 'M', cssVar: 'bg-m', colorDark: '#cccc00', colorLight: '#b7950b', icon: 'https://api.iconify.design/game-icons:rank-1.svg' },
    Y: { from: 37, label: 'Y', cssVar: 'bg-y', colorDark: '#00cc00', colorLight: '#196f3d', icon: 'https://api.iconify.design/game-icons:rank-1.svg' }
};

export const REMOTE_AUTH_JSON_URL = 'https://cdn.jsdelivr.net/gh/s-pro-v/json-lista@main/dev/auth.json';
export const DEFAULT_REMOTE_REPO_FULL = 's-pro-v/w5g.github.io';

export const SHIFT_MAP = {
    '1': 'DZIEN_06-18',
    '2': 'NOC_18-06',
    'P1': 'PARKING_D1',
    'P2': 'PARKING_D2',
    'N1': 'NAGODZINY_N1',
    'N2': 'NAGODZINY_N2',
    'NP1': 'NAGODZINY_P1',
    'NP2': 'NAGODZINY_P2',
    'X': 'ABSENCJA_CRITICAL',
    'U': 'URLOP_WYPEŁNIONY',
    'S1': 'SZKOLENIE_TECH',
    'S2': 'SZKOLENIE_TECH',
    'ZW': 'ZWOLNIENIE_LEK',
    "W": "WOLNE_WEEKEND"
};

export const WEEKDAYS_MAP = { 'PN': 0, 'WT': 1, 'ŚR': 2, 'CZ': 3, 'PT': 4, 'SO': 5, 'ND': 6 };
export const WEEKDAYS_HEADER = ['PN', 'WT', 'ŚR', 'CZ', 'PT', 'SO', 'ND'];
export const VALID_SHIFT_CODES = Object.keys(SHIFT_MAP);
