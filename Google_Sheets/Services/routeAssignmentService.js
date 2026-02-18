/**
 * ====================================================================
 * ROUTE_SERVICE_ASSIGNMENT.GS - Service d'Assignment des Routes
 * ====================================================================
 */

/**
 * 🚗 Assigner les clusters aux véhicules (avec support multi-trajets)
 */
function assignerClustersAuxVehicules(clusters, benevoles, params) {
    const routes = [];
    const clustersRestants = [...clusters];
    const maxLivraisonsParRoute = params.max_livraisons || 15;

    // Récupérer les coordonnées du QG
    const hqConfig = getCurrentHqConfig();
    const hqCoords = (hqConfig && hqConfig.lat && hqConfig.lng)
        ? { lat: hqConfig.lat, lng: hqConfig.lng }
        : null;

    if (hqCoords) {
        Logger.log(`[ROUTES] 🏢 QG: ${hqConfig.address} (${hqCoords.lat}, ${hqCoords.lng})`);
    } else {
        Logger.log(`[ROUTES] ⚠️ Coordonnées QG non configurées`);
    }

    // Trier les véhicules par capacité décroissante
    benevoles.sort((a, b) => {
        const capA = a.vehicule ? (a.vehicule.capaciteKg || 0) : 0;
        const capB = b.vehicule ? (b.vehicule.capaciteKg || 0) : 0;
        return capB - capA;
    });

    Logger.log(`[ROUTES] 🚗 Début assignation: ${benevoles.length} bénévoles, ${clusters.length} clusters`);

    // Logique multi-trajets
    let numeroTrajet = 1;

    while (clustersRestants.length > 0) {
        Logger.log(`[ROUTES] 🔄 Trajet ${numeroTrajet}: ${clustersRestants.length} clusters restants`);

        let assignesDansTrajet = 0;

        for (const benevole of benevoles) {
            if (clustersRestants.length === 0) {
                Logger.log(`[ROUTES] ✅ Tous les clusters assignés après trajet ${numeroTrajet}`);
                break;
            }

            Logger.log(`[ROUTES] 👤 ${benevole.nom} - Trajet ${numeroTrajet}`);

            const capaciteVehicule = benevole.vehicule?.capaciteKg || 0;
            Logger.log(`[ROUTES]    Véhicule: ${benevole.vehicule?.type}, capacité: ${capaciteVehicule}kg`);

            const route = {
                benevole: benevole,
                livraisons: [],
                clusters_assignes: [],
                poids_total: 0,
                distance_totale: 0,
                numero_trajet: numeroTrajet
            };

            // Prendre le cluster avec le PLUS de livraisons
            const clusterPrincipal = clustersRestants.shift();

            if (!clusterPrincipal) {
                Logger.log(`[ROUTES] ❌ Aucun cluster principal disponible`);
                continue;
            }

            // Vérifier la capacité
            if (capaciteVehicule > 0 && clusterPrincipal.poids_total > capaciteVehicule) {
                Logger.log(`[ROUTES] ⚠️ Cluster ${clusterPrincipal.id} trop lourd (${Math.round(clusterPrincipal.poids_total)}kg > ${capaciteVehicule}kg) - ignoré`);
                clustersRestants.push(clusterPrincipal);
                continue;
            }

            Logger.log(`[ROUTES]    ✅ Cluster principal ${clusterPrincipal.id}: ${clusterPrincipal.nombre_livraisons} livraisons, ${Math.round(clusterPrincipal.poids_total)}kg`);

            route.livraisons.push(...clusterPrincipal.livraisons);
            route.poids_total += clusterPrincipal.poids_total;
            route.clusters_assignes.push(clusterPrincipal.id);

            // Essayer d'ajouter d'autres clusters
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

                if (peutGrouper &&
                    (capaciteVehicule === 0 || nouveauPoids <= capaciteVehicule) &&
                    nouvelleTaille <= maxLivraisonsParRoute) {

                    clustersAAjouter.push({ index: j, cluster: autreCluster });
                    Logger.log(`[ROUTES]       + Ajout cluster ${autreCluster.id}: ${autreCluster.nombre_livraisons} livraisons, ${Math.round(autreCluster.poids_total)}kg`);
                }
            }

            // Ajouter les clusters sélectionnés
            for (let k = clustersAAjouter.length - 1; k >= 0; k--) {
                const { index, cluster } = clustersAAjouter[k];
                route.livraisons.push(...cluster.livraisons);
                route.poids_total += cluster.poids_total;
                route.clusters_assignes.push(cluster.id);
                clustersRestants.splice(index, 1);
            }

            // Calculer la distance (sera recalculée après optimisation TSP)
            route.distance_totale = calculerDistanceTotaleRoute(route.livraisons, hqCoords);

            Logger.log(`[ROUTES]    📊 Route: ${route.livraisons.length} livraisons, ${Math.round(route.poids_total)}kg, ~${Math.round(route.distance_totale)}km (avant optimisation)`);

            routes.push(route);
            assignesDansTrajet++;
        }

        if (assignesDansTrajet === 0 && clustersRestants.length > 0) {
            Logger.log(`[ROUTES] ⚠️ CRITIQUE: Aucun cluster assigné dans le trajet ${numeroTrajet}`);
            clustersRestants.forEach(c => {
                Logger.log(`[ROUTES]    ⚠️ Cluster ${c.id}: ${c.nombre_livraisons} livraisons, ${Math.round(c.poids_total)}kg`);
            });
            break;
        }

        numeroTrajet++;

        if (numeroTrajet > 5) {
            Logger.log(`[ROUTES] ⚠️ Nombre maximum de trajets (5) atteint, arrêt`);
            break;
        }
    }

    if (clustersRestants.length > 0) {
        const livraisonsNonAssignees = clustersRestants.reduce((sum, c) => sum + c.nombre_livraisons, 0);
        Logger.log(`[ROUTES] ⚠️ ATTENTION: ${clustersRestants.length} clusters NON assignés (${livraisonsNonAssignees} livraisons)`);
    } else {
        Logger.log(`[ROUTES] ✅ SUCCÈS: Tous les clusters assignés en ${numeroTrajet - 1} trajet(s)`);
    }

    Logger.log(`[ROUTES] ✅ Assignation terminée: ${routes.length} routes créées`);
    return routes;
}

