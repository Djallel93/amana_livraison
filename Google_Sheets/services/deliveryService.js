/**
 * ====================================================================
 * DELIVERY_SERVICE.GS - Service de Gestion des Livraisons (CORE)
 * ====================================================================
 * Point d'entrée principal et orchestration
 * Fichier 1/3 - ~250 lignes
 */

/**
 * Génère des livraisons à partir des familles validées (VERSION OPTIMISÉE)
 * @param {Object} filters - Filtres de sélection
 * @returns {Object} Résultat de la génération
 */
function generateDeliveries(filters) {
  Logger.log('[DELIVERIES] 🚀 Démarrage génération des livraisons...');
  Logger.log(`[DELIVERIES] Filtres: ${JSON.stringify(filters)}`);

  const result = {
    success: false,
    created: 0,
    skipped: 0,
    errors: [],
    deliveries: []
  };

  try {
    // 1. Récupérer les familles depuis l'API
    const families = fetchEligibleFamilies(filters);
    Logger.log(`[DELIVERIES] 📊 ${families.length} familles récupérées depuis l'API`);

    if (families.length === 0) {
      result.errors.push('Aucune famille ne correspond aux critères sélectionnés');
      return result;
    }

    // 2. Limiter au nombre demandé
    const limit = filters.nombre || families.length;
    const selectedFamilies = families.slice(0, limit);
    Logger.log(`[DELIVERIES] 🎯 ${selectedFamilies.length} familles sélectionnées (limite: ${limit})`);

    // 3. Initialiser le compteur d'ID
    const startingId = getNextIdNumber(CONFIG.SHEETS.LIVRAISON, 'L', CONFIG.COLUMNS.LIVRAISON.ID_LIVRAISON);
    let currentIdNumber = startingId;
    Logger.log(`[DELIVERIES] 🔢 ID de départ: L${String(startingId).padStart(3, '0')}`);

    // 4. Traiter par batches de 20 familles
    const BATCH_SIZE = 20;
    const totalBatches = Math.ceil(selectedFamilies.length / BATCH_SIZE);

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const batchStart = batchIndex * BATCH_SIZE;
      const batchEnd = Math.min(batchStart + BATCH_SIZE, selectedFamilies.length);
      const batchFamilies = selectedFamilies.slice(batchStart, batchEnd);

      Logger.log(`[DELIVERIES] 📦 Batch ${batchIndex + 1}/${totalBatches} (${batchFamilies.length} familles)`);

      const batchResult = processBatch(batchFamilies, filters, currentIdNumber, result);

      // Mettre à jour le compteur d'ID
      currentIdNumber = batchResult.nextIdNumber;

      Logger.log(`[DELIVERIES] ✅ Batch ${batchIndex + 1} terminé: ${batchResult.created} créées, ${batchResult.skipped} ignorées`);
    }

    result.success = result.created > 0;

    Logger.log('[DELIVERIES] ========================================');
    Logger.log(`[DELIVERIES] ✅ Génération terminée`);
    Logger.log(`[DELIVERIES] Créées: ${result.created}`);
    Logger.log(`[DELIVERIES] Ignorées: ${result.skipped}`);
    Logger.log(`[DELIVERIES] Erreurs: ${result.errors.length}`);
    Logger.log('[DELIVERIES] ========================================');

    return result;

  } catch (error) {
    Logger.log(`[DELIVERIES] ❌ Erreur critique: ${error.message}`);
    result.errors.push(`Erreur critique: ${error.message}`);
    return result;
  }
}

/**
 * Traite un batch de familles
 * @param {Array} families - Batch de familles
 * @param {Object} filters - Filtres
 * @param {number} startingIdNumber - Numéro d'ID de départ
 * @param {Object} result - Objet résultat à mettre à jour
 * @returns {Object} {created, skipped, nextIdNumber}
 */
function processBatch(families, filters, startingIdNumber, result) {
  const batchResult = {
    created: 0,
    skipped: 0,
    nextIdNumber: startingIdNumber
  };

  const deliveriesToCreate = [];

  // Phase 1: Préparer les données (sans appels API lourds)
  for (let i = 0; i < families.length; i++) {
    const family = families[i];

    try {
      // Vérifier si la famille a déjà une livraison active (rapide)
      if (hasActiveLivraison(family.id)) {
        Logger.log(`[DELIVERIES] ⏭️ Famille ${family.id} a déjà une livraison active - ignorée`);
        batchResult.skipped++;
        continue;
      }

      deliveriesToCreate.push({
        family: family,
        idNumber: batchResult.nextIdNumber++
      });

    } catch (error) {
      Logger.log(`[DELIVERIES] ❌ Erreur préparation famille ${family.id}: ${error.message}`);
      result.errors.push(`Famille ${family.id}: ${error.message}`);
    }
  }

  // Phase 2: Traiter les livraisons en parallèle (géocodage, etc.)
  const processedDeliveries = processDeliveriesInParallel(deliveriesToCreate, filters);

  // Phase 3: Sauvegarder toutes les livraisons du batch en une fois
  if (processedDeliveries.length > 0) {
    saveDeliveriesToSheet(processedDeliveries);
    batchResult.created = processedDeliveries.length;
    result.created += processedDeliveries.length;
    result.deliveries.push(...processedDeliveries);
  }

  return batchResult;
}

