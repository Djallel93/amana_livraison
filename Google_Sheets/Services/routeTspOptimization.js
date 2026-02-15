/**
 * ====================================================================
 * ROUTE_TSP_OPTIMIZATION.GS - TSP Optimization for Route Ordering
 * ====================================================================
 * Implements Nearest Neighbor + 2-opt for optimal delivery order
 * Priority: Start Closest > Logical Flow > Shortest Distance
 * 
 * 🎯 KEY FEATURES:
 * - Nearest Neighbor algorithm (greedy start)
 * - 2-opt improvement (eliminate crossings)
 * - HQ-aware (always starts from HQ)
 * - Pattern: HQ → closest → gradually outward → HQ
 */

/**
 * 🎯 MAIN FUNCTION: Optimize delivery order for a route
 * @param {Array<Object>} deliveries - Deliveries with lat/lng
 * @param {Object} hqCoords - {lat, lng} HQ coordinates
 * @returns {Array<Object>} Deliveries in optimized order
 */
function optimizeDeliveryOrder(deliveries, hqCoords) {
    if (!deliveries || deliveries.length === 0) {
        return [];
    }

    if (deliveries.length === 1) {
        return deliveries;
    }

    Logger.log(`[TSP] 🔄 Optimizing ${deliveries.length} deliveries...`);

    // Step 1: Nearest Neighbor (greedy construction)
    let route = nearestNeighborTSP(deliveries, hqCoords);

    // Step 2: 2-opt improvement (eliminate crossings)
    route = twoOptImprovement(route, hqCoords);

    // Calculate distances
    const originalDistance = calculateRouteDistance(deliveries, hqCoords.lat, hqCoords.lng);
    const optimizedDistance = calculateRouteDistance(route, hqCoords.lat, hqCoords.lng);
    const improvement = ((originalDistance - optimizedDistance) / originalDistance * 100).toFixed(1);

    Logger.log(`[TSP] 📏 Original: ${Math.round(originalDistance)}km → Optimized: ${Math.round(optimizedDistance)}km (${improvement}% better)`);

    return route;
}

/**
 * 🚀 Nearest Neighbor Algorithm
 * Greedy approach: always visit nearest unvisited delivery
 * Pattern: HQ → nearest → next nearest → ... → HQ
 * 
 * @param {Array<Object>} deliveries - All deliveries
 * @param {Object} hqCoords - HQ coordinates
 * @returns {Array<Object>} Ordered deliveries
 */
function nearestNeighborTSP(deliveries, hqCoords) {
    const visited = new Set();
    const route = [];

    let currentLat = hqCoords.lat;
    let currentLng = hqCoords.lng;

    Logger.log(`[TSP] 🏢 Starting from HQ (${currentLat}, ${currentLng})`);

    // Visit each delivery, always picking the nearest unvisited one
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

        if (nearestIndex === -1) break; // Should never happen

        // Add nearest delivery to route
        visited.add(nearestIndex);
        route.push(deliveries[nearestIndex]);

        // Update current position
        currentLat = deliveries[nearestIndex].latitude;
        currentLng = deliveries[nearestIndex].longitude;

        if (i < 5 || i === deliveries.length - 1) {
            Logger.log(`[TSP]   ${i + 1}. ${deliveries[nearestIndex].id_livraison} (${Math.round(shortestDistance * 1000)}m from previous)`);
        } else if (i === 5) {
            Logger.log(`[TSP]   ... (${deliveries.length - 6} more stops)`);
        }
    }

    return route;
}

/**
 * 🔧 2-opt Improvement Algorithm
 * Eliminates crossing paths by reversing route segments
 * 
 * How it works:
 * 1. Try reversing every possible segment of the route
 * 2. Keep the reversal if it reduces total distance
 * 3. Repeat until no improvement found
 * 
 * Example:
 *   Before: A → B → C → D → E
 *   If reversing B→C→D gives shorter path:
 *   After:  A → D → C → B → E
 * 
 * @param {Array<Object>} route - Initial route
 * @param {Object} hqCoords - HQ coordinates
 * @returns {Array<Object>} Improved route
 */
function twoOptImprovement(route, hqCoords) {
    if (route.length < 4) {
        return route; // Too small for 2-opt to help
    }

    Logger.log(`[TSP] 🔧 Applying 2-opt improvement...`);

    let improved = true;
    let iterations = 0;
    const MAX_ITERATIONS = 200; // Prevent infinite loop

    while (improved && iterations < MAX_ITERATIONS) {
        improved = false;
        iterations++;

        // Try all possible segment reversals
        for (let i = 0; i < route.length - 1; i++) {
            for (let j = i + 2; j < route.length; j++) {
                // Calculate current distance for this segment
                const currentDist = calculateSegmentDistance(route, i, j, hqCoords);

                // Reverse segment [i+1, j]
                const newRoute = [...route];
                reverseSegment(newRoute, i + 1, j);

                // Calculate new distance
                const newDist = calculateSegmentDistance(newRoute, i, j, hqCoords);

                // If improvement found, keep it
                if (newDist < currentDist) {
                    route = newRoute;
                    improved = true;
                    Logger.log(`[TSP]    Iteration ${iterations}: Improved by reversing segment [${i + 1}, ${j}]`);
                    break;
                }
            }

            if (improved) break; // Start over with improved route
        }
    }

    Logger.log(`[TSP] ✅ 2-opt completed in ${iterations} iterations`);

    return route;
}

