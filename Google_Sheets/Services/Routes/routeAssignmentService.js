/**
 * ====================================================================
 * ROUTE_SERVICE_ASSIGNMENT.GS - Assignation des Clusters aux Véhicules
 * ====================================================================
 *
 * Mode incrémental : chaque bénévole sélectionné reçoit au plus une route
 * par exécution. Les clusters non traités restent disponibles pour la suite.
 */

// ============================================================
// POINT D'ENTRÉE
// ============================================================

/**
 * Assigne les clusters aux bénévoles disponibles.
 *
 * Règles :
 * - Un bénévole reçoit au plus UNE route par exécution.
 * - Best-fit : plus petit véhicule suffisant pour le cluster.
 * - Si aucun bénévole libre ne peut gérer le cluster, on tente un split
 *   avec le plus grand véhicule encore disponible.
 * - Dès que tous les bénévoles ont leur route, on s'arrête.
 *
 * @param {Array<Object>} clusters  - Clusters triés par distance DESC
 * @param {Array<Object>} benevoles - Bénévoles avec vehicule.capaciteKg > 0
 * @param {Object}        params    - Paramètres (max_livraisons, poids_moyen_kg, ...)
 * @returns {Array<Object>} Routes à sauvegarder
 */
function assignerClustersAuxVehicules(clusters, benevoles, params) {
    const routes = [];
    const maxLivraisonsParRoute = params.max_livraisons || 15;
    const poidsParPart = parseFloat(params.poids_moyen_kg) || 0;

    const hqConfig = getCurrentHqConfig();
    const hqCoords = (hqConfig && hqConfig.lat && hqConfig.lng)
        ? { lat: hqConfig.lat, lng: hqConfig.lng }
        : null;

    if (hqCoords) {
        Logger.log(`[ROUTES] 🏢 QG: ${hqConfig.address} (${hqCoords.lat}, ${hqCoords.lng})`);
    } else {
        Logger.log(`[ROUTES] ⚠️ Coordonnées QG non configurées`);
    }

    // Ensemble des bénévoles ayant déjà reçu une route cette exécution.
    // Un bénévole ne peut pas en recevoir une deuxième — on s'arrête dès
    // que l'ensemble est plein (tous les bénévoles ont leur route).
    const benevolesAvecRoute = new Set();

    const fileClusters = [...clusters];

    Logger.log(`[ROUTES] 🚗 Début assignation incrémentale: ${benevoles.length} bénévoles, ${fileClusters.length} clusters`);

    let garde_fou = 0;
    const MAX_ITERATIONS = clusters.length * 10 + benevoles.length * 2;

    while (fileClusters.length > 0) {

        // Tous les bénévoles ont leur route — on arrête même s'il reste des clusters.
        if (benevolesAvecRoute.size >= benevoles.length) {
            Logger.log(`[ROUTES] 🛑 Tous les bénévoles ont leur route — ${fileClusters.length} cluster(s) restant(s) pour la prochaine exécution`);
            break;
        }

        if (++garde_fou > MAX_ITERATIONS) {
            Logger.log(`[ROUTES] ⚠️ Garde-fou atteint (${garde_fou} itérations) — arrêt`);
            break;
        }

        const cluster = fileClusters.shift();

        Logger.log(`[ROUTES] 🔄 Cluster ${cluster.id}: ${cluster.nombre_livraisons} livraisons, ${cluster.nombre_parts} parts, ${Math.round(cluster.poids_total)}kg`);

        const candidat = chercherMeilleurBenevole(
            cluster, benevoles, benevolesAvecRoute, maxLivraisonsParRoute
        );

        if (candidat) {
            const route = creerRouteDepuisCluster(cluster, candidat, hqCoords);
            routes.push(route);
            benevolesAvecRoute.add(candidat.id);

            Logger.log(`[ROUTES] ✅ Cluster ${cluster.id} → ${candidat.nom} (${candidat.vehicule.type}, ${candidat.vehicule.capaciteKg}kg)`);

        } else {
            // Aucun bénévole libre ne peut prendre ce cluster → tentative de split.
            const spliteur = chercherPlusGrandBenevoleLibre(benevoles, benevolesAvecRoute);

            if (!spliteur) {
                Logger.log(`[ROUTES] ⚠️ Aucun bénévole disponible pour cluster ${cluster.id} — cluster ignoré pour cette exécution`);
                continue;
            }

            Logger.log(`[ROUTES] ✂️ Split du cluster ${cluster.id} avec ${spliteur.nom} (${spliteur.vehicule.type})`);

            const { sousCluster, reste } = splitCluster(
                cluster, spliteur, poidsParPart, maxLivraisonsParRoute, params
            );

            const route = creerRouteDepuisCluster(sousCluster, spliteur, hqCoords);
            routes.push(route);
            benevolesAvecRoute.add(spliteur.id);

            Logger.log(`[ROUTES]   → Sous-cluster A: ${sousCluster.nombre_livraisons} livraisons, ${Math.round(sousCluster.poids_total)}kg`);

            if (reste && reste.nombre_livraisons > 0) {
                fileClusters.unshift(reste);
                Logger.log(`[ROUTES]   → Reste: ${reste.nombre_livraisons} livraisons remises en file`);
            }
        }
    }

    Logger.log(`[ROUTES] ✅ Assignation terminée: ${routes.length} routes, ${benevolesAvecRoute.size}/${benevoles.length} bénévoles utilisés`);
    return routes;
}

