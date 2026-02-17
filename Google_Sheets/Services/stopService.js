/**
 * ====================================================================
 * STOP_SERVICE.GS - Service de Génération des Étapes de Route
 * ====================================================================
 * Gère la création et l'optimisation des étapes (stops) pour les routes
 * 
 * ⚠️ MODIFICATION: Ajout génération lien Google Maps après optimisation TSP
 */

/**
 * Génère les étapes pour une route après optimisation TSP
 * @param {string} routeId - ID de la route
 * @returns {Object} Résultat avec nombre d'étapes créées
 */
function generateStepsForRoute(routeId) {
  try {
    Logger.log(`[STOPS] 🚀 Génération étapes pour route ${routeId}`);

    // 1. Récupérer les données de la route
    const routeData = getRouteById(routeId);
    if (!routeData) {
      throw new Error(`Route ${routeId} introuvable`);
    }

    // 2. Récupérer les livraisons assignées à cette route
    const deliveries = getDeliveriesForRoute(routeId);
    if (!deliveries || deliveries.length === 0) {
      throw new Error(`Aucune livraison trouvée pour la route ${routeId}`);
    }

    Logger.log(`[STOPS] 📦 ${deliveries.length} livraisons à optimiser`);

    // 3. Récupérer les coordonnées du QG
    const hqCoords = getHQCoordinates();
    if (!hqCoords) {
      throw new Error('Coordonnées du QG non configurées');
    }

    // 4. Optimiser l'ordre des livraisons avec TSP
    Logger.log('[STOPS] 🔄 Optimisation TSP en cours...');
    const optimizedOrder = optimizeRouteTSP(deliveries, hqCoords);

    // 5. Réorganiser les livraisons selon l'ordre optimisé
    const orderedDeliveries = optimizedOrder.map(index => deliveries[index]);

    // 6. ✨ NOUVEAU: Générer le lien Google Maps avec l'ordre optimisé
    Logger.log('[STOPS] 🗺️ Génération du lien Google Maps...');
    const mapsUrl = generateGoogleMapsUrl(orderedDeliveries, hqCoords);

    // 7. ✨ NOUVEAU: Mettre à jour la colonne lien_maps dans la feuille routes
    updateRouteMapsLink(routeId, mapsUrl);
    Logger.log(`[STOPS] ✅ Lien Maps enregistré: ${mapsUrl.substring(0, 80)}...`);

    // 8. Supprimer les anciennes étapes de cette route
    deleteStepsForRoute(routeId);

    // 9. Créer les nouvelles étapes dans l'ordre optimisé
    const stepsSheet = getSheet(CONFIG_SHEETS.SHEETS.ETAPES_ROUTE);
    let stepsCreated = 0;

    orderedDeliveries.forEach((delivery, index) => {
      const stepData = {
        id_etape: generateStepId(),
        id_route: routeId,
        id_livraison: delivery.id_livraison,
        ordre_passage: index + 1,
        statut: CONFIG_SHEETS.ENUMS.STATUT_ETAPE.EN_ATTENTE,
        heure_debut: '',
        heure_fin: '',
        commentaire: ''
      };

      const rowData = [
        stepData.id_etape,
        stepData.id_route,
        stepData.id_livraison,
        stepData.ordre_passage,
        stepData.statut,
        stepData.heure_debut,
        stepData.heure_fin,
        stepData.commentaire
      ];

      stepsSheet.appendRow(rowData);
      stepsCreated++;
    });

    Logger.log(`[STOPS] ✅ ${stepsCreated} étapes créées et optimisées`);

    return {
      success: true,
      stepsCreated: stepsCreated,
      mapsUrl: mapsUrl
    };

  } catch (error) {
    Logger.log(`[STOPS] ❌ Erreur génération étapes: ${error.message}`);
    throw error;
  }
}

/**
 * ✨ NOUVELLE FONCTION: Met à jour le lien Maps dans la feuille routes
 * @param {string} routeId - ID de la route
 * @param {string} mapsUrl - URL Google Maps
 */
function updateRouteMapsLink(routeId, mapsUrl) {
  try {
    const sheet = getSheet(CONFIG_SHEETS.SHEETS.ROUTES);
    const routeRow = findRouteRow(routeId);

    if (!routeRow) {
      throw new Error(`Route ${routeId} introuvable dans la feuille`);
    }

    // Écrire le lien Maps dans la colonne LIEN_MAPS (colonne 12)
    sheet.getRange(routeRow, CONFIG_SHEETS.COLUMNS.ROUTES.LIEN_MAPS).setValue(mapsUrl);

    Logger.log(`[STOPS] 📝 Lien Maps mis à jour pour route ${routeId}`);

  } catch (error) {
    Logger.log(`[STOPS] ⚠️ Erreur mise à jour lien Maps: ${error.message}`);
    throw error;
  }
}

/**
 * Trouve la ligne d'une route dans la feuille routes
 * @param {string} routeId - ID de la route
 * @returns {number|null} Numéro de ligne ou null
 */
