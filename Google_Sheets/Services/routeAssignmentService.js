/**
 * ====================================================================
 * ROUTE_SERVICE_ASSIGNMENT.GS - Service d'Assignation des Routes
 * ====================================================================
 *
 * ⚠️ CHANGEMENT v3 (hôtel) :
 * - splitCluster() calcule maintenant le poids de chaque livraison
 *   individuellement en tenant compte du type hôtel/domicile,
 *   au lieu d'utiliser un poids uniforme poidsParPart.
 *   Les valeurs poids_moyen_kg et poids_moyen_hotel_kg proviennent de params.
 */

// ============================================================
// POINT D'ENTRÉE
// ============================================================

/**
 * Assigne les clusters aux bénévoles disponibles
 * Logique : best-fit (plus petit véhicule suffisant) + split si nécessaire
 *
 * @param {Array<Object>} clusters  - Clusters triés par distance DESC
 * @param {Array<Object>} benevoles - Bénévoles avec vehicule.capaciteKg > 0
 * @param {Object}        params    - Paramètres (max_livraisons, poids_moyen_kg, poids_moyen_hotel_kg...)
 * @returns {Array<Object>} Routes à sauvegarder
 */
function assignerClustersAuxVehicules(clusters, benevoles, params) {
    const routes = [];
    const maxLivraisonsParRoute = params.max_livraisons || 15;
    const poidsParPart = parseFloat(params.poids_moyen_kg) || 0;

    // Récupérer les coordonnées du QG
    const hqConfig = getCurrentHqConfig();
    const hqCoords = (hqConfig && hqConfig.lat && hqConfig.lng)
        ? { lat: hqConfig.lat, lng: hqConfig.lng }
        : null;

    if (hqCoords) {
        Logger.log(`[ROUTES] 🏢 QG: ${hqConfig.address} (${hqCoords.lat}, ${hqCoords.lng})`);
    } else {
        Logger.log(`[ROUTES] ⚠️ Coordonnées QG non configurées`);
    }

    // File de clusters à traiter (peut grossir si split)
    const fileClusters = [...clusters];

    // Suivi des bénévoles déjà utilisés dans ce cycle
    // Un bénévole peut faire plusieurs trajets si tous les clusters
    // ont été assignés une première fois
    const benevolesUtilises = new Set();

    Logger.log(`[ROUTES] 🚗 Début assignation: ${benevoles.length} bénévoles, ${fileClusters.length} clusters`);

    let index = 0;

    while (fileClusters.length > 0) {
        const cluster = fileClusters.shift();

        Logger.log(`[ROUTES] 🔄 Traitement cluster ${cluster.id}: ` +
            `${cluster.nombre_livraisons} livraisons, ` +
            `${cluster.nombre_parts} parts, ` +
            `${Math.round(cluster.poids_total)}kg`);

        // Trouver le meilleur bénévole pour ce cluster
        const candidat = chercherMeilleurBenevole(
            cluster, benevoles, benevolesUtilises, maxLivraisonsParRoute
        );

        if (candidat) {
            // ── Cas 1 : un seul bénévole peut gérer le cluster ────────────
            const route = creerRouteDepuisCluster(cluster, candidat, hqCoords);
            routes.push(route);
            benevolesUtilises.add(candidat.id);

            Logger.log(`[ROUTES] ✅ Cluster ${cluster.id} → ${candidat.nom} ` +
                `(${candidat.vehicule.type}, ${candidat.vehicule.capaciteKg}kg, ` +
                `max ${candidat.vehicule.nombrePartMax} parts)`);

        } else {
            // ── Cas 2 : aucun bénévole seul ne peut gérer le cluster ──────
            // Réinitialiser benevolesUtilises si tous ont été utilisés
            if (benevolesUtilises.size >= benevoles.length) {
                Logger.log(`[ROUTES] 🔄 Tous les bénévoles utilisés — réinitialisation`);
                benevolesUtilises.clear();
            }

            // Chercher le plus grand véhicule disponible pour faire un split
            const spliteur = chercherPlusGrandBenevole(benevoles, benevolesUtilises);

            if (!spliteur) {
                Logger.log(`[ROUTES] ⚠️ Aucun bénévole disponible pour cluster ${cluster.id} — ignoré`);
                continue;
            }

            Logger.log(`[ROUTES] ✂️ Split du cluster ${cluster.id} avec ${spliteur.nom} ` +
                `(${spliteur.vehicule.type})`);

            const { sousCluster, reste } = splitCluster(
                cluster, spliteur, poidsParPart, maxLivraisonsParRoute, params
            );

            // Créer la route pour la première partie
            const route = creerRouteDepuisCluster(sousCluster, spliteur, hqCoords);
            routes.push(route);
            benevolesUtilises.add(spliteur.id);

            Logger.log(`[ROUTES]   → Sous-cluster A: ${sousCluster.nombre_livraisons} livraisons, ` +
                `${sousCluster.nombre_parts} parts, ${Math.round(sousCluster.poids_total)}kg`);

            // Remettre le reste en tête de file pour traitement immédiat
            if (reste && reste.nombre_livraisons > 0) {
                fileClusters.unshift(reste);
                Logger.log(`[ROUTES]   → Reste: ${reste.nombre_livraisons} livraisons remis en file`);
            }
        }

        index++;

        // Garde-fou : éviter une boucle infinie
        if (index > clusters.length * 10) {
            Logger.log(`[ROUTES] ⚠️ Garde-fou atteint (${index} itérations) — arrêt`);
            break;
        }
    }

    Logger.log(`[ROUTES] ✅ Assignation terminée: ${routes.length} routes créées`);
    return routes;
}

