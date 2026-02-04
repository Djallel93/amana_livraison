/**
 * ====================================================================
 * ROUTE_SERVICE.GS - Service de Gestion des Routes
 * ====================================================================
 */

/**
 * Planifie les routes pour une date donnée
 * @param {Object} params - Paramètres de planification
 * @returns {Object} Résultat de la planification
 */
function planRoutes(params) {
  Logger.log('[ROUTES] 🚀 Démarrage planification des routes...');
  Logger.log(`[ROUTES] Paramètres: ${JSON.stringify(params)}`);

  const result = {
    success: false,
    created: 0,
    warnings: [],
    errors: [],
    routes: []
  };

  try {
    // 1. Récupérer les livraisons non assignées pour la date
    const livraisons = getUnassignedDeliveriesForDate(params.date_livraison);
    Logger.log(`[ROUTES] 📦 ${livraisons.length} livraisons non assignées trouvées`);

    if (livraisons.length === 0) {
      result.errors.push('Aucune livraison non assignée pour cette date');
      return result;
    }

    // 2. Récupérer les bénévoles disponibles
    const benevoles = getAvailableVolunteers(params);
    Logger.log(`[ROUTES] 👥 ${benevoles.length} bénévoles disponibles`);

    if (benevoles.length === 0) {
      result.errors.push('Aucun bénévole disponible pour cette date');
      return result;
    }

    // 3. Identifier les clusters géographiques
    const clusters = identifierClusters(livraisons, params.poids_moyen_kg);
    Logger.log(`[ROUTES] 🗺️ ${clusters.length} clusters identifiés`);

    // 4. Attribuer les clusters aux véhicules
    const routes = assignerClustersAuxVehicules(
      clusters,
      benevoles,
      params
    );
    Logger.log(`[ROUTES] 🚗 ${routes.length} routes créées`);

    // 5. Sauvegarder les routes
    for (const route of routes) {
      const saved = saveRoute(route, params);
      if (saved) {
        result.routes.push(saved);
        result.created++;
      }
    }

    // 6. Détecter les routes éloignées
    result.warnings = detectRemoteRoutes(result.routes);

    result.success = result.created > 0;

    Logger.log('[ROUTES] ========================================');
    Logger.log(`[ROUTES] ✅ Planification terminée`);
    Logger.log(`[ROUTES] Routes créées: ${result.created}`);
    Logger.log(`[ROUTES] Avertissements: ${result.warnings.length}`);
    Logger.log('[ROUTES] ========================================');

    return result;

  } catch (error) {
    Logger.log(`[ROUTES] ❌ Erreur critique: ${error.message}`);
    result.errors.push(`Erreur critique: ${error.message}`);
    return result;
  }
}

/**
 * Récupère les livraisons non assignées pour une date
 * @param {string} date - Date au format YYYY-MM-DD
 * @returns {Array<Object>}
 */
function getUnassignedDeliveriesForDate(date) {
  const deliveries = getDeliveriesForDate(new Date(date));

  return deliveries.filter(d =>
    d.statut === CONFIG.ENUMS.STATUT_LIVRAISON.NON_ASSIGNEE
  );
}

/**
 * Récupère les bénévoles disponibles
 * @param {Object} params - Paramètres
 * @returns {Array<Object>}
 */
function getAvailableVolunteers(params) {
  // 1. Récupérer tous les bénévoles actifs et validés
  const response = listVolunteers({
    actif: true,
    statut: 'Validé'
  });

  if (!response || !response.volunteers) {
    return [];
  }

  let volunteers = response.volunteers;

  // 2. Enrichir avec les informations de véhicule
  volunteers = volunteers.map(v => {
    if (v.idVehicule) {
      v.vehicule = getVehiculeInfo(v.idVehicule);
    }
    return v;
  });

  // 3. Filtrer ceux qui ont un véhicule ou peuvent en avoir un prêté
  volunteers = volunteers.filter(v => {
    return v.vehicule &&
      v.vehicule.type !== 'Sans permis' &&
      (v.vehicule.capaciteKg > 0 || v.vehicule.type === 'Permis');
  });

  // 4. Ajouter les véhicules prêtés configurés
  if (params.vehicules_pretes && params.vehicules_pretes.length > 0) {
    volunteers = assignVehiculesPrets(volunteers, params.vehicules_pretes);
  }

  return volunteers;
}

