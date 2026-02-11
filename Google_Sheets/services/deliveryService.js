/**
 * ====================================================================
 * DELIVERY_SERVICE.GS - Service de Gestion des Livraisons
 * ====================================================================
 * Version ultra-simplifiée - idQuartier déjà dans family!
 * ~200 lignes
 */

/**
 * Génère des livraisons à partir des familles validées
 * @param {Object} filters - Filtres de sélection
 * @returns {Object} Résultat de la génération
 */
function generateDeliveries(filters) {
  Logger.log('[DELIVERIES] 🚀 Démarrage génération...');

  const result = {
    success: false,
    created: 0,
    skipped: 0,
    errors: [],
    deliveries: []
  };

  try {
    // 1. Récupérer familles (sans orderBy - on trie nous-mêmes)
    const families = fetchEligibleFamilies(filters);
    Logger.log(`[DELIVERIES] 📊 ${families.length} familles récupérées`);

    if (families.length === 0) {
      result.errors.push('Aucune famille ne correspond aux critères');
      return result;
    }

    // 2. Limiter et filtrer
    const limit = filters.nombre || families.length;
    const selected = families.slice(0, limit);

    const toProcess = selected.filter(f => {
      if (hasActiveLivraison(f.id)) {
        result.skipped++;
        return false;
      }
      return true;
    });

    Logger.log(`[DELIVERIES] ✅ ${toProcess.length} familles à traiter`);

    if (toProcess.length === 0) {
      result.success = true;
      return result;
    }

    // 3. Traiter par batches de 20
    const BATCH_SIZE = 20;
    let currentId = getNextIdNumber(CONFIG.SHEETS.LIVRAISON, 'L', CONFIG.COLUMNS.LIVRAISON.ID_LIVRAISON);

    for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
      const batch = toProcess.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const total = Math.ceil(toProcess.length / BATCH_SIZE);

      Logger.log(`[DELIVERIES] 📦 Batch ${batchNum}/${total} (${batch.length} familles)`);

      const deliveries = processBatch(batch, filters, currentId);

      if (deliveries.length > 0) {
        result.created += deliveries.length;
        result.deliveries.push(...deliveries);
        currentId += deliveries.length;
      }

      Logger.log(`[DELIVERIES] ✅ Batch ${batchNum}: ${deliveries.length} créées`);
    }

    // 4. Trier TOUTES les livraisons par distance (plus loin en premier)
    if (result.deliveries.length > 0) {
      Logger.log(`[DELIVERIES] 🔄 Tri de ${result.deliveries.length} livraisons...`);
      result.deliveries.sort((a, b) => {
        const distDiff = (b._distance || 0) - (a._distance || 0);
        if (distDiff !== 0) return distDiff;
        return a.priorite - b.priorite; // Si même distance, priorité
      });

      // 5. Sauvegarder APRÈS le tri
      saveDeliveriesToSheet(result.deliveries);
    }

    result.success = result.created > 0;
    Logger.log(`[DELIVERIES] 🎉 Terminé: ${result.created} créées, ${result.skipped} ignorées`);

    return result;

  } catch (error) {
    Logger.log(`[DELIVERIES] ❌ Erreur: ${error.message}`);
    result.errors.push(error.message);
    return result;
  }
}

/**
 * Traite un batch de familles
 */
function processBatch(families, filters, startId) {
  const deliveries = [];

  // 1. Géocoder toutes les adresses en batch
  const addresses = families.map(f => f.adresse);
  const geocoded = batchGeocode(addresses);

  // 2. Créer les livraisons
  families.forEach((family, index) => {
    try {
      const coords = geocoded[family.adresse];

      if (!coords || !coords.latitude || !coords.longitude) {
        Logger.log(`[DELIVERIES] ⚠️ Famille ${family.id}: géocodage échoué`);
        return;
      }

      const delivery = createDelivery(family, coords, filters, startId + index);
      deliveries.push(delivery);

    } catch (error) {
      Logger.log(`[DELIVERIES] ❌ Famille ${family.id}: ${error.message}`);
    }
  });

  return deliveries;
}

/**
 * Crée une livraison
 */
function createDelivery(family, coords, filters, idNumber) {
  // Valider
  const validation = validateFamilyData(family);
  if (validation.hasErrors()) {
    throw new Error(validation.getErrorMessages().join(', '));
  }

  // Calculer distance
  const distance = calculateDistance(
    CONFIG.HQ.LAT,
    CONFIG.HQ.LNG,
    coords.latitude,
    coords.longitude
  );

  // Créer
  const delivery = {
    id_livraison: `L${String(idNumber).padStart(3, '0')}`,
    id_famille: family.id,
    id_quartier: family.idQuartier, // ← Déjà dans family!
    adresse: family.adresse,
    latitude: coords.latitude,
    longitude: coords.longitude,
    disponibilite_debut: filters.date_livraison ? new Date(filters.date_livraison + ' 09:00:00') : null,
    disponibilite_fin: filters.date_livraison ? new Date(filters.date_livraison + ' 18:00:00') : null,
    nombre_personnes: (parseInt(family.nombreAdulte) || 0) + (parseInt(family.nombreEnfant) || 0),
    statut: CONFIG.ENUMS.STATUT_LIVRAISON.NON_ASSIGNEE,
    priorite: parseInt(family.criticite) || 5,
    type_aide: filters.types_aide?.[0] || CONFIG.ENUMS.TYPE_AIDE.SADAQA,
    besoins_speciaux: family.besoins_speciaux || '',
    date_creation: getCurrentDateTime(),
    date_modification: getCurrentDateTime(),
    _distance: distance.distance || 0
  };

  // Valider
  const deliveryValidation = validateLivraison(delivery);
  if (deliveryValidation.hasErrors()) {
    throw new Error(deliveryValidation.getErrorMessages().join(', '));
  }

  return delivery;
}

/**
 * Récupère les familles éligibles
 */
function fetchEligibleFamilies(filters) {
  const apiFilters = {
    includeHierarchy: false // Pas besoin de hiérarchie complète
  };

  // Type d'aide
  if (filters.types_aide?.length > 0) {
    if (filters.types_aide.includes('zakat')) apiFilters.zakatElFitr = true;
    if (filters.types_aide.includes('sadaqa')) apiFilters.sadaqa = true;
  }

  // PAS de orderBy, lat, lng - on trie nous-mêmes!

  const response = getAllValidatedFamilies(apiFilters);

  if (!response?.families) {
    throw new Error('Erreur récupération familles');
  }

  let families = response.families;

  // Filtrer par priorité
  if (filters.priorites?.length > 0) {
    families = families.filter(f => {
      const criticite = parseInt(f.criticite) || 5;
      return filters.priorites.includes(criticite);
    });
  }

  // Filtrer par quartiers
  if (filters.quartiers?.length > 0) {
    families = families.filter(f => filters.quartiers.includes(f.idQuartier));
  }

  return families;
}

/**
 * Vérifie si famille a livraison active
 */
function hasActiveLivraison(familyId) {
  const data = getAllData(CONFIG.SHEETS.LIVRAISON);
  const idCol = CONFIG.COLUMNS.LIVRAISON.ID_FAMILLE - 1;
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

/**
 * Obtient prochain ID
 */
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

/**
 * Sauvegarde livraisons
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
  Logger.log(`[DELIVERIES] 💾 ${rows.length} sauvegardées`);
}