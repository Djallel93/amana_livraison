/**
 * ====================================================================
 * CODE.GS - Point d'Entrée Principal
 * ====================================================================
 * 
 * Fichier principal du système de gestion des livraisons.
 * Gère :
 * - Menu personnalisé
 * - Initialisation
 * - Navigation
 */

/**
 * Fonction appelée à l'ouverture du spreadsheet
 * Crée le menu personnalisé
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();

  ui.createMenu('📦 ' + CONFIG.APP_NAME)
    // ========================================
    // LIVRAISONS
    // ========================================
    .addSubMenu(
      ui.createMenu('📋 Livraisons')
        .addItem('➕ Générer Livraisons', 'showGenerateDeliveriesForm')
        .addSeparator()
        .addItem('📊 Voir Toutes les Livraisons', 'viewAllDeliveries')
        .addItem('🔍 Rechercher Livraison', 'searchDelivery')
        .addSeparator()
        .addItem('🔄 Mettre à Jour Statuts', 'updateDeliveryStatuses')
    )

    // ========================================
    // ROUTES
    // ========================================
    .addSubMenu(
      ui.createMenu('🗺️ Routes')
        .addItem('📍 Planifier Routes', 'showPlanRoutesForm')
        .addItem('🛣️ Générer Étapes', 'showGenerateStopsForm')
        .addSeparator()
        .addItem('✉️ Envoyer Routes aux Bénévoles', 'sendRoutesToVolunteers')
        .addItem('🏷️ Générer Étiquettes', 'showGenerateLabelsForm')
        .addSeparator()
        .addItem('🔧 Réorganiser Étapes', 'showReorderStopsInterface')
        .addSeparator()
        .addItem('📊 Voir Toutes les Routes', 'viewAllRoutes')
    )

    // ========================================
    // CONFIGURATION
    // ========================================
    .addSubMenu(
      ui.createMenu('⚙️ Configuration')
        .addItem('🔑 Configurer API Keys', 'showApiKeysConfig')
        .addItem('📧 Configurer Emails', 'showEmailConfig')
        .addSeparator()
        .addItem('🏢 Adresse QG (Headquarters)', 'showHqAddressConfig')
        .addItem('🎛️ Paramètres Optimisation Routes', 'showRouteOptimizationConfig')
        .addSeparator()
        .addItem('📄 Templates Email', 'manageEmailTemplates')
    )

    // ========================================
    // SYNCHRONISATION
    // ========================================
    .addSubMenu(
      ui.createMenu('🔄 Synchronisation')
        .addItem('🔃 Actualiser Données APIs', 'refreshApiData')
        .addItem('🗑️ Vider le Cache', 'clearAllCache')
        .addSeparator()
        .addItem('🏓 Tester Connexion APIs', 'testApiConnections')
    )

    // ========================================
    // AIDE
    // ========================================
    .addSeparator()
    .addSubMenu(
      ui.createMenu('❓ Aide')
        .addItem('📖 Documentation', 'showDocumentation')
        .addItem('🔧 Initialiser Système', 'initializeSystem')
        .addItem('ℹ️ À Propos', 'showAbout')
    )

    .addToUi();

  Logger.log('[MENU] ✅ Menu créé avec succès');
}

/**
 * Fonction d'installation (à exécuter une seule fois)
 * Initialise le système :
 * - Crée les feuilles nécessaires
 * - Configure les propriétés par défaut
 * - Vérifie les APIs
 */
