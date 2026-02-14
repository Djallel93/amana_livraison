/**
 * ====================================================================
 * ROUTE_SERVICE_ASSIGNMENT.GS - Attribution aux Véhicules et Sauvegarde
 * ====================================================================
 * Contient : assignerClustersAuxVehicules(), saveRoute(), detectRemoteRoutes()
 * Responsabilité : Assigner les clusters aux bénévoles et sauvegarder les routes
 */

/**
 * Assigne les clusters aux véhicules
 * @param {Array} clusters - Clusters géographiques
 * @param {Array} benevoles - Bénévoles disponibles
 * @param {Object} params - Paramètres
 * @returns {Array} Routes créées
 */
function assignerClustersAuxVehicules(clusters, benevoles, params) {
    const routes = [];
    const clustersRestants = [...clusters]; // Copie
    const maxLivraisonsParRoute = params.max_livraisons || 15;

    // Trier les bénévoles par capacité véhicule (DESC)
    benevoles.sort((a, b) => {
        const capA = a.vehicule ? (a.vehicule.capaciteKg || 0) : 0;
        const capB = b.vehicule ? (b.vehicule.capaciteKg || 0) : 0;
        return capB - capA;
    });

    Logger.log(`[ROUTES] 🚗 Attribution des clusters aux ${benevoles.length} véhicules`);

    for (const benevole of benevoles) {
        if (clustersRestants.length === 0) break;

        const capaciteVehicule = benevole.vehicule.capaciteKg || 0;

        const route = {
            benevole: benevole,
            livraisons: [],
            clusters_assignes: [],
            poids_total: 0,
            distance_totale: 0
        };

        // Prendre le cluster avec le PLUS de livraisons restantes
        const clusterPrincipal = clustersRestants.shift();
        route.livraisons.push(...clusterPrincipal.livraisons);
        route.poids_total += clusterPrincipal.poids_total;
        route.clusters_assignes.push(clusterPrincipal.id);

        Logger.log(`[ROUTES]   Bénévole ${benevole.nom} (${benevole.vehicule.type}, ${capaciteVehicule}kg):`);
        Logger.log(`[ROUTES]     • Cluster principal ${clusterPrincipal.id}: ${clusterPrincipal.nombre_livraisons} livraisons`);

        // Essayer d'ajouter d'autres clusters pour maximiser la charge
        const clustersAAjouter = [];

        for (let i = 0; i < clustersRestants.length; i++) {
            const autreCluster = clustersRestants[i];

            const distanceEntreClusters = calculerDistanceHaversine(
                clusterPrincipal.centre.lat,
                clusterPrincipal.centre.lng,
                autreCluster.centre.lat,
                autreCluster.centre.lng
            );

            const DISTANCE_CLUSTER_MAX = CONFIG.ROUTE_OPTIMIZATION.DISTANCE_CLUSTER_MAX_KM;
            const DISTANCE_REGROUPE = CONFIG.ROUTE_OPTIMIZATION.DISTANCE_REGROUPE_ELOIGNES_KM;

            // Peut grouper si :
            // - Distance < DISTANCE_CLUSTER_MAX km (clusters voisins)
            // - OU les deux > DISTANCE_REGROUPE km du HQ (regrouper trajets longs)
            const peutGrouper = (
                distanceEntreClusters < DISTANCE_CLUSTER_MAX ||
                (clusterPrincipal.distance_hq > DISTANCE_REGROUPE && autreCluster.distance_hq > DISTANCE_REGROUPE)
            );

            const nouveauPoids = route.poids_total + autreCluster.poids_total;
            const nouvelleTaille = route.livraisons.length + autreCluster.nombre_livraisons;

            if (peutGrouper &&
                nouveauPoids <= capaciteVehicule &&
                nouvelleTaille <= maxLivraisonsParRoute) {

                clustersAAjouter.push({ index: i, cluster: autreCluster });
                Logger.log(`[ROUTES]     • Ajout cluster ${autreCluster.id}: ${autreCluster.nombre_livraisons} livraisons (distance: ${Math.round(distanceEntreClusters)} km)`);
            }
        }

        // Ajouter les clusters sélectionnés
        for (let i = clustersAAjouter.length - 1; i >= 0; i--) {
            const { index, cluster } = clustersAAjouter[i];
            route.livraisons.push(...cluster.livraisons);
            route.poids_total += cluster.poids_total;
            route.clusters_assignes.push(cluster.id);
            clustersRestants.splice(index, 1);
        }

        // Calculer la distance totale de la route
        route.distance_totale = calculerDistanceTotaleRoute(route.livraisons);

        Logger.log(`[ROUTES]     → Total: ${route.livraisons.length} livraisons, ${Math.round(route.poids_total)} kg, ${Math.round(route.distance_totale)} km`);

        routes.push(route);
    }

    // Avertir si des clusters restants
    if (clustersRestants.length > 0) {
        Logger.log(`[ROUTES] ⚠️ ${clustersRestants.length} clusters non assignés (manque de bénévoles/véhicules)`);
    }

    return routes;
}

/**
 * Sauvegarde une route dans Google Sheets
 * @param {Object} route - Route à sauvegarder
 * @param {Object} params - Paramètres
 * @returns {Object} Route sauvegardée avec ID
 */
function saveRoute(route, params) {
    try {
        // Générer l'ID de la route (temporaire, sera réassigné après tri)
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

        // Valider
        const validation = validateRoute(routeData);
        if (validation.hasErrors()) {
            throw new Error(`Route invalide: ${validation.getErrorMessages().join(', ')}`);
        }

        // Sauvegarder dans Sheets
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

        appendRow(CONFIG.SHEETS.ROUTES, rowData);

        // Mettre à jour les livraisons : Non Assignée → Assignée
        for (const livraison of route.livraisons) {
            updateDeliveryStatus(livraison.id_livraison, CONFIG.ENUMS.STATUT_LIVRAISON.ASSIGNEE);
        }

        Logger.log(`[ROUTES] ✅ Route ${tempId} sauvegardée`);

        return {
            ...routeData,
            livraisons: route.livraisons,
            benevole_nom: route.benevole.nom
        };

    } catch (error) {
        Logger.log(`[ROUTES] ❌ Erreur sauvegarde route: ${error.message}`);
        return null;
    }
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