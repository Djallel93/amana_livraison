/**
 * =====================================================================
 * CODE.GS - Point d'Entrée Principal
 * =====================================================================
 */

function onOpen() {
  const ui = SpreadsheetApp.getUi();

  ui.createMenu('📦 ' + CONFIG.APP_NAME)

    .addSubMenu(
      ui.createMenu('📋 Livraisons')
        .addItem('➕ Générer Livraisons', 'showGenerateDeliveriesForm')
        .addSeparator()
        .addItem('📊 Voir Toutes les Livraisons', 'viewAllDeliveries')
        .addItem('🔍 Rechercher Livraison', 'searchDelivery')
        .addSeparator()
        .addItem('🔄 Mettre à Jour Statuts', 'updateDeliveryStatuses')
        .addSeparator()
        .addItem('📦 Feuille de Conditionnement', 'showPackagingForm')
    )

    .addSubMenu(
      ui.createMenu('🗺️ Routes')
        .addItem('📍 Planifier Routes', 'showPlanRoutesForm')
        .addSeparator()
        .addItem('✉️ Envoyer Routes aux Bénévoles', 'sendRoutesToVolunteers')
        .addItem('🏷️ Générer Étiquettes', 'showGenerateLabelsForm')
        .addSeparator()
        .addItem('🔧 Réorganiser Étapes', 'showReorderStopsInterface')
        .addItem('🗺️ Régénérer Liens Maps', 'regenerateAllMapsLinks')
        .addSeparator()
        .addItem('📊 Voir Toutes les Routes', 'viewAllRoutes')
    )

    .addSubMenu(
      ui.createMenu('⚙️ Configuration')
        .addItem('🔑 Configurer API Keys', 'showApiKeysConfig')
        .addItem('📧 Configurer Emails', 'showEmailConfig')
        .addSeparator()
        .addItem('🏢 Adresse QG (Headquarters)', 'showHqAddressConfig')
        .addItem('🎛️ Paramètres Optimisation Routes', 'showRouteOptimizationConfig')
        .addSeparator()
        .addItem('🚗 Gérer Véhicules Temporaires', 'ouvrirGestionVehiculesTmp')
        .addSeparator()
        .addItem('📊 Statistiques', 'showStatisticsForm')
    )

    .addSubMenu(
      ui.createMenu('🔄 Synchronisation')
        .addItem('🔃 Actualiser Données APIs', 'refreshApiData')
        .addItem('🗑️ Vider le Cache', 'clearAllCache')
        .addSeparator()
        .addItem('🏓 Tester Connexion APIs', 'testApiConnections')
    )

    .addSeparator()
    .addSubMenu(
      ui.createMenu('❓ Aide')
        .addItem('📖 Documentation', 'showDocumentation')
        .addItem('ℹ️ À Propos', 'showAbout')
    )

    .addToUi();

  Logger.log('[MENU] ✅ Menu créé avec succès');
}