/**
 * Récupère les informations d'un véhicule
 * @param {number} vehiculeId - ID du véhicule
 * @returns {Object}
 */
function getVehiculeInfo(vehiculeId) {
  const vehiclesResponse = getVehicleTypes();

  if (!vehiclesResponse || !vehiclesResponse.vehicles) {
    return null;
  }

  let vehicle = vehiclesResponse.vehicles.find(v => v.id === vehiculeId);

  if (vehicle) {
    // Compléter les capacités manquantes
    if (!vehicle.capaciteKg || vehicle.capaciteKg === '') {
      if (vehicle.type === 'Berline') {
        vehicle.capaciteKg = CONFIG.ROUTE_OPTIMIZATION.CAPACITE_BERLINE_KG;
      } else if (vehicle.type === 'Break') {
        vehicle.capaciteKg = CONFIG.ROUTE_OPTIMIZATION.CAPACITE_BREAK_KG;
      }
    }
  }

  return vehicle;
}

/**
 * Assigne les véhicules prêtés aux bénévoles
 * @param {Array} volunteers - Bénévoles
 * @param {Array} vehiculesPrets - Véhicules prêtés configurés
 * @returns {Array}
 */
function assignVehiculesPrets(volunteers, vehiculesPrets) {
  // Cette fonction sera appelée avec la config manuelle de l'admin
  // Pour l'instant, on retourne juste les bénévoles tels quels
  return volunteers;
}

/**
 * Identifie les clusters géographiques
 * @param {Array<Object>} livraisons - Livraisons
 * @param {number} poidsPartKg - Poids moyen par personne
 * @returns {Array<Object>}
 */
function identifierClusters(livraisons, poidsPartKg) {
  const clusters = [];
  const DISTANCE_PROXIMITE = CONFIG.ROUTE_OPTIMIZATION.DISTANCE_PROXIMITE_KM;

  for (const livraison of livraisons) {
    // Trouver un cluster existant à moins de DISTANCE_PROXIMITE km
    let clusterTrouve = null;
    let minDistance = Infinity;

    for (const cluster of clusters) {
      const distance = calculerDistanceHaversine(
        cluster.centre.lat,
        cluster.centre.lng,
        livraison.latitude,
        livraison.longitude
      );

      if (distance < DISTANCE_PROXIMITE && distance < minDistance) {
        clusterTrouve = cluster;
        minDistance = distance;
      }
    }

    const poidsLivraison = livraison.nombre_personnes * poidsPartKg;

    if (clusterTrouve) {
      // Ajouter à un cluster existant
      clusterTrouve.livraisons.push(livraison);
      clusterTrouve.poids_total += poidsLivraison;
      clusterTrouve.nombre_livraisons++;

      // Recalculer le centre (moyenne des positions)
      const totalLat = clusterTrouve.livraisons.reduce((sum, l) => sum + l.latitude, 0);
      const totalLng = clusterTrouve.livraisons.reduce((sum, l) => sum + l.longitude, 0);
      clusterTrouve.centre.lat = totalLat / clusterTrouve.livraisons.length;
      clusterTrouve.centre.lng = totalLng / clusterTrouve.livraisons.length;

    } else {
      // Créer un nouveau cluster
      const distanceHQ = calculerDistanceHaversine(
        CONFIG.HQ.LAT,
        CONFIG.HQ.LNG,
        livraison.latitude,
        livraison.longitude
      );

      clusters.push({
        id: `C${clusters.length + 1}`,
        centre: {
          lat: livraison.latitude,
          lng: livraison.longitude
        },
        livraisons: [livraison],
        quartier_id: livraison.id_quartier,
        distance_hq: distanceHQ,
        poids_total: poidsLivraison,
        nombre_livraisons: 1
      });
    }
  }

  // Trier par NOMBRE DE LIVRAISONS (DESC - plus de livraisons en premier)
  clusters.sort((a, b) => b.nombre_livraisons - a.nombre_livraisons);

  Logger.log(`[ROUTES] 📊 Clusters triés par nombre de livraisons`);
  clusters.forEach(c => {
    Logger.log(`[ROUTES]   • Cluster ${c.id}: ${c.nombre_livraisons} livraisons, ${Math.round(c.poids_total)} kg, ${Math.round(c.distance_hq)} km`);
  });

  return clusters;
}

