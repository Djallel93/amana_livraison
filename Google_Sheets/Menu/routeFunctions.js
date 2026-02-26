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
  const html = HtmlService.createHtmlOutputFromFile('ui/sendRoutesForm')
    .setWidth(880)
    .setHeight(680)
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

  // Naviguer vers la feuille
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEETS.ETAPES_ROUTE);
  if (sheet) {
    ss.setActiveSheet(sheet);
  }
}

/**
 * Régénère les liens Google Maps pour toutes les routes en statut Brouillon.
 * Lit l'ordre des stops depuis etapes_route (ordre_passage ASC),
 * recalcule le lien Maps, met à jour lien_maps et date_modification.
 */
function regenerateAllMapsLinks() {
  const ui = SpreadsheetApp.getUi();

  const confirm = ui.alert(
    'Régénérer les Liens Maps',
    'Cette action va régénérer les liens Google Maps pour toutes les routes en statut Brouillon.\n\n' +
    'Continuer ?',
    ui.ButtonSet.YES_NO
  );

  if (confirm !== ui.Button.YES) return;

  try {
    Logger.log('[MAPS] 🗺️ Démarrage de la régénération des liens Maps...');

    // 1. Récupérer les routes en statut Brouillon uniquement
    const brouillonRoutes = filterData(
      CONFIG.SHEETS.ROUTES,
      row => normalizeStatut(row.statut) === CONFIG.ENUMS.STATUT_ROUTE.BROUILLON
    );

    if (brouillonRoutes.length === 0) {
      ui.alert(
        'Aucune route',
        'Aucune route en statut Brouillon trouvée.',
        ui.ButtonSet.OK
      );
      return;
    }

    Logger.log(`[MAPS] 📋 ${brouillonRoutes.length} route(s) Brouillon trouvée(s)`);

    // 2. Récupérer la config QG
    const hqConfig = getCurrentHqConfig();
    if (!hqConfig || !hqConfig.lat || !hqConfig.lng) {
      ui.alert(
        'Configuration manquante',
        'Les coordonnées du QG ne sont pas configurées.\nVeuillez les configurer dans Configuration > Adresse QG.',
        ui.ButtonSet.OK
      );
      return;
    }

    const hqCoords = { lat: hqConfig.lat, lng: hqConfig.lng };

    // 3. Traiter chaque route
    let updated = 0;
    let skipped = 0;
    const errors = [];

    for (const route of brouillonRoutes) {
      try {
        const routeId = route.id_route;
        Logger.log(`[MAPS] 🔄 Traitement route ${routeId}...`);

        // Récupérer les stops de livraison dans leur ordre actuel (ordre_passage ASC)
        const stops = getDeliveryStopsForRoute(routeId);

        if (stops.length === 0) {
          Logger.log(`[MAPS] ⚠️ Route ${routeId}: aucun stop de livraison — ignorée`);
          skipped++;
          continue;
        }

        // Récupérer les coordonnées complètes pour chaque stop
        const deliveriesOrdered = stops.map(stop => {
          const delivery = getDeliveryById(stop.id_livraison);
          if (!delivery) {
            throw new Error(`Livraison ${stop.id_livraison} introuvable`);
          }
          return delivery;
        });

        // Régénérer le lien Maps avec l'ordre actuel des stops
        const newLienMaps = generateGoogleMapsLink(deliveriesOrdered, hqCoords);

        // Mettre à jour lien_maps et date_modification dans la feuille
        updateRowById(
          CONFIG.SHEETS.ROUTES,
          routeId,
          CONFIG.COLUMNS.ROUTES.ID_ROUTE,
          {
            lien_maps: newLienMaps,
            date_modification: getCurrentDateTime()
          }
        );

        Logger.log(`[MAPS] ✅ Route ${routeId}: lien Maps régénéré (${stops.length} stops)`);
        updated++;

      } catch (err) {
        Logger.log(`[MAPS] ❌ Route ${route.id_route}: ${err.message}`);
        errors.push(`Route ${route.id_route} : ${err.message}`);
      }
    }

    // 4. Résumé
    Logger.log(`[MAPS] 🎉 Terminé: ${updated} mis à jour, ${skipped} ignorés, ${errors.length} erreurs`);

    let summary = `✅ ${updated} lien(s) Maps régénéré(s) avec succès.`;
    if (skipped > 0) summary += `\n⏭️ ${skipped} route(s) ignorée(s) (aucun stop).`;
    if (errors.length > 0) summary += `\n\n❌ Erreurs :\n${errors.join('\n')}`;

    ui.alert('Régénération terminée', summary, ui.ButtonSet.OK);

  } catch (error) {
    Logger.log(`[MAPS] ❌ Erreur critique: ${error.message}`);
    ui.alert('Erreur', `Erreur lors de la régénération :\n${error.message}`, ui.ButtonSet.OK);
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