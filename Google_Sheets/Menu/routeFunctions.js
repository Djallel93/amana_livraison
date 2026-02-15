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
 * PHASE 5 - Génération des Étiquettes
 */
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