/**
 * 🗺️ Générer le lien Google Maps pour un itinéraire optimisé
 *
 * Format : https://www.google.com/maps/dir/?api=1
 *   &origin=lat,lng
 *   &destination=lat,lng
 *   &waypoints=lat,lng|lat,lng|...
 *   &travelmode=driving
 *
 * @param {Array<Object>} livraisonsOptimisees - Livraisons dans l'ordre optimisé (avec lat/lng)
 * @param {Object} hqCoords - Coordonnées du QG {lat, lng}
 * @returns {string} URL Google Maps ou chaîne vide si impossible
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

/**
 * 💾 Sauvegarder une route en statut BROUILLON
 *
 * ⚠️ CHANGEMENT v3 :
 * - Statut : BROUILLON (l'admin doit valider manuellement dans Sheets)
 * - Lien Google Maps généré automatiquement après optimisation TSP
 * - Lien enregistré dans la colonne LIEN_MAPS
 *
 * @param {Object} route - Données de la route
 * @param {Object} params - Paramètres de planification
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

            const hqCoords = {
                lat: hqConfig.lat,
                lng: hqConfig.lng
            };

            // Appliquer l'optimisation TSP (Nearest Neighbor + 2-opt)
            livraisonsOptimisees = optimizeDeliveryOrder(route.livraisons, hqCoords);

            // Recalculer la distance avec l'ordre optimisé
            const distanceOptimisee = calculerDistanceTotaleRoute(livraisonsOptimisees, hqCoords);
            route.distance_totale = distanceOptimisee;

            Logger.log(`[ROUTES] ✅ Optimisation terminée: ${Math.round(distanceOptimisee)}km`);
        } else {
            Logger.log(`[ROUTES] ⚠️ Optimisation ignorée (QG non configuré ou livraison unique)`);
        }

        // ✅ Générer le lien Google Maps après optimisation
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
            // ⚠️ CHANGEMENT v3 : BROUILLON (validation manuelle requise)
            statut: CONFIG.ENUMS.STATUT_ROUTE.BROUILLON,
            distance_totale_km: Math.round(route.distance_totale * 100) / 100,
            poids_total_kg: Math.round(route.poids_total * 100) / 100,
            relivre: params.relivre || false,
            lien_maps: lienMaps,        // ✅ NOUVELLE COLONNE
            dossier_drive: '',
            date_creation: getCurrentDateTime(),
            date_modification: getCurrentDateTime()
        };

        // Valider les données
        const validation = validateRoute(routeData);
        if (validation.hasErrors()) {
            throw new Error(`Route invalide: ${validation.getErrorMessages().join(', ')}`);
        }

        // Construire la ligne avec la nouvelle colonne LIEN_MAPS (position 12)
        const rowData = [
            routeData.id_route,             // 1. ID_ROUTE
            routeData.id_benevole,          // 2. ID_BENEVOLE
            routeData.id_binome,            // 3. ID_BINOME
            routeData.id_vehicule_prete,    // 4. ID_VEHICULE_PRETE
            routeData.date_debut,           // 5. DATE_DEBUT
            routeData.date_fin,             // 6. DATE_FIN
            routeData.occasion,             // 7. OCCASION
            routeData.statut,               // 8. STATUT (BROUILLON)
            routeData.distance_totale_km,   // 9. DISTANCE_TOTALE_KM
            routeData.poids_total_kg,       // 10. POIDS_TOTAL_KG
            routeData.relivre,              // 11. RELIVRE
            routeData.lien_maps,            // 12. LIEN_MAPS ← NOUVEAU
            routeData.dossier_drive,        // 13. DOSSIER_DRIVE (décalé)
            routeData.date_creation,        // 14. DATE_CREATION (décalé)
            routeData.date_modification     // 15. DATE_MODIFICATION (décalé)
        ];

        // Étape 1 : Sauvegarder la route
        appendRow(CONFIG.SHEETS.ROUTES, rowData);
        Logger.log(`[ROUTES] ✅ Route ${tempId} sauvegardée (statut: BROUILLON, lien Maps: ${lienMaps ? 'oui' : 'non'})`);

        // Étape 2 : Créer les étapes avec l'ordre optimisé
        createOptimizedEtapes(tempId, livraisonsOptimisees);
        Logger.log(`[ROUTES] ✅ ${livraisonsOptimisees.length} étapes optimisées + retour QG créés`);

        // Étape 3 : Mettre à jour le statut des livraisons → ASSIGNEE
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
 * 📝 Créer les étapes OPTIMISÉES pour une route
 *
 * @param {string} routeId - ID de la route
 * @param {Array<Object>} livraisonsOptimisees - Livraisons dans l'ordre optimisé
 */
