/**
 * ====================================================================
 * ROUTE_SERVICE_PLANNING.GS - Planification et Orchestration des Routes
 * ====================================================================
 */

/**
 * Planifie les routes pour une date donnée
 * @param {Object} params - Paramètres de planification
 * @returns {Object} Résultat de la planification
 */
function planRoutes(params) {
    Logger.log('[ROUTES] 🚀 Démarrage planification des routes...');
    Logger.log(`[ROUTES] Paramètres: ${JSON.stringify(params)}`);

    const result = {
        success: false,
        created: 0,
        warnings: [],
        errors: [],
        routes: [],
        outliers: []
    };

    try {
        const livraisons = getUnassignedDeliveriesForDate(params.date_livraison);
        Logger.log(`[ROUTES] 📦 ${livraisons.length} livraisons non assignées trouvées`);

        if (livraisons.length === 0) {
            result.errors.push('Aucune livraison non assignée pour cette date');
            return result;
        }

        const { normal, outliers } = separateOutliers(livraisons);

        if (outliers.length > 0) {
            Logger.log(`[ROUTES] ⚠️ ${outliers.length} livraisons isolées détectées (> ${CONFIG.ROUTE_OPTIMIZATION.OUTLIER_DISTANCE_KM}km)`);
            outliers.forEach(o => {
                result.warnings.push({
                    type: 'outlier',
                    message: `Livraison ${o.id_livraison} très éloignée (${Math.round(o._distance_hq)}km) - Traitement manuel recommandé`,
                    livraison_id: o.id_livraison,
                    distance: o._distance_hq
                });
            });
            result.outliers = outliers;
        }

        const benevoles = getBenevolesPourPlanification(params);
        Logger.log(`[ROUTES] 👥 ${benevoles.length} bénévoles disponibles`);

        if (benevoles.length === 0) {
            result.errors.push('Aucun bénévole disponible pour cette date');
            return result;
        }

        const poidsParPart = parseFloat(params.poids_moyen_kg) || 0;
        const clusters = identifierClusters(normal, poidsParPart, params.poids_moyen_hotel_kg);
        Logger.log(`[ROUTES] 🗺️ ${clusters.length} clusters identifiés`);

        const routes = assignerClustersAuxVehicules(clusters, benevoles, params);
        Logger.log(`[ROUTES] 🚗 ${routes.length} routes créées`);

        for (const route of routes) {
            const saved = saveRoute(route, params);
            if (saved) {
                result.routes.push(saved);
                result.created++;
            }
        }

        const remoteWarnings = detectRemoteRoutes(result.routes);
        result.warnings.push(...remoteWarnings);

        result.success = result.created > 0;

        Logger.log('[ROUTES] ========================================');
        Logger.log(`[ROUTES] ✅ Planification terminée`);
        Logger.log(`[ROUTES] Routes créées   : ${result.created}`);
        Logger.log(`[ROUTES] Outliers        : ${result.outliers.length}`);
        Logger.log(`[ROUTES] Avertissements  : ${result.warnings.length}`);
        Logger.log('[ROUTES] ========================================');

        return result;

    } catch (error) {
        Logger.log(`[ROUTES] ❌ Erreur critique: ${error.message}`);
        result.errors.push(`Erreur critique: ${error.message}`);
        return result;
    }
}

/**
 * Sépare les livraisons normales des outliers (trop éloignées du QG)
 * @param {Array} livraisons
 * @returns {Object} {normal: Array, outliers: Array}
 */
function separateOutliers(livraisons) {
    const OUTLIER_THRESHOLD = CONFIG.ROUTE_OPTIMIZATION.OUTLIER_DISTANCE_KM;
    const normal = [];
    const outliers = [];

    for (const livraison of livraisons) {
        const distHQ = calculerDistanceHaversine(
            CONFIG.HQ.LAT, CONFIG.HQ.LNG,
            livraison.latitude, livraison.longitude
        );
        livraison._distance_hq = distHQ;
        (distHQ > OUTLIER_THRESHOLD ? outliers : normal).push(livraison);
    }

    return { normal, outliers };
}

/**
 * Récupère les bénévoles disponibles pour la planification.
 * Si params.selected_benevole_ids est fourni, seuls ces bénévoles sont retenus.
 * @param {Object} params - Paramètres de planification
 * @returns {Array<Object>}
 */
function getBenevolesPourPlanification(params) {
    let benevoles = getVolunteersWithVehicle();
    Logger.log(`[ROUTES] 👥 ${benevoles.length} bénévoles avec véhicule valide (capaciteKg > 0)`);

    if (params.vehicules_pretes && params.vehicules_pretes.length > 0) {
        benevoles = assignVehiculesPrets(benevoles, params.vehicules_pretes);
    }

    if (params.date_livraison) {
        try {
            const permisVolunteers = getPairedPermisVolunteers(params.date_livraison);
            if (permisVolunteers.length > 0) {
                benevoles = benevoles.concat(permisVolunteers);
                Logger.log(`[ROUTES] 🚗 ${permisVolunteers.length} bénévole(s) permis ajouté(s) via véhicules temporaires`);
            }
        } catch (err) {
            Logger.log(`[ROUTES] ⚠️ Erreur intégration véhicules temporaires: ${err.message}`);
        }
    }

    if (params.selected_benevole_ids && params.selected_benevole_ids.length > 0) {
        const ids = new Set(params.selected_benevole_ids.map(String));
        benevoles = benevoles.filter(b => ids.has(String(b.id)));
        Logger.log(`[ROUTES] 🎯 Filtre sélection manuelle: ${benevoles.length} bénévole(s) retenus`);
    }

    return benevoles;
}