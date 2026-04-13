/**
 * 📍 Générer les arrêts optimisés pour une route
 */
function generateStops(params) {
  try {
    const routeId = params.route_id;

    if (!routeId) {
      throw new Error("route_id est requis");
    }

    Logger.log(`[STOPS] 📍 Génération des arrêts pour ${routeId}`);

    // 1. Get route info
    const routeData = filterData(
      CONFIG.SHEETS.ROUTES,
      (row) => row.id_route === routeId,
    );
    if (routeData.length === 0) {
      throw new Error(`Route ${routeId} introuvable`);
    }
    const route = routeData[0];

    // 2. Get deliveries for this route (excluding HQ returns)
    const deliveries = getDeliveriesForRoute(routeId);
    Logger.log(
      `[STOPS] 📦 ${deliveries.length} livraisons trouvées pour ${routeId}`,
    );

    if (deliveries.length === 0) {
      throw new Error(`Aucune livraison trouvée pour la route ${routeId}`);
    }

    // 3. Get existing etapes (excluding HQ returns from previous runs)
    let etapes = filterData(
      CONFIG.SHEETS.ETAPES_ROUTE,
      (row) =>
        row.id_route === routeId &&
        row.id_livraison !== null &&
        row.id_livraison !== "",
    );
    Logger.log(`[STOPS] 📍 ${etapes.length} étapes de livraison trouvées`);

    // 4. Get HQ configuration
    Logger.log(`[STOPS] 🏢 Récupération du QG...`);
    const hqConfig = getCurrentHqConfig();

    if (!hqConfig || !hqConfig.lat || !hqConfig.lng) {
      throw new Error(
        "Configuration du QG introuvable. Veuillez configurer le QG dans les paramètres.",
      );
    }

    const HQ_COORDS = {
      lat: hqConfig.lat,
      lng: hqConfig.lng,
      adresse: hqConfig.address,
    };

    Logger.log(
      `[STOPS] 🏢 QG: ${HQ_COORDS.adresse} (${HQ_COORDS.lat}, ${HQ_COORDS.lng})`,
    );

    // 5. Optimize route order using TSP (Nearest Neighbor + 2-opt)
    // ✅ FIX: Use optimizeDeliveryOrder() (NN + 2-opt) instead of optimizeRouteOrder() (NN only)
    Logger.log(`[STOPS] 🔄 Optimisation de l'ordre des arrêts (NN + 2-opt)...`);
    const optimizedOrder = optimizeDeliveryOrder(deliveries, HQ_COORDS);

    // 6. Update ordre_passage in etapes_route sheet
    Logger.log(`[STOPS] 💾 Mise à jour de l'ordre dans la feuille...`);

    for (let i = 0; i < optimizedOrder.length; i++) {
      const delivery = optimizedOrder[i];
      const ordre = i + 1;

      const etape = etapes.find(
        (e) => e.id_livraison === delivery.id_livraison,
      );

      if (etape) {
        updateCellByRowId(
          CONFIG.SHEETS.ETAPES_ROUTE,
          etape.id_etape,
          "id_etape",
          "ordre_passage",
          ordre,
        );

        Logger.log(
          `[STOPS]   ✅ ${etape.id_etape}: ordre ${ordre} (${delivery.id_livraison})`,
        );
      }
    }

    // 7. CREATE HQ RETURN STOP (with NULL id_livraison and address in commentaire)
    const hqEtapeId = generateNextId(
      CONFIG.SHEETS.ETAPES_ROUTE,
      "E",
      CONFIG.COLUMNS.ETAPES_ROUTE.ID_ETAPE,
    );

    // ✅ Use NULL for id_livraison and preserve HQ address in commentaire
    const hqCommentaire = `Retour au QG - ${HQ_COORDS.adresse}`;

    const hqRowData = [
      hqEtapeId, // 1. ID_ETAPE
      routeId, // 2. ID_ROUTE
      null, // 3. ID_LIVRAISON (NULL for HQ return)
      optimizedOrder.length + 1, // 4. ORDRE_PASSAGE (last stop)
      CONFIG.ENUMS.STATUT_ETAPE.EN_ATTENTE, // 5. STATUT
      null, // 6. HEURE_DEBUT
      null, // 7. HEURE_FIN
      hqCommentaire, // 8. COMMENTAIRE (preserves HQ address)
    ];

    appendRow(CONFIG.SHEETS.ETAPES_ROUTE, hqRowData);
    Logger.log(
      `[STOPS] 🏢 Étape de retour au QG créée: ${hqEtapeId} (ordre ${hqRowData[3]})`,
    );
    Logger.log(`[STOPS] 📍 HQ préservé dans commentaire: ${hqCommentaire}`);

    // 8. Calculate total distance (including return to HQ)
    const totalDistance = calculateTotalDistanceWithHQ(
      optimizedOrder,
      HQ_COORDS,
    );

    updateCellByRowId(
      CONFIG.SHEETS.ROUTES,
      routeId,
      "id_route",
      "distance_totale_km",
      Math.round(totalDistance * 100) / 100,
    );

    Logger.log(
      `[STOPS] 📏 Distance totale (avec retour QG): ${Math.round(totalDistance * 100) / 100}km`,
    );

    // 9. Update route status to "Confirmée"
    updateCellByRowId(
      CONFIG.SHEETS.ROUTES,
      routeId,
      "id_route",
      "statut",
      CONFIG.ENUMS.STATUT_ROUTE.CONFIRMEE,
    );

    updateCellByRowId(
      CONFIG.SHEETS.ROUTES,
      routeId,
      "id_route",
      "date_modification",
      getCurrentDateTime(),
    );

    Logger.log(`[STOPS] ✅ Arrêts générés avec succès pour ${routeId}`);

    return {
      success: true,
      route_id: routeId,
      stops_count: optimizedOrder.length + 1, // +1 for HQ return
      total_distance_km: Math.round(totalDistance * 100) / 100,
    };
  } catch (error) {
    Logger.log(`[STOPS] ❌ Erreur génération arrêts: ${error.message}`);
    throw error;
  }
}

