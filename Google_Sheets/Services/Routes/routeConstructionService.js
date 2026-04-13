/**
 * ====================================================================
 * ROUTE_CONSTRUCTION_SERVICE.GS - Construction et Étapes des Routes
 * ====================================================================
 * Modifications :
 * - Suppression de l'étape de retour au QG dans createOptimizedEtapes
 * - Le lien Maps conserve le QG comme point de départ (origine)
 *   mais se termine au dernier stop (pas de retour)
 */

/**
 * Crée un objet route à partir d'un cluster et d'un bénévole.
 *
 * @param {Object}      cluster   - Cluster (ou sous-cluster)
 * @param {Object}      benevole  - Bénévole assigné
 * @param {Object|null} hqCoords  - Coordonnées du QG {lat, lng}
 * @returns {Object} Route prête à être passée à saveRoute()
 */
function creerRouteDepuisCluster(cluster, benevole, hqCoords) {
  const distanceTotale = calculerDistanceTotaleRoute(
    cluster.livraisons,
    hqCoords,
  );

  return {
    benevole: benevole,
    binome: null,
    vehicule_prete_id: "",
    livraisons: cluster.livraisons,
    poids_total: cluster.poids_total,
    distance_totale: distanceTotale,
  };
}

/**
 * Crée les étapes optimisées pour une route.
 * Le QG n'est PAS ajouté comme étape finale — il sert uniquement
 * de point de départ dans le lien Google Maps.
 *
 * @param {string}        routeId              - ID de la route
 * @param {Array<Object>} livraisonsOptimisees - Livraisons dans l'ordre optimisé
 */
function createOptimizedEtapes(routeId, livraisonsOptimisees) {
  Logger.log(
    `[ROUTES] 📝 Création de ${livraisonsOptimisees.length} étapes pour ${routeId}...`,
  );

  const sheet = getSheet(CONFIG.SHEETS.ETAPES_ROUTE);
  const rows = [];

  for (let i = 0; i < livraisonsOptimisees.length; i++) {
    const livraison = livraisonsOptimisees[i];

    const etapeId = generateNextId(
      CONFIG.SHEETS.ETAPES_ROUTE,
      "E",
      CONFIG.COLUMNS.ETAPES_ROUTE.ID_ETAPE,
    );

    rows.push([
      etapeId,
      routeId,
      livraison.id_livraison,
      i + 1,
      CONFIG.ENUMS.STATUT_ETAPE.EN_ATTENTE,
      null,
      null,
      "",
    ]);

    if (i < 3 || i === livraisonsOptimisees.length - 1) {
      Logger.log(
        `[ROUTES]    ✅ Étape ${etapeId} pour ${livraison.id_livraison} (ordre ${i + 1})`,
      );
    } else if (i === 3) {
      Logger.log(
        `[ROUTES]    ... (${livraisonsOptimisees.length - 4} étapes supplémentaires)`,
      );
    }
  }

  // Aucune étape de retour QG n'est ajoutée
  // Le QG est uniquement utilisé comme point de départ dans le lien Maps

  if (rows.length > 0) {
    sheet
      .getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length)
      .setValues(rows);
    Logger.log(`[ROUTES] ✅ ${rows.length} étape(s) créée(s) pour ${routeId}`);
  }
}

/**
 * Calcule le centre de gravité (barycentre) d'un ensemble de livraisons.
 * @param {Array<Object>} livraisons - Livraisons avec latitude/longitude
 * @returns {{lat: number, lng: number}}
 */
function calculerCentre(livraisons) {
  if (!livraisons || livraisons.length === 0) return { lat: 0, lng: 0 };

  const totalLat = livraisons.reduce((sum, l) => sum + l.latitude, 0);
  const totalLng = livraisons.reduce((sum, l) => sum + l.longitude, 0);

  return {
    lat: totalLat / livraisons.length,
    lng: totalLng / livraisons.length,
  };
}

/**
 * Génère un lien Google Maps pour la route.
 * Origine = QG, Destination = dernier stop.
 * Les stops intermédiaires sont ajoutés comme waypoints.
 * Les coordonnées dupliquées sont dédupliquées.
 *
 * @param {Array<Object>} livraisonsOptimisees - Livraisons dans l'ordre optimisé
 * @param {Object}        hqCoords             - Coordonnées du QG {lat, lng}
 * @returns {string} URL Google Maps
 */
function generateGoogleMapsLink(livraisonsOptimisees, hqCoords) {
  if (!livraisonsOptimisees || livraisonsOptimisees.length === 0) {
    Logger.log("[ROUTES] ⚠️ Génération lien Maps: aucune livraison");
    return "";
  }

  if (!hqCoords || !hqCoords.lat || !hqCoords.lng) {
    Logger.log("[ROUTES] ⚠️ Génération lien Maps: coordonnées QG manquantes");
    return "";
  }

  try {
    // Origine = QG (point de départ uniquement, pas de retour)
    const origin = `${hqCoords.lat},${hqCoords.lng}`;

    // Déduplication des coordonnées
    const seen = new Set();
    const livraisonsUniques = livraisonsOptimisees.filter((l) => {
      const coord = `${l.latitude},${l.longitude}`;
      if (seen.has(coord)) return false;
      seen.add(coord);
      return true;
    });

    const nbIgnores = livraisonsOptimisees.length - livraisonsUniques.length;
    if (nbIgnores > 0) {
      Logger.log(
        `[ROUTES] 🗺️ ${nbIgnores} adresse(s) dupliquée(s) retirée(s) du lien Maps`,
      );
    }

    if (livraisonsUniques.length === 0) {
      Logger.log(
        "[ROUTES] ⚠️ Génération lien Maps: aucune livraison unique après déduplication",
      );
      return "";
    }

    // Destination = dernier stop (pas le QG)
    const derniere = livraisonsUniques[livraisonsUniques.length - 1];
    const destination = `${derniere.latitude},${derniere.longitude}`;

    let url = `https://www.google.com/maps/dir/?api=1`;
    url += `&origin=${encodeURIComponent(origin)}`;
    url += `&destination=${encodeURIComponent(destination)}`;

    // Waypoints = tous les stops sauf le dernier
    const intermediaires = livraisonsUniques.slice(0, -1);
    if (intermediaires.length > 0) {
      const waypoints = intermediaires
        .map((l) => `${l.latitude},${l.longitude}`)
        .join("|");
      url += `&waypoints=${encodeURIComponent(waypoints)}`;
    }

    url += `&travelmode=driving`;
    Logger.log(
      `[ROUTES] 🗺️ Lien Maps généré (${livraisonsUniques.length} arrêt(s), départ QG)`,
    );
    return url;
  } catch (error) {
    Logger.log(`[ROUTES] ❌ Erreur génération lien Maps: ${error.message}`);
    return "";
  }
}
