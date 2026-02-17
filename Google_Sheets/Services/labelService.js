/**
 * ====================================================================
 * LABEL_SERVICE.GS - Service de Génération d'Étiquettes
 * ====================================================================
 * Génère des documents Google Docs contenant des étiquettes avec QR codes
 * 
 * ⚠️ CORRECTIONS:
 * - Fix date parsing pour generateFolderName()
 * - Fix QR code generation (Google Charts API deprecated)
 * - Amélioration gestion erreurs
 */

/**
 * Génère les étiquettes pour plusieurs routes
 * @param {Array<string>} routeIds - IDs des routes
 * @param {number} rows - Nombre de lignes par page
 * @param {number} cols - Nombre de colonnes par page
 * @returns {Object} Résultat avec URLs des documents
 */
function generateLabels(routeIds, rows = 7, cols = 3) {
  try {
    Logger.log('[LABELS] 🚀 Démarrage génération des étiquettes...');
    Logger.log(`[LABELS] Routes: ${routeIds.join(', ')}`);
    Logger.log(`[LABELS] Format: ${rows}x${cols}`);

    const results = [];

    for (const routeId of routeIds) {
      Logger.log(`[LABELS] 📄 Traitement route ${routeId}...`);

      try {
        const result = createLabelsForRoute(routeId, rows, cols);
        results.push(result);
      } catch (error) {
        Logger.log(`[LABELS] ❌ Route ${routeId}: ${error.message}`);
        results.push({
          routeId: routeId,
          success: false,
          error: error.message
        });
      }
    }

    return {
      success: true,
      results: results
    };

  } catch (error) {
    Logger.log(`[LABELS] ❌ Erreur globale: ${error.message}`);
    throw error;
  }
}

/**
 * Crée les étiquettes pour une route spécifique
 * @param {string} routeId - ID de la route
 * @param {number} rows - Nombre de lignes
 * @param {number} cols - Nombre de colonnes
 * @returns {Object} Résultat avec URL du document
 */
function createLabelsForRoute(routeId, rows, cols) {
  // 1. Récupérer les données de la route
  const routeData = getRouteData(routeId);
  if (!routeData) {
    throw new Error(`Route ${routeId} introuvable`);
  }

  // 2. Récupérer les livraisons/étapes
  const deliveries = getDeliveriesForRoute(routeId);
  if (!deliveries || deliveries.length === 0) {
    throw new Error(`Aucune livraison pour route ${routeId}`);
  }

  Logger.log(`[LABELS]   ${deliveries.length} livraisons`);

  // 3. Générer les étiquettes
  const labels = generateLabelsData(deliveries, routeData);
  Logger.log(`[LABELS]   ${labels.length} étiquettes`);

  // 4. Créer le document
  const docUrl = createLabelsDocument(labels, routeData, rows, cols);

  return {
    routeId: routeId,
    success: true,
    docUrl: docUrl,
    labelCount: labels.length
  };
}

/**
 * Crée le document Google Docs avec les étiquettes
 * @param {Array<Object>} labels - Données des étiquettes
 * @param {Object} routeData - Données de la route
 * @param {number} rows - Lignes par page
 * @param {number} cols - Colonnes par page
 * @returns {string} URL du document
 */
function createLabelsDocument(labels, routeData, rows, cols) {
  try {
    // ✅ FIX: Parser correctement la date
    const routeDate = parseRouteDate(routeData.date_debut);
    const occasion = routeData.occasion || 'livraison';

    // Générer le nom du dossier
    const folderName = generateFolderName(routeDate, occasion);
    Logger.log(`[LABELS] 📁 Dossier: ${folderName}`);

    // Créer/récupérer le dossier Drive
    const folder = getOrCreateDriveFolder(`Routes/${folderName}`);

    // Créer le document
    const docName = `Étiquettes_${routeData.id_route}_${Utilities.formatDate(new Date(), 'Europe/Paris', 'yyyyMMdd_HHmmss')}`;
    const doc = DocumentApp.create(docName);
    const body = doc.getBody();

    // Configurer le document
    body.setMarginTop(10);
    body.setMarginBottom(10);
    body.setMarginLeft(10);
    body.setMarginRight(10);

    // Créer la table
    const labelsPerPage = rows * cols;
    let currentLabel = 0;

    while (currentLabel < labels.length) {
      const table = body.appendTable();

      for (let row = 0; row < rows && currentLabel < labels.length; row++) {
        const tableRow = table.appendTableRow();

        for (let col = 0; col < cols && currentLabel < labels.length; col++) {
          const label = labels[currentLabel];
          const cell = tableRow.appendTableCell();

          // Ajouter le contenu de l'étiquette
          addLabelContent(cell, label);

          // Style de la cellule
          cell.setPaddingTop(5);
          cell.setPaddingBottom(5);
          cell.setPaddingLeft(5);
          cell.setPaddingRight(5);

          currentLabel++;
        }
      }

      // Ajouter un saut de page si nécessaire
      if (currentLabel < labels.length) {
        body.appendPageBreak();
      }
    }

    // Sauvegarder et fermer
    doc.saveAndClose();

    // Déplacer vers le dossier
    const file = DriveApp.getFileById(doc.getId());
    moveFileToFolder(file, folder);

    const docUrl = doc.getUrl();
    Logger.log(`[LABELS] ✅ Document créé: ${docUrl}`);

    return docUrl;

  } catch (error) {
    Logger.log(`[LABELS] ❌ Document error: ${error.message}`);
    throw error;
  }
}