/**
 * Calcule la distance Haversine entre deux points GPS
 * @param {number} lat1 - Latitude point 1
 * @param {number} lng1 - Longitude point 1
 * @param {number} lat2 - Latitude point 2
 * @param {number} lng2 - Longitude point 2
 * @returns {number} Distance en km
 */
function calculerDistanceHaversine(lat1, lng1, lat2, lng2) {
  const R = 6371; // Rayon de la Terre en km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;

  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return distance;
}

/**
 * Assigne les clusters aux véhicules
 * @param {Array} clusters - Clusters géographiques
 * @param {Array} benevoles - Bénévoles disponibles
 * @param {Object} params - Paramètres
 * @returns {Array} Routes créées
 */
function assignerClustersAuxVehicules(clusters, benevoles, params) {
  const routes = [];
  const clustersRestants = [...clusters]; // Copie
  const maxLivraisonsParRoute = params.max_livraisons || 15;

  // Trier les bénévoles par capacité véhicule (DESC)
  benevoles.sort((a, b) => {
    const capA = a.vehicule ? (a.vehicule.capaciteKg || 0) : 0;
    const capB = b.vehicule ? (b.vehicule.capaciteKg || 0) : 0;
    return capB - capA;
  });

  Logger.log(`[ROUTES] 🚗 Attribution des clusters aux ${benevoles.length} véhicules`);

  for (const benevole of benevoles) {
    if (clustersRestants.length === 0) break;

    const capaciteVehicule = benevole.vehicule.capaciteKg || 0;

    const route = {
      benevole: benevole,
      livraisons: [],
      clusters_assignes: [],
      poids_total: 0,
      distance_totale: 0
    };

    // Prendre le cluster avec le PLUS de livraisons restantes
    const clusterPrincipal = clustersRestants.shift();
    route.livraisons.push(...clusterPrincipal.livraisons);
    route.poids_total += clusterPrincipal.poids_total;
    route.clusters_assignes.push(clusterPrincipal.id);

    Logger.log(`[ROUTES]   Bénévole ${benevole.nom} (${benevole.vehicule.type}, ${capaciteVehicule}kg):`);
    Logger.log(`[ROUTES]     • Cluster principal ${clusterPrincipal.id}: ${clusterPrincipal.nombre_livraisons} livraisons`);

    // Essayer d'ajouter d'autres clusters pour maximiser la charge
    const clustersAAjouter = [];

    for (let i = 0; i < clustersRestants.length; i++) {
      const autreCluster = clustersRestants[i];

      const distanceEntreClusters = calculerDistanceHaversine(
        clusterPrincipal.centre.lat,
        clusterPrincipal.centre.lng,
        autreCluster.centre.lat,
        autreCluster.centre.lng
      );

      const DISTANCE_CLUSTER_MAX = CONFIG.ROUTE_OPTIMIZATION.DISTANCE_CLUSTER_MAX_KM;
      const DISTANCE_REGROUPE = CONFIG.ROUTE_OPTIMIZATION.DISTANCE_REGROUPE_ELOIGNES_KM;

      // Peut grouper si :
      // - Distance < DISTANCE_CLUSTER_MAX km (clusters voisins)
      // - OU les deux > DISTANCE_REGROUPE km du HQ (regrouper trajets longs)
      const peutGrouper = (
        distanceEntreClusters < DISTANCE_CLUSTER_MAX ||
        (clusterPrincipal.distance_hq > DISTANCE_REGROUPE && autreCluster.distance_hq > DISTANCE_REGROUPE)
      );

      const nouveauPoids = route.poids_total + autreCluster.poids_total;
      const nouvelleTaille = route.livraisons.length + autreCluster.nombre_livraisons;

      if (peutGrouper &&
        nouveauPoids <= capaciteVehicule &&
        nouvelleTaille <= maxLivraisonsParRoute) {

        clustersAAjouter.push({ index: i, cluster: autreCluster });
        Logger.log(`[ROUTES]     • Ajout cluster ${autreCluster.id}: ${autreCluster.nombre_livraisons} livraisons (distance: ${Math.round(distanceEntreClusters)} km)`);
      }
    }

    // Ajouter les clusters sélectionnés
    for (let i = clustersAAjouter.length - 1; i >= 0; i--) {
      const { index, cluster } = clustersAAjouter[i];
      route.livraisons.push(...cluster.livraisons);
      route.poids_total += cluster.poids_total;
      route.clusters_assignes.push(cluster.id);
      clustersRestants.splice(index, 1);
    }

    // Calculer la distance totale de la route
    route.distance_totale = calculerDistanceTotaleRoute(route.livraisons);

    Logger.log(`[ROUTES]     → Total: ${route.livraisons.length} livraisons, ${Math.round(route.poids_total)} kg, ${Math.round(route.distance_totale)} km`);

    routes.push(route);
  }

  // Avertir si des clusters restants
  if (clustersRestants.length > 0) {
    Logger.log(`[ROUTES] ⚠️ ${clustersRestants.length} clusters non assignés (manque de bénévoles/véhicules)`);
  }

  return routes;
}

