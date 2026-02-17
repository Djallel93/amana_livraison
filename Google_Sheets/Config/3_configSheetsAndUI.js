/**
 * =======================================================================
 * CONFIG_SHEETS_AND_UI.GS - Configuration Sheets, Drive, Email, UI
 * =======================================================================
 * Contient : Structure des feuilles, colonnes, Drive, Email, Tokens, Labels, Énumérations
 * 
 * ⚠️ MODIFICATION: Ajout de la colonne LIEN_MAPS dans ROUTES
 */

/**
 * Configuration Google Sheets
 */
const CONFIG_SHEETS = {
    SHEETS: {
        LIVRAISON: 'Livraison',
        ROUTES: 'routes',
        ETAPES_ROUTE: 'etapes_route',
        TOKENS: 'tokens',
        CONFIG: 'config'
    },

    COLUMNS: {
        LIVRAISON: {
            ID_LIVRAISON: 1,
            ID_FAMILLE: 2,
            ID_QUARTIER: 3,
            ADRESSE: 4,
            LATITUDE: 5,
            LONGITUDE: 6,
            DISPONIBILITE_DEBUT: 7,
            DISPONIBILITE_FIN: 8,
            NOMBRE_PERSONNES: 9,
            STATUT: 10,
            PRIORITE: 11,
            TYPE_AIDE: 12,
            BESOINS_SPECIAUX: 13,
            DATE_CREATION: 14,
            DATE_MODIFICATION: 15
        },
        ROUTES: {
            ID_ROUTE: 1,
            ID_BENEVOLE: 2,
            ID_BINOME: 3,
            ID_VEHICULE_PRETE: 4,
            DATE_DEBUT: 5,
            DATE_FIN: 6,
            OCCASION: 7,
            STATUT: 8,
            DISTANCE_TOTALE_KM: 9,
            POIDS_TOTAL_KG: 10,
            RELIVRE: 11,
            LIEN_MAPS: 12,          // ✅ NOUVELLE COLONNE
            DOSSIER_DRIVE: 13,      // ⚠️ Index décalé de 12 → 13
            DATE_CREATION: 14,       // ⚠️ Index décalé de 13 → 14
            DATE_MODIFICATION: 15    // ⚠️ Index décalé de 14 → 15
        },
        ETAPES_ROUTE: {
            ID_ETAPE: 1,
            ID_ROUTE: 2,
            ID_LIVRAISON: 3,
            ORDRE_PASSAGE: 4,
            STATUT: 5,
            HEURE_DEBUT: 6,
            HEURE_FIN: 7,
            COMMENTAIRE: 8
        },
        TOKENS: {
            ID_ROUTE: 1,
            TOKEN: 2,
            DATE_EXPIRATION: 3,
            DATE_CREATION: 4
        }
    }
};

/**
 * Configuration Google Drive
 */
const CONFIG_DRIVE = {
    FOLDER_ROOT: 'Routes',
    FOLDER_DATE_FORMAT: 'YYYYMMdd',
    FILE_PREFIXES: {
        ROUTE: 'Route_',
        LABELS: 'Labels_'
    },
    EXTENSIONS: {
        ROUTE_DOC: '.gdoc',
        LABELS_DOC: '.gdoc'
    }
};

/**
 * Configuration Email
 */
const CONFIG_EMAIL = {
    get FROM() {
        return PropertiesService.getScriptProperties().getProperty('EMAIL_FROM') ||
            'deliveries@association.org';
    },
    get FROM_NAME() {
        return PropertiesService.getScriptProperties().getProperty('EMAIL_FROM_NAME') ||
            'Association AMANA - Livraisons';
    },
    get ADMIN_EMAIL() {
        return PropertiesService.getScriptProperties().getProperty('EMAIL_ADMIN') ||
            'admin@association.org';
    },
    SUBJECT_ROUTE: '🗺️ Votre itinéraire de livraison',
    SUBJECT_ADMIN_SKIP: '⚠️ Livraison sautée',
    TEMPLATES: {
        ROUTE_EMAIL: 'templates/email_route.html',
        ADMIN_NOTIFICATION: 'templates/email_admin_notification.html',
        STYLES_CSS: 'templates/styles.css'
    }
};

/**
 * Configuration Tokens et Labels
 */
const CONFIG_TOKENS = {
    EXPIRATION_HOURS: 48,
    LENGTH: 32
};

const CONFIG_LABELS = {
    DEFAULT_ROWS: 7,
    DEFAULT_COLS: 3,
    QR_CODE_SIZE: 150,
    FONT: {
        ID_SIZE: '16pt',
        ID_WEIGHT: 'bold',
        PART_SIZE: '10pt',
        PART_WEIGHT: 'normal'
    }
};

/**
 * Énumérations
 */
const CONFIG_ENUMS = {
    STATUT_LIVRAISON: {
        NON_ASSIGNEE: 'Non Assignée',
        ASSIGNEE: 'Assignée',
        EN_COURS: 'En Cours',
        LIVREE: 'Livrée',
        ANNULEE: 'Annulée'
    },
    STATUT_ROUTE: {
        BROUILLON: 'Brouillon',
        CONFIRMEE: 'Confirmée',
        EN_COURS: 'En Cours',
        TERMINEE: 'Terminée',
        ANNULEE: 'Annulée'
    },
    STATUT_ETAPE: {
        EN_ATTENTE: 'En Attente',
        EN_COURS: 'En Cours',
        LIVREE: 'Livrée',
        SAUTEE: 'Sautée'
    },
    OCCASION: {
        ZAKAT_EL_FITR: 'zakat_el_fitr',
        RECOLTE: 'recolte',
        PONCTUELLE: 'ponctuelle'
    },
    TYPE_AIDE: {
        ZAKAT: 'zakat',
        SADAQA: 'sadaqa',
        RECOLTE: 'recolte'
    },
    PRIORITE: {
        URGENT: 1,
        HAUTE: 2,
        MOYENNE: 3,
        BASSE: 4,
        STANDARD: 5
    }
};

/**
 * Configuration UI
 */
const CONFIG_UI = {
    LOCALE: 'fr_FR',
    TIMEZONE: 'Europe/Paris',
    APP_NAME: 'Gestion Livraisons AMANA',
    VERSION: '1.0.0',
    MESSAGES: {
        ERROR_API_KEY_MISSING: '⚠️ Clés API manquantes. Veuillez les configurer dans Configuration > API Keys',
        ERROR_NO_DATA: '⚠️ Aucune donnée trouvée',
        SUCCESS_CREATED: '✅ Créé avec succès',
        SUCCESS_UPDATED: '✅ Mis à jour avec succès',
        SUCCESS_DELETED: '✅ Supprimé avec succès',
        CONFIRM_DELETE: 'Êtes-vous sûr de vouloir supprimer cet élément ?'
    }
};