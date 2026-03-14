/**
 * ====================================================================
 * MENU - FONCTIONS CONFIGURATION
 * ====================================================================
 */

function showPlaceholder(title, message) {
  SpreadsheetApp.getUi().alert(title, '⏳ ' + message, SpreadsheetApp.getUi().ButtonSet.OK);
}

function saveApiKeysConfig(config) {
  try {
    const props = PropertiesService.getScriptProperties();
    if (config.famillesUrl) props.setProperty('API_FAMILLES_URL', config.famillesUrl);
    if (config.famillesKey) props.setProperty('API_FAMILLES_KEY', config.famillesKey);
    if (config.benevolesUrl) props.setProperty('API_BENEVOLES_URL', config.benevolesUrl);
    if (config.benevolesKey) props.setProperty('API_BENEVOLES_KEY', config.benevolesKey);
    if (config.geoUrl) props.setProperty('API_GEO_URL', config.geoUrl);
    if (config.geoKey) props.setProperty('API_GEO_KEY', config.geoKey);
    Logger.log('[CONFIG] ✅ Clés API sauvegardées');
    return { success: true };
  } catch (error) {
    Logger.log('[CONFIG] ❌ Erreur: ' + error.message);
    return { success: false, error: error.message };
  }
}

function getApiKeysConfig() {
  return {
    famillesUrl: CONFIG.API_FAMILLES.URL,
    famillesKey: CONFIG.API_FAMILLES.KEY ? '***' : '',
    benevolesUrl: CONFIG.API_BENEVOLES.URL,
    benevolesKey: CONFIG.API_BENEVOLES.KEY ? '***' : '',
    geoUrl: CONFIG.API_GEO.URL,
    geoKey: CONFIG.API_GEO.KEY ? '***' : ''
  };
}

function showHqAddressConfig() {
  const html = HtmlService.createTemplateFromFile('ui/configHq')
    .evaluate()
    .setWidth(600)
    .setHeight(520)
    .setTitle('🏢 Configuration du QG');

  SpreadsheetApp.getUi().showModalDialog(html, 'Configuration du QG');
}

function getCurrentHqConfig() {
  const props = PropertiesService.getScriptProperties();
  return {
    address: props.getProperty('HQ_ADRESSE') || '',
    lat: parseFloat(props.getProperty('HQ_LAT')) || 0,
    lng: parseFloat(props.getProperty('HQ_LNG')) || 0
  };
}

function saveHqConfig(config) {
  const props = PropertiesService.getScriptProperties();
  props.setProperty('HQ_ADRESSE', config.address);
  props.setProperty('HQ_LAT', config.lat.toString());
  props.setProperty('HQ_LNG', config.lng.toString());
  Logger.log('[CONFIG] QG configuré : ' + config.address + ' (' + config.lat + ', ' + config.lng + ')');
}

function showEmailConfig() {
  const html = HtmlService.createTemplateFromFile('ui/configEmail')
    .evaluate()
    .setWidth(600)
    .setHeight(580)
    .setTitle('📧 Configuration des Emails');

  SpreadsheetApp.getUi().showModalDialog(html, 'Configuration des Emails');
}

function getCurrentEmailConfig() {
  const props = PropertiesService.getScriptProperties();
  return {
    fromName: props.getProperty('EMAIL_FROM_NAME') || CONFIG.EMAIL.FROM_NAME,
    adminEmail: props.getProperty('EMAIL_ADMIN') || CONFIG.EMAIL.ADMIN_EMAIL,
    subjectRoute: props.getProperty('EMAIL_SUBJECT_ROUTE') || CONFIG.EMAIL.SUBJECT_ROUTE,
    subjectSkip: props.getProperty('EMAIL_SUBJECT_SKIP') || CONFIG.EMAIL.SUBJECT_ADMIN_SKIP
  };
}

function saveEmailConfig(config) {
  const props = PropertiesService.getScriptProperties();
  props.setProperty('EMAIL_FROM_NAME', config.fromName);
  props.setProperty('EMAIL_ADMIN', config.adminEmail);
  props.setProperty('EMAIL_SUBJECT_ROUTE', config.subjectRoute);
  props.setProperty('EMAIL_SUBJECT_SKIP', config.subjectSkip);
  Logger.log('[CONFIG] Emails configurés : ' + config.fromName + ' <' + config.adminEmail + '>');
}

function showRouteOptimizationConfig() {
  const html = HtmlService.createTemplateFromFile('ui/configRouteOptimization')
    .evaluate()
    .setWidth(700)
    .setHeight(680)
    .setTitle('🎛️ Paramètres Optimisation Routes');

  SpreadsheetApp.getUi().showModalDialog(html, 'Paramètres Optimisation Routes');
}

function getCurrentOptimizationConfig() {
  const props = PropertiesService.getScriptProperties();
  return {
    distanceProximite: parseFloat(props.getProperty('OPT_DISTANCE_PROXIMITE')) || CONFIG.ROUTE_OPTIMIZATION.DISTANCE_PROXIMITE_KM,
    distanceClusterMax: parseFloat(props.getProperty('OPT_DISTANCE_CLUSTER_MAX')) || CONFIG.ROUTE_OPTIMIZATION.DISTANCE_CLUSTER_MAX_KM,
    distanceRegroupeEloignes: parseFloat(props.getProperty('OPT_DISTANCE_REGROUPE')) || CONFIG.ROUTE_OPTIMIZATION.DISTANCE_REGROUPE_ELOIGNES_KM,
    distanceLivraisonIsolee: parseFloat(props.getProperty('OPT_DISTANCE_ISOLEE')) || CONFIG.ROUTE_OPTIMIZATION.DISTANCE_LIVRAISON_ISOLEE_KM,
    capaciteBerline: parseFloat(props.getProperty('OPT_CAPACITE_BERLINE')) || 200,
    capaciteBreak: parseFloat(props.getProperty('OPT_CAPACITE_BREAK')) || 400
  };
}

function saveOptimizationConfig(config) {
  const props = PropertiesService.getScriptProperties();
  props.setProperty('OPT_DISTANCE_PROXIMITE', config.distanceProximite.toString());
  props.setProperty('OPT_DISTANCE_CLUSTER_MAX', config.distanceClusterMax.toString());
  props.setProperty('OPT_DISTANCE_REGROUPE', config.distanceRegroupeEloignes.toString());
  props.setProperty('OPT_DISTANCE_ISOLEE', config.distanceLivraisonIsolee.toString());
  props.setProperty('OPT_CAPACITE_BERLINE', config.capaciteBerline.toString());
  props.setProperty('OPT_CAPACITE_BREAK', config.capaciteBreak.toString());
  Logger.log('[CONFIG] Optimisation configurée');
}

/**
 * Ouvre le formulaire des statistiques.
 */
function showStatisticsForm() {
  const html = HtmlService.createTemplateFromFile('ui/statsForm')
    .evaluate()
    .setWidth(1200)
    .setHeight(800)
    .setTitle('📊 Statistiques');

  SpreadsheetApp.getUi().showModalDialog(html, '📊 Statistiques');
}

/**
 * Ouvre le formulaire de gestion des véhicules temporaires.
 */
function ouvrirGestionVehiculesTmp() {
  const html = HtmlService.createTemplateFromFile('ui/gererVehiculesTmp')
    .evaluate()
    .setWidth(500)
    .setHeight(580)
    .setTitle('🚗 Véhicules Temporaires');

  SpreadsheetApp.getUi().showModalDialog(html, 'Véhicules Temporaires');
}

function manageEmailTemplates() {
  showPlaceholder('Templates Email', 'Cette fonctionnalité sera disponible ultérieurement');
}