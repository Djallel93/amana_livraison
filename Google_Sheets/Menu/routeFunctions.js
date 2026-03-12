/**
 * ====================================================================
 * MENU - FONCTIONS ROUTES
 * ====================================================================
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

  const html = HtmlService.createTemplateFromFile('ui/routeForm')
    .evaluate()
    .setWidth(1200)
    .setHeight(800)
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

function sendRoutesToVolunteers() {
  const html = HtmlService.createTemplateFromFile('ui/sendRoutesForm')
    .evaluate()
    .setWidth(1200)
    .setHeight(800)
    .setTitle('✉️ Envoyer les Itinéraires aux Bénévoles');

  SpreadsheetApp.getUi().showModalDialog(html, 'Envoyer les Itinéraires');
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

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEETS.ETAPES_ROUTE);
  if (sheet) {
    ss.setActiveSheet(sheet);
  }
}

/**
 * Régénère les liens Google Maps pour toutes les routes en statut Brouillon.
 */
function regenerateAllMapsLinks() {
  const ui = SpreadsheetApp.getUi();

  const confirm = ui.alert(
    'Régénérer les Liens Maps',
    'Cette action va régénérer les liens Google Maps pour toutes les routes en statut Brouillon.\n\nContinuer ?',
    ui.ButtonSet.YES_NO
  );

  if (confirm !== ui.Button.YES) return;

  try {
    Logger.log('[MAPS] 🗺️ Démarrage de la régénération des liens Maps...');

    const brouillonRoutes = filterData(
      CONFIG.SHEETS.ROUTES,
      row => normalizeStatut(row.statut) === CONFIG.ENUMS.STATUT_ROUTE.BROUILLON
    );

    if (brouillonRoutes.length === 0) {
      ui.alert('Aucune route', 'Aucune route en statut Brouillon trouvée.', ui.ButtonSet.OK);
      return;
    }

    const hqConfig = getCurrentHqConfig();
    if (!hqConfig || !hqConfig.lat || !hqConfig.lng) {
      ui.alert('Configuration manquante', 'Les coordonnées du QG ne sont pas configurées.\nVeuillez les configurer dans Configuration > Adresse QG.', ui.ButtonSet.OK);
      return;
    }

    const hqCoords = { lat: hqConfig.lat, lng: hqConfig.lng };
    let updated = 0, skipped = 0;
    const errors = [];

    for (const route of brouillonRoutes) {
      try {
        const routeId = route.id_route;
        const stops = getDeliveryStopsForRoute(routeId);
        if (stops.length === 0) { skipped++; continue; }

        const deliveriesOrdered = stops.map(stop => {
          const delivery = getDeliveryById(stop.id_livraison);
          if (!delivery) throw new Error(`Livraison ${stop.id_livraison} introuvable`);
          return delivery;
        });

        const newLienMaps = generateGoogleMapsLink(deliveriesOrdered, hqCoords);
        updateRowById(CONFIG.SHEETS.ROUTES, routeId, CONFIG.COLUMNS.ROUTES.ID_ROUTE, { lien_maps: newLienMaps, date_modification: getCurrentDateTime() });
        updated++;
      } catch (err) {
        errors.push(`Route ${route.id_route} : ${err.message}`);
      }
    }

    let summary = `✅ ${updated} lien(s) Maps régénéré(s) avec succès.`;
    if (skipped > 0) summary += `\n⏭️ ${skipped} route(s) ignorée(s) (aucun stop).`;
    if (errors.length > 0) summary += `\n\n❌ Erreurs :\n${errors.join('\n')}`;
    ui.alert('Régénération terminée', summary, ui.ButtonSet.OK);

  } catch (error) {
    ui.alert('Erreur', `Erreur lors de la régénération :\n${error.message}`, ui.ButtonSet.OK);
  }
}

/**
 * PHASE 5 - Génération des Étiquettes
 */
function showGenerateLabelsForm() {
  const html = HtmlService.createTemplateFromFile('ui/labelForm')
    .evaluate()
    .setWidth(1200)
    .setHeight(800)
    .setTitle('🏷️ Générer les Étiquettes');

  SpreadsheetApp.getUi().showModalDialog(html, 'Générer les Étiquettes');
}