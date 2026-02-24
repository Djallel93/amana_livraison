/**
 * ====================================================================
 * ROUTE_SERVICE_PLANNING.GS - Planification et Orchestration des Routes
 * ====================================================================
 * VERSION 4.0
 *
 * ⚠️ CHANGEMENT v4 :
 * - Passage de params.poids_moyen_kg vers identifierClusters
 * - Passage de nombrePartMax (depuis getVehicleTypes) vers assignerClustersAuxVehicules
 *
 * Contient : planRoutes(), separateOutliers(), getAvailableVolunteers()
 * Responsabilité : Orchestrer le processus complet de planification
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
        // 1. Récupérer les livraisons non assignées pour la date
        const livraisons = getUnassignedDeliveriesForDate(params.date_livraison);
        Logger.log(`[ROUTES] 📦 ${livraisons.length} livraisons non assignées trouvées`);

        if (livraisons.length === 0) {
            result.errors.push('Aucune livraison non assignée pour cette date');
            return result;
        }

        // 2. Détecter et séparer les outliers (livraisons très éloignées)
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

        // 3. Récupérer les bénévoles disponibles (avec véhicule valide)
        const benevoles = getBenevolesPourPlanification(params);
        Logger.log(`[ROUTES] 👥 ${benevoles.length} bénévoles disponibles`);

        if (benevoles.length === 0) {
            result.errors.push('Aucun bénévole disponible pour cette date');
            return result;
        }

        // 4. Identifier les clusters géographiques
        // ⚠️ On passe poids_moyen_kg pour que chaque cluster ait poids_total calculé
        const poidsParPart = parseFloat(params.poids_moyen_kg) || 0;
        const clusters = identifierClusters(normal, poidsParPart);
        Logger.log(`[ROUTES] 🗺️ ${clusters.length} clusters identifiés`);

        // 5. Attribuer les clusters aux véhicules (best-fit + split si nécessaire)
        const routes = assignerClustersAuxVehicules(clusters, benevoles, params);
        Logger.log(`[ROUTES] 🚗 ${routes.length} routes créées`);

        // 6. Sauvegarder les routes
        for (const route of routes) {
            const saved = saveRoute(route, params);
            if (saved) {
                result.routes.push(saved);
                result.created++;
            }
        }

        // 7. Détecter les routes éloignées
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
 * Sépare les livraisons normales des outliers (très éloignées du QG)
 * @param {Array} livraisons - Toutes les livraisons
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

        if (distHQ > OUTLIER_THRESHOLD) {
            outliers.push(livraison);
        } else {
            normal.push(livraison);
        }
    }

    return { normal, outliers };
}

/**
 * Récupère les livraisons non assignées pour une date
 * @param {string} date - Date au format YYYY-MM-DD
 * @returns {Array<Object>}
 */
function getUnassignedDeliveriesForDate(date) {
    const deliveries = getDeliveriesForDate(new Date(date));
    return deliveries.filter(d =>
        d.statut === CONFIG.ENUMS.STATUT_LIVRAISON.NON_ASSIGNEE
    );
}

/**
 * Récupère les bénévoles avec un véhicule valide pour la planification
 * Délègue à getVolunteersWithVehicle() défini dans apiService.js
 *
 * @param {Object} params - Paramètres de planification
 * @returns {Array<Object>} Bénévoles avec vehicule.capaciteKg > 0
 */
function getBenevolesPourPlanification(params) {
    const volunteers = getVolunteersWithVehicle();

    Logger.log(`[ROUTES] 👥 ${volunteers.length} bénévoles avec véhicule valide (capaciteKg > 0)`);

    // Ajouter les véhicules prêtés configurés
    if (params.vehicules_pretes && params.vehicules_pretes.length > 0) {
        return assignVehiculesPrets(volunteers, params.vehicules_pretes);
    }

    return volunteers;
}