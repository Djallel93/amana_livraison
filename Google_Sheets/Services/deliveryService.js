/**
 * ====================================================================
 * DELIVERY_SERVICE.GS - Service de Gestion des Livraisons
 * ====================================================================
 */

function generateDeliveries(filters) {
    Logger.log('[LIVRAISONS] 🚀 Démarrage génération...');

    const result = {
        success:    false,
        created:    0,
        skipped:    0,
        errors:     [],
        deliveries: []
    };

    try {
        const families = fetchEligibleFamilies(filters);
        Logger.log(`[LIVRAISONS] 📊 ${families.length} familles récupérées`);

        if (families.length === 0) {
            result.errors.push('Aucune famille ne correspond aux critères');
            return result;
        }

        const limit    = filters.nombre || families.length;
        const selected = families.slice(0, limit);

        const toProcess = selected.filter(f => {
            if (hasActiveLivraison(f.id)) {
                result.skipped++;
                return false;
            }
            return true;
        });

        Logger.log(`[LIVRAISONS] ✅ ${toProcess.length} familles à traiter`);

        if (toProcess.length === 0) {
            result.success = true;
            return result;
        }

        const BATCH_SIZE = 20;
        let currentId = getNextIdNumber(CONFIG.SHEETS.LIVRAISON, 'L', CONFIG.COLUMNS.LIVRAISON.ID_LIVRAISON);

        for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
            const batch    = toProcess.slice(i, i + BATCH_SIZE);
            const batchNum = Math.floor(i / BATCH_SIZE) + 1;
            const total    = Math.ceil(toProcess.length / BATCH_SIZE);

            Logger.log(`[LIVRAISONS] 📦 Batch ${batchNum}/${total} (${batch.length} familles)`);

            const deliveries = processBatch(batch, filters, currentId);

            if (deliveries.length > 0) {
                result.created += deliveries.length;
                result.deliveries.push(...deliveries);
                currentId += deliveries.length;
            }

            Logger.log(`[LIVRAISONS] ✅ Batch ${batchNum}: ${deliveries.length} créées`);
        }

        if (result.deliveries.length > 0) {
            Logger.log(`[LIVRAISONS] 🔄 Tri de ${result.deliveries.length} livraisons...`);
            result.deliveries.sort((a, b) => {
                const distDiff = (b._distance || 0) - (a._distance || 0);
                if (distDiff !== 0) return distDiff;
                return a.priorite - b.priorite;
            });

            saveDeliveriesToSheet(result.deliveries);
        }

        result.success = result.created > 0;
        Logger.log(`[LIVRAISONS] 🎉 Terminé: ${result.created} créées, ${result.skipped} ignorées`);

        return result;

    } catch (error) {
        Logger.log(`[LIVRAISONS] ❌ Erreur: ${error.message}`);
        result.errors.push(error.message);
        return result;
    }
}

function processBatch(families, filters, startId) {
    const deliveries = [];
    const addresses  = families.map(f => f.adresse);
    const geocoded   = batchGeocode(addresses);

    families.forEach((family, index) => {
        try {
            const coords = geocoded[family.adresse];

            if (!coords || !coords.latitude || !coords.longitude) {
                Logger.log(`[LIVRAISONS] ⚠️ Famille ${family.id}: géocodage échoué`);
                return;
            }

            const delivery = createDelivery(family, coords, filters, startId + index);
            deliveries.push(delivery);

        } catch (error) {
            Logger.log(`[LIVRAISONS] ❌ Famille ${family.id}: ${error.message}`);
        }
    });

    return deliveries;
}