function initializeSystem() {
  const ui = SpreadsheetApp.getUi();

  const response = ui.alert(
    'Initialisation du Système',
    'Cette action va créer les feuilles nécessaires et initialiser la configuration.\n\n' +
    'Continuer ?',
    ui.ButtonSet.YES_NO
  );

  if (response !== ui.Button.YES) {
    return;
  }

  try {
    Logger.log('[INIT] 🚀 Démarrage de l\'initialisation...');

    // 1. Créer les feuilles
    createSheetIfNotExists(CONFIG.SHEETS.LIVRAISON, [
      'id_livraison', 'id_famille', 'id_quartier', 'adresse',
      'latitude', 'longitude', 'disponibilite_debut', 'disponibilite_fin',
      'nombre_personnes', 'statut', 'priorite', 'type_aide',
      'besoins_speciaux', 'date_creation', 'date_modification'
    ]);

    createSheetIfNotExists(CONFIG.SHEETS.ROUTES, [
      'id_route', 'id_benevole', 'id_binome', 'id_vehicule_prete',
      'date_debut', 'date_fin', 'occasion', 'statut',
      'distance_totale_km', 'poids_total_kg', 'relivre',
      'dossier_drive', 'date_creation', 'date_modification'
    ]);

    createSheetIfNotExists(CONFIG.SHEETS.ETAPES_ROUTE, [
      'id_etape', 'id_route', 'id_livraison', 'ordre_passage',
      'statut', 'heure_debut', 'heure_fin', 'commentaire'
    ]);

    createSheetIfNotExists(CONFIG.SHEETS.TOKENS, [
      'id_route', 'token', 'date_expiration', 'date_creation'
    ]);

    Logger.log('[INIT] ✅ Feuilles créées');

    // 2. Initialiser les propriétés par défaut
    initializeDefaultProperties();
    Logger.log('[INIT] ✅ Propriétés initialisées');

    // 3. Vérifier les APIs (si les clés sont configurées)
    if (isApiConfigured()) {
      Logger.log('[INIT] 🔍 Vérification des APIs...');
      logApiStatus();
      Logger.log('[INIT] ✅ APIs vérifiées');
    } else {
      Logger.log('[INIT] ⚠️ Clés API non configurées');
    }

    Logger.log('[INIT] ✅ Initialisation terminée avec succès');

    ui.alert(
      'Succès',
      'Le système a été initialisé avec succès !\n\n' +
      'Prochaines étapes :\n' +
      '1. Configurer les API Keys (Configuration > API Keys)\n' +
      '2. Vérifier l\'adresse du QG (Configuration > Adresse QG)\n' +
      '3. Tester les connexions APIs (Synchronisation > Tester Connexion)',
      ui.ButtonSet.OK
    );

  } catch (error) {
    Logger.log(`[INIT] ❌ Erreur: ${error.message}`);
    ui.alert(
      'Erreur',
      `Erreur lors de l'initialisation :\n${error.message}`,
      ui.ButtonSet.OK
    );
  }
}

// ========================================
// FONCTIONS DE NAVIGATION (PLACEHOLDERS)
// ========================================
// Ces fonctions seront implémentées dans les phases suivantes


function showGenerateDeliveriesForm() {
  // Vérifier que les APIs sont configurées
  if (!isApiConfigured()) {
    const ui = SpreadsheetApp.getUi();
    ui.alert(
      'Configuration Manquante',
      CONFIG.MESSAGES.ERROR_API_KEY_MISSING,
      ui.ButtonSet.OK
    );
    return;
  }

  const html = HtmlService.createHtmlOutputFromFile('ui/deliveryForm')
    .setWidth(850)
    .setHeight(700)
    .setTitle('📦 Générer des Livraisons');

  SpreadsheetApp.getUi().showModalDialog(html, 'Générer des Livraisons');
}

function viewAllDeliveries() {
  const ui = SpreadsheetApp.getUi();

  try {
    const stats = getDeliveryStatistics();

    let message = `📊 STATISTIQUES DES LIVRAISONS\n\n`;
    message += `Total : ${stats.total} livraisons\n\n`;

    message += `Par Statut :\n`;
    Object.entries(stats.byStatus).forEach(([status, count]) => {
      if (count > 0) {
        message += `  • ${status} : ${count}\n`;
      }
    });

    message += `\nTotal Personnes : ${stats.totalPersonnes}\n`;

    if (stats.averageDistance > 0) {
      message += `Distance Moyenne : ${stats.averageDistance} km\n`;
    }

    ui.alert('Statistiques des Livraisons', message, ui.ButtonSet.OK);

    // Naviguer vers la feuille Livraison
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEETS.LIVRAISON);
    if (sheet) {
      ss.setActiveSheet(sheet);
    }

  } catch (error) {
    ui.alert('Erreur', error.message, ui.ButtonSet.OK);
  }
}

