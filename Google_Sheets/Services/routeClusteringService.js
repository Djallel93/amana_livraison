/**
 * ====================================================================
 * ROUTE_SERVICE_CLUSTERING.GS - Algorithme de Clustering Adaptatif
 * ====================================================================
 * VERSION 2.0 - WITH DISTANCE-BASED SORTING
 * 
 * 🆕 CHANGE: Clusters are now sorted by distance from HQ (FARTHEST FIRST)
 * This ensures R001 is always the farthest route
 */

/**
 * Identifie les clusters géographiques
 * 🆕 NOW SORTS BY DISTANCE FROM HQ (FARTHEST FIRST)
 * 
 * @param {Array<Object>} livraisons - Livraisons
 * @param {number} poidsPartKg - Poids moyen par personne
 * @returns {Array<Object>} Clusters sorted by distance from HQ (farthest first)
 */
function identifierClusters(livraisons, poidsPartKg) {
    const clusters = [];

    const DISTANCE_PROXIMITE = CONFIG.ROUTE_OPTIMIZATION.DISTANCE_PROXIMITE_KM;
    const MAX_DIAMETER = CONFIG.ROUTE_OPTIMIZATION.MAX_CLUSTER_DIAMETER_KM;
    const MAX_WEIGHT = CONFIG.ROUTE_OPTIMIZATION.MAX_WEIGHT_PER_CLUSTER_KG;
    const MIN_COMPACTNESS = CONFIG.ROUTE_OPTIMIZATION.MIN_COMPACTNESS_RATIO;
    const QUARTIER_PREFERENCE = CONFIG.ROUTE_OPTIMIZATION.QUARTIER_PREFERENCE;
    const ALLOW_CROSS_QUARTIER = CONFIG.ROUTE_OPTIMIZATION.ALLOW_CROSS_QUARTIER;

    Logger.log(`[ROUTES] 📐 Paramètres clustering: proximité=${DISTANCE_PROXIMITE}km, diamètre_max=${MAX_DIAMETER}km`);

    // Étape 1: Grouper les livraisons au même bâtiment
    const buildingGroups = groupByBuilding(livraisons, poidsPartKg);
    Logger.log(`[ROUTES] 🏢 ${buildingGroups.length} groupes de bâtiments identifiés`);

    // Étape 2: Créer les clusters avec contrôles stricts
    for (const group of buildingGroups) {
        let bestCluster = null;
        let bestScore = -1;

        // Chercher le meilleur cluster existant
        for (const cluster of clusters) {
            // Check 1: Distance au centre
            const distToCenter = calculerDistanceHaversine(
                cluster.centre.lat,
                cluster.centre.lng,
                group.centre.lat,
                group.centre.lng
            );

            if (distToCenter > DISTANCE_PROXIMITE) {
                continue;
            }

            // Check 2: Diamètre maximum
            const newDiameter = calculateMaxDiameter(cluster.livraisons, group.livraisons);
            if (newDiameter > MAX_DIAMETER) {
                continue;
            }

            // Check 3: Poids total
            const newWeight = cluster.poids_total + group.poids_total;
            if (newWeight > MAX_WEIGHT) {
                continue;
            }

            // Check 4: Compacité
            const newCompactness = calculateCompactness(
                [...cluster.livraisons, ...group.livraisons]
            );
            if (newCompactness < MIN_COMPACTNESS) {
                continue;
            }

            // Check 5: Préférence quartier
            const sameQuartier = cluster.quartier_id === group.quartier_id;

            if (!sameQuartier && !ALLOW_CROSS_QUARTIER) {
                continue;
            }

            // Calculer le score
            let score = 0;

            if (sameQuartier && QUARTIER_PREFERENCE) {
                score += 10;
            }

            score += (DISTANCE_PROXIMITE - distToCenter) * 2;
            score += newCompactness * 5;

            if (score > bestScore) {
                bestScore = score;
                bestCluster = cluster;
            }
        }

        // Ajouter au meilleur cluster ou créer un nouveau
        if (bestCluster) {
            bestCluster.livraisons.push(...group.livraisons);
            bestCluster.poids_total += group.poids_total;
            bestCluster.nombre_livraisons += group.livraisons.length;
            updateClusterCenter(bestCluster);

            Logger.log(`[ROUTES]   Groupe ajouté au cluster ${bestCluster.id} (${bestCluster.nombre_livraisons} livraisons, ${Math.round(bestCluster.poids_total)}kg)`);
        } else {
            const newCluster = {
                id: `C${clusters.length + 1}`,
                centre: { ...group.centre },
                livraisons: [...group.livraisons],
                quartier_id: group.quartier_id,
                distance_hq: group.distance_hq,
                poids_total: group.poids_total,
                nombre_livraisons: group.livraisons.length
            };

            clusters.push(newCluster);
            Logger.log(`[ROUTES]   Nouveau cluster ${newCluster.id} créé (${newCluster.nombre_livraisons} livraisons, ${Math.round(newCluster.poids_total)}kg)`);
        }
    }

    // Étape 3: 🆕 TRIER PAR DISTANCE DU QG (PLUS LOIN EN PREMIER)
    Logger.log(`[ROUTES] 🗺️ Sorting ${clusters.length} clusters by distance from HQ (FARTHEST FIRST)...`);

    clusters.sort((a, b) => {
        // Sort DESCENDING (farthest first)
        return b.distance_hq - a.distance_hq;
    });

    // Log final des clusters
    Logger.log(`[ROUTES] 📊 Clusters finaux (triés par distance du QG - plus loin en premier):`);
    clusters.forEach((c, index) => {
        const diameter = calculateClusterDiameter(c.livraisons);
        const compactness = calculateCompactness(c.livraisons);
        Logger.log(`[ROUTES]   ${index + 1}. ${c.id}: ${Math.round(c.distance_hq)}km du QG, ` +
            `${c.nombre_livraisons} livraisons, ` +
            `${Math.round(c.poids_total)}kg, ` +
            `diamètre=${Math.round(diameter * 10) / 10}km, ` +
            `compacité=${Math.round(compactness * 100)}%`);
    });

    return clusters;
}

