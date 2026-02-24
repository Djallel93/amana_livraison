/**
 * ====================================================================
 * MENU - FONCTIONS LIVRAISONS
 * ====================================================================
 */

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

/**
 * PHASE 3 - Planification des Routes
 */
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
    .setWidth(700)
    .setHeight(900)
    .setTitle('🗺️ Planifier les Routes');

  SpreadsheetApp.getUi().showModalDialog(html, 'Planifier les Routes');
}