/**
 * Calculate distance for a segment of the route
 * Used by 2-opt to evaluate improvements
 * 
 * @param {Array<Object>} route - Full route
 * @param {number} i - Segment start index
 * @param {number} j - Segment end index
 * @param {Object} hqCoords - HQ coordinates
 * @returns {number} Distance in km
 */
function calculateSegmentDistance(route, i, j, hqCoords) {
    let distance = 0;

    // Distance from HQ (or previous stop) to first stop in segment
    if (i === 0) {
        distance += calculerDistanceHaversine(
            hqCoords.lat,
            hqCoords.lng,
            route[0].latitude,
            route[0].longitude
        );
    } else {
        distance += calculerDistanceHaversine(
            route[i - 1].latitude,
            route[i - 1].longitude,
            route[i].latitude,
            route[i].longitude
        );
    }

    // Distance through the segment
    for (let k = i; k < j; k++) {
        distance += calculerDistanceHaversine(
            route[k].latitude,
            route[k].longitude,
            route[k + 1].latitude,
            route[k + 1].longitude
        );
    }

    // Distance from last stop in segment to next stop (or HQ)
    if (j < route.length - 1) {
        distance += calculerDistanceHaversine(
            route[j].latitude,
            route[j].longitude,
            route[j + 1].latitude,
            route[j + 1].longitude
        );
    } else {
        distance += calculerDistanceHaversine(
            route[j].latitude,
            route[j].longitude,
            hqCoords.lat,
            hqCoords.lng
        );
    }

    return distance;
}

/**
 * Reverse a segment of the route in-place
 * 
 * @param {Array<Object>} route - Route to modify
 * @param {number} start - Start index (inclusive)
 * @param {number} end - End index (inclusive)
 */
function reverseSegment(route, start, end) {
    while (start < end) {
        // Swap elements
        const temp = route[start];
        route[start] = route[end];
        route[end] = temp;
        start++;
        end--;
    }
}

/**
 * 🎯 FINAL STEP: Assign ordre_passage based on optimized order
 * This replaces the simple sequential assignment in createPreliminaryEtapes
 * 
 * @param {Array<Object>} optimizedDeliveries - Deliveries in optimal order
 * @returns {Array<Object>} Deliveries with ordre_passage assigned
 */
function assignOrdrePassage(optimizedDeliveries) {
    return optimizedDeliveries.map((delivery, index) => {
        return {
            ...delivery,
            _ordre_passage: index + 1
        };
    });
}

/**
 * 📊 Calculate quality metrics for a route
 * Useful for comparing before/after optimization
 * 
 * @param {Array<Object>} route - Route to analyze
 * @param {Object} hqCoords - HQ coordinates
 * @returns {Object} Metrics
 */
function calculateRouteMetrics(route, hqCoords) {
    if (!route || route.length === 0) {
        return {
            totalDistance: 0,
            averageSegmentDistance: 0,
            maxSegmentDistance: 0,
            backtrackingCount: 0
        };
    }

    let totalDistance = 0;
    let maxSegmentDistance = 0;
    let backtrackingCount = 0;

    // HQ to first stop
    const firstDist = calculerDistanceHaversine(
        hqCoords.lat,
        hqCoords.lng,
        route[0].latitude,
        route[0].longitude
    );
    totalDistance += firstDist;
    maxSegmentDistance = Math.max(maxSegmentDistance, firstDist);

    // Between stops
    for (let i = 0; i < route.length - 1; i++) {
        const dist = calculerDistanceHaversine(
            route[i].latitude,
            route[i].longitude,
            route[i + 1].latitude,
            route[i + 1].longitude
        );
        totalDistance += dist;
        maxSegmentDistance = Math.max(maxSegmentDistance, dist);

        // Detect backtracking (moving away from HQ then back towards it)
        if (i > 0) {
            const distToHqBefore = calculerDistanceHaversine(
                route[i].latitude,
                route[i].longitude,
                hqCoords.lat,
                hqCoords.lng
            );
            const distToHqAfter = calculerDistanceHaversine(
                route[i + 1].latitude,
                route[i + 1].longitude,
                hqCoords.lat,
                hqCoords.lng
            );

            // If we're moving significantly back towards HQ (more than 1km closer)
            if (distToHqAfter < distToHqBefore - 1) {
                backtrackingCount++;
            }
        }
    }

    // Last stop back to HQ
    const lastDist = calculerDistanceHaversine(
        route[route.length - 1].latitude,
        route[route.length - 1].longitude,
        hqCoords.lat,
        hqCoords.lng
    );
    totalDistance += lastDist;
    maxSegmentDistance = Math.max(maxSegmentDistance, lastDist);

    return {
        totalDistance: Math.round(totalDistance * 100) / 100,
        averageSegmentDistance: Math.round((totalDistance / (route.length + 1)) * 100) / 100,
        maxSegmentDistance: Math.round(maxSegmentDistance * 100) / 100,
        backtrackingCount: backtrackingCount
    };
}

