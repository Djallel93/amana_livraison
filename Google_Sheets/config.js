/**
 * =======================================================================
 * CONFIG.GS - Configuration Centrale du Système de Gestion des Livraisons
 * =======================================================================
 */

/**
 * Configuration globale du système
 * @const {Object}
 */
const CONFIG = {

  // ========================================
  // 🌐 APIS EXTERNES
  // ========================================

  /**
   * API de gestion des familles
   * Documentation : Family Management REST API v2.2
   */
  API_FAMILLES: {
    // L'URL de base sera récupérée depuis Script Properties
    get URL() {
      return PropertiesService.getScriptProperties().getProperty('API_FAMILLES_URL') || '';
    },
    get KEY() {
      return PropertiesService.getScriptProperties().getProperty('API_FAMILLES_KEY') || '';
    },
    ENDPOINTS: {
      ALL_FAMILIES: 'allfamilies',
      GET_FAMILY: 'getfamily',
      PING: 'ping',
      CONFIRM_FAMILY: 'confirmfamilyinfo'
    },
    CACHE_DURATION: 300 // 5 minutes en secondes
  },

  /**
   * API de gestion des bénévoles
   * Documentation : Volunteer Management API v1.0
   */
  API_BENEVOLES: {
    get URL() {
      return PropertiesService.getScriptProperties().getProperty('API_BENEVOLES_URL') ||
        'https://script.google.com/macros/s/YOUR_VOLUNTEER_SCRIPT_ID/exec';
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
      return PropertiesService.getScriptProperties().getProperty('API_GEO_URL') ||
        'https://script.google.com/macros/s/YOUR_GEO_SCRIPT_ID/exec';
    },
    get KEY() {
      return PropertiesService.getScriptProperties().getProperty('API_GEO_KEY') || '';
    },
    ENDPOINTS: {
      GEOCODE: 'geocode',
      REVERSE_GEOCODE: 'reversegeocode',
      RESOLVE_LOCATION: 'resolvelocation',
      GET_VILLES: 'getvilles',
      GET_VILLE: 'getville',
      GET_SECTEURS: 'getsecteurs',
      GET_SECTEUR: 'getsecteur',
      GET_QUARTIERS: 'getquartiers',
      GET_QUARTIER: 'getquartier',
      QUARTIERS_BY_SECTEUR: 'quartiersbysecteur',
      CALCULATE_DISTANCE: 'calculatedistance',
      VALIDATE_VILLE: 'validateville',
      VALIDATE_SECTEUR: 'validatesecteur',
      VALIDATE_QUARTIER: 'validatequartier',
      PING: 'ping'
    },
    CACHE_DURATION: 3600 // 1 heure (données géographiques changent rarement)
  },

  // ========================================
  // 🏢 CONFIGURATION SIÈGE SOCIAL (HQ)
  // ========================================

  /**
   * Adresse et coordonnées du QG de l'association
   * Modifiable via menu Configuration > Adresse HQ
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

  // ========================================
  // 🗺️ OPTIMISATION DES ROUTES
  // ========================================

  /**
   * Paramètres pour l'algorithme de génération de routes
   * Modifiable via menu Configuration > Paramètres d'Optimisation Routes
   */
  ROUTE_OPTIMIZATION: {
    /**
     * Distance en km pour considérer 2 livraisons comme "proches"
     * Utilisé pour le clustering géographique
     */
    get DISTANCE_PROXIMITE_KM() {
      return parseFloat(
        PropertiesService.getScriptProperties().getProperty('ROUTE_DISTANCE_PROXIMITE_KM') || '3'
      );
    },

    /**
     * Distance max en km pour grouper 2 quartiers dans une même route
     * Si > cette valeur, ils seront considérés trop éloignés sauf exception
     */
    get DISTANCE_CLUSTER_MAX_KM() {
      return parseFloat(
        PropertiesService.getScriptProperties().getProperty('ROUTE_DISTANCE_CLUSTER_MAX_KM') || '15'
      );
    },

    /**
     * Capacité max en kg considérée comme "petite voiture"
     * Utilisé pour les optimisations spécifiques aux petits véhicules
     */
    get CAPACITE_PETITE_VOITURE_KG() {
      return parseFloat(
        PropertiesService.getScriptProperties().getProperty('ROUTE_CAPACITE_PETITE_VOITURE_KG') || '400'
      );
    },

    /**
     * Distance en km au-delà de laquelle une route est considérée "éloignée"
     * Déclenche un popup de confirmation pour l'admin
     */
    get DISTANCE_LIVRAISON_ISOLEE_KM() {
      return parseFloat(
        PropertiesService.getScriptProperties().getProperty('ROUTE_DISTANCE_ISOLEE_KM') || '30'
      );
    },

    /**
     * Distance en km pour regrouper des clusters très éloignés ensemble
     * Si tous les clusters sont > cette distance du HQ, on peut les grouper
     */
    DISTANCE_REGROUPE_ELOIGNES_KM: 30,

    /**
     * Capacités par défaut des véhicules (en kg)
     * Utilisées quand l'API ne retourne pas de capacité
     */
    get CAPACITE_BERLINE_KG() {
      return parseFloat(
        PropertiesService.getScriptProperties().getProperty('ROUTE_CAPACITE_BERLINE_KG') || '400'
      );
    },
    get CAPACITE_BREAK_KG() {
      return parseFloat(
        PropertiesService.getScriptProperties().getProperty('ROUTE_CAPACITE_BREAK_KG') || '500'
      );
    }
  },

  // ========================================
  // 🔄 PARAMÈTRES RÉSEAU
  // ========================================

  /**
   * Nombre de tentatives pour les appels API
   */
  MAX_RETRIES_API: 3,

  /**
   * Délai initial en ms pour le backoff exponentiel
   */
  BACKOFF_DELAY_MS: 1000,

  /**
   * Timeout pour les requêtes HTTP (en secondes)
   */
  HTTP_TIMEOUT_SECONDS: 30,

  // ========================================
  // 📊 GOOGLE SHEETS
  // ========================================

  /**
   * Noms des feuilles dans le Google Spreadsheet
   */
  SHEETS: {
    LIVRAISON: 'Livraison',
    ROUTES: 'routes',
    ETAPES_ROUTE: 'etapes_route',
    TOKENS: 'tokens',
    CONFIG: 'config' // Feuille optionnelle pour paramètres avancés
  },

  /**
   * Structure des colonnes pour chaque feuille
   * Index commence à 1 (comme dans Google Sheets)
   */
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
      DOSSIER_DRIVE: 12,
      DATE_CREATION: 13,
      DATE_MODIFICATION: 14
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
  },

  // ========================================
  // 📁 GOOGLE DRIVE
  // ========================================

  /**
   * Configuration Google Drive
   */
  DRIVE: {
    /**
     * Nom du dossier racine pour les routes
     */
    FOLDER_ROOT: 'Routes',

    /**
     * Format du nom des sous-dossiers : YYYYMMdd_{occasion}
     */
    FOLDER_DATE_FORMAT: 'YYYYMMdd',

    /**
     * Préfixes des fichiers générés
     */
    FILE_PREFIXES: {
      ROUTE: 'Route_',
      LABELS: 'Labels_'
    },

    /**
     * Extensions
     */
    EXTENSIONS: {
      ROUTE_DOC: '.gdoc',
      LABELS_DOC: '.gdoc'
    }
  },

  // ========================================
  // ✉️ EMAIL ET NOTIFICATIONS
  // ========================================

  /**
   * Configuration email
   */
  EMAIL: {
    /**
     * Adresse email de l'expéditeur
     */
    get FROM() {
      return PropertiesService.getScriptProperties().getProperty('EMAIL_FROM') ||
        'deliveries@association.org';
    },

    /**
     * Nom affiché de l'expéditeur
     */
    get FROM_NAME() {
      return PropertiesService.getScriptProperties().getProperty('EMAIL_FROM_NAME') ||
        'Association AMANA - Livraisons';
    },

    /**
     * Email de l'administrateur (pour notifications)
     */
    get ADMIN_EMAIL() {
      return PropertiesService.getScriptProperties().getProperty('EMAIL_ADMIN') ||
        'admin@association.org';
    },

    /**
     * Sujet des emails de route
     */
    SUBJECT_ROUTE: '🗺️ Votre itinéraire de livraison',

    /**
     * Sujet des notifications admin
     */
    SUBJECT_ADMIN_SKIP: '⚠️ Livraison sautée',

    /**
     * Chemin des templates HTML
     */
    TEMPLATES: {
      ROUTE_EMAIL: 'templates/email_route.html',
      ADMIN_NOTIFICATION: 'templates/email_admin_notification.html',
      STYLES_CSS: 'templates/styles.css'
    }
  },

  // ========================================
  // 🔐 SÉCURITÉ ET TOKENS
  // ========================================

  /**
   * Configuration des tokens pour l'API web
   */
  TOKENS: {
    /**
     * Durée de validité des tokens (en heures)
     */
    EXPIRATION_HOURS: 48,

    /**
     * Longueur du token (caractères aléatoires)
     */
    LENGTH: 32
  },

  // ========================================
  // 🏷️ ÉTIQUETTES (LABELS)
  // ========================================

  /**
   * Configuration des étiquettes imprimables
   */
  LABELS: {
    /**
     * Format par défaut (lignes x colonnes)
     */
    DEFAULT_ROWS: 7,
    DEFAULT_COLS: 3,

    /**
     * Taille du QR code (pixels)
     */
    QR_CODE_SIZE: 150,

    /**
     * Police pour les textes
     */
    FONT: {
      ID_SIZE: '16pt',
      ID_WEIGHT: 'bold',
      PART_SIZE: '10pt',
      PART_WEIGHT: 'normal'
    }
  },

  // ========================================
  // 📋 ÉNUMÉRATIONS
  // ========================================

  /**
   * Valeurs autorisées pour les champs enum
   */
  ENUMS: {
    /**
     * Statuts possibles des livraisons
     */
    STATUT_LIVRAISON: {
      NON_ASSIGNEE: 'Non Assignée',
      ASSIGNEE: 'Assignée',
      EN_COURS: 'En Cours',
      LIVREE: 'Livrée',
      ANNULEE: 'Annulée'
    },

    /**
     * Statuts possibles des routes
     */
    STATUT_ROUTE: {
      BROUILLON: 'Brouillon',
      CONFIRMEE: 'Confirmée',
      EN_COURS: 'En Cours',
      TERMINEE: 'Terminée',
      ANNULEE: 'Annulée'
    },

    /**
     * Statuts possibles des étapes
     */
    STATUT_ETAPE: {
      EN_ATTENTE: 'En Attente',
      EN_COURS: 'En Cours',
      LIVREE: 'Livrée',
      SAUTEE: 'Sautée'
    },

    /**
     * Types d'occasion
     */
    OCCASION: {
      ZAKAT_EL_FITR: 'zakat_el_fitr',
      RECOLTE: 'recolte',
      PONCTUELLE: 'ponctuelle'
    },

    /**
     * Types d'aide
     */
    TYPE_AIDE: {
      ZAKAT: 'zakat',
      SADAQA: 'sadaqa',
      RECOLTE: 'recolte'
    },

    /**
     * Niveaux de priorité (1 = urgent, 5 = standard)
     */
    PRIORITE: {
      URGENT: 1,
      HAUTE: 2,
      MOYENNE: 3,
      BASSE: 4,
      STANDARD: 5
    }
  },

  // ========================================
  // 🌍 LOCALISATION
  // ========================================

  /**
   * Langue par défaut du système
   */
  LOCALE: 'fr_FR',

  /**
   * Timezone
   */
  TIMEZONE: 'Europe/Paris',

  // ========================================
  // 🎨 UI ET INTERFACE
  // ========================================

  /**
   * Titre de l'application (affiché dans les menus)
   */
  APP_NAME: 'Gestion Livraisons AMANA',

  /**
   * Version de l'application
   */
  VERSION: '1.0.0',

  /**
   * Messages d'interface (pour cohérence)
   */
  MESSAGES: {
    ERROR_API_KEY_MISSING: '⚠️ Clés API manquantes. Veuillez les configurer dans Configuration > API Keys',
    ERROR_NO_DATA: '⚠️ Aucune donnée trouvée',
    SUCCESS_CREATED: '✅ Créé avec succès',
    SUCCESS_UPDATED: '✅ Mis à jour avec succès',
    SUCCESS_DELETED: '✅ Supprimé avec succès',
    CONFIRM_DELETE: 'Êtes-vous sûr de vouloir supprimer cet élément ?'
  }
};

/**
 * Fonctions helper pour accéder à la configuration
 */

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
 */
function initializeDefaultProperties() {
  const properties = PropertiesService.getScriptProperties();
  const defaults = {
    'HQ_ADRESSE': '319 Rte de Vannes, 44800 Saint-Herblain',
    'HQ_LAT': '47.2457349',
    'HQ_LNG': '-1.6037901',
    'ROUTE_DISTANCE_PROXIMITE_KM': '3',
    'ROUTE_DISTANCE_CLUSTER_MAX_KM': '15',
    'ROUTE_CAPACITE_PETITE_VOITURE_KG': '400',
    'ROUTE_DISTANCE_ISOLEE_KM': '30',
    'ROUTE_CAPACITE_BERLINE_KG': '400',
    'ROUTE_CAPACITE_BREAK_KG': '500',
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
