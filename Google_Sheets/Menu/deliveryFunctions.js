/**
 * ====================================================================
 * MENU - FONCTIONS LIVRAISONS
 * ====================================================================
 */

function showGenerateDeliveriesForm() {
  if (!isApiConfigured()) {
    SpreadsheetApp.getUi().alert(
      "Configuration Manquante",
      CONFIG.MESSAGES.ERROR_API_KEY_MISSING,
      SpreadsheetApp.getUi().ButtonSet.OK,
    );
    return;
  }

  const html = HtmlService.createTemplateFromFile("ui/deliveryForm")
    .evaluate()
    .setWidth(1200)
    .setHeight(800)
    .setTitle("📦 Générer des Livraisons");

  SpreadsheetApp.getUi().showModalDialog(html, "Générer des Livraisons");
}

function viewAllDeliveries() {
  const ui = SpreadsheetApp.getUi();

  try {
    const stats = getDeliveryStatistics();

    let message = `📊 STATISTIQUES DES LIVRAISONS\n\n`;
    message += `Total : ${stats.total} livraisons\n\n`;
    message += `Par Statut :\n`;

    Object.entries(stats.byStatus).forEach(([status, count]) => {
      if (count > 0) message += `  • ${status} : ${count}\n`;
    });

    message += `\nTotal Personnes : ${stats.totalPersonnes}\n`;

    if (stats.averageDistance > 0) {
      message += `Distance Moyenne : ${stats.averageDistance} km\n`;
    }

    ui.alert("Statistiques des Livraisons", message, ui.ButtonSet.OK);

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEETS.LIVRAISON);
    if (sheet) ss.setActiveSheet(sheet);
  } catch (error) {
    ui.alert("Erreur", error.message, ui.ButtonSet.OK);
  }
}

function searchDelivery() {
  const ui = SpreadsheetApp.getUi();

  const response = ui.prompt(
    "Rechercher une Livraison",
    "Entrez l'ID de la livraison (ex: L001) ou l'ID de la famille :",
    ui.ButtonSet.OK_CANCEL,
  );

  if (response.getSelectedButton() !== ui.Button.OK) return;

  const searchTerm = response.getResponseText().trim();

  if (!searchTerm) {
    ui.alert("Erreur", "Veuillez entrer un ID de recherche", ui.ButtonSet.OK);
    return;
  }

  try {
    let delivery = getDeliveryById(searchTerm);

    if (!delivery) {
      const deliveries = filterData(CONFIG.SHEETS.LIVRAISON, function (row) {
        return row.id_famille === searchTerm;
      });
      if (deliveries.length > 0) delivery = deliveries[0];
    }

    if (!delivery) {
      ui.alert(
        "Introuvable",
        `Aucune livraison trouvée pour "${searchTerm}"`,
        ui.ButtonSet.OK,
      );
      return;
    }

    let message = `📦 DÉTAILS DE LA LIVRAISON\n\n`;
    message += `ID Livraison : ${delivery.id_livraison}\n`;
    message += `Famille : ${delivery.id_famille}\n`;
    message += `Quartier : ${delivery.id_quartier}\n`;
    message += `Adresse : ${delivery.adresse}\n`;
    message += `Personnes : ${delivery.nombre_personnes}\n`;
    message += `Avec enfant : ${delivery.avec_enfant ? "Oui" : "Non"}\n`;
    message += `Statut : ${delivery.statut}\n`;
    message += `Conditionnement : ${delivery.statut_conditionnement || "En attente"}\n`;
    message += `Priorité : ${delivery.priorite}\n`;
    message += `Type : ${delivery.type_aide}\n`;

    if (delivery.besoins_speciaux) {
      message += `\nBesoins spéciaux :\n${delivery.besoins_speciaux}\n`;
    }

    ui.alert("Détails de la Livraison", message, ui.ButtonSet.OK);

    const sheet = getSheet(CONFIG.SHEETS.LIVRAISON);
    const rowIndex = delivery._rowIndex;
    if (rowIndex) {
      sheet.setActiveRange(
        sheet.getRange(rowIndex, 1, 1, sheet.getLastColumn()),
      );
      SpreadsheetApp.getActiveSpreadsheet().setActiveSheet(sheet);
    }
  } catch (error) {
    ui.alert("Erreur", error.message, ui.ButtonSet.OK);
  }
}

function updateDeliveryStatuses() {
  const ui = SpreadsheetApp.getUi();

  const response = ui.alert(
    "Mettre à Jour les Statuts",
    "Cette fonction permet de synchroniser les statuts des livraisons.\n\nContinuer ?",
    ui.ButtonSet.YES_NO,
  );

  if (response !== ui.Button.YES) return;

  try {
    const stats = countDeliveriesByStatus();

    let message = "Statuts actuels :\n\n";
    Object.entries(stats).forEach(([status, count]) => {
      message += `${status} : ${count}\n`;
    });

    message +=
      "\nLes statuts sont mis à jour automatiquement lors de la gestion des routes.";
    ui.alert("Statuts des Livraisons", message, ui.ButtonSet.OK);
  } catch (error) {
    ui.alert("Erreur", error.message, ui.ButtonSet.OK);
  }
}

/**
 * Ouvre le formulaire de génération de la feuille de conditionnement.
 */
function showPackagingForm() {
  const html = HtmlService.createTemplateFromFile("ui/packagingForm")
    .evaluate()
    .setWidth(1200)
    .setHeight(800)
    .setTitle("📦 Feuille de Préparation");

  SpreadsheetApp.getUi().showModalDialog(html, "Feuille de Préparation");
}

/**
 * Appelé depuis le formulaire HTML pour lancer la génération.
 * @param {Object} params - { date, occasion }
 * @returns {Object}
 */
function generatePackagingSheetFromForm(params) {
  try {
    Logger.log(
      `[MENU] 📦 Génération feuille conditionnement: ${JSON.stringify(params)}`,
    );
    return generatePackagingSheet(params);
  } catch (error) {
    Logger.log(`[MENU] ❌ Erreur: ${error.message}`);
    throw error;
  }
}

function getQuartiersForDeliveryForm() {
  try {
    const response = getAllQuartiers();

    if (!response || !response.quartiers) {
      return [];
    }

    return response.quartiers.map((q) => ({
      id: q.id,
      nom: q.nom,
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
    Logger.log("[FORM] 📝 Génération depuis formulaire...");
    Logger.log(`[FORM] Filtres: ${JSON.stringify(filters)}`);

    const result = generateDeliveries(filters);

    // Strip heavy deliveries array before sending back to UI
    const { deliveries, ...lightResult } = result;

    Logger.log(
      `[FORM] ✅ Génération terminée: ${lightResult.created} créées, ${lightResult.skipped} ignorées`,
    );

    return lightResult;
  } catch (error) {
    Logger.log(`[FORM] ❌ Erreur: ${error.message}`);
    throw error;
  }
}