/**
 * Calcule la distance totale d'une route
 * @param {Array} livraisons - Livraisons de la route
 * @returns {number} Distance en km
 */
function calculerDistanceTotaleRoute(livraisons) {
  if (livraisons.length === 0) return 0;

  let distance = 0;

  // Distance HQ → Première livraison
  distance += calculerDistanceHaversine(
    CONFIG.HQ.LAT,
    CONFIG.HQ.LNG,
    livraisons[0].latitude,
    livraisons[0].longitude
  );

  // Distance entre chaque livraison
  for (let i = 0; i < livraisons.length - 1; i++) {
    distance += calculerDistanceHaversine(
      livraisons[i].latitude,
      livraisons[i].longitude,
      livraisons[i + 1].latitude,
      livraisons[i + 1].longitude
    );
  }

  // Distance dernière livraison → HQ (pour estimation)
  distance += calculerDistanceHaversine(
    livraisons[livraisons.length - 1].latitude,
    livraisons[livraisons.length - 1].longitude,
    CONFIG.HQ.LAT,
    CONFIG.HQ.LNG
  );

  return distance;
}

/**
 * Sauvegarde une route dans Google Sheets
 * @param {Object} route - Route à sauvegarder
 * @param {Object} params - Paramètres
 * @returns {Object} Route sauvegardée avec ID
 */
