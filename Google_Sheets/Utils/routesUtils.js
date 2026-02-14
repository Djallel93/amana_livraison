/**
 * 🔧 UTILITY: Reset orphaned deliveries
 * (Deliveries marked "Assignée" but not in any route)
 */
function resetOrphanedDeliveries() {
    Logger.log('[CLEANUP] 🧹 Starting orphan cleanup...');

    const allEtapes = getAllDataAsObjects(CONFIG.SHEETS.ETAPES_ROUTE);
    const etapeDeliveryIds = new Set(allEtapes.map(e => e.id_livraison));

    const assignedDeliveries = filterData(CONFIG.SHEETS.LIVRAISON, row =>
        row.statut === CONFIG.ENUMS.STATUT_LIVRAISON.ASSIGNEE
    );

    Logger.log(`[CLEANUP] Found ${assignedDeliveries.length} deliveries marked "Assignée"`);
    Logger.log(`[CLEANUP] Found ${etapeDeliveryIds.size} deliveries in etapes`);

    let resetCount = 0;

    for (const delivery of assignedDeliveries) {
        if (!etapeDeliveryIds.has(delivery.id_livraison)) {
            // Orphan found - reset to Non Assignée
            updateDeliveryStatus(
                delivery.id_livraison,
                CONFIG.ENUMS.STATUT_LIVRAISON.NON_ASSIGNEE
            );
            resetCount++;
        }
    }

    Logger.log(`[CLEANUP] ✅ Reset ${resetCount} orphaned deliveries to "Non Assignée"`);

    return {
        found: assignedDeliveries.length,
        inEtapes: etapeDeliveryIds.size,
        reset: resetCount
    };
}

/**
 * 🔄 Optimize route order using Nearest Neighbor algorithm (simplified TSP)
 * @param {Array} deliveries - Array of delivery objects with lat/lng
 * @returns {Array} Deliveries in optimized order
 */
function optimizeRouteOrder(deliveries) {
    if (deliveries.length <= 1) {
        return deliveries;
    }

    Logger.log(`[OPTIMIZE] 🔄 Optimizing order for ${deliveries.length} deliveries...`);

    const hqConfig = getCurrentHqConfig();

    if (!hqConfig || !hqConfig.lat || !hqConfig.lng) {
        Logger.log(`[OPTIMIZE] ⚠️ HQ coordinates not found, using first delivery as start`);
        return deliveries;
    }

    const visited = new Set();
    const optimized = [];
    let currentLat = hqConfig.lat;
    let currentLng = hqConfig.lng;

    // Nearest neighbor algorithm
    for (let i = 0; i < deliveries.length; i++) {
        let nearestIndex = -1;
        let shortestDistance = Infinity;

        // Find nearest unvisited delivery
        for (let j = 0; j < deliveries.length; j++) {
            if (visited.has(j)) continue;

            const distance = calculerDistanceHaversine(
                currentLat,
                currentLng,
                deliveries[j].latitude,
                deliveries[j].longitude
            );

            if (distance < shortestDistance) {
                shortestDistance = distance;
                nearestIndex = j;
            }
        }

        if (nearestIndex === -1) break;

        // Add nearest delivery to optimized route
        visited.add(nearestIndex);
        optimized.push(deliveries[nearestIndex]);

        // Update current position
        currentLat = deliveries[nearestIndex].latitude;
        currentLng = deliveries[nearestIndex].longitude;

        Logger.log(`[OPTIMIZE]   ${i + 1}. ${deliveries[nearestIndex].id_livraison} (${Math.round(shortestDistance * 1000)}m from previous)`);
    }

    // Calculate improvement
    const originalDistance = calculateRouteDistance(deliveries, hqConfig.lat, hqConfig.lng);
    const optimizedDistance = calculateRouteDistance(optimized, hqConfig.lat, hqConfig.lng);
    const improvement = ((originalDistance - optimizedDistance) / originalDistance * 100).toFixed(1);

    Logger.log(`[OPTIMIZE] ✅ Original: ${Math.round(originalDistance)}km, Optimized: ${Math.round(optimizedDistance)}km (${improvement}% improvement)`);

    return optimized;
}

/**
 * 📏 Calculate total distance including return to HQ
 */
function calculateTotalDistanceWithHQ(deliveries, hqCoords) {
    if (deliveries.length === 0) return 0;

    let totalDistance = 0;

    // Distance from HQ to first delivery
    totalDistance += calculerDistanceHaversine(
        hqCoords.lat,
        hqCoords.lng,
        deliveries[0].latitude,
        deliveries[0].longitude
    );

    // Distances between deliveries
    for (let i = 0; i < deliveries.length - 1; i++) {
        totalDistance += calculerDistanceHaversine(
            deliveries[i].latitude,
            deliveries[i].longitude,
            deliveries[i + 1].latitude,
            deliveries[i + 1].longitude
        );
    }

    // Distance from last delivery back to HQ
    const lastDelivery = deliveries[deliveries.length - 1];
    totalDistance += calculerDistanceHaversine(
        lastDelivery.latitude,
        lastDelivery.longitude,
        hqCoords.lat,
        hqCoords.lng
    );

    return totalDistance;
}

/**
 * 📏 Calculate total route distance (for comparison)
 */
function calculateRouteDistance(deliveries, startLat, startLng) {
    if (deliveries.length === 0) return 0;

    let distance = 0;

    // HQ to first delivery
    distance += calculerDistanceHaversine(
        startLat,
        startLng,
        deliveries[0].latitude,
        deliveries[0].longitude
    );

    // Between deliveries
    for (let i = 0; i < deliveries.length - 1; i++) {
        distance += calculerDistanceHaversine(
            deliveries[i].latitude,
            deliveries[i].longitude,
            deliveries[i + 1].latitude,
            deliveries[i + 1].longitude
        );
    }

    // Last delivery back to HQ
    distance += calculerDistanceHaversine(
        deliveries[deliveries.length - 1].latitude,
        deliveries[deliveries.length - 1].longitude,
        startLat,
        startLng
    );

    return distance;
}

/**
 * Helper: Gets the next etape number across all routes
 * @returns {number}
 */
function getNextEtapeNumber() {
    const data = getAllData(CONFIG.SHEETS.ETAPES_ROUTE);

    if (data.length === 0) {
        return 1;
    }

    const numbers = data
        .map(row => row[CONFIG.COLUMNS.ETAPES_ROUTE.ID_ETAPE - 1])
        .filter(id => id && typeof id === 'string' && id.startsWith('E'))
        .map(id => parseInt(id.substring(1)))
        .filter(num => !isNaN(num));

    return numbers.length > 0 ? Math.max(...numbers) + 1 : 1;
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
                type: 'remote_route',
                id_route: route.id_route,
                distance: route.distance_totale_km,
                message: `Route ${route.id_route} très éloignée (${Math.round(route.distance_totale_km)} km)`
            });
        }
    }

    return warnings;
}