// ============================================================
// RECHERCHE DU MEILLEUR BÉNÉVOLE (BEST-FIT)
// ============================================================

/**
 * Trouve le plus petit véhicule disponible capable de gérer le cluster.
 * Un bénévole déjà assigné cette exécution est exclu.
 */
function chercherMeilleurBenevole(cluster, benevoles, benevolesAvecRoute, maxLivraisonsParRoute) {
    const eligibles = benevoles.filter(b => {
        if (benevolesAvecRoute.has(b.id)) return false;
        return vehiculeCompatible(b.vehicule, cluster, maxLivraisonsParRoute);
    });

    if (eligibles.length === 0) return null;

    eligibles.sort((a, b) => a.vehicule.capaciteKg - b.vehicule.capaciteKg);
    return eligibles[0];
}

/**
 * Trouve le bénévole disponible avec le plus grand véhicule (pour le split).
 * Un bénévole déjà assigné cette exécution est exclu.
 */
function chercherPlusGrandBenevoleLibre(benevoles, benevolesAvecRoute) {
    const disponibles = benevoles.filter(b => !benevolesAvecRoute.has(b.id));
    if (disponibles.length === 0) return null;

    disponibles.sort((a, b) => b.vehicule.capaciteKg - a.vehicule.capaciteKg);
    return disponibles[0];
}

/**
 * Vérifie si un véhicule peut gérer un cluster (poids, parts, nb livraisons).
 */
function vehiculeCompatible(vehicule, cluster, maxLivraisonsParRoute) {
    if (!vehicule) return false;

    const capaciteKg = parseFloat(vehicule.capaciteKg) || 0;
    const nombrePartMax = parseFloat(vehicule.nombrePartMax) || 0;

    if (capaciteKg < cluster.poids_total) return false;
    if (nombrePartMax < cluster.nombre_parts) return false;
    if (cluster.nombre_livraisons > maxLivraisonsParRoute) return false;

    return true;
}

// ============================================================
// SPLIT SÉQUENTIEL
// ============================================================

/**
 * Découpe un cluster en deux parties selon la capacité du bénévole.
 * Chaque livraison est pesée individuellement (domicile ou hôtel).
 */
function splitCluster(cluster, benevole, poidsParPart, maxLivraisonsParRoute, params) {
    const capaciteKg = parseFloat(benevole.vehicule.capaciteKg) || 0;
    const nombrePartMax = parseFloat(benevole.vehicule.nombrePartMax) || 0;

    const poids_moyen_kg = parseFloat((params && params.poids_moyen_kg) || poidsParPart) || 0;
    const poids_moyen_hotel_kg = parseFloat((params && params.poids_moyen_hotel_kg) || poids_moyen_kg) || 0;

    const livraisonsA = [];
    const livraisonsB = [];
    let poidsA = 0;
    let partsA = 0;

    for (const livraison of cluster.livraisons) {
        const parts = parseInt(livraison.nombre_personnes) || 0;
        const estHotel = livraison.hotel === true || livraison.hotel === 'TRUE' || livraison.hotel === 'true';
        const poidsLiv = parts * (estHotel ? poids_moyen_hotel_kg : poids_moyen_kg);

        const poidsApres = poidsA + poidsLiv;
        const partsApres = partsA + parts;
        const nbLiv = livraisonsA.length + 1;

        if (
            poidsApres <= capaciteKg &&
            partsApres <= nombrePartMax &&
            nbLiv <= maxLivraisonsParRoute
        ) {
            livraisonsA.push(livraison);
            poidsA = poidsApres;
            partsA = partsApres;
        } else {
            livraisonsB.push(livraison);
        }
    }

    const centreA = calculerCentre(livraisonsA);
    const sousCluster = {
        id: `${cluster.id}_A`,
        centre: centreA,
        livraisons: livraisonsA,
        quartier_id: cluster.quartier_id,
        distance_hq: cluster.distance_hq,
        nombre_livraisons: livraisonsA.length,
        nombre_parts: partsA,
        poids_total: poidsA
    };

    const partsB = livraisonsB.reduce((s, l) => s + (parseInt(l.nombre_personnes) || 0), 0);
    const poidsB = livraisonsB.reduce((sum, l) => {
        const estHotel = l.hotel === true || l.hotel === 'TRUE' || l.hotel === 'true';
        const parts = parseInt(l.nombre_personnes) || 0;
        return sum + parts * (estHotel ? poids_moyen_hotel_kg : poids_moyen_kg);
    }, 0);
    const centreB = livraisonsB.length > 0 ? calculerCentre(livraisonsB) : centreA;

    const reste = {
        id: `${cluster.id}_B`,
        centre: centreB,
        livraisons: livraisonsB,
        quartier_id: cluster.quartier_id,
        distance_hq: cluster.distance_hq,
        nombre_livraisons: livraisonsB.length,
        nombre_parts: partsB,
        poids_total: poidsB
    };

    return { sousCluster, reste };
}