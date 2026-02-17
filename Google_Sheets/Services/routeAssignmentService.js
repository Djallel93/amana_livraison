/**
 * ====================================================================
 * ROUTE_ASSIGNMENT_SERVICE.GS - Service d'Attribution de Routes
 * ====================================================================
 * Gère l'attribution des véhicules et la sauvegarde des routes
 * 
 * ⚠️ MODIFICATION: Ajout champ lien_maps (vide) dans rowData
 */

/**
 * Sauvegarde une route dans la feuille routes
 * @param {Object} routeData - Données de la route
 * @returns {boolean} Succès de la sauvegarde
 */
function saveRoute(routeData) {
    try {
        Logger.log(`[ROUTE] 💾 Sauvegarde route ${routeData.id_route}`);

        const sheet = getSheet(CONFIG_SHEETS.SHEETS.ROUTES);

        // Construire le tableau de données pour la ligne
        // ⚠️ IMPORTANT: L'ordre doit correspondre EXACTEMENT aux colonnes de la feuille
        const rowData = [
            routeData.id_route,              // 1. ID_ROUTE
            routeData.id_benevole,           // 2. ID_BENEVOLE
            routeData.id_binome || '',       // 3. ID_BINOME
            routeData.id_vehicule_prete || '', // 4. ID_VEHICULE_PRETE
            routeData.date_debut,            // 5. DATE_DEBUT
            routeData.date_fin,              // 6. DATE_FIN
            routeData.occasion,              // 7. OCCASION
            routeData.statut,                // 8. STATUT
            routeData.distance_totale_km || 0, // 9. DISTANCE_TOTALE_KM
            routeData.poids_total_kg || 0,   // 10. POIDS_TOTAL_KG
            routeData.relivre || false,      // 11. RELIVRE
            '',                              // 12. LIEN_MAPS ← ✨ NOUVEAU (vide, sera rempli après optimisation TSP)
            routeData.dossier_drive || '',   // 13. DOSSIER_DRIVE
            routeData.date_creation,         // 14. DATE_CREATION
            routeData.date_modification      // 15. DATE_MODIFICATION
        ];

        // Vérifier que le nombre de champs correspond
        const expectedColumns = 15;
        if (rowData.length !== expectedColumns) {
            Logger.log(`[ROUTE] ⚠️ Attention: ${rowData.length} champs fournis, ${expectedColumns} attendus`);
        }

        // Ajouter la ligne dans la feuille
        sheet.appendRow(rowData);

        Logger.log(`[ROUTE] ✅ Route ${routeData.id_route} sauvegardée (statut: ${routeData.statut})`);

        return true;

    } catch (error) {
        Logger.log(`[ROUTE] ❌ Erreur sauvegarde route: ${error.message}`);
        throw error;
    }
}

/**
 * Met à jour une route existante
 * @param {string} routeId - ID de la route
 * @param {Object} updates - Champs à mettre à jour
 * @returns {boolean} Succès de la mise à jour
 */
function updateRoute(routeId, updates) {
    try {
        Logger.log(`[ROUTE] 🔄 Mise à jour route ${routeId}`);

        const sheet = getSheet(CONFIG_SHEETS.SHEETS.ROUTES);
        const routeRow = findRouteRow(routeId);

        if (!routeRow) {
            throw new Error(`Route ${routeId} introuvable`);
        }

        // Mettre à jour les champs spécifiés
        Object.keys(updates).forEach(field => {
            const columnIndex = CONFIG_SHEETS.COLUMNS.ROUTES[field.toUpperCase()];
            if (columnIndex) {
                sheet.getRange(routeRow, columnIndex).setValue(updates[field]);
            }
        });

        // Toujours mettre à jour la date de modification
        const now = new Date();
        sheet.getRange(routeRow, CONFIG_SHEETS.COLUMNS.ROUTES.DATE_MODIFICATION).setValue(now);

        Logger.log(`[ROUTE] ✅ Route ${routeId} mise à jour`);

        return true;

    } catch (error) {
        Logger.log(`[ROUTE] ❌ Erreur mise à jour route: ${error.message}`);
        throw error;
    }
}

/**
 * Trouve la ligne d'une route dans la feuille
 * @param {string} routeId - ID de la route
 * @returns {number|null} Numéro de ligne ou null
 */
function findRouteRow(routeId) {
    const sheet = getSheet(CONFIG_SHEETS.SHEETS.ROUTES);
    const data = sheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) { // Skip header row
        if (data[i][CONFIG_SHEETS.COLUMNS.ROUTES.ID_ROUTE - 1] === routeId) {
            return i + 1; // Retourner le numéro de ligne (1-indexed)
        }
    }

    return null;
}

/**
 * Crée une nouvelle route avec les paramètres par défaut
 * @param {Object} params - Paramètres de la route
 * @returns {Object} Données de la route créée
 */
function createNewRoute(params) {
    const now = new Date();

    const routeData = {
        id_route: generateRouteId(),
        id_benevole: params.id_benevole,
        id_binome: params.id_binome || '',
        id_vehicule_prete: params.id_vehicule_prete || '',
        date_debut: params.date_debut || now,
        date_fin: params.date_fin || now,
        occasion: params.occasion,
        statut: CONFIG_SHEETS.ENUMS.STATUT_ROUTE.BROUILLON, // ← La route commence en BROUILLON
        distance_totale_km: 0,
        poids_total_kg: 0,
        relivre: params.relivre || false,
        dossier_drive: '',
        date_creation: now,
        date_modification: now
    };

    saveRoute(routeData);

    return routeData;
}

