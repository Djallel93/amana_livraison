/**
 * Crée un objet route à partir d'un cluster et d'un bénévole
 *
 * @param {Object}      cluster   - Cluster (ou sous-cluster)
 * @param {Object}      benevole  - Bénévole assigné
 * @param {Object|null} hqCoords  - Coordonnées du QG {lat, lng}
 * @returns {Object} Route prête à être passée à saveRoute()
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