function searchDelivery() {
  const ui = SpreadsheetApp.getUi();

  const response = ui.prompt(
    'Rechercher une Livraison',
    'Entrez l\'ID de la livraison (ex: L001) ou l\'ID de la famille :',
    ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() !== ui.Button.OK) {
    return;
  }

  const searchTerm = response.getResponseText().trim();

  if (!searchTerm) {
    ui.alert('Erreur', 'Veuillez entrer un ID de recherche', ui.ButtonSet.OK);
    return;
  }

  try {
    // Chercher d'abord par ID livraison
    let delivery = getDeliveryById(searchTerm);

    // Sinon chercher par ID famille
    if (!delivery) {
      const deliveries = filterData(CONFIG.SHEETS.LIVRAISON, function (row) {
        return row.id_famille === searchTerm;
      });

      if (deliveries.length > 0) {
        delivery = deliveries[0];
      }
    }

    if (!delivery) {
      ui.alert(
        'Introuvable',
        `Aucune livraison trouvée pour "${searchTerm}"`,
        ui.ButtonSet.OK
      );
      return;
    }

    // Afficher les détails
    let message = `📦 DÉTAILS DE LA LIVRAISON\n\n`;
    message += `ID Livraison : ${delivery.id_livraison}\n`;
    message += `Famille : ${delivery.id_famille}\n`;
    message += `Quartier : ${delivery.id_quartier}\n`;
    message += `Adresse : ${delivery.adresse}\n`;
    message += `Personnes : ${delivery.nombre_personnes}\n`;
    message += `Statut : ${delivery.statut}\n`;
    message += `Priorité : ${delivery.priorite}\n`;
    message += `Type : ${delivery.type_aide}\n`;

    if (delivery.besoins_speciaux) {
      message += `\nBesoins spéciaux :\n${delivery.besoins_speciaux}\n`;
    }

    ui.alert('Détails de la Livraison', message, ui.ButtonSet.OK);

    // Naviguer vers la ligne dans la feuille
    const sheet = getSheet(CONFIG.SHEETS.LIVRAISON);
    const rowIndex = delivery._rowIndex;
    if (rowIndex) {
      sheet.setActiveRange(sheet.getRange(rowIndex, 1, 1, sheet.getLastColumn()));
      SpreadsheetApp.getActiveSpreadsheet().setActiveSheet(sheet);
    }

  } catch (error) {
    ui.alert('Erreur', error.message, ui.ButtonSet.OK);
  }
}

function updateDeliveryStatuses() {
  const ui = SpreadsheetApp.getUi();

  const response = ui.alert(
    'Mettre à Jour les Statuts',
    'Cette fonction permet de synchroniser les statuts des livraisons.\n\n' +
    'Continuer ?',
    ui.ButtonSet.YES_NO
  );

  if (response !== ui.Button.YES) {
    return;
  }

  try {
    // Pour l'instant, juste afficher les statistiques
    const stats = countDeliveriesByStatus();

    let message = 'Statuts actuels :\n\n';
    Object.entries(stats).forEach(([status, count]) => {
      message += `${status} : ${count}\n`;
    });

    message += '\nLes statuts sont mis à jour automatiquement lors de la gestion des routes.';

    ui.alert('Statuts des Livraisons', message, ui.ButtonSet.OK);

  } catch (error) {
    ui.alert('Erreur', error.message, ui.ButtonSet.OK);
  }
}

function showPlanRoutesForm() {
  if (!isApiConfigured()) {
    const ui = SpreadsheetApp.getUi();
    ui.alert(
      'Configuration Manquante',
      CONFIG.MESSAGES.ERROR_API_KEY_MISSING,
      ui.ButtonSet.OK
    );
    return;
  }

  const html = HtmlService.createHtmlOutputFromFile('ui/routeForm')
    .setWidth(900)
    .setHeight(650)
    .setTitle('🗺️ Planifier les Routes');

  SpreadsheetApp.getUi().showModalDialog(html, 'Planifier les Routes');
}

