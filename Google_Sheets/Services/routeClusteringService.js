/**
 * ====================================================================
 * ROUTE_SERVICE_CLUSTERING.GS - Algorithme de Clustering Géographique
 * ====================================================================
 * VERSION 4.0 - CORRECTION BUG poids_total
 *
 * ⚠️ CHANGEMENT v4 :
 * - Ajout du paramètre poids_moyen_kg à identifierClusters et grouperParBatiment
 * - Calcul de poids_total = nombre_parts * poids_moyen_kg sur chaque groupe/cluster
 * - Recalcul de poids_total lors de chaque fusion de groupe dans un cluster existant
 *
 * Clusters triés par distance du QG (le plus loin en premier)
 * pour garantir que R001 est toujours la route la plus éloignée.
 */

/**
 * Identifie les clusters géographiques
 * Clustering purement géographique - contraintes de capacité vérifiées à l'assignation
 *
 * @param {Array<Object>} livraisons     - Livraisons avec lat/lng/nombre_personnes
 * @param {number}        poids_moyen_kg - Poids moyen par personne (kg)
 * @returns {Array<Object>} Clusters triés par distance du QG (le plus loin en premier)
 */
function identifierClusters(livraisons, poids_moyen_kg) {
    const clusters = [];

    const DISTANCE_PROXIMITE = CONFIG.ROUTE_OPTIMIZATION.DISTANCE_PROXIMITE_KM;
    const MAX_DIAMETER = CONFIG.ROUTE_OPTIMIZATION.MAX_CLUSTER_DIAMETER_KM;
    const MIN_COMPACTNESS = CONFIG.ROUTE_OPTIMIZATION.MIN_COMPACTNESS_RATIO;
    const QUARTIER_PREFERENCE = CONFIG.ROUTE_OPTIMIZATION.QUARTIER_PREFERENCE;
    const ALLOW_CROSS_QUARTIER = CONFIG.ROUTE_OPTIMIZATION.ALLOW_CROSS_QUARTIER;

    const poidsParPart = parseFloat(poids_moyen_kg) || 0;

    Logger.log(`[CLUSTERING] 📐 Paramètres: proximité=${DISTANCE_PROXIMITE}km, diamètre_max=${MAX_DIAMETER}km`);
    Logger.log(`[CLUSTERING] ⚖️  Poids moyen par personne: ${poidsParPart}kg`);
    Logger.log(`[CLUSTERING] ℹ️  Clustering purement géographique (contraintes capacité vérifiées à l'assignation)`);

    // Étape 1 : Grouper les livraisons au même bâtiment
    const buildingGroups = grouperParBatiment(livraisons, poidsParPart);
    Logger.log(`[CLUSTERING] 🏢 ${buildingGroups.length} groupes de bâtiments identifiés`);

    // Étape 2 : Créer les clusters avec contrôles géographiques stricts
    for (const group of buildingGroups) {
        let meilleurCluster = null;
        let meilleurScore = -1;

        for (const cluster of clusters) {
            // Vérification 1 : Distance au centre
            const distCentre = calculerDistanceHaversine(
                cluster.centre.lat, cluster.centre.lng,
                group.centre.lat, group.centre.lng
            );
            if (distCentre > DISTANCE_PROXIMITE) continue;

            // Vérification 2 : Diamètre maximum
            const nouveauDiametre = calculateMaxDiameter(cluster.livraisons, group.livraisons);
            if (nouveauDiametre > MAX_DIAMETER) continue;

            // Vérification 3 : Compacité minimale
            const nouvelleCompacite = calculateCompactness(
                [...cluster.livraisons, ...group.livraisons]
            );
            if (nouvelleCompacite < MIN_COMPACTNESS) continue;

            // Vérification 4 : Préférence quartier
            const memeQuartier = cluster.quartier_id === group.quartier_id;
            if (!memeQuartier && !ALLOW_CROSS_QUARTIER) continue;

            // Calcul du score
            let score = 0;
            if (memeQuartier && QUARTIER_PREFERENCE) score += 10;
            score += (DISTANCE_PROXIMITE - distCentre) * 2;
            score += nouvelleCompacite * 5;

            if (score > meilleurScore) {
                meilleurScore = score;
                meilleurCluster = cluster;
            }
        }

        if (meilleurCluster) {
            // Fusionner le groupe dans le cluster existant
            meilleurCluster.livraisons.push(...group.livraisons);
            meilleurCluster.nombre_livraisons += group.livraisons.length;
            meilleurCluster.nombre_parts += group.nombre_parts;
            meilleurCluster.poids_total = meilleurCluster.nombre_parts * poidsParPart;
            mettreAJourCentre(meilleurCluster);

            Logger.log(
                `[CLUSTERING]   Groupe ajouté au cluster ${meilleurCluster.id} ` +
                `(${meilleurCluster.nombre_livraisons} livraisons, ` +
                `${meilleurCluster.nombre_parts} parts, ` +
                `${Math.round(meilleurCluster.poids_total)}kg)`
            );
        } else {
            // Créer un nouveau cluster
            const nouveauCluster = {
                id: `C${clusters.length + 1}`,
                centre: { ...group.centre },
                livraisons: [...group.livraisons],
                quartier_id: group.quartier_id,
                distance_hq: group.distance_hq,
                nombre_livraisons: group.livraisons.length,
                nombre_parts: group.nombre_parts,
                poids_total: group.poids_total
            };

            clusters.push(nouveauCluster);
            Logger.log(
                `[CLUSTERING]   Nouveau cluster ${nouveauCluster.id} créé ` +
                `(${nouveauCluster.nombre_livraisons} livraisons, ` +
                `${nouveauCluster.nombre_parts} parts, ` +
                `${Math.round(nouveauCluster.poids_total)}kg)`
            );
        }
    }

    // Étape 3 : Trier par distance du QG (le plus loin en premier)
    Logger.log(`[CLUSTERING] 🗺️ Tri de ${clusters.length} clusters par distance du QG (le plus loin en premier)...`);
    clusters.sort((a, b) => b.distance_hq - a.distance_hq);

    // Journal final
    Logger.log(`[CLUSTERING] 📊 Clusters finaux (triés par distance du QG) :`);
    clusters.forEach((c, index) => {
        const diametre = calculateClusterDiameter(c.livraisons);
        const compacite = calculateCompactness(c.livraisons);
        Logger.log(
            `[CLUSTERING]   ${index + 1}. ${c.id}: ${Math.round(c.distance_hq)}km du QG, ` +
            `${c.nombre_livraisons} livraisons, ${c.nombre_parts} parts, ` +
            `${Math.round(c.poids_total)}kg, ` +
            `diamètre=${Math.round(diametre * 10) / 10}km, ` +
            `compacité=${Math.round(compacite * 100)}%`
        );
    });

    return clusters;
}