/**
 * 📦 Get deliveries for a specific route (excludes HQ returns)
 */
function getDeliveriesForRoute(routeId) {
  // Get etapes for this route (excluding HQ returns - NULL id_livraison)
  const etapes = filterData(
    CONFIG.SHEETS.ETAPES_ROUTE,
    (row) =>
      row.id_route === routeId &&
      row.id_livraison !== null &&
      row.id_livraison !== "",
  );

  if (etapes.length === 0) {
    return [];
  }

  // Get delivery IDs from etapes
  const deliveryIds = etapes.map((e) => e.id_livraison);

  // Get full delivery data
  const allDeliveries = getAllDataAsObjects(CONFIG.SHEETS.LIVRAISON);
  const deliveries = allDeliveries.filter((d) =>
    deliveryIds.includes(d.id_livraison),
  );

  return deliveries;
}

/**
 * 🏢 Check if an etape is an HQ return stop
 * @param {Object} etape - Etape object
 * @returns {boolean}
 */
function isHqReturnStop(etape) {
  return etape.id_livraison === null || etape.id_livraison === "";
}

/**
 * 🏢 Extract HQ address from commentaire field
 * @param {string} commentaire - Commentaire text
 * @returns {string|null} - Extracted address or null
 */
function extractHqAddressFromCommentaire(commentaire) {
  if (!commentaire) return null;

  const match = commentaire.match(/Retour au QG - (.+)/);
  return match ? match[1] : null;
}

/**
 * 📍 Get HQ coordinates for an etape
 * For HQ return stops, returns current HQ config
 * For delivery stops, returns delivery coordinates
 * @param {Object} etape - Etape object
 * @returns {Object} {lat, lng, adresse}
 */
function getEtapeCoordinates(etape) {
  if (isHqReturnStop(etape)) {
    const hqConfig = getCurrentHqConfig();
    return {
      lat: hqConfig.lat,
      lng: hqConfig.lng,
      adresse: hqConfig.address,
    };
  }

  // Get delivery coordinates
  const delivery = getDeliveryById(etape.id_livraison);
  if (!delivery) {
    throw new Error(`Livraison ${etape.id_livraison} introuvable`);
  }

  return {
    lat: delivery.latitude,
    lng: delivery.longitude,
    adresse: delivery.adresse,
  };
}
