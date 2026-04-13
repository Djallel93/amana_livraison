/**
 * ====================================================================
 * ROUTE_GEOMETRY_SERVICE.GS - Calculs Géométriques et Distances
 * ====================================================================
 * Modifications :
 * - calculerDistanceTotaleRoute : suppression de la jambe de retour QG
 *   Le calcul est désormais : QG → stop1 → stop2 → ... → dernierStop
 * - calculateSegmentDistance (TSP 2-opt) : même logique, pas de fermeture
 */

/**
 * Calcule le diamètre maximum si on ajoute de nouvelles livraisons au cluster.
 * Retourne la plus grande distance entre TOUS les points.
 *
 * @param {Array} existingLivraisons - Livraisons existantes dans le cluster
 * @param {Array} newLivraisons      - Nouvelles livraisons à ajouter
 * @returns {number} Diamètre maximum en km
 */
function calculateMaxDiameter(existingLivraisons, newLivraisons) {
    const allLivraisons = [...existingLivraisons, ...newLivraisons];

    if (allLivraisons.length < 2) return 0;

    let maxDist = 0;

    for (let i = 0; i < allLivraisons.length; i++) {
        for (let j = i + 1; j < allLivraisons.length; j++) {
            const dist = calculerDistanceHaversine(
                allLivraisons[i].latitude, allLivraisons[i].longitude,
                allLivraisons[j].latitude, allLivraisons[j].longitude
            );
            maxDist = Math.max(maxDist, dist);
        }
    }

    return maxDist;
}

/**
 * Calcule le diamètre d'un cluster (version simple, sans ajout).
 * @param {Array} livraisons - Livraisons du cluster
 * @returns {number} Diamètre en km
 */
function calculateClusterDiameter(livraisons) {
    return calculateMaxDiameter(livraisons, []);
}

/**
 * Calcule la compacité d'un cluster.
 * Ratio = distance_moyenne_au_centre / distance_max_au_centre
 * Plus proche de 1 = plus compact.
 *
 * @param {Array} livraisons - Livraisons
 * @returns {number} Ratio de compacité (0-1)
 */
function calculateCompactness(livraisons) {
    if (livraisons.length < 2) return 1;

    const centerLat = livraisons.reduce((sum, l) => sum + l.latitude, 0) / livraisons.length;
    const centerLng = livraisons.reduce((sum, l) => sum + l.longitude, 0) / livraisons.length;

    const distances = livraisons.map(l =>
        calculerDistanceHaversine(centerLat, centerLng, l.latitude, l.longitude)
    );

    const avgDist = distances.reduce((sum, d) => sum + d, 0) / distances.length;
    const maxDist = Math.max(...distances);

    if (maxDist === 0) return 1;

    return avgDist / maxDist;
}

/**
 * Calcule la distance Haversine entre deux points GPS.
 * @param {number} lat1
 * @param {number} lng1
 * @param {number} lat2
 * @param {number} lng2
 * @returns {number} Distance en km
 */
function calculerDistanceHaversine(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;

    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

/**
 * Calcule la distance totale d'une route.
 * Formule : QG → stop1 → stop2 → ... → dernierStop (PAS de retour au QG).
 *
 * @param {Array}        livraisons - Livraisons ordonnées
 * @param {Object|null}  hqCoords   - Coordonnées du QG {lat, lng} (optionnel)
 * @returns {number} Distance totale en km
 */
function calculerDistanceTotaleRoute(livraisons, hqCoords) {
    if (!livraisons || livraisons.length === 0) return 0;

    // Récupération du QG si non fourni
    if (!hqCoords) {
        const hqConfig = getCurrentHqConfig();
        if (hqConfig && hqConfig.lat && hqConfig.lng) {
            hqCoords = { lat: hqConfig.lat, lng: hqConfig.lng };
        } else {
            Logger.log('[ROUTES] ⚠️ Coordonnées QG introuvables — calcul sans départ QG');
            // Calcul inter-stops uniquement
            let distance = 0;
            for (let i = 0; i < livraisons.length - 1; i++) {
                distance += calculerDistanceHaversine(
                    livraisons[i].latitude, livraisons[i].longitude,
                    livraisons[i + 1].latitude, livraisons[i + 1].longitude
                );
            }
            return distance;
        }
    }

    let distance = 0;

    // QG → premier stop
    distance += calculerDistanceHaversine(
        hqCoords.lat, hqCoords.lng,
        livraisons[0].latitude, livraisons[0].longitude
    );

    // Stop à stop
    for (let i = 0; i < livraisons.length - 1; i++) {
        distance += calculerDistanceHaversine(
            livraisons[i].latitude, livraisons[i].longitude,
            livraisons[i + 1].latitude, livraisons[i + 1].longitude
        );
    }

    // Pas de retour au QG

    return distance;
}

/**
 * Calcule la distance d'un segment de route pour l'algorithme 2-opt.
 * Pas de jambe de retour au QG même pour le dernier segment.
 *
 * @param {Array}  route    - Route complète
 * @param {number} i        - Index de début du segment
 * @param {number} j        - Index de fin du segment
 * @param {Object} hqCoords - Coordonnées du QG
 * @returns {number} Distance en km
 */
function calculateSegmentDistance(route, i, j, hqCoords) {
    let distance = 0;

    // Distance depuis le QG (ou le stop précédent) jusqu'au début du segment
    if (i === 0) {
        distance += calculerDistanceHaversine(
            hqCoords.lat, hqCoords.lng,
            route[0].latitude, route[0].longitude
        );
    } else {
        distance += calculerDistanceHaversine(
            route[i - 1].latitude, route[i - 1].longitude,
            route[i].latitude, route[i].longitude
        );
    }

    // Distance à travers le segment
    for (let k = i; k < j; k++) {
        distance += calculerDistanceHaversine(
            route[k].latitude, route[k].longitude,
            route[k + 1].latitude, route[k + 1].longitude
        );
    }

    // Distance depuis la fin du segment vers le stop suivant
    // Si c'est le dernier stop, on ne revient PAS au QG
    if (j < route.length - 1) {
        distance += calculerDistanceHaversine(
            route[j].latitude, route[j].longitude,
            route[j + 1].latitude, route[j + 1].longitude
        );
    }
    // Pas de retour QG pour j === route.length - 1

    return distance;
}
