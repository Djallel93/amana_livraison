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
        .addItem('🗺️ Régénérer Liens Maps', 'regenerateAllMapsLinks')  // ← NOUVEAU
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
        .addSeparator()                                                         // ← AJOUT
        .addItem('🚗 Gérer Véhicules Temporaires', 'ouvrirGestionVehiculesTmp') // ← AJOUT
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
        .addItem('ℹ️ À Propos', 'showAbout')
    )

    .addToUi();

  Logger.log('[MENU] ✅ Menu créé avec succès');
}