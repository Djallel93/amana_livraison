/**
 * 🚗 Assigner les clusters aux véhicules (avec support multi-trips)
 */
function assignerClustersAuxVehicules(clusters, benevoles, params) {
    const routes = [];
    const clustersRestants = [...clusters];
    const maxLivraisonsParRoute = params.max_livraisons || 15;

    // Get HQ coordinates
    const hqConfig = getCurrentHqConfig();
    const hqCoords = (hqConfig && hqConfig.lat && hqConfig.lng)
        ? { lat: hqConfig.lat, lng: hqConfig.lng }
        : null;

    if (hqCoords) {
        Logger.log(`[ROUTES] 🏢 HQ: ${hqConfig.address} (${hqCoords.lat}, ${hqCoords.lng})`);
    } else {
        Logger.log(`[ROUTES] ⚠️ HQ coordinates not configured`);
    }

    // Sort vehicles by capacity (largest first)
    benevoles.sort((a, b) => {
        const capA = a.vehicule ? (a.vehicule.capaciteKg || 0) : 0;
        const capB = b.vehicule ? (b.vehicule.capaciteKg || 0) : 0;
        return capB - capA;
    });

    Logger.log(`[ROUTES] 🚗 Starting assignment: ${benevoles.length} volunteers, ${clusters.length} clusters`);

    // Multi-trip logic: Keep going until all clusters assigned
    let tripNumber = 1;

    while (clustersRestants.length > 0) {
        Logger.log(`[ROUTES] 🔄 Trip ${tripNumber}: ${clustersRestants.length} clusters remaining`);

        let assignedInThisTrip = 0;

        for (const benevole of benevoles) {
            if (clustersRestants.length === 0) {
                Logger.log(`[ROUTES] ✅ All clusters assigned after trip ${tripNumber}`);
                break;
            }

            Logger.log(`[ROUTES] 👤 ${benevole.nom} - Trip ${tripNumber}`);
            Logger.log(`[ROUTES]    Remaining clusters: ${clustersRestants.length}`);

            const capaciteVehicule = benevole.vehicule?.capaciteKg || 0;
            Logger.log(`[ROUTES]    Vehicle: ${benevole.vehicule?.type}, capacity: ${capaciteVehicule}kg`);

            const route = {
                benevole: benevole,
                livraisons: [],
                clusters_assignes: [],
                poids_total: 0,
                distance_totale: 0,
                trip_number: tripNumber
            };

            // Take the cluster with MOST deliveries
            const clusterPrincipal = clustersRestants.shift();

            if (!clusterPrincipal) {
                Logger.log(`[ROUTES] ❌ No principal cluster available`);
                continue;
            }

            // ✅ CHECK VEHICLE CAPACITY
            if (capaciteVehicule > 0 && clusterPrincipal.poids_total > capaciteVehicule) {
                Logger.log(`[ROUTES] ⚠️ Cluster ${clusterPrincipal.id} too heavy (${Math.round(clusterPrincipal.poids_total)}kg > ${capaciteVehicule}kg) - skipping`);
                // Put it back at the end for next volunteer
                clustersRestants.push(clusterPrincipal);
                continue;
            }

            Logger.log(`[ROUTES]    ✅ Principal cluster ${clusterPrincipal.id}: ${clusterPrincipal.nombre_livraisons} deliveries, ${Math.round(clusterPrincipal.poids_total)}kg`);

            route.livraisons.push(...clusterPrincipal.livraisons);
            route.poids_total += clusterPrincipal.poids_total;
            route.clusters_assignes.push(clusterPrincipal.id);

            // Try to add more clusters if they fit
            const clustersAAjouter = [];

            for (let j = 0; j < clustersRestants.length; j++) {
                const autreCluster = clustersRestants[j];

                const distanceEntreClusters = calculerDistanceHaversine(
                    clusterPrincipal.centre.lat,
                    clusterPrincipal.centre.lng,
                    autreCluster.centre.lat,
                    autreCluster.centre.lng
                );

                const DISTANCE_CLUSTER_MAX = CONFIG.ROUTE_OPTIMIZATION.DISTANCE_CLUSTER_MAX_KM;
                const DISTANCE_REGROUPE = CONFIG.ROUTE_OPTIMIZATION.DISTANCE_REGROUPE_ELOIGNES_KM;

                const peutGrouper = (
                    distanceEntreClusters < DISTANCE_CLUSTER_MAX ||
                    (clusterPrincipal.distance_hq > DISTANCE_REGROUPE && autreCluster.distance_hq > DISTANCE_REGROUPE)
                );

                const nouveauPoids = route.poids_total + autreCluster.poids_total;
                const nouvelleTaille = route.livraisons.length + autreCluster.nombre_livraisons;

                // ✅ CHECK: fits capacity, fits max deliveries, and can be grouped
                if (peutGrouper &&
                    (capaciteVehicule === 0 || nouveauPoids <= capaciteVehicule) &&
                    nouvelleTaille <= maxLivraisonsParRoute) {

                    clustersAAjouter.push({ index: j, cluster: autreCluster });
                    Logger.log(`[ROUTES]       + Adding cluster ${autreCluster.id}: ${autreCluster.nombre_livraisons} deliveries, ${Math.round(autreCluster.poids_total)}kg`);
                }
            }

            // Add selected clusters
            for (let k = clustersAAjouter.length - 1; k >= 0; k--) {
                const { index, cluster } = clustersAAjouter[k];
                route.livraisons.push(...cluster.livraisons);
                route.poids_total += cluster.poids_total;
                route.clusters_assignes.push(cluster.id);
                clustersRestants.splice(index, 1);
            }

            // Calculate distance including HQ
            route.distance_totale = calculerDistanceTotaleRoute(route.livraisons, hqCoords);

            Logger.log(`[ROUTES]    📊 Final route: ${route.livraisons.length} deliveries, ${Math.round(route.poids_total)}kg, ${Math.round(route.distance_totale)}km`);

            routes.push(route);
            assignedInThisTrip++;
        }

        // Safety check: if no clusters assigned in this trip, break to avoid infinite loop
        if (assignedInThisTrip === 0 && clustersRestants.length > 0) {
            Logger.log(`[ROUTES] ⚠️ CRITICAL: No clusters assigned in trip ${tripNumber}`);
            Logger.log(`[ROUTES] ⚠️ Remaining clusters cannot fit in any vehicle:`);
            clustersRestants.forEach(c => {
                Logger.log(`[ROUTES]    ⚠️ Cluster ${c.id}: ${c.nombre_livraisons} deliveries, ${Math.round(c.poids_total)}kg`);
            });
            break;
        }

        tripNumber++;

        // Safety limit: max 5 trips per volunteer
        if (tripNumber > 5) {
            Logger.log(`[ROUTES] ⚠️ Max trips (5) reached, stopping assignment`);
            break;
        }
    }

    // Final report
    if (clustersRestants.length > 0) {
        const unassignedDeliveries = clustersRestants.reduce((sum, c) => sum + c.nombre_livraisons, 0);
        Logger.log(`[ROUTES] ⚠️ WARNING: ${clustersRestants.length} clusters NOT assigned (${unassignedDeliveries} deliveries)`);
        clustersRestants.forEach(c => {
            Logger.log(`[ROUTES]    ⚠️ Unassigned cluster ${c.id}: ${c.nombre_livraisons} deliveries, ${Math.round(c.poids_total)}kg`);
        });
    } else {
        Logger.log(`[ROUTES] ✅ SUCCESS: All clusters assigned in ${tripNumber - 1} trip(s)`);
    }

    Logger.log(`[ROUTES] ✅ Assignment complete: ${routes.length} routes created`);

    return routes;
}