/**
 * Groupe les livraisons par bâtiment (même adresse)
 * UNCHANGED
 */
function groupByBuilding(livraisons, poidsPartKg) {
    const groups = [];
    const processed = new Set();
    const THRESHOLD_M = CONFIG.ROUTE_OPTIMIZATION.SAME_BUILDING_THRESHOLD_M;
    const THRESHOLD_KM = THRESHOLD_M / 1000;

    for (const livraison of livraisons) {
        if (processed.has(livraison.id_livraison)) {
            continue;
        }

        // Trouver toutes les livraisons au même bâtiment (< 50m)
        const sameBuilding = livraisons.filter(other => {
            if (processed.has(other.id_livraison)) return false;

            const dist = calculerDistanceHaversine(
                livraison.latitude,
                livraison.longitude,
                other.latitude,
                other.longitude
            );

            return dist < THRESHOLD_KM;
        });

        // Marquer comme traité
        sameBuilding.forEach(l => processed.add(l.id_livraison));

        // Calculer poids total
        const totalWeight = sameBuilding.reduce((sum, l) =>
            sum + (l.nombre_personnes * poidsPartKg), 0
        );

        // Calculer distance au QG
        const distHQ = calculerDistanceHaversine(
            CONFIG.HQ.LAT,
            CONFIG.HQ.LNG,
            livraison.latitude,
            livraison.longitude
        );

        groups.push({
            centre: {
                lat: livraison.latitude,
                lng: livraison.longitude
            },
            livraisons: sameBuilding,
            poids_total: totalWeight,
            quartier_id: livraison.id_quartier,
            distance_hq: distHQ
        });

        if (sameBuilding.length > 1) {
            Logger.log(`[ROUTES] 🏢 Même bâtiment: ${sameBuilding.length} livraisons groupées (${Math.round(totalWeight)}kg)`);
        }
    }

    return groups;
}

/**
 * Met à jour le centre d'un cluster
 * UNCHANGED
 */
function updateClusterCenter(cluster) {
    if (cluster.livraisons.length === 0) {
        return;
    }

    const totalLat = cluster.livraisons.reduce((sum, l) => sum + l.latitude, 0);
    const totalLng = cluster.livraisons.reduce((sum, l) => sum + l.longitude, 0);

    cluster.centre.lat = totalLat / cluster.livraisons.length;
    cluster.centre.lng = totalLng / cluster.livraisons.length;

    // 🆕 UPDATE: Also recalculate distance to HQ when center changes
    cluster.distance_hq = calculerDistanceHaversine(
        CONFIG.HQ.LAT,
        CONFIG.HQ.LNG,
        cluster.centre.lat,
        cluster.centre.lng
    );
}