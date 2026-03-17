/**
 * ====================================================================
 * MENU - FONCTIONS ROUTES
 * ====================================================================
 */

function showPlanRoutesForm() {
  if (!isApiConfigured()) {
    const ui = SpreadsheetApp.getUi();
    ui.alert('Configuration Manquante', CONFIG.MESSAGES.ERROR_API_KEY_MISSING, ui.ButtonSet.OK);
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
      ui.alert('Aucune Route', "Aucune route n'a encore été créée.", ui.ButtonSet.OK);
      return;
    }

    const byStatus = {};
    routes.forEach(r => { byStatus[r.statut] = (byStatus[r.statut] || 0) + 1; });

    let message = `📊 STATISTIQUES DES ROUTES\n\nTotal : ${routes.length} routes\n\nPar Statut :\n`;
    Object.entries(byStatus).forEach(([status, count]) => {
      message += `  • ${status} : ${count}\n`;
    });

    ui.alert('Statistiques des Routes', message, ui.ButtonSet.OK);

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEETS.ROUTES);
    if (sheet) ss.setActiveSheet(sheet);

  } catch (error) {
    ui.alert('Erreur', error.message, ui.ButtonSet.OK);
  }
}

/**
 * Planifie les routes depuis le formulaire.
 */
function planRoutesFromForm(params) {
  try {
    Logger.log('[FORM] Planification depuis formulaire…');
    Logger.log(`[FORM] Paramètres: ${JSON.stringify(params)}`);

    const result = planRoutes(params);

    const routesLegeres = (result.routes || []).map(r => ({
      id_route: r.id_route,
      id_benevole: r.id_benevole,
      benevole_nom: r.benevole_nom || '',
      statut: r.statut,
      distance_totale_km: r.distance_totale_km || 0,
      poids_total_kg: r.poids_total_kg || 0,
      nb_livraisons: r.livraisons ? r.livraisons.length : 0
    }));

    const resultLeger = {
      success: result.success,
      created: result.created,
      warnings: result.warnings,
      errors: result.errors,
      outliers: (result.outliers || []).map(o => ({
        id_livraison: o.id_livraison,
        distance: Math.round(o._distance_hq || 0)
      })),
      routes: routesLegeres
    };

    Logger.log(`[FORM] Planification terminée: ${result.created} routes créées`);
    return resultLeger;

  } catch (error) {
    Logger.log(`[FORM] Erreur: ${error.message}`);
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
  if (sheet) ss.setActiveSheet(sheet);
}

function regenerateAllMapsLinks() {
  const ui = SpreadsheetApp.getUi();

  const confirm = ui.alert(
    'Régénérer les Liens Maps',
    'Cette action va régénérer les liens Google Maps pour toutes les routes en statut Brouillon.\n\nContinuer ?',
    ui.ButtonSet.YES_NO
  );

  if (confirm !== ui.Button.YES) return;

  try {
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
      ui.alert('Configuration manquante', 'Les coordonnées du QG ne sont pas configurées.', ui.ButtonSet.OK);
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
        updateRowById(CONFIG.SHEETS.ROUTES, routeId, CONFIG.COLUMNS.ROUTES.ID_ROUTE, {
          lien_maps: newLienMaps,
          date_modification: getCurrentDateTime()
        });
        updated++;
      } catch (err) {
        errors.push(`Route ${route.id_route} : ${err.message}`);
      }
    }

    let summary = `✅ ${updated} lien(s) Maps régénéré(s).`;
    if (skipped > 0) summary += `\n⏭️ ${skipped} route(s) ignorée(s) (aucun stop).`;
    if (errors.length > 0) summary += `\n\n❌ Erreurs :\n${errors.join('\n')}`;
    ui.alert('Régénération terminée', summary, ui.ButtonSet.OK);

  } catch (error) {
    ui.alert('Erreur', `Erreur lors de la régénération :\n${error.message}`, ui.ButtonSet.OK);
  }
}

function showGenerateLabelsForm() {
  const html = HtmlService.createTemplateFromFile('ui/labelForm')
    .evaluate()
    .setWidth(1200)
    .setHeight(800)
    .setTitle('🏷️ Générer les Étiquettes');

  SpreadsheetApp.getUi().showModalDialog(html, 'Générer les Étiquettes');
}