function saveRoute(route, params) {
  try {
    // Générer l'ID de la route (temporaire, sera réassigné après tri)
    const tempId = generateNextId(
      CONFIG.SHEETS.ROUTES,
      'R',
      CONFIG.COLUMNS.ROUTES.ID_ROUTE
    );

    const routeData = {
      id_route: tempId,
      id_benevole: route.benevole.id,
      id_binome: route.binome ? route.binome.id : '',
      id_vehicule_prete: route.vehicule_prete_id || '',
      date_debut: params.date_livraison,
      date_fin: null,
      occasion: params.occasion,
      statut: CONFIG.ENUMS.STATUT_ROUTE.BROUILLON,
      distance_totale_km: Math.round(route.distance_totale * 100) / 100,
      poids_total_kg: Math.round(route.poids_total * 100) / 100,
      relivre: params.relivre || false,
      dossier_drive: '',
      date_creation: getCurrentDateTime(),
      date_modification: getCurrentDateTime()
    };

    // Valider
    const validation = validateRoute(routeData);
    if (validation.hasErrors()) {
      throw new Error(`Route invalide: ${validation.getErrorMessages().join(', ')}`);
    }

    // Sauvegarder dans Sheets
    const rowData = [
      routeData.id_route,
      routeData.id_benevole,
      routeData.id_binome,
      routeData.id_vehicule_prete,
      routeData.date_debut,
      routeData.date_fin,
      routeData.occasion,
      routeData.statut,
      routeData.distance_totale_km,
      routeData.poids_total_kg,
      routeData.relivre,
      routeData.dossier_drive,
      routeData.date_creation,
      routeData.date_modification
    ];

    appendRow(CONFIG.SHEETS.ROUTES, rowData);

    // Mettre à jour les livraisons : Non Assignée → Assignée
    for (const livraison of route.livraisons) {
      updateDeliveryStatus(livraison.id_livraison, CONFIG.ENUMS.STATUT_LIVRAISON.ASSIGNEE);
    }

    Logger.log(`[ROUTES] ✅ Route ${tempId} sauvegardée`);

    return {
      ...routeData,
      livraisons: route.livraisons,
      benevole_nom: route.benevole.nom
    };

  } catch (error) {
    Logger.log(`[ROUTES] ❌ Erreur sauvegarde route: ${error.message}`);
    return null;
  }
}

/**
 * Détecte les routes éloignées
 * @param {Array} routes - Routes créées
 * @returns {Array} Avertissements
 */
function detectRemoteRoutes(routes) {
  const warnings = [];
  const DISTANCE_ISOLEE = CONFIG.ROUTE_OPTIMIZATION.DISTANCE_LIVRAISON_ISOLEE_KM;

  for (const route of routes) {
    if (route.distance_totale_km > DISTANCE_ISOLEE) {
      warnings.push({
        id_route: route.id_route,
        distance: route.distance_totale_km,
        message: `Route ${route.id_route} très éloignée (${Math.round(route.distance_totale_km)} km)`
      });
    }
  }

  return warnings;
}

/**
 * Réorganise les IDs des routes par distance (DESC)
 */
function reorderRouteIdsByDistance() {
  const routes = getAllDataAsObjects(CONFIG.SHEETS.ROUTES);

  // Trier par distance DESC (plus éloignée = R001)
  routes.sort((a, b) => b.distance_totale_km - a.distance_totale_km);

  // Réassigner les IDs
  for (let i = 0; i < routes.length; i++) {
    const newId = `R${String(i + 1).padStart(3, '0')}`;
    const oldId = routes[i].id_route;

    if (oldId !== newId) {
      updateRowById(
        CONFIG.SHEETS.ROUTES,
        oldId,
        CONFIG.COLUMNS.ROUTES.ID_ROUTE,
        { id_route: newId }
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
    CONFIG.COLUMNS.ROUTES.ID_ROUTE
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
      date_modification: getCurrentDateTime()
    }
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
    updateDeliveryStatus(delivery.id_livraison, CONFIG.ENUMS.STATUT_LIVRAISON.NON_ASSIGNEE);
  }

  // Supprimer les étapes associées
  const etapes = filterData(CONFIG.SHEETS.ETAPES_ROUTE, row => row.id_route === routeId);
  for (const etape of etapes) {
    deleteRowById(CONFIG.SHEETS.ETAPES_ROUTE, etape.id_etape, CONFIG.COLUMNS.ETAPES_ROUTE.ID_ETAPE);
  }

  // Supprimer la route
  const deleted = deleteRowById(
    CONFIG.SHEETS.ROUTES,
    routeId,
    CONFIG.COLUMNS.ROUTES.ID_ROUTE
  );

  if (deleted) {
    Logger.log(`[ROUTES] ✅ Route ${routeId} supprimée (${deliveries.length} livraisons réassignées)`);
  }

  return deleted;
}