// ============================================================
// RECHERCHE DU MEILLEUR BÉNÉVOLE (BEST-FIT)
// ============================================================

/**
 * Trouve le plus petit véhicule disponible capable de gérer le cluster.
 * Contraintes : poids_total ≤ capaciteKg ET nombre_parts ≤ nombrePartMax
 *               ET nombre_livraisons ≤ maxLivraisonsParRoute
 *
 * "Plus petit" = capaciteKg minimal parmi les bénévoles éligibles
 * (évite de gaspiller un gros véhicule pour un petit cluster)
 *
 * @param {Object}   cluster              - Cluster à assigner
 * @param {Array}    benevoles            - Tous les bénévoles
 * @param {Set}      benevolesUtilises    - IDs déjà utilisés ce cycle
 * @param {number}   maxLivraisonsParRoute - Limite de livraisons par route
 * @returns {Object|null} Meilleur bénévole ou null
 */
function chercherMeilleurBenevole(cluster, benevoles, benevolesUtilises, maxLivraisonsParRoute) {
    const eligibles = benevoles.filter(b => {
        // Ignorer les bénévoles déjà utilisés ce cycle
        if (benevolesUtilises.has(b.id)) return false;

        // Vérifier les contraintes du véhicule
        return vehiculeCompatible(b.vehicule, cluster, maxLivraisonsParRoute);
    });

    if (eligibles.length === 0) return null;

    // Sélectionner le plus petit véhicule suffisant (best-fit)
    eligibles.sort((a, b) => a.vehicule.capaciteKg - b.vehicule.capaciteKg);

    return eligibles[0];
}

/**
 * Trouve le bénévole disponible avec le plus grand véhicule (pour le split)
 *
 * @param {Array} benevoles         - Tous les bénévoles
 * @param {Set}   benevolesUtilises - IDs déjà utilisés ce cycle
 * @returns {Object|null}
 */
function chercherPlusGrandBenevole(benevoles, benevolesUtilises) {
    const disponibles = benevoles.filter(b => !benevolesUtilises.has(b.id));

    if (disponibles.length === 0) return null;

    // Trier par capaciteKg DESC → le plus grand véhicule en premier
    disponibles.sort((a, b) => b.vehicule.capaciteKg - a.vehicule.capaciteKg);

    return disponibles[0];
}

/**
 * Vérifie si un véhicule peut gérer un cluster
 *
 * @param {Object} vehicule             - Véhicule avec capaciteKg et nombrePartMax
 * @param {Object} cluster              - Cluster avec poids_total, nombre_parts, nombre_livraisons
 * @param {number} maxLivraisonsParRoute - Limite de livraisons
 * @returns {boolean}
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
 * Découpe un cluster en deux parties :
 * - sousCluster : livraisons prises séquentiellement jusqu'aux contraintes du véhicule
 * - reste        : livraisons restantes (remises en file)
 *
 * ⚠️ CHANGEMENT v3 : chaque livraison est pesée individuellement selon son type
 *    (hôtel ou domicile) via le calcul inline estHotel, au lieu du poids uniforme
 *    poidsParPart = poids_total / nombre_parts.
 *    Les valeurs poids_moyen_kg et poids_moyen_hotel_kg viennent de params.
 *
 * @param {Object} cluster              - Cluster à découper
 * @param {Object} benevole             - Bénévole assigné à la première partie
 * @param {number} poidsParPart         - Poids moyen domicile par personne (kg) [conservé pour compatibilité]
 * @param {number} maxLivraisonsParRoute - Limite de livraisons par route
 * @param {Object} params               - Paramètres de planification (poids_moyen_kg, poids_moyen_hotel_kg)
 * @returns {{ sousCluster: Object, reste: Object }}
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

    // Remplir séquentiellement jusqu'aux contraintes
    for (const livraison of cluster.livraisons) {
        const parts = parseInt(livraison.nombre_personnes) || 0;


        const estHotel = livraison.hotel === true || livraison.hotel === 'TRUE' || livraison.hotel === 'true';
        const poidsLivraison = parts * (estHotel ? poids_moyen_hotel_kg : poids_moyen_kg);

        const poidsApres = poidsA + poidsLivraison;
        const partsApres = partsA + parts;
        const nbLivraisons = livraisonsA.length + 1;

        if (
            poidsApres <= capaciteKg &&
            partsApres <= nombrePartMax &&
            nbLivraisons <= maxLivraisonsParRoute
        ) {
            livraisonsA.push(livraison);
            poidsA = poidsApres;
            partsA = partsApres;
        } else {
            livraisonsB.push(livraison);
        }
    }

    // Construire le sous-cluster A
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

    // Construire le reste (sous-cluster B)

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