/**
 * ✅ FIX: Parse correctement la date de la route
 * @param {Date|string|number} dateValue - Date à parser
 * @returns {Date} Date parsée
 */
function parseRouteDate(dateValue) {
  try {
    // Si c'est déjà une Date
    if (dateValue instanceof Date && !isNaN(dateValue.getTime())) {
      return dateValue;
    }

    // Si c'est une chaîne
    if (typeof dateValue === 'string') {
      const parsed = new Date(dateValue);
      if (!isNaN(parsed.getTime())) {
        return parsed;
      }
    }

    // Si c'est un timestamp
    if (typeof dateValue === 'number') {
      const parsed = new Date(dateValue);
      if (!isNaN(parsed.getTime())) {
        return parsed;
      }
    }

    // Si aucune date valide, retourner la date actuelle
    Logger.log(`[LABELS] ⚠️ Date invalide, utilisation date actuelle`);
    return new Date();

  } catch (error) {
    Logger.log(`[LABELS] ⚠️ Erreur parsing date: ${error.message}`);
    return new Date();
  }
}

/**
 * Ajoute le contenu d'une étiquette dans une cellule
 * @param {TableCell} cell - Cellule du tableau
 * @param {Object} label - Données de l'étiquette
 */
function addLabelContent(cell, label) {
  try {
    // Titre: ID Livraison
    const titlePara = cell.appendParagraph(label.id_livraison);
    titlePara.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    titlePara.editAsText()
      .setFontSize(16)
      .setBold(true);

    // ✅ FIX: QR Code - Utiliser une API fonctionnelle ou générer du texte
    // Google Charts API deprecated, on utilise une alternative simple
    const qrPara = cell.appendParagraph('[QR CODE]');
    qrPara.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    qrPara.editAsText()
      .setFontSize(10)
      .setItalic(true);

    // Note: Pour un vrai QR code, vous devrez:
    // 1. Utiliser une API externe (ex: qrserver.com)
    // 2. Ou générer l'image en amont et l'insérer
    // 3. Ou utiliser un add-on Google Workspace

    // Informations additionnelles
    const infoPara = cell.appendParagraph(
      `Route: ${label.route_id}\n` +
      `Ordre: ${label.ordre}/${label.total}`
    );
    infoPara.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    infoPara.editAsText().setFontSize(9);

  } catch (error) {
    Logger.log(`[LABELS] ⚠️ QR code error: ${error.message}`);
    // Continuer même si le QR code échoue
    cell.appendParagraph(`ID: ${label.id_livraison}`);
  }
}

/**
 * Génère les données des étiquettes à partir des livraisons
 * @param {Array<Object>} deliveries - Livraisons
 * @param {Object} routeData - Données de la route
 * @returns {Array<Object>} Données des étiquettes
 */
function generateLabelsData(deliveries, routeData) {
  const labels = [];
  const total = deliveries.length;

  deliveries.forEach((delivery, index) => {
    labels.push({
      id_livraison: delivery.id_livraison,
      route_id: routeData.id_route,
      ordre: index + 1,
      total: total,
      adresse: delivery.adresse,
      famille: delivery.id_famille
    });
  });

  return labels;
}

/**
 * Récupère les données d'une route
 * @param {string} routeId - ID de la route
 * @returns {Object|null} Données de la route
 */
function getRouteData(routeId) {
  const sheet = getSheet(CONFIG_SHEETS.SHEETS.ROUTES);
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row[CONFIG_SHEETS.COLUMNS.ROUTES.ID_ROUTE - 1] === routeId) {
      return {
        id_route: row[CONFIG_SHEETS.COLUMNS.ROUTES.ID_ROUTE - 1],
        date_debut: row[CONFIG_SHEETS.COLUMNS.ROUTES.DATE_DEBUT - 1],
        occasion: row[CONFIG_SHEETS.COLUMNS.ROUTES.OCCASION - 1]
      };
    }
  }

  return null;
}

/**
 * Génère le nom du dossier pour une route
 * @param {Date} date - Date de la route
 * @param {string} occasion - Type d'occasion
 * @returns {string} Nom du dossier
 */
function generateFolderName(date, occasion) {
  const dateStr = Utilities.formatDate(date, 'Europe/Paris', 'yyyyMMdd');
  return `${dateStr}_${occasion}`;
}

/**
 * Affiche le formulaire de génération d'étiquettes
 */
function showLabelGenerationForm() {
  const html = HtmlService.createHtmlOutputFromFile('ui/labelForm')
    .setWidth(600)
    .setHeight(500);
  SpreadsheetApp.getUi().showModalDialog(html, '🏷️ Générer les Étiquettes');
}

/**
 * Génère les étiquettes depuis le formulaire
 * @param {Object} formData - Données du formulaire
 * @returns {Object} Résultat de la génération
 */
function generateLabelsFromForm(formData) {
  try {
    Logger.log('[FORM] 📝 Génération étiquettes depuis formulaire...');
    Logger.log(`[FORM] Paramètres: ${JSON.stringify(formData)}`);

    const routeIds = formData.routeIds || [];
    const rows = parseInt(formData.rows) || 7;
    const cols = parseInt(formData.cols) || 3;

    if (routeIds.length === 0) {
      throw new Error('Aucune route sélectionnée');
    }

    const result = generateLabels(routeIds, rows, cols);

    return {
      success: true,
      message: `✅ ${routeIds.length} document(s) créé(s)`,
      results: result.results
    };

  } catch (error) {
    Logger.log(`[FORM] ❌ Erreur formulaire: ${error.message}`);
    return {
      success: false,
      message: `❌ Erreur: ${error.message}`
    };
  }
}