/**
 * Génère un ID unique pour une route
 * @returns {string} ID route (format: R_YYYYMMDD_XXX)
 */
function generateRouteId() {
    const timestamp = Utilities.formatDate(new Date(), 'Europe/Paris', 'yyyyMMdd');
    const sheet = getSheet(CONFIG_SHEETS.SHEETS.ROUTES);
    const lastRow = sheet.getLastRow();
    const counter = (lastRow).toString().padStart(3, '0');
    return `R_${timestamp}_${counter}`;
}

/**
 * Récupère les routes avec le statut "Brouillon"
 * @returns {Array<Object>} Liste des routes en brouillon
 */
function getDraftRoutes() {
    const sheet = getSheet(CONFIG_SHEETS.SHEETS.ROUTES);
    const data = sheet.getDataRange().getValues();
    const routes = [];

    for (let i = 1; i < data.length; i++) {
        const row = data[i];
        const statut = row[CONFIG_SHEETS.COLUMNS.ROUTES.STATUT - 1];

        if (statut === CONFIG_SHEETS.ENUMS.STATUT_ROUTE.BROUILLON) {
            routes.push({
                id_route: row[CONFIG_SHEETS.COLUMNS.ROUTES.ID_ROUTE - 1],
                id_benevole: row[CONFIG_SHEETS.COLUMNS.ROUTES.ID_BENEVOLE - 1],
                occasion: row[CONFIG_SHEETS.COLUMNS.ROUTES.OCCASION - 1],
                lien_maps: row[CONFIG_SHEETS.COLUMNS.ROUTES.LIEN_MAPS - 1],
                date_debut: row[CONFIG_SHEETS.COLUMNS.ROUTES.DATE_DEBUT - 1],
                statut: statut
            });
        }
    }

    return routes;
}

/**
 * Change le statut d'une route de "Brouillon" à "Confirmée"
 * @param {string} routeId - ID de la route
 * @returns {boolean} Succès de la confirmation
 */
function confirmRoute(routeId) {
    try {
        Logger.log(`[ROUTE] ✅ Confirmation route ${routeId}`);

        // Vérifier que le lien Maps existe
        const routeData = getRouteById(routeId);
        if (!routeData || !routeData.lien_maps) {
            throw new Error('Le lien Google Maps doit être généré avant de confirmer la route');
        }

        // Mettre à jour le statut
        updateRoute(routeId, {
            statut: CONFIG_SHEETS.ENUMS.STATUT_ROUTE.CONFIRMEE
        });

        Logger.log(`[ROUTE] ✅ Route ${routeId} confirmée`);

        return true;

    } catch (error) {
        Logger.log(`[ROUTE] ❌ Erreur confirmation route: ${error.message}`);
        throw error;
    }
}

/**
 * Récupère les données complètes d'une route
 * @param {string} routeId - ID de la route
 * @returns {Object|null} Données de la route
 */
function getRouteById(routeId) {
    const sheet = getSheet(CONFIG_SHEETS.SHEETS.ROUTES);
    const data = sheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
        const row = data[i];
        if (row[CONFIG_SHEETS.COLUMNS.ROUTES.ID_ROUTE - 1] === routeId) {
            return {
                id_route: row[CONFIG_SHEETS.COLUMNS.ROUTES.ID_ROUTE - 1],
                id_benevole: row[CONFIG_SHEETS.COLUMNS.ROUTES.ID_BENEVOLE - 1],
                id_binome: row[CONFIG_SHEETS.COLUMNS.ROUTES.ID_BINOME - 1],
                id_vehicule_prete: row[CONFIG_SHEETS.COLUMNS.ROUTES.ID_VEHICULE_PRETE - 1],
                date_debut: row[CONFIG_SHEETS.COLUMNS.ROUTES.DATE_DEBUT - 1],
                date_fin: row[CONFIG_SHEETS.COLUMNS.ROUTES.DATE_FIN - 1],
                occasion: row[CONFIG_SHEETS.COLUMNS.ROUTES.OCCASION - 1],
                statut: row[CONFIG_SHEETS.COLUMNS.ROUTES.STATUT - 1],
                distance_totale_km: row[CONFIG_SHEETS.COLUMNS.ROUTES.DISTANCE_TOTALE_KM - 1],
                poids_total_kg: row[CONFIG_SHEETS.COLUMNS.ROUTES.POIDS_TOTAL_KG - 1],
                relivre: row[CONFIG_SHEETS.COLUMNS.ROUTES.RELIVRE - 1],
                lien_maps: row[CONFIG_SHEETS.COLUMNS.ROUTES.LIEN_MAPS - 1], // ← ✨ NOUVEAU
                dossier_drive: row[CONFIG_SHEETS.COLUMNS.ROUTES.DOSSIER_DRIVE - 1],
                date_creation: row[CONFIG_SHEETS.COLUMNS.ROUTES.DATE_CREATION - 1],
                date_modification: row[CONFIG_SHEETS.COLUMNS.ROUTES.DATE_MODIFICATION - 1]
            };
        }
    }

    return null;
}