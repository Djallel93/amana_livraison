/**
 * ====================================================================
 * ROUTE_SERVICE_CLUSTERING.GS - Algorithme de Clustering Adaptatif
 * ====================================================================
 * Contient : identifierClusters(), groupByBuilding(), updateClusterCenter()
 * Responsabilité : Créer des clusters compacts en empêchant l'allongement
 * 
 * 🎯 CŒUR DE L'ALGORITHME : Contrôle du diamètre maximum pour éviter
 * les clusters allongés (ex: Quartier 36 qui s'étendait sur 8.5km)
 */

/**
 * Identifie les clusters géographiques (VERSION AMÉLIORÉE)
 * Empêche les clusters allongés grâce au contrôle du diamètre maximum
 * @param {Array<Object>} livraisons - Livraisons
 * @param {number} poidsPartKg - Poids moyen par personne
 * @returns {Array<Object>}
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
                continue; // Trop loin du centre
            }

            // Check 2: Diamètre maximum (CRITIQUE - empêche l'allongement!)
            const newDiameter = calculateMaxDiameter(cluster.livraisons, group.livraisons);
            if (newDiameter > MAX_DIAMETER) {
                continue; // Cluster deviendrait trop allongé
            }

            // Check 3: Poids total
            const newWeight = cluster.poids_total + group.poids_total;
            if (newWeight > MAX_WEIGHT) {
                continue; // Dépasserait la capacité
            }

            // Check 4: Compacité (optionnel mais recommandé)
            const newCompactness = calculateCompactness(
                [...cluster.livraisons, ...group.livraisons]
            );
            if (newCompactness < MIN_COMPACTNESS) {
                continue; // Cluster trop dispersé
            }

            // Check 5: Préférence quartier (soft constraint)
            const sameQuartier = cluster.quartier_id === group.quartier_id;

            if (!sameQuartier && !ALLOW_CROSS_QUARTIER) {
                continue; // Quartiers différents non autorisés
            }

            // Calculer le score de ce cluster
            let score = 0;

            // Bonus si même quartier
            if (sameQuartier && QUARTIER_PREFERENCE) {
                score += 10;
            }

            // Bonus pour proximité (plus proche = meilleur)
            score += (DISTANCE_PROXIMITE - distToCenter) * 2;

            // Bonus pour compacité
            score += newCompactness * 5;

            // Garder le meilleur cluster
            if (score > bestScore) {
                bestScore = score;
                bestCluster = cluster;
            }
        }

        // Ajouter au meilleur cluster ou créer un nouveau
        if (bestCluster) {
            // Ajouter au cluster existant
            bestCluster.livraisons.push(...group.livraisons);
            bestCluster.poids_total += group.poids_total;
            bestCluster.nombre_livraisons += group.livraisons.length;
            updateClusterCenter(bestCluster);

            Logger.log(`[ROUTES]   Groupe ajouté au cluster ${bestCluster.id} (${bestCluster.nombre_livraisons} livraisons, ${Math.round(bestCluster.poids_total)}kg)`);
        } else {
            // Créer un nouveau cluster
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

    // Étape 3: Trier par NOMBRE DE LIVRAISONS (DESC)
    clusters.sort((a, b) => b.nombre_livraisons - a.nombre_livraisons);

    // Log final des clusters
    Logger.log(`[ROUTES] 📊 Clusters finaux (triés par nombre de livraisons):`);
    clusters.forEach((c, index) => {
        const diameter = calculateClusterDiameter(c.livraisons);
        const compactness = calculateCompactness(c.livraisons);
        Logger.log(`[ROUTES]   ${index + 1}. ${c.id}: ${c.nombre_livraisons} livraisons, ` +
            `${Math.round(c.poids_total)}kg, diamètre=${Math.round(diameter * 10) / 10}km, ` +
            `compacité=${Math.round(compactness * 100)}%, ${Math.round(c.distance_hq)}km du QG`);
    });

    return clusters;
}

/**
 * Groupe les livraisons par bâtiment (même adresse)
 * @param {Array} livraisons - Livraisons
 * @param {number} poidsPartKg - Poids par personne
 * @returns {Array} Groupes de livraisons
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
 * @param {Object} cluster - Cluster à mettre à jour
 */
function updateClusterCenter(cluster) {
    if (cluster.livraisons.length === 0) {
        return;
    }

    const totalLat = cluster.livraisons.reduce((sum, l) => sum + l.latitude, 0);
    const totalLng = cluster.livraisons.reduce((sum, l) => sum + l.longitude, 0);

    cluster.centre.lat = totalLat / cluster.livraisons.length;
    cluster.centre.lng = totalLng / cluster.livraisons.length;
}