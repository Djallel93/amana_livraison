/**
 * ====================================================================
 * ROUTE_SERVICE_CRUD.GS - Opérations CRUD sur les Routes
 * ====================================================================
 * Contient : getRouteById(), updateRouteStatus(), deleteRoute(),
 *            reorderRouteIdsByDistance(), getDraftRoutes()
 * Responsabilité : Lecture, modification et suppression des routes
 */

/**
 * Réorganise les IDs des routes par distance (DESC)
 */
function reorderRouteIdsByDistance() {
  const routes = getAllDataAsObjects(CONFIG.SHEETS.ROUTES);

  // Trier par distance DESC (plus éloignée = R001)
  routes.sort((a, b) => b.distance_totale_km - a.distance_totale_km);

  // Réassigner les IDs
  for (let i = 0; i < routes.length; i++) {
    const newId = `R${String(i + 1).padStart(3, "0")}`;
    const oldId = routes[i].id_route;

    if (oldId !== newId) {
      updateRowById(
        CONFIG.SHEETS.ROUTES,
        oldId,
        CONFIG.COLUMNS.ROUTES.ID_ROUTE,
        { id_route: newId },
      );

      Logger.log(`[ROUTES] 🔄 Route ${oldId} → ${newId}`);
    }
  }

  Logger.log(`[ROUTES] ✅ IDs réorganisés par distance`);
}

/**
 * Récupère une route par ID
 * @param {string} routeId - ID de la route
 * @returns {Object|null}
 */
function getRouteById(routeId) {
  return getRowById(
    CONFIG.SHEETS.ROUTES,
    routeId,
    CONFIG.COLUMNS.ROUTES.ID_ROUTE,
  );
}

/**
 * Récupère toutes les routes pour une occasion
 * @param {string} occasion - Type d'occasion
 * @returns {Array}
 */
function getRoutesByOccasion(occasion) {
  return filterData(CONFIG.SHEETS.ROUTES, function (row) {
    return row.occasion === occasion;
  });
}

/**
 * Récupère les routes en statut Brouillon
 * @returns {Array}
 */
function getDraftRoutes() {
  return filterData(CONFIG.SHEETS.ROUTES, function (row) {
    return row.statut === CONFIG.ENUMS.STATUT_ROUTE.BROUILLON;
  });
}

/**
 * Met à jour le statut d'une route
 * @param {string} routeId - ID de la route
 * @param {string} newStatus - Nouveau statut
 * @returns {boolean}
 */
function updateRouteStatus(routeId, newStatus) {
  const validStatuts = Object.values(CONFIG.ENUMS.STATUT_ROUTE);
  if (!validStatuts.includes(newStatus)) {
    Logger.log(`[ROUTES] ❌ Statut invalide: ${newStatus}`);
    return false;
  }

  const updated = updateRowById(
    CONFIG.SHEETS.ROUTES,
    routeId,
    CONFIG.COLUMNS.ROUTES.ID_ROUTE,
    {
      statut: newStatus,
      date_modification: getCurrentDateTime(),
    },
  );

  if (updated) {
    Logger.log(`[ROUTES] ✅ Route ${routeId} → ${newStatus}`);
  }

  return updated;
}

/**
 * Supprime une route (et réassigne les livraisons)
 * @param {string} routeId - ID de la route
 * @returns {boolean}
 */
function deleteRoute(routeId) {
  // Récupérer les livraisons de la route
  const deliveries = getDeliveriesForRoute(routeId);

  // Remettre les livraisons en Non Assignée
  for (const delivery of deliveries) {
    updateDeliveryStatus(
      delivery.id_livraison,
      CONFIG.ENUMS.STATUT_LIVRAISON.NON_ASSIGNEE,
    );
  }

  // Supprimer les étapes associées
  const etapes = filterData(
    CONFIG.SHEETS.ETAPES_ROUTE,
    (row) => row.id_route === routeId,
  );
  for (const etape of etapes) {
    deleteRowById(
      CONFIG.SHEETS.ETAPES_ROUTE,
      etape.id_etape,
      CONFIG.COLUMNS.ETAPES_ROUTE.ID_ETAPE,
    );
  }

  // Supprimer la route
  const deleted = deleteRowById(
    CONFIG.SHEETS.ROUTES,
    routeId,
    CONFIG.COLUMNS.ROUTES.ID_ROUTE,
  );

  if (deleted) {
    Logger.log(
      `[ROUTES] ✅ Route ${routeId} supprimée (${deliveries.length} livraisons réassignées)`,
    );
  }

  return deleted;
}