function viewAllRoutes() {
  const ui = SpreadsheetApp.getUi();

  try {
    const routes = getAllDataAsObjects(CONFIG.SHEETS.ROUTES);

    if (routes.length === 0) {
      ui.alert('Aucune Route', 'Aucune route n\'a encore été créée.', ui.ButtonSet.OK);
      return;
    }

    // Compter par statut
    const byStatus = {};
    routes.forEach(r => {
      byStatus[r.statut] = (byStatus[r.statut] || 0) + 1;
    });

    let message = `📊 STATISTIQUES DES ROUTES\n\n`;
    message += `Total : ${routes.length} routes\n\n`;

    message += `Par Statut :\n`;
    Object.entries(byStatus).forEach(([status, count]) => {
      message += `  • ${status} : ${count}\n`;
    });

    ui.alert('Statistiques des Routes', message, ui.ButtonSet.OK);

    // Naviguer vers la feuille
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEETS.ROUTES);
    if (sheet) {
      ss.setActiveSheet(sheet);
    }

  } catch (error) {
    ui.alert('Erreur', error.message, ui.ButtonSet.OK);
  }
}

/**
 * Planifie les routes depuis le formulaire
 * @param {Object} params - Paramètres du formulaire
 * @returns {Object}
 */
function planRoutesFromForm(params) {
  try {
    Logger.log('[FORM] 📝 Planification depuis formulaire...');
    Logger.log(`[FORM] Paramètres: ${JSON.stringify(params)}`);

    const result = planRoutes(params);

    Logger.log(`[FORM] ✅ Planification terminée: ${result.created} routes créées`);

    return result;

  } catch (error) {
    Logger.log(`[FORM] ❌ Erreur: ${error.message}`);
    throw error;
  }
}


function showGenerateStopsForm() {
  const html = HtmlService.createHtmlOutputFromFile('ui/stopForm')
    .setWidth(850)
    .setHeight(700)
    .setTitle('🛣️ Générer les Étapes');

  SpreadsheetApp.getUi().showModalDialog(html, 'Générer les Étapes');
}

function sendRoutesToVolunteers() {
  const ui = SpreadsheetApp.getUi();

  const response = ui.alert(
    'Envoyer Routes',
    'Cette fonction enverra les itinéraires à tous les bénévoles dont les routes sont confirmées.\n\n' +
    'Continuer ?',
    ui.ButtonSet.YES_NO
  );

  if (response !== ui.Button.YES) {
    return;
  }

  try {
    const routes = filterData(CONFIG.SHEETS.ROUTES, row =>
      row.statut === CONFIG.ENUMS.STATUT_ROUTE.CONFIRMEE
    );

    if (routes.length === 0) {
      ui.alert('Aucune Route', 'Aucune route confirmée à envoyer.', ui.ButtonSet.OK);
      return;
    }

    ui.alert('Envoi Routes', `${routes.length} route(s) confirmée(s) trouvée(s).\nLes emails ont déjà été envoyés lors de la génération des étapes.`, ui.ButtonSet.OK);

  } catch (error) {
    ui.alert('Erreur', error.message, ui.ButtonSet.OK);
  }
}

function showReorderStopsInterface() {
  const ui = SpreadsheetApp.getUi();

  ui.alert(
    'Réorganiser Étapes',
    'Pour réorganiser les étapes d\'une route :\n\n' +
    '1. Allez dans la feuille "etapes_route"\n' +
    '2. Modifiez la colonne "ordre_passage"\n' +
    '3. Les changements seront automatiquement pris en compte\n\n' +
    'Astuce : Triez par id_route pour voir toutes les étapes d\'une même route',
    ui.ButtonSet.OK
  );

  // Naviguer vers la feuille
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEETS.ETAPES_ROUTE);
  if (sheet) {
    ss.setActiveSheet(sheet);
  }
}

/**
 * Récupère les routes en brouillon pour le formulaire
 * @returns {Array}
 */
function getDraftRoutesForForm() {
  try {
    const routes = getDraftRoutes();

    // Enrichir avec le nombre de livraisons
    return routes.map(route => {
      const deliveries = getDeliveriesForRoute(route.id_route);

      // Récupérer le nom du bénévole
      let benevoleNom = route.id_benevole;
      try {
        const benevole = getVolunteerById(route.id_benevole);
        if (benevole) {
          benevoleNom = `${benevole.prenom || ''} ${benevole.nom || ''}`.trim();
        }
      } catch (e) {
        // Ignorer erreur
      }

      return {
        id_route: route.id_route,
        id_benevole: route.id_benevole,
        benevole_nom: benevoleNom,
        distance_totale_km: route.distance_totale_km,
        poids_total_kg: route.poids_total_kg,
        nombre_livraisons: deliveries.length
      };
    });

  } catch (error) {
    Logger.log(`[FORM] ❌ Erreur récupération routes: ${error.message}`);
    return [];
  }
}

