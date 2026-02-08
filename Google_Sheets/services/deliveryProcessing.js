/**
 * ====================================================================
 * DELIVERY_PROCESSING.GS - Helpers de Traitement des Livraisons
 * ====================================================================
 * Traitement batch et création des objets
 * Fichier 2/3 - ~250 lignes
 */

/**
 * Récupère les détails de plusieurs familles
 * @param {Array<string>} familyIds - IDs des familles
 * @returns {Object} Map {familyId: familyDetails}
 */
function fetchFamilyDetailsBatch(familyIds) {
    const familyDetailsMap = {};

    // OPTION 1: Si l'API supporte le batch (à implémenter si disponible)
    // const batchResponse = getFamiliesByIds(familyIds);

    // OPTION 2: Récupérer une par une (mais optimisé avec cache)
    for (const familyId of familyIds) {
        try {
            const details = getFamilyById(familyId);
            if (details) {
                familyDetailsMap[familyId] = details;
            }
        } catch (error) {
            Logger.log(`[DELIVERIES] ⚠️ Erreur récupération famille ${familyId}: ${error.message}`);
        }
    }

    return familyDetailsMap;
}

/**
 * Géocode plusieurs adresses
 * @param {Array<string>} addresses - Adresses à géocoder
 * @returns {Object} Map {address: {latitude, longitude}}
 */
function geocodeAddressesBatch(addresses) {
    const geocodedMap = {};

    // OPTION 1: Si l'API GEO supporte le batch (à implémenter si disponible)
    // const batchResults = geocodeAddressesBulk(addresses);

    // OPTION 2: Une par une avec cache
    for (const address of addresses) {
        try {
            const coords = geocodeFamilyAddress({ adresse: address });
            geocodedMap[address] = coords;
        } catch (error) {
            Logger.log(`[DELIVERIES] ⚠️ Erreur géocodage ${address}: ${error.message}`);
            geocodedMap[address] = null;
        }
    }

    return geocodedMap;
}

/**
 * Géocode l'adresse d'une famille (VERSION OPTIMISÉE)
 * @param {Object} family - Données famille
 * @returns {Object} {latitude, longitude}
 */
function geocodeFamilyAddress(family) {
    try {
        const geocodeResult = geocodeAddress(family.adresse);

        if (!geocodeResult?.coordinates?.latitude || !geocodeResult?.coordinates?.longitude) {
            throw new Error('Géocodage échoué - coordonnées manquantes');
        }

        return {
            latitude: geocodeResult.coordinates.latitude,
            longitude: geocodeResult.coordinates.longitude
        };

    } catch (error) {
        Logger.log(`[DELIVERIES] ⚠️ Erreur géocodage: ${error.message}`);
        throw new Error(`Impossible de géocoder l'adresse: ${error.message}`);
    }
}

/**
 * Crée un objet livraison complet
 * @param {Object} item - {family, idNumber}
 * @param {Object} familyDetailsMap - Map des détails familles
 * @param {Object} geocodedAddresses - Map des adresses géocodées
 * @param {Object} filters - Filtres
 * @returns {Object|null} Objet livraison
 */
function createDeliveryObject(item, familyDetailsMap, geocodedAddresses, filters) {
    const familyDetails = familyDetailsMap[item.family.id];

    if (!familyDetails) {
        throw new Error(`Impossible de récupérer les détails de la famille ${item.family.id}`);
    }

    // Valider les données de la famille
    const validation = validateFamilyData(familyDetails);
    if (validation.hasErrors()) {
        throw new Error(`Données famille invalides: ${validation.getErrorMessages().join(', ')}`);
    }

    const coords = geocodedAddresses[familyDetails.adresse];

    if (!coords || !coords.latitude || !coords.longitude) {
        throw new Error('Géocodage échoué');
    }

    // Résoudre la hiérarchie géographique
    const location = resolveLocation(coords.latitude, coords.longitude);

    if (!location || !location.quartier) {
        throw new Error('Impossible de résoudre la localisation géographique');
    }

    // Calculer la distance depuis le HQ
    const distanceResult = calculateDistance(
        CONFIG.HQ.LAT,
        CONFIG.HQ.LNG,
        coords.latitude,
        coords.longitude
    );

    const distanceKm = distanceResult.distance || 0;

    // Calculer nombre de personnes
    const adultes = parseInt(familyDetails.nombreAdulte) || 0;
    const enfants = parseInt(familyDetails.nombreEnfant) || 0;
    const nombrePersonnes = adultes + enfants;

    // Déterminer le type d'aide
    let typeAide = filters.types_aide && filters.types_aide.length > 0
        ? filters.types_aide[0]
        : CONFIG.ENUMS.TYPE_AIDE.SADAQA;

    // Générer l'ID avec le compteur
    const idLivraison = `L${String(item.idNumber).padStart(3, '0')}`;

    // Créer l'objet livraison
    const delivery = {
        id_livraison: idLivraison,
        id_famille: item.family.id,
        id_quartier: location.quartier.id,
        adresse: familyDetails.adresse,
        latitude: coords.latitude,
        longitude: coords.longitude,
        disponibilite_debut: filters.date_livraison ? new Date(filters.date_livraison + ' 09:00:00') : null,
        disponibilite_fin: filters.date_livraison ? new Date(filters.date_livraison + ' 18:00:00') : null,
        nombre_personnes: nombrePersonnes,
        statut: CONFIG.ENUMS.STATUT_LIVRAISON.NON_ASSIGNEE,
        priorite: parseInt(familyDetails.criticite) || 5,
        type_aide: typeAide,
        besoins_speciaux: familyDetails.besoins_speciaux || '',
        date_creation: getCurrentDateTime(),
        date_modification: getCurrentDateTime(),
        _distance_from_hq: distanceKm
    };

    // Valider la livraison
    const deliveryValidation = validateLivraison(delivery);
    if (deliveryValidation.hasErrors()) {
        throw new Error(`Livraison invalide: ${deliveryValidation.getErrorMessages().join(', ')}`);
    }

    return delivery;
}