function createDelivery(family, coords, filters, idNumber) {
    const validation = validateFamilyData(family);
    if (validation.hasErrors()) {
        throw new Error(validation.getErrorMessages().join(', '));
    }

    const distance = calculateDistance(
        CONFIG.HQ.LAT, CONFIG.HQ.LNG,
        coords.latitude, coords.longitude
    );

    const delivery = {
        id_livraison:           `L${String(idNumber).padStart(3, '0')}`,
        id_famille:             family.id,
        id_quartier:            family.idQuartier,
        adresse:                family.adresse,
        latitude:               coords.latitude,
        longitude:              coords.longitude,
        hotel:                  family.hotel === true || family.hotel === 'true' || false,
        disponibilite_debut:    filters.date_livraison ? new Date(filters.date_livraison + ' 09:00:00') : null,
        disponibilite_fin:      filters.date_livraison ? new Date(filters.date_livraison + ' 18:00:00') : null,
        nombre_personnes:       (parseInt(family.nombreAdulte) || 0) + (parseInt(family.nombreEnfant) || 0),
        avec_enfant:            (parseInt(family.nombreEnfant) || 0) > 0,
        statut_conditionnement: '',
        statut:                 CONFIG.ENUMS.STATUT_LIVRAISON.NON_ASSIGNEE,
        priorite:               parseInt(family.criticite) || 5,
        type_aide:              filters.types_aide?.[0] || CONFIG.ENUMS.TYPE_AIDE.PONCTUELLE,
        besoins_speciaux:       family.besoins_speciaux || '',
        date_creation:          getCurrentDateTime(),
        date_modification:      getCurrentDateTime(),
        _distance:              distance.distance || 0
    };

    const deliveryValidation = validateLivraison(delivery);
    if (deliveryValidation.hasErrors()) {
        throw new Error(deliveryValidation.getErrorMessages().join(', '));
    }

    return delivery;
}

function fetchEligibleFamilies(filters) {
    const apiFilters = { includeHierarchy: false };

    if (filters.types_aide?.length > 0) {
        if (filters.types_aide.includes(CONFIG.ENUMS.TYPE_AIDE.ZAKAT_EL_FITR)) apiFilters.zakatElFitr = true;
        if (filters.types_aide.includes(CONFIG.ENUMS.TYPE_AIDE.RECOLTE))       apiFilters.sadaqa     = true;
        if (filters.types_aide.includes(CONFIG.ENUMS.TYPE_AIDE.PONCTUELLE))    apiFilters.sadaqa     = true;
    }

    const response = getAllValidatedFamilies(apiFilters);

    if (!response?.families) {
        throw new Error('Erreur récupération familles');
    }

    let families = response.families;

    if (filters.priorites?.length > 0) {
        families = families.filter(f => {
            const criticite = parseInt(f.criticite) || 5;
            return filters.priorites.includes(criticite);
        });
    }

    if (filters.quartiers?.length > 0) {
        families = families.filter(f => filters.quartiers.includes(f.idQuartier));
    }

    return families;
}

function hasActiveLivraison(familyId) {
    const data    = getAllData(CONFIG.SHEETS.LIVRAISON);
    const idCol   = CONFIG.COLUMNS.LIVRAISON.ID_FAMILLE - 1;
    const statCol = CONFIG.COLUMNS.LIVRAISON.STATUT - 1;

    for (const row of data) {
        if (row[idCol] === familyId) {
            const statut = row[statCol];
            if (statut !== CONFIG.ENUMS.STATUT_LIVRAISON.LIVREE &&
                statut !== CONFIG.ENUMS.STATUT_LIVRAISON.ANNULEE) {
                return true;
            }
        }
    }
    return false;
}

function getNextIdNumber(sheetName, prefix, colIndex) {
    const data = getAllData(sheetName);
    if (data.length === 0) return 1;

    const numbers = data
        .map(row => row[colIndex - 1])
        .filter(id => id && typeof id === 'string' && id.startsWith(prefix))
        .map(id => parseInt(id.substring(prefix.length)))
        .filter(num => !isNaN(num));

    return numbers.length > 0 ? Math.max(...numbers) + 1 : 1;
}

function saveDeliveriesToSheet(deliveries) {
    if (deliveries.length === 0) return;

    const rows = deliveries.map(d => [
        d.id_livraison,
        d.id_famille,
        d.id_quartier,
        d.adresse,
        d.latitude,
        d.longitude,
        d.hotel === true,
        d.disponibilite_debut,
        d.disponibilite_fin,
        d.nombre_personnes,
        d.avec_enfant === true,
        d.statut_conditionnement || '',
        d.statut,
        d.priorite,
        d.type_aide,
        d.besoins_speciaux,
        d.date_creation,
        d.date_modification
    ]);

    appendRows(CONFIG.SHEETS.LIVRAISON, rows);
    Logger.log(`[LIVRAISONS] 💾 ${rows.length} livraisons sauvegardées`);
}