/**
 * 🐛 DEBUG: Test max_livraisons parameter handling
 */
function testMaxLivraisonsParameter() {
    Logger.log('========================================');
    Logger.log('🔍 DEBUG: Testing max_livraisons parameter');
    Logger.log('========================================');

    // Simulate planning with max_livraisons = 5
    const testParams = {
        date_livraison: '2026-02-15',
        occasion: 'Noël',
        max_livraisons: 5,
        poids_moyen_kg: 10,
        relivre: true,
        vehicules_pretes: []
    };

    Logger.log(`📋 Test params: ${JSON.stringify(testParams)}`);
    Logger.log('');

    // Get deliveries
    const livraisons = getUnassignedDeliveriesForDate(testParams.date_livraison);
    Logger.log(`📦 Found ${livraisons.length} unassigned deliveries`);
    Logger.log('');

    // Get volunteers
    const benevoles = getAvailableVolunteers(testParams);
    Logger.log(`👥 Found ${benevoles.length} available volunteers`);
    benevoles.forEach(b => {
        Logger.log(`  • ${b.nom} - ${b.vehicule.type} (${b.vehicule.capaciteKg}kg)`);
    });
    Logger.log('');

    // Create clusters
    const clusters = identifierClusters(livraisons, testParams.poids_moyen_kg);
    Logger.log(`🗺️ Created ${clusters.length} clusters`);
    clusters.forEach(c => {
        Logger.log(`  • Cluster ${c.id}: ${c.nombre_livraisons} deliveries, ${Math.round(c.poids_total)}kg`);
    });
    Logger.log('');

    // Assign to vehicles
    Logger.log(`🚗 Assigning clusters to vehicles with max_livraisons = ${testParams.max_livraisons}`);
    const routes = assignerClustersAuxVehicules(clusters, benevoles, testParams);

    Logger.log('');
    Logger.log('📊 RESULTS:');
    Logger.log('========================================');
    routes.forEach((route, index) => {
        Logger.log(`Route ${index + 1}:`);
        Logger.log(`  • Volunteer: ${route.benevole.nom}`);
        Logger.log(`  • Vehicle: ${route.benevole.vehicule.type} (${route.benevole.vehicule.capaciteKg}kg)`);
        Logger.log(`  • Deliveries: ${route.livraisons.length} ⚠️ ${route.livraisons.length > testParams.max_livraisons ? 'EXCEEDS MAX!' : 'OK'}`);
        Logger.log(`  • Weight: ${Math.round(route.poids_total)}kg`);
        Logger.log(`  • Clusters: ${route.clusters_assignes.join(', ')}`);
        Logger.log('');
    });

    // Check for violations
    Logger.log('========================================');
    const violations = routes.filter(r => r.livraisons.length > testParams.max_livraisons);
    if (violations.length > 0) {
        Logger.log(`❌ PROBLEM: ${violations.length} routes exceed max_livraisons!`);
        violations.forEach(r => {
            Logger.log(`  • Route with ${r.livraisons.length} deliveries (max was ${testParams.max_livraisons})`);
        });
    } else {
        Logger.log(`✅ SUCCESS: All routes respect max_livraisons = ${testParams.max_livraisons}`);
    }
    Logger.log('========================================');

    return {
        params: testParams,
        totalDeliveries: livraisons.length,
        totalVolunteers: benevoles.length,
        totalClusters: clusters.length,
        totalRoutes: routes.length,
        violations: violations.length,
        routes: routes.map(r => ({
            volunteer: r.benevole.nom,
            deliveries: r.livraisons.length,
            weight: Math.round(r.poids_total),
            exceeds: r.livraisons.length > testParams.max_livraisons
        }))
    };
}