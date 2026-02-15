/**
 * =====================================================================
 * CODE.GS - Point d'Entrée Principal
 * =====================================================================
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
        // .addSeparator()
        // .addItem('📄 Templates Email', 'manageEmailTemplates')
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