/**
 * Génère les étapes depuis le formulaire
 * @param {Array<string>} routeIds - IDs des routes
 * @returns {Object}
 */
function generateStopsFromForm(routeIds) {
  try {
    Logger.log('[FORM] 📝 Génération étapes depuis formulaire...');
    Logger.log(`[FORM] Routes sélectionnées: ${routeIds.join(', ')}`);

    const result = generateStops(routeIds);

    Logger.log(`[FORM] ✅ Génération terminée: ${result.processed} routes traitées`);

    return result;

  } catch (error) {
    Logger.log(`[FORM] ❌ Erreur: ${error.message}`);
    throw error;
  }
}


function showGenerateLabelsForm() {
  const html = HtmlService.createHtmlOutputFromFile('ui/labelForm')
    .setWidth(950)
    .setHeight(750)
    .setTitle('🏷️ Générer les Étiquettes');

  SpreadsheetApp.getUi().showModalDialog(html, 'Générer les Étiquettes');
}

/**
 * Récupère les routes confirmées pour les étiquettes
 * @returns {Array}
 */
function getConfirmedRoutesForLabels() {
  try {
    const validStatuts = [
      CONFIG.ENUMS.STATUT_ROUTE.CONFIRMEE,
      CONFIG.ENUMS.STATUT_ROUTE.EN_COURS
    ];

    const routes = filterData(CONFIG.SHEETS.ROUTES, row =>
      validStatuts.includes(row.statut)
    );

    // Enrichir avec le nombre de livraisons et personnes
    return routes.map(route => {
      const deliveries = getDeliveriesForRoute(route.id_route);
      const totalPersonnes = deliveries.reduce((sum, d) => sum + (d.nombre_personnes || 0), 0);

      return {
        id_route: route.id_route,
        nombre_livraisons: deliveries.length,
        total_personnes: totalPersonnes
      };
    });

  } catch (error) {
    Logger.log(`[FORM] ❌ Erreur récupération routes: ${error.message}`);
    return [];
  }
}

/**
 * Génère les étiquettes depuis le formulaire
 * @param {Object} params - Paramètres du formulaire
 * @returns {Object}
 */
function generateLabelsFromForm(params) {
  try {
    Logger.log('[FORM] 📝 Génération étiquettes depuis formulaire...');
    Logger.log(`[FORM] Paramètres: ${JSON.stringify(params)}`);

    const result = generateLabels(params);

    Logger.log(`[FORM] ✅ Génération terminée: ${result.processed} routes traitées`);

    return result;

  } catch (error) {
    Logger.log(`[FORM] ❌ Erreur: ${error.message}`);
    throw error;
  }
}

// ========================================
// CONFIGURATION
// ========================================

/**
 * Affiche le formulaire de configuration des API Keys
 */
function showApiKeysConfig() {
  const html = HtmlService.createHtmlOutputFromFile('ui/configApiKeys')
    .setWidth(600)
    .setHeight(500)
    .setTitle('🔑 Configuration des API Keys');

  SpreadsheetApp.getUi().showModalDialog(html, 'Configuration des API Keys');
}

/**
 * Affiche le formulaire de configuration des emails
 */
function showEmailConfig() {
  const html = HtmlService.createHtmlOutputFromFile('ui/configEmail')
    .setWidth(600)
    .setHeight(400)
    .setTitle('📧 Configuration Email');

  SpreadsheetApp.getUi().showModalDialog(html, 'Configuration Email');
}

/**
 * Affiche le formulaire de configuration du QG
 */
function showHqAddressConfig() {
  const html = HtmlService.createHtmlOutputFromFile('ui/configHq')
    .setWidth(600)
    .setHeight(400)
    .setTitle('🏢 Adresse du QG');

  SpreadsheetApp.getUi().showModalDialog(html, 'Adresse du QG');
}

/**
 * Affiche le formulaire de configuration de l'optimisation routes
 */
function showRouteOptimizationConfig() {
  const html = HtmlService.createHtmlOutputFromFile('ui/configRouteOptimization')
    .setWidth(700)
    .setHeight(600)
    .setTitle('🎛️ Paramètres Optimisation Routes');

  SpreadsheetApp.getUi().showModalDialog(html, 'Paramètres Optimisation Routes');
}

