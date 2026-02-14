/**
 * ====================================================================
 * ROUTE_SERVICE_GEOMETRY.GS - Calculs Géométriques et Distances
 * ====================================================================
 * Contient : calculateMaxDiameter(), calculateCompactness(), 
 *            calculerDistanceHaversine(), calculerDistanceTotaleRoute()
 * Responsabilité : Tous les calculs de distances et métriques géométriques
 */

/**
 * Calcule le diamètre maximum si on ajoute des nouvelles livraisons
 * Retourne la plus grande distance entre TOUS les points
 * @param {Array} existingLivraisons - Livraisons existantes dans le cluster
 * @param {Array} newLivraisons - Nouvelles livraisons à ajouter
 * @returns {number} Diamètre maximum en km
 */
function calculateMaxDiameter(existingLivraisons, newLivraisons) {
    const allLivraisons = [...existingLivraisons, ...newLivraisons];

    if (allLivraisons.length < 2) {
        return 0;
    }

    let maxDist = 0;

    // Vérifier toutes les paires de points
    for (let i = 0; i < allLivraisons.length; i++) {
        for (let j = i + 1; j < allLivraisons.length; j++) {
            const dist = calculerDistanceHaversine(
                allLivraisons[i].latitude,
                allLivraisons[i].longitude,
                allLivraisons[j].latitude,
                allLivraisons[j].longitude
            );
            maxDist = Math.max(maxDist, dist);
        }
    }

    return maxDist;
}

/**
 * Calcule le diamètre d'un cluster (version simple)
 * @param {Array} livraisons - Livraisons du cluster
 * @returns {number} Diamètre en km
 */
function calculateClusterDiameter(livraisons) {
    return calculateMaxDiameter(livraisons, []);
}

/**
 * Calcule la compacité d'un cluster
 * Ratio = distance_moyenne_au_centre / distance_max_au_centre
 * Plus proche de 1 = plus compact
 * @param {Array} livraisons - Livraisons
 * @returns {number} Ratio de compacité (0-1)
 */
function calculateCompactness(livraisons) {
    if (livraisons.length < 2) {
        return 1; // Un seul point = parfaitement compact
    }

    // Calculer le centre
    const centerLat = livraisons.reduce((sum, l) => sum + l.latitude, 0) / livraisons.length;
    const centerLng = livraisons.reduce((sum, l) => sum + l.longitude, 0) / livraisons.length;

    // Calculer distances au centre
    const distances = livraisons.map(l =>
        calculerDistanceHaversine(centerLat, centerLng, l.latitude, l.longitude)
    );

    const avgDist = distances.reduce((sum, d) => sum + d, 0) / distances.length;
    const maxDist = Math.max(...distances);

    if (maxDist === 0) {
        return 1; // Tous au même point
    }

    return avgDist / maxDist;
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