/**
 * Retourne tous les bénévoles éligibles enrichis avec leurs créneaux de disponibilité
 * et leur statut du jour (si une date est fournie).
 * Les bénévoles sont chargés dès l'ouverture du formulaire — la date est optionnelle.
 *
 * @param {string|null} date - Format YYYY-MM-DD (optionnel)
 * @returns {Array<Object>}
 */
function getVolunteersForPlanningForm(date) {
  try {
    Logger.log(`[FORM] Chargement bénévoles${date ? ' pour date: ' + date : ' (sans date)'}`);

    let benevoles = getVolunteersWithVehicle();

    if (date) {
      try {
        const permis = getPairedPermisVolunteers(date);
        if (permis.length > 0) {
          const existingIds = new Set(benevoles.map(v => v.id));
          permis.forEach(v => { if (!existingIds.has(v.id)) benevoles.push(v); });
          Logger.log(`[FORM] ${permis.length} bénévole(s) permis ajouté(s) via véhicules temporaires`);
        }
      } catch (e) {
        Logger.log(`[FORM] Véhicules temporaires: ${e.message}`);
      }
    }

    Logger.log(`[FORM] ${benevoles.length} bénévoles éligibles`);

    const routesAujourdhui = date ? _getRoutesForDate(date) : [];
    const routeParBenevole = {};

    routesAujourdhui.forEach(route => {
      const bid = String(route.id_benevole);
      if (!routeParBenevole[bid] || _statutPrecedence(route.statut) > _statutPrecedence(routeParBenevole[bid].statut)) {
        routeParBenevole[bid] = route;
      }
    });

    return benevoles.map(benevole => {
      const routeExistante = routeParBenevole[String(benevole.id)] || null;

      let livraisonsFaites = 0;
      if (routeExistante) {
        const stops = getDeliveryStopsForRoute(routeExistante.id_route);
        livraisonsFaites = stops.filter(s => s.statut === CONFIG.ENUMS.STATUT_ETAPE.LIVREE).length;
      }

      return {
        id: benevole.id,
        nom: benevole.nom || '',
        prenom: benevole.prenom || '',
        admin: benevole.admin === true || benevole.admin === 'true',
        vehicule_type: benevole.vehicule ? benevole.vehicule.type : '—',
        vehicule_capacite: benevole.vehicule ? (parseFloat(benevole.vehicule.capaciteKg) || 0) : 0,
        disponibilites: benevole.disponibilites || [],
        has_route_today: !!routeExistante,
        route_statut: routeExistante ? routeExistante.statut : null,
        livraisons_faites: livraisonsFaites,
        is_tmp_vehicle: !!benevole._tmp_vehicule_id
      };
    });

  } catch (error) {
    Logger.log(`[FORM] Erreur getVolunteersForPlanningForm: ${error.message}`);
    throw error;
  }
}

/**
 * Retourne le nombre de livraisons non assignées pour une date.
 */
function getUnassignedDeliveryCountForDate(date) {
  try {
    return getUnassignedDeliveriesForDate(date).length;
  } catch (e) {
    Logger.log(`[FORM] Erreur getUnassignedDeliveryCountForDate: ${e.message}`);
    return 0;
  }
}

function _getRoutesForDate(date) {
  const cible = new Date(date);
  cible.setHours(0, 0, 0, 0);

  return filterData(CONFIG.SHEETS.ROUTES, function (row) {
    if (!row.date_debut) return false;
    const d = new Date(row.date_debut);
    d.setHours(0, 0, 0, 0);
    return d.getTime() === cible.getTime();
  });
}

function _statutPrecedence(statut) {
  const order = {
    [CONFIG.ENUMS.STATUT_ROUTE.TERMINEE]: 5,
    [CONFIG.ENUMS.STATUT_ROUTE.EN_COURS]: 4,
    [CONFIG.ENUMS.STATUT_ROUTE.PRETE]: 3,
    [CONFIG.ENUMS.STATUT_ROUTE.CONFIRMEE]: 2,
    [CONFIG.ENUMS.STATUT_ROUTE.BROUILLON]: 1,
    [CONFIG.ENUMS.STATUT_ROUTE.ANNULEE]: 0
  };
  return order[statut] || 0;
}