/**
 * =======================================================================
 * CONFIG_APIS.GS - Configuration des APIs Externes
 * =======================================================================
 * Contient : API Familles, API Bénévoles, API Géo, Configuration HQ
 */

/**
 * Configuration globale du système - Partie 1
 * @const {Object}
 */
const CONFIG_APIS = {
    /**
     * API de gestion des familles
     * Documentation : Family Management REST API v2.2
     */
    API_FAMILLES: {
        get URL() {
            return PropertiesService.getScriptProperties().getProperty('API_FAMILLES_URL') || '';
        },
        get KEY() {
            return PropertiesService.getScriptProperties().getProperty('API_FAMILLES_KEY') || '';
        },
        ENDPOINTS: {
            ALL_FAMILIES: 'allfamilies',
            GET_FAMILY: 'familybyid',
            PING: 'ping',
        },
        CACHE_DURATION: 300 // 5 minutes en secondes
    },

    /**
     * API de gestion des bénévoles
     * Documentation : Volunteer Management API v1.0
     */
    API_BENEVOLES: {
        get URL() {
            return PropertiesService.getScriptProperties().getProperty('API_BENEVOLES_URL') || '';
        },
        get KEY() {
            return PropertiesService.getScriptProperties().getProperty('API_BENEVOLES_KEY') || '';
        },
        ENDPOINTS: {
            LIST_VOLUNTEERS: 'listvolunteers',
            GET_VOLUNTEER: 'getvolunteer',
            GET_AVAILABILITY: 'getavailability',
            GET_AVAILABLE_VOLUNTEERS: 'getavailablevolunteers',
            GET_VOLUNTEERS_BY_QUARTIER: 'getvolunteersbyquartier',
            GET_VEHICLES: 'getvehicles',
            PING: 'ping'
        },
        CACHE_DURATION: 300 // 5 minutes
    },

    /**
     * API de géolocalisation
     * Documentation : AMANA GEO API v5.0
     */
    API_GEO: {
        get URL() {
            return PropertiesService.getScriptProperties().getProperty('API_GEO_URL') || '';
        },
        get KEY() {
            return PropertiesService.getScriptProperties().getProperty('API_GEO_KEY') || '';
        },
        ENDPOINTS: {
            GEOCODE: 'geocode',
            BATCH_GEOCODE: 'batchgeocode',
            REVERSE_GEOCODE: 'reversegeocode',
            RESOLVE_LOCATION: 'resolvelocation',
            BATCH_RESOLVE_LOCATION: 'batchresolvelocation',
            GET_VILLES: 'getvilles',
            GET_VILLE: 'getville',
            GET_SECTEURS: 'getsecteurs',
            GET_SECTEUR: 'getsecteur',
            GET_QUARTIERS: 'getquartiers',
            GET_QUARTIER: 'getquartier',
            QUARTIERS_BY_SECTEUR: 'quartiersbysecteur',
            CALCULATE_DISTANCE: 'calculatedistance',
            BATCH_CALCULATE_DISTANCE: 'batchcalculatedistance',
            VALIDATE_VILLE: 'validateville',
            VALIDATE_SECTEUR: 'validatesecteur',
            VALIDATE_QUARTIER: 'validatequartier',
            PING: 'ping'
        },
        CACHE_DURATION: 3600 // 1 heure (données géographiques changent rarement)
    }
};

/**
 * Configuration HQ et réseau
 */
const CONFIG_HQ = {
    /**
     * Adresse et coordonnées du QG de l'association
     */
    HQ: {
        get ADRESSE() {
            return PropertiesService.getScriptProperties().getProperty('HQ_ADRESSE') || '';
        },
        get LAT() {
            return parseFloat(PropertiesService.getScriptProperties().getProperty('HQ_LAT') || '');
        },
        get LNG() {
            return parseFloat(PropertiesService.getScriptProperties().getProperty('HQ_LNG') || '');
        }
    },

    /**
     * Paramètres réseau
     */
    MAX_RETRIES_API: 3,
    BACKOFF_DELAY_MS: 1000,
    HTTP_TIMEOUT_SECONDS: 30
};