/**
 * 💾 Sauvegarder une route
 */
function saveRoute(route, params) {
    try {
        const tempId = generateNextId(
            CONFIG.SHEETS.ROUTES,
            'R',
            CONFIG.COLUMNS.ROUTES.ID_ROUTE
        );

        const routeData = {
            id_route: tempId,
            id_benevole: route.benevole.id,
            id_binome: route.binome ? route.binome.id : '',
            id_vehicule_prete: route.vehicule_prete_id || '',
            date_debut: params.date_livraison,
            date_fin: null,
            occasion: params.occasion,
            statut: CONFIG.ENUMS.STATUT_ROUTE.BROUILLON,
            distance_totale_km: Math.round(route.distance_totale * 100) / 100,
            poids_total_kg: Math.round(route.poids_total * 100) / 100,
            relivre: params.relivre || false,
            dossier_drive: '',
            date_creation: getCurrentDateTime(),
            date_modification: getCurrentDateTime()
        };

        const validation = validateRoute(routeData);
        if (validation.hasErrors()) {
            throw new Error(`Route invalide: ${validation.getErrorMessages().join(', ')}`);
        }

        const rowData = [
            routeData.id_route,
            routeData.id_benevole,
            routeData.id_binome,
            routeData.id_vehicule_prete,
            routeData.date_debut,
            routeData.date_fin,
            routeData.occasion,
            routeData.statut,
            routeData.distance_totale_km,
            routeData.poids_total_kg,
            routeData.relivre,
            routeData.dossier_drive,
            routeData.date_creation,
            routeData.date_modification
        ];

        // Step 1: Save route
        appendRow(CONFIG.SHEETS.ROUTES, rowData);
        Logger.log(`[ROUTES] ✅ Route ${tempId} saved to sheet`);

        // Step 2: Create preliminary etapes
        createPreliminaryEtapes(tempId, route.livraisons);
        Logger.log(`[ROUTES] ✅ ${route.livraisons.length} etapes created`);

        // Step 3: ONLY NOW update delivery status (after route and etapes successfully saved)
        for (const livraison of route.livraisons) {
            const updated = updateDeliveryStatus(
                livraison.id_livraison,
                CONFIG.ENUMS.STATUT_LIVRAISON.ASSIGNEE
            );
            if (!updated) {
                Logger.log(`[ROUTES] ⚠️ Failed to update status for ${livraison.id_livraison}`);
            }
        }
        Logger.log(`[ROUTES] ✅ Updated status for ${route.livraisons.length} deliveries`);

        return {
            ...routeData,
            livraisons: route.livraisons,
            benevole_nom: route.benevole.nom
        };

    } catch (error) {
        Logger.log(`[ROUTES] ❌ Erreur sauvegarde route: ${error.message}`);
        Logger.log(`[ROUTES] ❌ Route NOT saved - deliveries NOT updated`);
        return null;
    }
}

