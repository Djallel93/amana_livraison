/**
 * ====================================================================
 * MENU - FONCTIONS CONFIGURATION
 * ====================================================================
 */

/**
 * Affiche les informations À Propos
 */
function showAbout() {
  const ui = SpreadsheetApp.getUi();

  const message = `
${CONFIG.APP_NAME}
Version ${CONFIG.VERSION}

Développé pour Association AMANA
© 2026

🎯 Fonctionnalités :
- Gestion des livraisons
- Optimisation des routes
- Communication bénévoles
- Génération d'étiquettes
- Suivi en temps réel

🔧 APIs Intégrées :
- API Familles v2.2
- API Bénévoles v1.0
- API GEO v5.0
  `;

  ui.alert('À Propos', message, ui.ButtonSet.OK);
}

// ========================================
// UTILITAIRES
// ========================================

/**
 * Affiche un placeholder pour fonctionnalités non implémentées
 * @param {string} title - Titre
 * @param {string} message - Message
 */
function showPlaceholder(title, message) {
  const ui = SpreadsheetApp.getUi();
  ui.alert(title, `⏳ ${message}`, ui.ButtonSet.OK);
}

/**
 * Sauvegarde la configuration des API Keys
 * Appelée depuis le formulaire HTML
 * @param {Object} config - Configuration {famillesUrl, famillesKey, ...}
 */
function saveApiKeysConfig(config) {
  try {
    const props = PropertiesService.getScriptProperties();

    if (config.famillesUrl) props.setProperty('API_FAMILLES_URL', config.famillesUrl);
    if (config.famillesKey) props.setProperty('API_FAMILLES_KEY', config.famillesKey);
    if (config.benevolesUrl) props.setProperty('API_BENEVOLES_URL', config.benevolesUrl);
    if (config.benevolesKey) props.setProperty('API_BENEVOLES_KEY', config.benevolesKey);
    if (config.geoUrl) props.setProperty('API_GEO_URL', config.geoUrl);
    if (config.geoKey) props.setProperty('API_GEO_KEY', config.geoKey);

    Logger.log('[CONFIG] ✅ API Keys sauvegardées');
    return { success: true };
  } catch (error) {
    Logger.log(`[CONFIG] ❌ Erreur: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Récupère la configuration actuelle des API Keys
 * @returns {Object} Configuration actuelle
 */
function getApiKeysConfig() {
  return {
    famillesUrl: CONFIG.API_FAMILLES.URL,
    famillesKey: CONFIG.API_FAMILLES.KEY ? '***' : '', // Masquer la clé
    benevolesUrl: CONFIG.API_BENEVOLES.URL,
    benevolesKey: CONFIG.API_BENEVOLES.KEY ? '***' : '',
    geoUrl: CONFIG.API_GEO.URL,
    geoKey: CONFIG.API_GEO.KEY ? '***' : ''
  };
}

/**
 * Configure l'URL de l'API Web (pour Phase 6)
 * Cette fonction doit être appelée après le déploiement
 */
function configureApiWebUrl() {
  const ui = SpreadsheetApp.getUi();

  const response = ui.prompt(
    'Configuration API Web',
    'Entrez l\'URL de déploiement de l\'API Web :\n\n' +
    'Format : https://script.google.com/macros/s/VOTRE_DEPLOYMENT_ID/exec',
    ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() === ui.Button.OK) {
    const url = response.getResponseText().trim();

    if (url) {
      PropertiesService.getScriptProperties().setProperty('API_WEB_URL', url);
      ui.alert('Succès', `URL de l'API Web configurée : ${url}`, ui.ButtonSet.OK);
      Logger.log(`[CONFIG] API Web URL: ${url}`);
    }
  }
}

/**
 * Affiche le formulaire de configuration du QG
 */
function showConfigHq() {
  const html = HtmlService.createHtmlOutputFromFile('ui/configHq')
    .setWidth(650)
    .setHeight(550)
    .setTitle('📍 Configuration du QG');

  SpreadsheetApp.getUi().showModalDialog(html, 'Configuration du QG');
}

// Alias pour le menu
function showHqAddressConfig() {
  showConfigHq();
}

/**
 * Récupère la configuration actuelle du QG
 */
function getCurrentHqConfig() {
  const props = PropertiesService.getScriptProperties();
  return {
    address: props.getProperty('HQ_ADDRESS') || CONFIG.HQ.ADDRESS,
    lat: parseFloat(props.getProperty('HQ_LAT')) || CONFIG.HQ.LAT,
    lng: parseFloat(props.getProperty('HQ_LNG')) || CONFIG.HQ.LNG
  };
}

/**
 * Sauvegarde la configuration du QG
 */
function saveHqConfig(config) {
  const props = PropertiesService.getScriptProperties();
  props.setProperty('HQ_ADDRESS', config.address);
  props.setProperty('HQ_LAT', config.lat.toString());
  props.setProperty('HQ_LNG', config.lng.toString());

  Logger.log(`[CONFIG] QG configuré : ${config.address} (${config.lat}, ${config.lng})`);
}