/**
 * Groupe les livraisons par bâtiment (même adresse ≈ mêmes coordonnées GPS)
 * Calcule poids_total = nombre_parts * poids_moyen_kg pour chaque groupe
 *
 * @param {Array<Object>} livraisons     - Livraisons
 * @param {number}        poidsParPart   - Poids par personne en kg
 * @returns {Array<Object>} Groupes de bâtiments avec nombre_parts et poids_total calculés
 */
function grouperParBatiment(livraisons, poidsParPart) {
    const groupes = [];
    const traites = new Set();
    const SEUIL_KM = CONFIG.ROUTE_OPTIMIZATION.SAME_BUILDING_THRESHOLD_M / 1000;

    for (const livraison of livraisons) {
        if (traites.has(livraison.id_livraison)) continue;

        // Trouver toutes les livraisons au même bâtiment (< seuil)
        const memeBatiment = livraisons.filter(autre => {
            if (traites.has(autre.id_livraison)) return false;
            const dist = calculerDistanceHaversine(
                livraison.latitude, livraison.longitude,
                autre.latitude, autre.longitude
            );
            return dist < SEUIL_KM;
        });

        memeBatiment.forEach(l => traites.add(l.id_livraison));

        // Nombre total de parts = somme des nombre_personnes
        const totalParts = memeBatiment.reduce(
            (sum, l) => sum + (parseInt(l.nombre_personnes) || 0), 0
        );

        // Poids total du groupe
        const poidsTotal = totalParts * poidsParPart;

        // Distance au QG
        const distHQ = calculerDistanceHaversine(
            CONFIG.HQ.LAT, CONFIG.HQ.LNG,
            livraison.latitude, livraison.longitude
        );

        groupes.push({
            centre: { lat: livraison.latitude, lng: livraison.longitude },
            livraisons: memeBatiment,
            nombre_parts: totalParts,
            poids_total: poidsTotal,
            quartier_id: livraison.id_quartier,
            distance_hq: distHQ
        });

        if (memeBatiment.length > 1) {
            Logger.log(
                `[CLUSTERING] 🏢 Même bâtiment: ${memeBatiment.length} livraisons groupées ` +
                `(${totalParts} parts, ${Math.round(poidsTotal)}kg)`
            );
        }
    }

    return groupes;
}

/**
 * Met à jour le centre d'un cluster (barycentre des livraisons)
 * et recalcule la distance au QG
 *
 * @param {Object} cluster - Cluster à mettre à jour
 */
function mettreAJourCentre(cluster) {
    if (cluster.livraisons.length === 0) return;

    const totalLat = cluster.livraisons.reduce((sum, l) => sum + l.latitude, 0);
    const totalLng = cluster.livraisons.reduce((sum, l) => sum + l.longitude, 0);

    cluster.centre.lat = totalLat / cluster.livraisons.length;
    cluster.centre.lng = totalLng / cluster.livraisons.length;

    // Recalculer la distance au QG après déplacement du centre
    cluster.distance_hq = calculerDistanceHaversine(
        CONFIG.HQ.LAT, CONFIG.HQ.LNG,
        cluster.centre.lat, cluster.centre.lng
    );
}