function findRouteRow(routeId) {
  const sheet = getSheet(CONFIG_SHEETS.SHEETS.ROUTES);
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) { // Skip header
    if (data[i][CONFIG_SHEETS.COLUMNS.ROUTES.ID_ROUTE - 1] === routeId) {
      return i + 1; // Retourner le numéro de ligne (1-indexed)
    }
  }

  return null;
}

/**
 * Récupère les données d'une route par son ID
 * @param {string} routeId - ID de la route
 * @returns {Object|null} Données de la route
 */
function getRouteById(routeId) {
  const sheet = getSheet(CONFIG_SHEETS.SHEETS.ROUTES);
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row[CONFIG_SHEETS.COLUMNS.ROUTES.ID_ROUTE - 1] === routeId) {
      return {
        id_route: row[CONFIG_SHEETS.COLUMNS.ROUTES.ID_ROUTE - 1],
        id_benevole: row[CONFIG_SHEETS.COLUMNS.ROUTES.ID_BENEVOLE - 1],
        statut: row[CONFIG_SHEETS.COLUMNS.ROUTES.STATUT - 1],
        occasion: row[CONFIG_SHEETS.COLUMNS.ROUTES.OCCASION - 1]
      };
    }
  }

  return null;
}

/**
 * Récupère les livraisons assignées à une route
 * @param {string} routeId - ID de la route
 * @returns {Array<Object>} Livraisons avec coordonnées
 */
function getDeliveriesForRoute(routeId) {
  const sheet = getSheet(CONFIG_SHEETS.SHEETS.LIVRAISON);
  const data = sheet.getDataRange().getValues();
  const deliveries = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    // Logique de filtrage des livraisons pour cette route
    // (à adapter selon votre structure de données)
    deliveries.push({
      id_livraison: row[CONFIG_SHEETS.COLUMNS.LIVRAISON.ID_LIVRAISON - 1],
      adresse: row[CONFIG_SHEETS.COLUMNS.LIVRAISON.ADRESSE - 1],
      latitude: row[CONFIG_SHEETS.COLUMNS.LIVRAISON.LATITUDE - 1],
      longitude: row[CONFIG_SHEETS.COLUMNS.LIVRAISON.LONGITUDE - 1]
    });
  }

  return deliveries;
}

/**
 * Récupère les coordonnées du QG depuis la configuration
 * @returns {Object} Coordonnées {lat, lng, adresse}
 */
function getHQCoordinates() {
  const props = PropertiesService.getScriptProperties();
  const hqLat = props.getProperty('HQ_LATITUDE');
  const hqLng = props.getProperty('HQ_LONGITUDE');
  const hqAddress = props.getProperty('HQ_ADDRESS');

  if (!hqLat || !hqLng) {
    return null;
  }

  return {
    lat: parseFloat(hqLat),
    lng: parseFloat(hqLng),
    adresse: hqAddress || 'QG Association'
  };
}

/**
 * Supprime les étapes existantes d'une route
 * @param {string} routeId - ID de la route
 */
function deleteStepsForRoute(routeId) {
  const sheet = getSheet(CONFIG_SHEETS.SHEETS.ETAPES_ROUTE);
  const data = sheet.getDataRange().getValues();

  // Parcourir de bas en haut pour éviter les problèmes d'index
  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][1] === routeId) { // Colonne ID_ROUTE
      sheet.deleteRow(i + 1);
    }
  }

  Logger.log(`[STOPS] 🗑️ Anciennes étapes supprimées pour route ${routeId}`);
}

/**
 * Génère un ID unique pour une étape
 * @returns {string} ID étape (format: STEP_YYYYMMDD_XXX)
 */
function generateStepId() {
  const timestamp = Utilities.formatDate(new Date(), 'Europe/Paris', 'yyyyMMdd_HHmmss');
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `STEP_${timestamp}_${random}`;
}

/**
 * Affiche le formulaire de génération d'étapes
 */
function showStopGenerationForm() {
  const html = HtmlService.createHtmlOutputFromFile('ui/stopForm')
    .setWidth(600)
    .setHeight(400);
  SpreadsheetApp.getUi().showModalDialog(html, '🚦 Générer les Étapes de Route');
}

/**
 * Génère les étapes depuis le formulaire
 * @param {Object} formData - Données du formulaire
 * @returns {Object} Résultat de la génération
 */
function generateStepsFromForm(formData) {
  try {
    const routeId = formData.routeId;

    if (!routeId) {
      throw new Error('ID de route manquant');
    }

    const result = generateStepsForRoute(routeId);

    return {
      success: true,
      message: `✅ ${result.stepsCreated} étapes créées et optimisées`,
      mapsUrl: result.mapsUrl
    };

  } catch (error) {
    Logger.log(`[STOPS] ❌ Erreur formulaire: ${error.message}`);
    return {
      success: false,
      message: `❌ Erreur: ${error.message}`
    };
  }
}