/**
 * Trie les livraisons par distance (VERSION OPTIMISÉE - en place)
 * @param {Array<Object>} deliveries - Livraisons
 */
function sortDeliveriesByDistance(deliveries) {
    deliveries.sort((a, b) => {
        // D'abord par distance (DESC - plus loin en premier)
        const distanceDiff = (b._distance_from_hq || 0) - (a._distance_from_hq || 0);
        if (distanceDiff !== 0) return distanceDiff;

        // Puis par priorité (ASC - 1 = urgent avant 5 = standard)
        return a.priorite - b.priorite;
    });
}

/**
 * Sauvegarde les livraisons dans Google Sheets (VERSION OPTIMISÉE)
 * @param {Array<Object>} deliveries - Livraisons à sauvegarder
 */
function saveDeliveriesToSheet(deliveries) {
    if (deliveries.length === 0) return;

    const rows = deliveries.map(d => [
        d.id_livraison,
        d.id_famille,
        d.id_quartier,
        d.adresse,
        d.latitude,
        d.longitude,
        d.disponibilite_debut,
        d.disponibilite_fin,
        d.nombre_personnes,
        d.statut,
        d.priorite,
        d.type_aide,
        d.besoins_speciaux,
        d.date_creation,
        d.date_modification
    ]);

    appendRows(CONFIG.SHEETS.LIVRAISON, rows);
    Logger.log(`[DELIVERIES] 💾 ${rows.length} livraisons sauvegardées dans Google Sheets`);
}

/**
 * Met à jour le statut d'une livraison
 * @param {string} deliveryId - ID de la livraison
 * @param {string} newStatus - Nouveau statut
 * @returns {boolean}
 */
function updateDeliveryStatus(deliveryId, newStatus) {
    const validStatuts = Object.values(CONFIG.ENUMS.STATUT_LIVRAISON);
    if (!validStatuts.includes(newStatus)) {
        Logger.log(`[DELIVERIES] ❌ Statut invalide: ${newStatus}`);
        return false;
    }

    const updated = updateRowById(
        CONFIG.SHEETS.LIVRAISON,
        deliveryId,
        CONFIG.COLUMNS.LIVRAISON.ID_LIVRAISON,
        {
            statut: newStatus,
            date_modification: getCurrentDateTime()
        }
    );

    if (updated) {
        Logger.log(`[DELIVERIES] ✅ Livraison ${deliveryId} → ${newStatus}`);
    }

    return updated;
}

/**
 * Annule une livraison
 * @param {string} deliveryId - ID de la livraison
 * @param {string} reason - Raison de l'annulation
 * @returns {boolean}
 */
function cancelDelivery(deliveryId, reason = '') {
    const delivery = getDeliveryById(deliveryId);

    if (!delivery) {
        Logger.log(`[DELIVERIES] ❌ Livraison ${deliveryId} introuvable`);
        return false;
    }

    if (delivery.statut === CONFIG.ENUMS.STATUT_LIVRAISON.LIVREE) {
        Logger.log(`[DELIVERIES] ❌ Impossible d'annuler une livraison déjà livrée`);
        return false;
    }

    const updated = updateRowById(
        CONFIG.SHEETS.LIVRAISON,
        deliveryId,
        CONFIG.COLUMNS.LIVRAISON.ID_LIVRAISON,
        {
            statut: CONFIG.ENUMS.STATUT_LIVRAISON.ANNULEE,
            besoins_speciaux: delivery.besoins_speciaux + (reason ? `\n[Annulée: ${reason}]` : ''),
            date_modification: getCurrentDateTime()
        }
    );

    if (updated) {
        Logger.log(`[DELIVERIES] ✅ Livraison ${deliveryId} annulée`);
    }

    return updated;
}