function createOptimizedEtapes(routeId, livraisonsOptimisees) {
    Logger.log(`[ROUTES] 📝 Création de ${livraisonsOptimisees.length} étapes optimisées + retour QG pour ${routeId}...`);

    const sheet = getSheet(CONFIG.SHEETS.ETAPES_ROUTE);
    const rows = [];

    // 1. Créer les étapes de livraison dans l'ordre optimisé
    for (let i = 0; i < livraisonsOptimisees.length; i++) {
        const livraison = livraisonsOptimisees[i];

        const etapeId = generateNextId(
            CONFIG.SHEETS.ETAPES_ROUTE,
            'E',
            CONFIG.COLUMNS.ETAPES_ROUTE.ID_ETAPE
        );

        const rowData = [
            etapeId,                                    // 1. ID_ETAPE
            routeId,                                    // 2. ID_ROUTE
            livraison.id_livraison,                     // 3. ID_LIVRAISON
            i + 1,                                      // 4. ORDRE_PASSAGE (optimisé)
            CONFIG.ENUMS.STATUT_ETAPE.EN_ATTENTE,      // 5. STATUT
            null,                                       // 6. HEURE_DEBUT
            null,                                       // 7. HEURE_FIN
            ''                                          // 8. COMMENTAIRE
        ];

        rows.push(rowData);

        if (i < 3 || i === livraisonsOptimisees.length - 1) {
            Logger.log(`[ROUTES]    ✅ Étape ${etapeId} pour ${livraison.id_livraison} (ordre ${i + 1})`);
        } else if (i === 3) {
            Logger.log(`[ROUTES]    ... (${livraisonsOptimisees.length - 4} étapes supplémentaires)`);
        }
    }

    // 2. Ajouter le retour au QG comme dernière étape
    const hqConfig = getCurrentHqConfig();

    if (hqConfig && hqConfig.lat && hqConfig.lng) {
        const hqEtapeId = generateNextId(
            CONFIG.SHEETS.ETAPES_ROUTE,
            'E',
            CONFIG.COLUMNS.ETAPES_ROUTE.ID_ETAPE
        );

        const hqCommentaire = `Retour au QG - ${hqConfig.address}`;

        const hqRowData = [
            hqEtapeId,
            routeId,
            null,  // NULL pour retour QG
            livraisonsOptimisees.length + 1,
            CONFIG.ENUMS.STATUT_ETAPE.EN_ATTENTE,
            null,
            null,
            hqCommentaire
        ];

        rows.push(hqRowData);
        Logger.log(`[ROUTES]    🏢 Étape retour QG: ${hqEtapeId} (ordre ${livraisonsOptimisees.length + 1})`);
    } else {
        Logger.log(`[ROUTES]    ⚠️ QG non configuré - retour QG ignoré`);
    }

    // 3. Insérer toutes les étapes en batch
    if (rows.length > 0) {
        sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
        Logger.log(`[ROUTES] ✅ ${rows.length} étapes créées pour ${routeId} (${livraisonsOptimisees.length} livraisons + ${rows.length - livraisonsOptimisees.length} retour QG)`);
    }
}