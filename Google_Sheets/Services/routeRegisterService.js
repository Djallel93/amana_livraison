/**
 * Sauvegarde une route en statut BROUILLON
 * Optimise l'ordre TSP, génère le lien Maps, crée les étapes
 *
 * @param {Object} route  - Données de la route (benevole, livraisons, poids_total, distance_totale)
 * @param {Object} params - Paramètres de planification (date_livraison, occasion, relivre...)
 * @returns {Object|null} Route sauvegardée ou null si erreur
 */
function saveRoute(route, params) {
    try {
        const tempId = generateNextId(
            CONFIG.SHEETS.ROUTES,
            'R',
            CONFIG.COLUMNS.ROUTES.ID_ROUTE
        );

        Logger.log(`[ROUTES] 💾 Sauvegarde route ${tempId}...`);

        // Optimiser l'ordre des livraisons avant de créer les étapes
        const hqConfig = getCurrentHqConfig();
        let livraisonsOptimisees = route.livraisons;

        if (hqConfig && hqConfig.lat && hqConfig.lng && route.livraisons.length > 1) {
            Logger.log(`[ROUTES] 🎯 Optimisation de l'ordre des livraisons pour ${tempId}...`);

            const hqCoords = { lat: hqConfig.lat, lng: hqConfig.lng };
            livraisonsOptimisees = optimizeDeliveryOrder(route.livraisons, hqCoords);

            const distanceOptimisee = calculerDistanceTotaleRoute(livraisonsOptimisees, hqCoords);
            route.distance_totale = distanceOptimisee;

            Logger.log(`[ROUTES] ✅ Optimisation terminée: ${Math.round(distanceOptimisee)}km`);
        } else {
            Logger.log(`[ROUTES] ⚠️ Optimisation ignorée (QG non configuré ou livraison unique)`);
        }

        // Générer le lien Google Maps après optimisation
        let lienMaps = '';
        if (hqConfig && hqConfig.lat && hqConfig.lng) {
            lienMaps = generateGoogleMapsLink(livraisonsOptimisees, {
                lat: hqConfig.lat,
                lng: hqConfig.lng
            });
            Logger.log(`[ROUTES] 🗺️ Lien Maps: ${lienMaps ? 'généré' : 'non généré'}`);
        }

        // Construire les données de la route
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
            lien_maps: lienMaps,
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
            routeData.lien_maps,
            routeData.dossier_drive,
            routeData.date_creation,
            routeData.date_modification
        ];

        // Sauvegarder la route
        appendRow(CONFIG.SHEETS.ROUTES, rowData);
        Logger.log(`[ROUTES] ✅ Route ${tempId} sauvegardée (statut: BROUILLON, lien Maps: ${lienMaps ? 'oui' : 'non'})`);

        // Créer les étapes avec l'ordre optimisé
        createOptimizedEtapes(tempId, livraisonsOptimisees);
        Logger.log(`[ROUTES] ✅ ${livraisonsOptimisees.length} étapes optimisées + retour QG créés`);

        // Mettre à jour le statut des livraisons → ASSIGNEE
        for (const livraison of livraisonsOptimisees) {
            const updated = updateDeliveryStatus(
                livraison.id_livraison,
                CONFIG.ENUMS.STATUT_LIVRAISON.ASSIGNEE
            );
            if (!updated) {
                Logger.log(`[ROUTES] ⚠️ Échec mise à jour statut de ${livraison.id_livraison}`);
            }
        }
        Logger.log(`[ROUTES] ✅ Statut mis à jour pour ${livraisonsOptimisees.length} livraisons`);

        return {
            ...routeData,
            livraisons: livraisonsOptimisees,
            benevole_nom: route.benevole.nom
        };

    } catch (error) {
        Logger.log(`[ROUTES] ❌ Erreur sauvegarde route: ${error.message}`);
        Logger.log(`[ROUTES] ❌ Route NON sauvegardée - livraisons NON mises à jour`);
        return null;
    }
}

/**
 * Calcule le centre géographique (barycentre) d'un ensemble de livraisons
 *
 * @param {Array<Object>} livraisons - Livraisons avec latitude/longitude
 * @returns {{ lat: number, lng: number }}
 */
function calculerCentre(livraisons) {
    if (!livraisons || livraisons.length === 0) {
        return { lat: 0, lng: 0 };
    }

    const totalLat = livraisons.reduce((sum, l) => sum + l.latitude, 0);
    const totalLng = livraisons.reduce((sum, l) => sum + l.longitude, 0);

    return {
        lat: totalLat / livraisons.length,
        lng: totalLng / livraisons.length
    };
}

function generateGoogleMapsLink(livraisonsOptimisees, hqCoords) {
    if (!livraisonsOptimisees || livraisonsOptimisees.length === 0) {
        Logger.log('[ROUTES] ⚠️ Génération lien Maps: aucune livraison');
        return '';
    }

    if (!hqCoords || !hqCoords.lat || !hqCoords.lng) {
        Logger.log('[ROUTES] ⚠️ Génération lien Maps: coordonnées QG manquantes');
        return '';
    }

    try {
        const origin = `${hqCoords.lat},${hqCoords.lng}`;
        const destination = `${hqCoords.lat},${hqCoords.lng}`;

        let url = `https://www.google.com/maps/dir/?api=1`;
        url += `&origin=${encodeURIComponent(origin)}`;
        url += `&destination=${encodeURIComponent(destination)}`;

        if (livraisonsOptimisees.length > 0) {
            // ✅ Dédupliquer les coordonnées identiques (ex: cluster de même adresse)
            // On conserve uniquement la première occurrence de chaque paire lat/lng
            const seen = new Set();
            const waypointsUniques = livraisonsOptimisees
                .map(l => `${l.latitude},${l.longitude}`)
                .filter(coord => {
                    if (seen.has(coord)) return false;
                    seen.add(coord);
                    return true;
                });

            const nbIgnores = livraisonsOptimisees.length - waypointsUniques.length;
            if (nbIgnores > 0) {
                Logger.log(`[ROUTES] 🗺️ Déduplication: ${nbIgnores} adresse(s) en double supprimée(s) du lien Maps`);
            }

            url += `&waypoints=${encodeURIComponent(waypointsUniques.join('|'))}`;
        }

        url += `&travelmode=driving`;

        Logger.log(`[ROUTES] 🗺️ Lien Maps généré (${livraisonsOptimisees.length} arrêts, waypoints dédupliqués)`);
        return url;

    } catch (error) {
        Logger.log(`[ROUTES] ❌ Erreur génération lien Maps: ${error.message}`);
        return '';
    }
}