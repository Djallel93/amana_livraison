/**
 * =======================================================================
 * CONFIG_MAIN.GS - Configuration Principale (À installer EN DERNIER)
 * =======================================================================
 */

/**
 * Objet CONFIG principal qui combine toutes les parties
 * @const {Object}
 */
const CONFIG = {
    // APIs
    ...CONFIG_APIS,

    // HQ et réseau
    ...CONFIG_HQ,

    // Optimisation routes
    ROUTE_OPTIMIZATION: CONFIG_ROUTE_OPTIMIZATION,

    // Sheets
    ...CONFIG_SHEETS,

    // Drive
    DRIVE: CONFIG_DRIVE,

    // Email
    EMAIL: CONFIG_EMAIL,

    // Tokens et Labels
    TOKENS: CONFIG_TOKENS,
    LABELS: CONFIG_LABELS,

    // Énumérations
    ENUMS: CONFIG_ENUMS,

    // UI
    ...CONFIG_UI
};

/**
 * Vérifie si toutes les clés API sont configurées
 * @returns {boolean}
 */
function isApiConfigured() {
    const famillesKey = CONFIG.API_FAMILLES.KEY;
    const benevolesKey = CONFIG.API_BENEVOLES.KEY;
    const geoKey = CONFIG.API_GEO.KEY;
    return !!(famillesKey && benevolesKey && geoKey);
}

/**
 * Met à jour une propriété de configuration
 * @param {string} key - Clé de la propriété
 * @param {string} value - Nouvelle valeur
 */
function setConfigProperty(key, value) {
    PropertiesService.getScriptProperties().setProperty(key, value);
    Logger.log(`[CONFIG] Propriété mise à jour: ${key} = ${value}`);
}

/**
 * Obtient une propriété de configuration
 * @param {string} key - Clé de la propriété
 * @returns {string|null}
 */
function getConfigProperty(key) {
    return PropertiesService.getScriptProperties().getProperty(key);
}