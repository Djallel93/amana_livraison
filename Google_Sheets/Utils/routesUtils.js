/**
 * 🔧 UTILITY: Reset orphaned deliveries
 * (Deliveries marked "Assignée" but not in any route)
 */
function resetOrphanedDeliveries() {
    Logger.log('[CLEANUP] 🧹 Starting orphan cleanup...');

    const allEtapes = getAllDataAsObjects(CONFIG.SHEETS.ETAPES_ROUTE);
    // Filter out HQ returns (NULL id_livraison) when building the set
    const etapeDeliveryIds = new Set(
        allEtapes
            .filter(e => e.id_livraison !== null && e.id_livraison !== '')
            .map(e => e.id_livraison)
    );

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
 * Handles both delivery objects and etape objects
 * @param {Array} items - Array of deliveries or etapes
 * @param {Object} hqCoords - HQ coordinates {lat, lng}
 * @returns {number} Total distance in km
 */
function calculateTotalDistanceWithHQ(items, hqCoords) {
    if (!items || items.length === 0) return 0;

    if (!hqCoords) {
        const hqConfig = getCurrentHqConfig();
        if (hqConfig && hqConfig.lat && hqConfig.lng) {
            hqCoords = {
                lat: hqConfig.lat,
                lng: hqConfig.lng
            };
        } else {
            Logger.log(`[ROUTES] ⚠️ HQ coordinates not found, using delivery-only distance`);
            return calculateItemsDistance(items);
        }
    }

    let totalDistance = 0;

    // Distance from HQ to first item
    const firstItem = items[0];
    totalDistance += calculerDistanceHaversine(
        hqCoords.lat,
        hqCoords.lng,
        firstItem.latitude,
        firstItem.longitude
    );

    // Distances between items
    for (let i = 0; i < items.length - 1; i++) {
        totalDistance += calculerDistanceHaversine(
            items[i].latitude,
            items[i].longitude,
            items[i + 1].latitude,
            items[i + 1].longitude
        );
    }

    // Distance from last item back to HQ
    const lastItem = items[items.length - 1];
    totalDistance += calculerDistanceHaversine(
        lastItem.latitude,
        lastItem.longitude,
        hqCoords.lat,
        hqCoords.lng
    );

    return totalDistance;
}

/**
 * 📏 Calculate distance between items only (no HQ)
 * @param {Array} items - Array of items with lat/lng
 * @returns {number} Total distance in km
 */
function calculateItemsDistance(items) {
    if (!items || items.length <= 1) return 0;

    let distance = 0;
    for (let i = 0; i < items.length - 1; i++) {
        distance += calculerDistanceHaversine(
            items[i].latitude,
            items[i].longitude,
            items[i + 1].latitude,
            items[i + 1].longitude
        );
    }
    return distance;
}

/**
 * 📏 Calculate total route distance (for comparison)
 * @param {Array} deliveries - Array of deliveries
 * @param {number} startLat - Starting latitude
 * @param {number} startLng - Starting longitude
 * @returns {number} Total distance in km
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

/**
 * 🏢 Get HQ coordinates from an etape's commentaire field
 * Used for historical routes where HQ may have changed
 * @param {Object} etape - Etape object
 * @returns {Object|null} {lat, lng, adresse} or null if not HQ return or can't parse
 */
function getHistoricalHqFromEtape(etape) {
    if (!etape || etape.id_livraison !== null) {
        return null; // Not an HQ return stop
    }

    const address = extractHqAddressFromCommentaire(etape.commentaire);
    if (!address) {
        return null; // Can't extract address from commentaire
    }

    // For historical accuracy, we have the address but not coordinates
    // Return current HQ coords as fallback (best we can do)
    const hqConfig = getCurrentHqConfig();
    return {
        lat: hqConfig.lat,
        lng: hqConfig.lng,
        adresse: address // Use historical address
    };
}

/**
 * 📍 Get coordinates for an etape (handles both deliveries and HQ returns)
 * @param {Object} etape - Etape object
 * @returns {Object} {lat, lng, adresse}
 */
function getEtapeCoordinatesFromEtape(etape) {
    // Check if this is an HQ return stop
    if (etape.id_livraison === null || etape.id_livraison === '') {
        const hqConfig = getCurrentHqConfig();
        const historicalAddress = extractHqAddressFromCommentaire(etape.commentaire);

        return {
            lat: hqConfig.lat,
            lng: hqConfig.lng,
            adresse: historicalAddress || hqConfig.address
        };
    }

    // Regular delivery stop - get from Livraison table
    const delivery = getDeliveryById(etape.id_livraison);
    if (!delivery) {
        throw new Error(`Livraison ${etape.id_livraison} introuvable pour étape ${etape.id_etape}`);
    }

    return {
        lat: delivery.latitude,
        lng: delivery.longitude,
        adresse: delivery.adresse
    };
}

/**
 * 🔍 Extract HQ address from commentaire field
 * @param {string} commentaire - Commentaire text
 * @returns {string|null} Extracted address or null
 */
function extractHqAddressFromCommentaire(commentaire) {
    if (!commentaire) return null;

    const match = commentaire.match(/Retour au QG - (.+)/);
    return match ? match[1] : null;
}