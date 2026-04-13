/**
 * =======================================================================
 * CONFIG_SHEETS_AND_UI.GS - Configuration des Feuilles et Interface
 * =======================================================================
 * IMPORTANT : La colonne ETUDIANT (col 8) a été ajoutée manuellement
 * dans la feuille après HOTEL (col 7) et avant DISPONIBILITE_DEBUT.
 * Toutes les colonnes à partir de 8 sont décalées de +1.
 */

const CONFIG_SHEETS = {
  SHEETS: {
    LIVRAISON: "Livraison",
    ROUTES: "routes",
    ETAPES_ROUTE: "etapes_route",
    TOKENS: "tokens",
    CONFIG: "config",
    DONATIONS: "donations",
  },

  COLUMNS: {
    LIVRAISON: {
      ID_LIVRAISON: 1,
      ID_FAMILLE: 2,
      ID_QUARTIER: 3,
      ADRESSE: 4,
      LATITUDE: 5,
      LONGITUDE: 6,
      HOTEL: 7,
      ETUDIANT: 8, // ← nouvelle colonne (ajoutée manuellement)
      DISPONIBILITE_DEBUT: 9,
      DISPONIBILITE_FIN: 10,
      NOMBRE_PERSONNES: 11,
      AVEC_ENFANT: 12,
      STATUT_CONDITIONNEMENT: 13,
      STATUT: 14,
      PRIORITE: 15,
      TYPE_AIDE: 16,
      BESOINS_SPECIAUX: 17,
      DATE_CREATION: 18,
      DATE_MODIFICATION: 19,
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
      POIDS_PAR_PART: 11,
      POIDS_PAR_PART_HOTEL: 12,
      RELIVRE: 13,
      LIEN_MAPS: 14,
      DOSSIER_DRIVE: 15,
      DATE_CREATION: 16,
      DATE_MODIFICATION: 17,
    },
    ETAPES_ROUTE: {
      ID_ETAPE: 1,
      ID_ROUTE: 2,
      ID_LIVRAISON: 3,
      ORDRE_PASSAGE: 4,
      STATUT: 5,
      HEURE_DEBUT: 6,
      HEURE_FIN: 7,
      COMMENTAIRE: 8,
    },
    TOKENS: {
      ID_ROUTE: 1,
      TOKEN: 2,
      DATE_EXPIRATION: 3,
      DATE_CREATION: 4,
    },
    DONATIONS: {
      ID: 1,
      DATE: 2,
      OCCASION: 3,
      POIDS_KG: 4,
    },
  },
};

const CONFIG_DRIVE = {
  FOLDER_ROOT: "Livraisons",
  FOLDER_DATE_FORMAT: "YYYYMMdd",
  FILE_PREFIXES: {
    ROUTE: "Route_",
    LABELS: "Labels_",
  },
  EXTENSIONS: {
    ROUTE_DOC: ".gdoc",
    LABELS_DOC: ".gdoc",
  },
};

const CONFIG_EMAIL = {
  get FROM() {
    return (
      PropertiesService.getScriptProperties().getProperty("EMAIL_FROM") ||
      "deliveries@association.org"
    );
  },
  get FROM_NAME() {
    return (
      PropertiesService.getScriptProperties().getProperty("EMAIL_FROM_NAME") ||
      "Association AMANA - Livraisons"
    );
  },
  get ADMIN_EMAIL() {
    return (
      PropertiesService.getScriptProperties().getProperty("EMAIL_ADMIN") ||
      "admin@association.org"
    );
  },
  get STATS_EMAILS() {
    return (
      PropertiesService.getScriptProperties().getProperty("STATS_EMAILS") || ""
    );
  },
  SUBJECT_ROUTE: "🗺️ Votre itinéraire de livraison",
  SUBJECT_ADMIN_SKIP: "⚠️ Livraison sautée",
  TEMPLATES: {
    ROUTE_EMAIL: "templates/email_route.html",
    ADMIN_NOTIFICATION: "templates/email_admin_notification.html",
    STYLES_CSS: "templates/styles.css",
  },
};

const CONFIG_TOKENS = {
  EXPIRATION_HOURS: 48,
  LENGTH: 32,
};

const CONFIG_LABELS = {
  DEFAULT_ROWS: 7,
  DEFAULT_COLS: 3,
  QR_CODE_SIZE: 150,
  FONT: {
    ID_SIZE: "16pt",
    ID_WEIGHT: "bold",
    PART_SIZE: "10pt",
    PART_WEIGHT: "normal",
  },
};

const CONFIG_ENUMS = {
  STATUT_LIVRAISON: {
    NON_ASSIGNEE: "Non Assignée",
    ASSIGNEE: "Assignée",
    EN_COURS: "En Cours",
    LIVREE: "Livrée",
    ANNULEE: "Annulée",
  },
  STATUT_ROUTE: {
    BROUILLON: "Brouillon",
    CONFIRMEE: "Confirmée",
    PRETE: "Prete",
    EN_COURS: "En Cours",
    TERMINEE: "Terminée",
    ANNULEE: "Annulée",
  },
  STATUT_ETAPE: {
    EN_ATTENTE: "En Attente",
    EN_COURS: "En Cours",
    PRETE: "Prete",
    LIVREE: "Livrée",
    IGNOREE: "ignorée",
  },
  STATUT_CONDITIONNEMENT: {
    PRETE: "Prete",
  },
  OCCASION: {
    ZAKAT_EL_FITR: "zakat_el_fitr",
    RECOLTE: "recolte",
    PONCTUELLE: "ponctuelle",
  },
  TYPE_AIDE: {
    ZAKAT_EL_FITR: "zakat_el_fitr",
    RECOLTE: "recolte",
    PONCTUELLE: "ponctuelle",
  },
  PRIORITE: {
    URGENT: 1,
    HAUTE: 2,
    MOYENNE: 3,
    BASSE: 4,
    STANDARD: 5,
  },
};

const CONFIG_UI = {
  LOCALE: "fr_FR",
  TIMEZONE: "Europe/Paris",
  APP_NAME: "Gestion Livraisons AMANA",
  VERSION: "1.0.0",
  MESSAGES: {
    ERROR_API_KEY_MISSING:
      "⚠️ Clés API manquantes. Veuillez les configurer dans Configuration > API Keys",
    ERROR_NO_DATA: "⚠️ Aucune donnée trouvée",
    SUCCESS_CREATED: "✅ Créé avec succès",
    SUCCESS_UPDATED: "✅ Mis à jour avec succès",
    SUCCESS_DELETED: "✅ Supprimé avec succès",
    CONFIRM_DELETE: "Êtes-vous sûr de vouloir supprimer cet élément ?",
  },
};
