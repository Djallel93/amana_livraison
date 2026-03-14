/**
 * ====================================================================
 * MENU - FONCTIONS SYSTÈME
 * ====================================================================
 * Fonctions Synchronisation et Aide
 */

/**
 * Inclut un fichier HTML (pour les styles partagés)
 * @param {string} filename
 * @returns {string}
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
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
  const html = HtmlService.createTemplateFromFile('ui/configApiKeys')
    .evaluate()
    .setWidth(600)
    .setHeight(560)
    .setTitle('🔑 Configuration des API Keys');

  SpreadsheetApp.getUi().showModalDialog(html, 'Configuration des API Keys');
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