/**
 * Affiche le formulaire de configuration des emails
 */
function showConfigEmail() {
  const html = HtmlService.createHtmlOutputFromFile('ui/configEmail')
    .setWidth(750)
    .setHeight(600)
    .setTitle('📧 Configuration des Emails');

  SpreadsheetApp.getUi().showModalDialog(html, 'Configuration des Emails');
}

// Alias pour le menu
function showEmailConfig() {
  showConfigEmail();
}

/**
 * Récupère la configuration actuelle des emails
 */
function getCurrentEmailConfig() {
  const props = PropertiesService.getScriptProperties();
  return {
    fromName: props.getProperty('EMAIL_FROM_NAME') || CONFIG.EMAIL.FROM_NAME,
    adminEmail: props.getProperty('EMAIL_ADMIN') || CONFIG.EMAIL.ADMIN_EMAIL,
    subjectRoute: props.getProperty('EMAIL_SUBJECT_ROUTE') || CONFIG.EMAIL.SUBJECT_ROUTE,
    subjectSkip: props.getProperty('EMAIL_SUBJECT_SKIP') || CONFIG.EMAIL.SUBJECT_ADMIN_SKIP
  };
}

/**
 * Sauvegarde la configuration des emails
 */
function saveEmailConfig(config) {
  const props = PropertiesService.getScriptProperties();
  props.setProperty('EMAIL_FROM_NAME', config.fromName);
  props.setProperty('EMAIL_ADMIN', config.adminEmail);
  props.setProperty('EMAIL_SUBJECT_ROUTE', config.subjectRoute);
  props.setProperty('EMAIL_SUBJECT_SKIP', config.subjectSkip);

  Logger.log(`[CONFIG] Emails configurés : ${config.fromName} <${config.adminEmail}>`);
}

/**
 * Affiche le formulaire de configuration de l'optimisation
 */
function showConfigRouteOptimization() {
  const html = HtmlService.createHtmlOutputFromFile('ui/configRouteOptimization')
    .setWidth(850)
    .setHeight(700)
    .setTitle('⚙️ Optimisation des Routes');

  SpreadsheetApp.getUi().showModalDialog(html, 'Optimisation des Routes');
}

// Alias pour le menu
function showRouteOptimizationConfig() {
  showConfigRouteOptimization();
}

/**
 * Récupère la configuration actuelle de l'optimisation
 */
function getCurrentOptimizationConfig() {
  const props = PropertiesService.getScriptProperties();
  return {
    distanceProximite: parseFloat(props.getProperty('OPT_DISTANCE_PROXIMITE')) || CONFIG.ROUTE_OPTIMIZATION.DISTANCE_PROXIMITE_KM,
    distanceClusterMax: parseFloat(props.getProperty('OPT_DISTANCE_CLUSTER_MAX')) || CONFIG.ROUTE_OPTIMIZATION.DISTANCE_CLUSTER_MAX_KM,
    distanceRegroupeEloignes: parseFloat(props.getProperty('OPT_DISTANCE_REGROUPE')) || CONFIG.ROUTE_OPTIMIZATION.DISTANCE_REGROUPE_ELOIGNES_KM,
    distanceLivraisonIsolee: parseFloat(props.getProperty('OPT_DISTANCE_ISOLEE')) || CONFIG.ROUTE_OPTIMIZATION.DISTANCE_LIVRAISON_ISOLEE_KM,
    capaciteBerline: parseFloat(props.getProperty('OPT_CAPACITE_BERLINE')) || CONFIG.ROUTE_OPTIMIZATION.CAPACITE_BERLINE_KG,
    capaciteBreak: parseFloat(props.getProperty('OPT_CAPACITE_BREAK')) || CONFIG.ROUTE_OPTIMIZATION.CAPACITE_BREAK_KG
  };
}

/**
 * Sauvegarde la configuration de l'optimisation
 */
function saveOptimizationConfig(config) {
  const props = PropertiesService.getScriptProperties();
  props.setProperty('OPT_DISTANCE_PROXIMITE', config.distanceProximite.toString());
  props.setProperty('OPT_DISTANCE_CLUSTER_MAX', config.distanceClusterMax.toString());
  props.setProperty('OPT_DISTANCE_REGROUPE', config.distanceRegroupeEloignes.toString());
  props.setProperty('OPT_DISTANCE_ISOLEE', config.distanceLivraisonIsolee.toString());
  props.setProperty('OPT_CAPACITE_BERLINE', config.capaciteBerline.toString());
  props.setProperty('OPT_CAPACITE_BREAK', config.capaciteBreak.toString());

  Logger.log(`[CONFIG] Optimisation configurée : proximité ${config.distanceProximite}km, berline ${config.capaciteBerline}kg`);
}

/**
 * Gestion des templates d'email (placeholder)
 */
function manageEmailTemplates() {
  showPlaceholder('Templates Email', 'Cette fonctionnalité sera disponible ultérieurement');
}