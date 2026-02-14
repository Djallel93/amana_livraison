/**
 * ====================================================================
 * ROUTE_SERVICE_PLANNING.GS - Planification et Orchestration des Routes
 * ====================================================================
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

        // 3. Récupérer les bénévoles disponibles
        const benevoles = getAvailableVolunteers(params);
        Logger.log(`[ROUTES] 👥 ${benevoles.length} bénévoles disponibles`);

        if (benevoles.length === 0) {
            result.errors.push('Aucun bénévole disponible pour cette date');
            return result;
        }

        // 4. Identifier les clusters géographiques (version améliorée)
        const clusters = identifierClusters(normal, params.poids_moyen_kg);
        Logger.log(`[ROUTES] 🗺️ ${clusters.length} clusters identifiés`);

        // 5. Attribuer les clusters aux véhicules
        const routes = assignerClustersAuxVehicules(
            clusters,
            benevoles,
            params
        );
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
        Logger.log(`[ROUTES] Routes créées: ${result.created}`);
        Logger.log(`[ROUTES] Outliers: ${result.outliers.length}`);
        Logger.log(`[ROUTES] Avertissements: ${result.warnings.length}`);
        Logger.log('[ROUTES] ========================================');

        return result;

    } catch (error) {
        Logger.log(`[ROUTES] ❌ Erreur critique: ${error.message}`);
        result.errors.push(`Erreur critique: ${error.message}`);
        return result;
    }
}

/**
 * Sépare les livraisons normales des outliers (très éloignées)
 * @param {Array} livraisons - Toutes les livraisons
 * @returns {Object} {normal: Array, outliers: Array}
 */
function separateOutliers(livraisons) {
    const OUTLIER_THRESHOLD = CONFIG.ROUTE_OPTIMIZATION.OUTLIER_DISTANCE_KM;
    const normal = [];
    const outliers = [];

    for (const livraison of livraisons) {
        const distHQ = calculerDistanceHaversine(
            CONFIG.HQ.LAT,
            CONFIG.HQ.LNG,
            livraison.latitude,
            livraison.longitude
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
 * Récupère les bénévoles disponibles
 * @param {Object} params - Paramètres
 * @returns {Array<Object>}
 */
function getAvailableVolunteers(params) {
    // 1. Récupérer tous les bénévoles actifs et validés
    const response = listVolunteers({
        actif: true,
        statut: 'Validé'
    });

    if (!response || !response.volunteers) {
        return [];
    }

    let volunteers = response.volunteers;

    // 2. Enrichir avec les informations de véhicule
    volunteers = volunteers.map(v => {
        if (v.idVehicule) {
            v.vehicule = getVehiculeInfo(v.idVehicule);
        }
        return v;
    });

    // 3. Filtrer ceux qui ont un véhicule ou peuvent en avoir un prêté
    volunteers = volunteers.filter(v => {
        return v.vehicule &&
            v.vehicule.type !== 'Sans permis' &&
            (v.vehicule.capaciteKg > 0 || v.vehicule.type === 'Permis');
    });

    // 4. Ajouter les véhicules prêtés configurés
    if (params.vehicules_pretes && params.vehicules_pretes.length > 0) {
        volunteers = assignVehiculesPrets(volunteers, params.vehicules_pretes);
    }

    return volunteers;
}

/**
 * Récupère les informations d'un véhicule
 * @param {number} vehiculeId - ID du véhicule
 * @returns {Object}
 */
function getVehiculeInfo(vehiculeId) {
    const vehiclesResponse = getVehicleTypes();

    if (!vehiclesResponse || !vehiclesResponse.vehicles) {
        return null;
    }

    let vehicle = vehiclesResponse.vehicles.find(v => v.id === vehiculeId);

    if (vehicle) {
        // Compléter les capacités manquantes
        if (!vehicle.capaciteKg || vehicle.capaciteKg === '') {
            if (vehicle.type === 'Berline') {
                vehicle.capaciteKg = CONFIG.ROUTE_OPTIMIZATION.CAPACITE_BERLINE_KG;
            } else if (vehicle.type === 'Break') {
                vehicle.capaciteKg = CONFIG.ROUTE_OPTIMIZATION.CAPACITE_BREAK_KG;
            }
        }
    }

    return vehicle;
}

/**
 * Assigne les véhicules prêtés aux bénévoles
 * @param {Array} volunteers - Bénévoles
 * @param {Array} vehiculesPrets - Véhicules prêtés configurés
 * @returns {Array}
 */
function assignVehiculesPrets(volunteers, vehiculesPrets) {
    // Cette fonction sera appelée avec la config manuelle de l'admin
    return volunteers;
}