/**
 * Crée un objet route à partir d'un cluster et d'un bénévole
 */
function creerRouteDepuisCluster(cluster, benevole, hqCoords) {
    const distanceTotale = calculerDistanceTotaleRoute(cluster.livraisons, hqCoords);

    return {
        benevole: benevole,
        binome: null,
        vehicule_prete_id: '',
        livraisons: cluster.livraisons,
        poids_total: cluster.poids_total,
        distance_totale: distanceTotale
    };
}

function saveRoute(route, params) {
    try {
        const tempId = generateNextId(
            CONFIG.SHEETS.ROUTES,
            'R',
            CONFIG.COLUMNS.ROUTES.ID_ROUTE
        );

        Logger.log(`[ROUTES] 💾 Sauvegarde route ${tempId}...`);

        const poidsParPart = parseFloat(params && params.poids_moyen_kg) || 0;
        const poidsParPartHotel = parseFloat(params && params.poids_moyen_hotel_kg) || poidsParPart;

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

        let lienMaps = '';
        if (hqConfig && hqConfig.lat && hqConfig.lng) {
            lienMaps = generateGoogleMapsLink(livraisonsOptimisees, {
                lat: hqConfig.lat,
                lng: hqConfig.lng
            });
        }

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
            poids_par_part: poidsParPart,
            poids_par_part_hotel: poidsParPartHotel,
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
            routeData.poids_par_part,
            routeData.poids_par_part_hotel,
            routeData.relivre,
            routeData.lien_maps,
            routeData.dossier_drive,
            routeData.date_creation,
            routeData.date_modification
        ];

        appendRow(CONFIG.SHEETS.ROUTES, rowData);
        Logger.log(`[ROUTES] ✅ Route ${tempId} sauvegardée (${poidsParPart}kg/pers dom. | ${poidsParPartHotel}kg/pers hôtel)`);

        createOptimizedEtapes(tempId, livraisonsOptimisees);
        Logger.log(`[ROUTES] ✅ Étapes créées pour ${tempId}`);

        for (const livraison of livraisonsOptimisees) {
            const updated = updateDeliveryStatus(
                livraison.id_livraison,
                CONFIG.ENUMS.STATUT_LIVRAISON.ASSIGNEE
            );
            if (!updated) {
                Logger.log(`[ROUTES] ⚠️ Échec mise à jour statut de ${livraison.id_livraison}`);
            }
        }

        _verifierConditionnementApresCreation(tempId, livraisonsOptimisees);

        return {
            ...routeData,
            livraisons: livraisonsOptimisees,
            benevole_nom: route.benevole.nom
        };

    } catch (error) {
        Logger.log(`[ROUTES] ❌ Erreur sauvegarde route: ${error.message}`);
        return null;
    }
}

/**
 * Vérifie si toutes les livraisons sont déjà conditionnées après création des étapes.
 * Si oui, passe la route directement à Prête et envoie l'email.
 */
function _verifierConditionnementApresCreation(routeId, livraisons) {
    const toutesPretes = livraisons.every(l => {
        const liv = getDeliveryById(l.id_livraison);
        return liv && liv.statut_conditionnement === CONFIG.ENUMS.STATUT_CONDITIONNEMENT.PRETE;
    });

    if (!toutesPretes) return;

    Logger.log(`[ROUTES] 🟢 Toutes livraisons déjà Prêtes pour route ${routeId} → passage Prête`);

    const stops = getDeliveryStopsForRoute(routeId);
    for (const stop of stops) {
        updateStopStatus(stop.id_etape, CONFIG.ENUMS.STATUT_ETAPE.PRETE);
    }

    passerRouteEnPrete(routeId);
}

function calculerCentre(livraisons) {
    if (!livraisons || livraisons.length === 0) return { lat: 0, lng: 0 };

    const totalLat = livraisons.reduce((sum, l) => sum + l.latitude, 0);
    const totalLng = livraisons.reduce((sum, l) => sum + l.longitude, 0);

    return {
        lat: totalLat / livraisons.length,
        lng: totalLng / livraisons.length
    };
}