/**
 * Gestion des templates email
 */
function manageEmailTemplates() {
  showPlaceholder('Templates Email', 'Cette fonctionnalité sera disponible ultérieurement');
}

// ========================================
// SYNCHRONISATION
// ========================================

/**
 * Rafraîchit toutes les données des APIs
 */
function refreshApiData() {
  const ui = SpreadsheetApp.getUi();

  try {
    invalidateAllCache();
    ui.alert(
      'Succès',
      'Le cache a été vidé. Les prochaines requêtes récupéreront des données fraîches.',
      ui.ButtonSet.OK
    );
  } catch (error) {
    ui.alert('Erreur', error.message, ui.ButtonSet.OK);
  }
}

/**
 * Vide le cache
 */
function clearAllCache() {
  refreshApiData();
}

/**
 * Teste les connexions aux APIs
 */
function testApiConnections() {
  const ui = SpreadsheetApp.getUi();

  if (!isApiConfigured()) {
    ui.alert(
      'Configuration Manquante',
      CONFIG.MESSAGES.ERROR_API_KEY_MISSING,
      ui.ButtonSet.OK
    );
    return;
  }

  try {
    ui.alert(
      'Test en cours...',
      'Vérification de la connexion aux 3 APIs.\nCela peut prendre quelques secondes.',
      ui.ButtonSet.OK
    );

    const status = checkAllApis();

    let message = 'Résultats des tests :\n\n';

    for (const [apiName, apiStatus] of Object.entries(status.apis)) {
      const emoji = apiStatus.status === 'ok' ? '✅' : '❌';
      message += `${emoji} ${apiName.toUpperCase()}\n`;
      message += `   Status: ${apiStatus.status}\n`;
      if (apiStatus.version) {
        message += `   Version: ${apiStatus.version}\n`;
      }
      message += `   ${apiStatus.message}\n\n`;
    }

    ui.alert('Résultats des Tests', message, ui.ButtonSet.OK);

    // Aussi logger dans la console
    logApiStatus();

  } catch (error) {
    ui.alert(
      'Erreur',
      `Erreur lors du test des APIs :\n${error.message}`,
      ui.ButtonSet.OK
    );
  }
}

// ========================================
// AIDE
// ========================================

/**
 * Affiche la documentation
 */
function showDocumentation() {
  const ui = SpreadsheetApp.getUi();

  const message = `
${CONFIG.APP_NAME}
Version ${CONFIG.VERSION}

📖 DOCUMENTATION

Ce système permet de gérer les livraisons de l'association :
- Génération automatique des demandes de livraison
- Planification optimisée des routes
- Communication avec les bénévoles
- Suivi en temps réel

🔗 Pour plus d'informations :
Consultez le fichier README.md du projet

📧 Support :
${CONFIG.EMAIL.ADMIN_EMAIL}
  `;

  ui.alert('Documentation', message, ui.ButtonSet.OK);
}

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

// ========================================
// FONCTIONS POUR FORMULAIRE LIVRAISONS
// ========================================

/**
 * Récupère la liste des quartiers pour le formulaire
 * @returns {Array<Object>}
 */
function getQuartiersForDeliveryForm() {
  try {
    const response = getAllQuartiers();

    if (!response || !response.quartiers) {
      return [];
    }

    return response.quartiers.map(q => ({
      id: q.id,
      nom: q.nom
    }));

  } catch (error) {
    Logger.log(`[FORM] ❌ Erreur récupération quartiers: ${error.message}`);
    return [];
  }
}

/**
 * Génère des livraisons depuis le formulaire
 * @param {Object} filters - Filtres du formulaire
 * @returns {Object} Résultat de la génération
 */
function generateDeliveriesFromForm(filters) {
  try {
    Logger.log('[FORM] 📝 Génération depuis formulaire...');
    Logger.log(`[FORM] Filtres: ${JSON.stringify(filters)}`);

    const result = generateDeliveries(filters);

    Logger.log(`[FORM] ✅ Génération terminée: ${result.created} créées, ${result.skipped} ignorées`);

    return result;

  } catch (error) {
    Logger.log(`[FORM] ❌ Erreur: ${error.message}`);
    throw error;
  }
}