/**
 * 📝 Créer les étapes préliminaires pour une route
 */
function createPreliminaryEtapes(routeId, livraisons) {
    Logger.log(`[ROUTES] 📝 Création de ${livraisons.length} étapes préliminaires pour ${routeId}...`);

    const rows = [];

    for (let i = 0; i < livraisons.length; i++) {
        const livraison = livraisons[i];
        const etapeId = generateNextId(
            CONFIG.SHEETS.ETAPES_ROUTE,
            'E',
            CONFIG.COLUMNS.ETAPES_ROUTE.ID_ETAPE
        );

        // ✅ MATCH YOUR SHEET STRUCTURE: 8 columns only
        const rowData = [
            etapeId,                                    // 1. ID_ETAPE
            routeId,                                    // 2. ID_ROUTE
            livraison.id_livraison,                     // 3. ID_LIVRAISON
            i + 1,                                      // 4. ORDRE_PASSAGE (temporary)
            CONFIG.ENUMS.STATUT_ETAPE.EN_ATTENTE,      // 5. STATUT
            null,                                       // 6. HEURE_DEBUT
            null,                                       // 7. HEURE_FIN
            ''                                          // 8. COMMENTAIRE
        ];

        rows.push(rowData);
    }

    // Batch append all etapes at once
    if (rows.length > 0) {
        const sheet = getSheet(CONFIG.SHEETS.ETAPES_ROUTE);
        sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
        Logger.log(`[ROUTES] ✅ ${rows.length} étapes créées pour ${routeId}`);
    }
}