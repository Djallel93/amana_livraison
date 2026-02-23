/**
 * =======================================================================
 * CONFIG_MAIN.GS - Configuration Principale (À installer EN DERNIER)
 * =======================================================================
 * Combine tous les objets CONFIG_* en un seul objet CONFIG
 * Fonctions helper : isApiConfigured(), setConfigProperty(), initializeDefaultProperties()
 *
 * ⚠️ IMPORTANT : Ce fichier doit être installé APRÈS les 3 autres fichiers config
 *
 * ⚠️ CHANGEMENT v3 :
 * - Suppression de ROUTE_MAX_WEIGHT_PER_CLUSTER_KG des propriétés par défaut
 *   Le clustering est désormais purement géographique.
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

/**
 * Initialise les propriétés par défaut si elles n'existent pas
 *
 * ⚠️ ROUTE_MAX_WEIGHT_PER_CLUSTER_KG supprimé : le clustering est désormais
 * purement géographique. Les contraintes de capacité sont gérées à l'assignation.
 */
function initializeDefaultProperties() {
    const properties = PropertiesService.getScriptProperties();
    const defaults = {
        'HQ_ADRESSE': '319 Rte de Vannes, 44800 Saint-Herblain',
        'HQ_LAT': '47.2457349',
        'HQ_LNG': '-1.6037901',
        'ROUTE_DISTANCE_PROXIMITE_KM': '2.5',
        'ROUTE_MAX_CLUSTER_DIAMETER_KM': '5',
        'ROUTE_DISTANCE_CLUSTER_MAX_KM': '15',
        'ROUTE_SAME_BUILDING_THRESHOLD_M': '50',
        'ROUTE_QUARTIER_PREFERENCE': 'true',
        'ROUTE_ALLOW_CROSS_QUARTIER': 'true',
        'ROUTE_OUTLIER_DISTANCE_KM': '40',
        'ROUTE_MIN_COMPACTNESS_RATIO': '0.4',

        'ROUTE_DISTANCE_ISOLEE_KM': '30',
        'EMAIL_FROM': 'deliveries@association.org',
        'EMAIL_FROM_NAME': 'Association AMANA - Livraisons',
        'EMAIL_ADMIN': 'admin@association.org'
    };

    for (const [key, value] of Object.entries(defaults)) {
        if (!properties.getProperty(key)) {
            properties.setProperty(key, value);
            Logger.log(`[CONFIG] Propriété initialisée: ${key} = ${value}`);
        }
    }

    Logger.log('[CONFIG] ✅ Propriétés par défaut initialisées');
}