/**
 * 🏆 BONUS: Sort clusters by distance from HQ (farthest first)
 * This ensures R001 is always the farthest route
 * 
 * @param {Array<Object>} clusters - Clusters with distance_hq
 * @returns {Array<Object>} Sorted clusters (farthest first)
 */
function sortClustersByDistanceFromHQ(clusters) {
    Logger.log(`[TSP] 🗺️ Sorting ${clusters.length} clusters by distance from HQ...`);

    const sorted = [...clusters].sort((a, b) => {
        // Sort DESCENDING (farthest first)
        return b.distance_hq - a.distance_hq;
    });

    Logger.log(`[TSP] 📍 Cluster order (farthest to closest):`);
    sorted.forEach((cluster, index) => {
        Logger.log(`[TSP]   ${index + 1}. ${cluster.id}: ${Math.round(cluster.distance_hq)}km from HQ (${cluster.nombre_livraisons} deliveries)`);
    });

    return sorted;
}

/**
 * 🧪 TEST FUNCTION: Compare optimization algorithms
 */
function TEST_compareOptimizationMethods() {
    Logger.log('========================================');
    Logger.log('🧪 TSP OPTIMIZATION COMPARISON TEST');
    Logger.log('========================================');

    // Get a sample route
    const routes = filterData(CONFIG.SHEETS.ROUTES, row => row.statut === CONFIG.ENUMS.STATUT_ROUTE.BROUILLON);

    if (routes.length === 0) {
        Logger.log('❌ No draft routes found for testing');
        return;
    }

    const route = routes[0];
    Logger.log(`\n📍 Testing route: ${route.id_route}`);

    // Get deliveries
    const deliveries = getDeliveriesForRoute(route.id_route);
    Logger.log(`   Deliveries: ${deliveries.length}`);

    if (deliveries.length < 3) {
        Logger.log('❌ Not enough deliveries for meaningful test');
        return;
    }

    // Get HQ
    const hqConfig = getCurrentHqConfig();
    if (!hqConfig) {
        Logger.log('❌ HQ not configured');
        return;
    }

    Logger.log(`\n📊 METHOD 1: Original (Sequential)`);
    const metrics1 = calculateRouteMetrics(deliveries, hqConfig);
    Logger.log(`   Distance: ${metrics1.totalDistance}km`);
    Logger.log(`   Avg segment: ${metrics1.averageSegmentDistance}km`);
    Logger.log(`   Max segment: ${metrics1.maxSegmentDistance}km`);
    Logger.log(`   Backtracking: ${metrics1.backtrackingCount} times`);

    Logger.log(`\n📊 METHOD 2: Nearest Neighbor only`);
    const nnRoute = nearestNeighborTSP(deliveries, hqConfig);
    const metrics2 = calculateRouteMetrics(nnRoute, hqConfig);
    Logger.log(`   Distance: ${metrics2.totalDistance}km`);
    Logger.log(`   Avg segment: ${metrics2.averageSegmentDistance}km`);
    Logger.log(`   Max segment: ${metrics2.maxSegmentDistance}km`);
    Logger.log(`   Backtracking: ${metrics2.backtrackingCount} times`);

    Logger.log(`\n📊 METHOD 3: Nearest Neighbor + 2-opt`);
    const optimizedRoute = optimizeDeliveryOrder(deliveries, hqConfig);
    const metrics3 = calculateRouteMetrics(optimizedRoute, hqConfig);
    Logger.log(`   Distance: ${metrics3.totalDistance}km`);
    Logger.log(`   Avg segment: ${metrics3.averageSegmentDistance}km`);
    Logger.log(`   Max segment: ${metrics3.maxSegmentDistance}km`);
    Logger.log(`   Backtracking: ${metrics3.backtrackingCount} times`);

    Logger.log(`\n🏆 RESULTS:`);
    const improvement_nn = ((metrics1.totalDistance - metrics2.totalDistance) / metrics1.totalDistance * 100).toFixed(1);
    const improvement_2opt = ((metrics1.totalDistance - metrics3.totalDistance) / metrics1.totalDistance * 100).toFixed(1);

    Logger.log(`   Nearest Neighbor: ${improvement_nn}% better than sequential`);
    Logger.log(`   NN + 2-opt: ${improvement_2opt}% better than sequential`);
    Logger.log(`   2-opt adds: ${(improvement_2opt - improvement_nn).toFixed(1)}% extra improvement`);

    Logger.log('\n========================================');
}