/**
 * Traite plusieurs livraisons en parallèle
 * @param {Array} deliveriesToCreate - [{family, idNumber}]
 * @param {Object} filters - Filtres
 * @returns {Array} Livraisons créées
 */
function processDeliveriesInParallel(deliveriesToCreate, filters) {
  const deliveries = [];

  // Récupérer tous les détails de familles
  const familyIds = deliveriesToCreate.map(d => d.family.id);
  const familyDetailsMap = fetchFamilyDetailsBatch(familyIds);

  // Préparer toutes les adresses pour géocodage
  const addressesToGeocode = [];
  const deliveryIndexMap = new Map();

  deliveriesToCreate.forEach((item, index) => {
    const familyDetails = familyDetailsMap[item.family.id];
    if (familyDetails && familyDetails.adresse) {
      addressesToGeocode.push(familyDetails.adresse);
      deliveryIndexMap.set(familyDetails.adresse, index);
    }
  });

  // Géocoder toutes les adresses
  const geocodedAddresses = geocodeAddressesBatch(addressesToGeocode);

  // Créer les objets livraison
  for (let i = 0; i < deliveriesToCreate.length; i++) {
    const item = deliveriesToCreate[i];

    try {
      const delivery = createDeliveryObject(item, familyDetailsMap, geocodedAddresses, filters);
      if (delivery) {
        deliveries.push(delivery);
      }
    } catch (error) {
      Logger.log(`[DELIVERIES] ❌ Erreur famille ${item.family.id}: ${error.message}`);
    }
  }

  // Trier par distance avant de retourner
  sortDeliveriesByDistance(deliveries);

  return deliveries;
}

/**
 * Récupère les familles éligibles depuis l'API
 * @param {Object} filters - Filtres
 * @returns {Array<Object>} Liste des familles
 */
function fetchEligibleFamilies(filters) {
  const apiFilters = {
    includeHierarchy: true
  };

  // Filtrer par type d'aide
  if (filters.types_aide && filters.types_aide.length > 0) {
    if (filters.types_aide.includes('zakat')) {
      apiFilters.zakatElFitr = true;
    }
    if (filters.types_aide.includes('sadaqa')) {
      apiFilters.sadaqa = true;
    }
  }

  // Trier par distance depuis HQ
  apiFilters.orderBy = 'distance';
  apiFilters.lat = CONFIG.HQ.LAT;
  apiFilters.lng = CONFIG.HQ.LNG;

  const response = getAllValidatedFamilies(apiFilters);

  if (!response || !response.families) {
    throw new Error('Erreur lors de la récupération des familles depuis l\'API');
  }

  let families = response.families;

  // Filtrer par priorité (criticité)
  if (filters.priorites && filters.priorites.length > 0) {
    families = families.filter(f => {
      const criticite = parseInt(f.criticite) || 5;
      return filters.priorites.includes(criticite);
    });
  }

  // Filtrer par quartiers
  if (filters.quartiers && filters.quartiers.length > 0) {
    families = families.filter(f => {
      return filters.quartiers.includes(f.idQuartier);
    });
  }

  return families;
}

/**
 * Vérifie si une famille a déjà une livraison active (VERSION OPTIMISÉE)
 * @param {string} familyId - ID de la famille
 * @returns {boolean}
 */
function hasActiveLivraison(familyId) {
  const sheet = getSheet(CONFIG.SHEETS.LIVRAISON);
  const data = getAllData(CONFIG.SHEETS.LIVRAISON);

  const idFamilleColIndex = CONFIG.COLUMNS.LIVRAISON.ID_FAMILLE - 1;
  const statutColIndex = CONFIG.COLUMNS.LIVRAISON.STATUT - 1;

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (row[idFamilleColIndex] === familyId) {
      const statut = row[statutColIndex];
      const isActive = statut !== CONFIG.ENUMS.STATUT_LIVRAISON.LIVREE &&
        statut !== CONFIG.ENUMS.STATUT_LIVRAISON.ANNULEE;

      if (isActive) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Obtient le prochain numéro d'ID
 * @param {string} sheetName - Nom de la feuille
 * @param {string} prefix - Préfixe (ex: 'L')
 * @param {number} colIndex - Index de la colonne
 * @returns {number} Prochain numéro (pas le full ID)
 */
function getNextIdNumber(sheetName, prefix, colIndex) {
  const sheet = getSheet(sheetName);
  const data = getAllData(sheetName);

  if (data.length === 0) {
    return 1;
  }

  const numbers = data
    .map(row => row[colIndex - 1])
    .filter(id => id && typeof id === 'string' && id.startsWith(prefix))
    .map(id => parseInt(id.substring(prefix.length)))
    .filter(num => !isNaN(num));

  const maxNumber = numbers.length > 0 ? Math.max(...numbers) : 0;
  return maxNumber + 1;
}