/**
 * Génère un lien Google Maps pour la route.
 * - Origine  : QG
 * - Destination : dernière livraison
 * - Waypoints : toutes les livraisons sauf la dernière, dédupliquées
 */
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
        const derniere = livraisonsOptimisees[livraisonsOptimisees.length - 1];
        const destination = `${derniere.latitude},${derniere.longitude}`;

        let url = `https://www.google.com/maps/dir/?api=1`;
        url += `&origin=${encodeURIComponent(origin)}`;
        url += `&destination=${encodeURIComponent(destination)}`;

        const intermediaires = livraisonsOptimisees.slice(0, -1);

        if (intermediaires.length > 0) {
            const seen = new Set();
            const waypointsUniques = intermediaires
                .map(l => `${l.latitude},${l.longitude}`)
                .filter(coord => {
                    if (seen.has(coord)) return false;
                    seen.add(coord);
                    return true;
                });

            const nbIgnores = intermediaires.length - waypointsUniques.length;
            if (nbIgnores > 0) {
                Logger.log(`[ROUTES] 🗺️ ${nbIgnores} adresse(s) dupliquée(s) retirée(s) du lien Maps`);
            }

            url += `&waypoints=${encodeURIComponent(waypointsUniques.join('|'))}`;
        }

        url += `&travelmode=driving`;
        Logger.log(`[ROUTES] 🗺️ Lien Maps généré (${livraisonsOptimisees.length} arrêts)`);
        return url;

    } catch (error) {
        Logger.log(`[ROUTES] ❌ Erreur génération lien Maps: ${error.message}`);
        return '';
    }
}

/**
 * Crée les étapes OPTIMISÉES pour une route
 */
function createOptimizedEtapes(routeId, livraisonsOptimisees) {
    Logger.log(`[ROUTES] 📝 Création de ${livraisonsOptimisees.length} étapes optimisées + retour QG pour ${routeId}...`);

    const sheet = getSheet(CONFIG.SHEETS.ETAPES_ROUTE);
    const rows = [];

    for (let i = 0; i < livraisonsOptimisees.length; i++) {
        const livraison = livraisonsOptimisees[i];

        const etapeId = generateNextId(
            CONFIG.SHEETS.ETAPES_ROUTE,
            'E',
            CONFIG.COLUMNS.ETAPES_ROUTE.ID_ETAPE
        );

        rows.push([
            etapeId,
            routeId,
            livraison.id_livraison,
            i + 1,
            CONFIG.ENUMS.STATUT_ETAPE.EN_ATTENTE,
            null,
            null,
            ''
        ]);

        if (i < 3 || i === livraisonsOptimisees.length - 1) {
            Logger.log(`[ROUTES]    ✅ Étape ${etapeId} pour ${livraison.id_livraison} (ordre ${i + 1})`);
        } else if (i === 3) {
            Logger.log(`[ROUTES]    ... (${livraisonsOptimisees.length - 4} étapes supplémentaires)`);
        }
    }

    const hqConfig = getCurrentHqConfig();

    if (hqConfig && hqConfig.lat && hqConfig.lng) {
        const hqEtapeId = generateNextId(
            CONFIG.SHEETS.ETAPES_ROUTE,
            'E',
            CONFIG.COLUMNS.ETAPES_ROUTE.ID_ETAPE
        );

        rows.push([
            hqEtapeId,
            routeId,
            null,
            livraisonsOptimisees.length + 1,
            CONFIG.ENUMS.STATUT_ETAPE.EN_ATTENTE,
            null,
            null,
            `Retour au QG - ${hqConfig.address}`
        ]);

        Logger.log(`[ROUTES]    🏢 Étape retour QG: ${hqEtapeId} (ordre ${livraisonsOptimisees.length + 1})`);
    } else {
        Logger.log(`[ROUTES]    ⚠️ QG non configuré - retour QG ignoré`);
    }

    if (rows.length > 0) {
        sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
        Logger.log(`[ROUTES] ✅ ${rows.length} étapes créées pour ${routeId}`);
    }
}