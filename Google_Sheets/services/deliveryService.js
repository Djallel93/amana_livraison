/**
 * ====================================================================
 * DELIVERY_SERVICE.GS - Service de Gestion des Livraisons
 * ====================================================================
 */

/**
 * Génère des livraisons à partir des familles validées
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

    // 3. Traiter chaque famille
    for (let i = 0; i < selectedFamilies.length; i++) {
      const family = selectedFamilies[i];
      Logger.log(`[DELIVERIES] 📦 Traitement famille ${i + 1}/${selectedFamilies.length}: ${family.id}`);

      try {
        // Vérifier si la famille a déjà une livraison active
        if (hasActiveLivraison(family.id)) {
          Logger.log(`[DELIVERIES] ⚠️ Famille ${family.id} a déjà une livraison active - ignorée`);
          result.skipped++;
          continue;
        }

        // Créer la livraison
        const delivery = createDeliveryFromFamily(family, filters);

        if (delivery) {
          result.deliveries.push(delivery);
          result.created++;
          Logger.log(`[DELIVERIES] ✅ Livraison ${delivery.id_livraison} créée pour famille ${family.id}`);
        }

      } catch (error) {
        Logger.log(`[DELIVERIES] ❌ Erreur famille ${family.id}: ${error.message}`);
        result.errors.push(`Famille ${family.id}: ${error.message}`);
      }
    }

    // 4. Trier les livraisons par distance (plus loin en premier)
    if (result.deliveries.length > 0) {
      sortDeliveriesByDistance(result.deliveries);
      saveDeliveriesToSheet(result.deliveries);
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
    // Convertir les types en filtres API
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
 * Vérifie si une famille a déjà une livraison active
 * @param {string} familyId - ID de la famille
 * @returns {boolean}
 */
function hasActiveLivraison(familyId) {
  const activeLivraisons = filterData(CONFIG.SHEETS.LIVRAISON, function (row) {
    const statut = row.statut;
    const isActive = statut !== CONFIG.ENUMS.STATUT_LIVRAISON.LIVREE &&
      statut !== CONFIG.ENUMS.STATUT_LIVRAISON.ANNULEE;
    return row.id_famille === familyId && isActive;
  });

  return activeLivraisons.length > 0;
}

/**
 * Crée une livraison à partir d'une famille
 * @param {Object} family - Données famille depuis API
 * @param {Object} filters - Filtres de génération
 * @returns {Object|null} Objet livraison
 */
function createDeliveryFromFamily(family, filters) {
  // 1. Récupérer les détails complets de la famille
  const familyDetails = getFamilyById(family.id);

  if (!familyDetails) {
    throw new Error(`Impossible de récupérer les détails de la famille ${family.id}`);
  }

  // 2. Valider les données de la famille
  const validation = validateFamilyData(familyDetails);
  if (validation.hasErrors()) {
    throw new Error(`Données famille invalides: ${validation.getErrorMessages().join(', ')}`);
  }

  // 3. Géocoder l'adresse si nécessaire
  let coords = {
    latitude: familyDetails.latitude,
    longitude: familyDetails.longitude
  };

  if (!coords.latitude || !coords.longitude) {
    Logger.log(`[DELIVERIES] 🗺️ Géocodage de l'adresse: ${familyDetails.adresse}`);
    coords = geocodeFamilyAddress(familyDetails);
  }

  // 4. Résoudre la hiérarchie géographique
  const location = resolveLocation(coords.latitude, coords.longitude);

  if (!location || !location.quartier) {
    throw new Error('Impossible de résoudre la localisation géographique');
  }

  // 5. Calculer la distance depuis le HQ
  const distanceResult = calculateDistance(
    CONFIG.HQ.LAT,
    CONFIG.HQ.LNG,
    coords.latitude,
    coords.longitude
  );

  const distanceKm = distanceResult.distance || 0;

  // 6. Calculer nombre de personnes
  const adultes = parseInt(familyDetails.adultes) || 0;
  const enfants = parseInt(familyDetails.enfants) || 0;
  const nombrePersonnes = adultes + enfants;

  // 7. Déterminer le type d'aide
  let typeAide = filters.types_aide && filters.types_aide.length > 0
    ? filters.types_aide[0]
    : CONFIG.ENUMS.TYPE_AIDE.SADAQA;

  // 8. Générer l'ID de livraison
  const idLivraison = generateNextId(
    CONFIG.SHEETS.LIVRAISON,
    'L',
    CONFIG.COLUMNS.LIVRAISON.ID_LIVRAISON
  );

  // 9. Créer l'objet livraison
  const delivery = {
    id_livraison: idLivraison,
    id_famille: family.id,
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
    _distance_from_hq: distanceKm // Temporaire pour le tri
  };

  // 10. Valider la livraison
  const deliveryValidation = validateLivraison(delivery);
  if (deliveryValidation.hasErrors()) {
    throw new Error(`Livraison invalide: ${deliveryValidation.getErrorMessages().join(', ')}`);
  }

  return delivery;
}

/**
 * Géocode l'adresse d'une famille
 * @param {Object} family - Données famille
 * @returns {Object} {latitude, longitude}
 */
function geocodeFamilyAddress(family) {
  try {
    const geocodeResult = geocodeAddress(
      family.adresse,
      family.ville,
      family.codePostal
    );

    if (!geocodeResult || !geocodeResult.latitude || !geocodeResult.longitude) {
      throw new Error('Géocodage échoué - coordonnées manquantes');
    }

    return {
      latitude: geocodeResult.latitude,
      longitude: geocodeResult.longitude
    };

  } catch (error) {
    Logger.log(`[DELIVERIES] ⚠️ Erreur géocodage: ${error.message}`);
    throw new Error(`Impossible de géocoder l'adresse: ${error.message}`);
  }
}

/**
 * Trie les livraisons par distance (plus loin en premier, puis par priorité)
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

  Logger.log('[DELIVERIES] 📊 Livraisons triées par distance (plus éloignées en premier)');
}

/**
 * Sauvegarde les livraisons dans Google Sheets
 * @param {Array<Object>} deliveries - Livraisons à sauvegarder
 */
function saveDeliveriesToSheet(deliveries) {
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
  // Valider le nouveau statut
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
 * Récupère toutes les livraisons avec un statut donné
 * @param {string} status - Statut recherché
 * @returns {Array<Object>}
 */
function getDeliveriesByStatus(status) {
  return filterData(CONFIG.SHEETS.LIVRAISON, function (row) {
    return row.statut === status;
  });
}

/**
 * Récupère une livraison par ID
 * @param {string} deliveryId - ID de la livraison
 * @returns {Object|null}
 */
function getDeliveryById(deliveryId) {
  return getRowById(
    CONFIG.SHEETS.LIVRAISON,
    deliveryId,
    CONFIG.COLUMNS.LIVRAISON.ID_LIVRAISON
  );
}

/**
 * Récupère les livraisons d'une route
 * @param {string} routeId - ID de la route
 * @returns {Array<Object>}
 */
function getDeliveriesForRoute(routeId) {
  // Récupérer les étapes de la route
  const etapes = filterData(CONFIG.SHEETS.ETAPES_ROUTE, function (row) {
    return row.id_route === routeId;
  });

  // Récupérer les livraisons correspondantes
  const deliveries = [];
  for (const etape of etapes) {
    const delivery = getDeliveryById(etape.id_livraison);
    if (delivery) {
      delivery._ordre_passage = etape.ordre_passage;
      deliveries.push(delivery);
    }
  }

  // Trier par ordre de passage
  deliveries.sort((a, b) => a._ordre_passage - b._ordre_passage);

  return deliveries;
}

/**
 * Compte le nombre de livraisons par statut
 * @returns {Object} {Non Assignée: X, Assignée: Y, ...}
 */
function countDeliveriesByStatus() {
  const counts = {};

  // Initialiser tous les statuts à 0
  Object.values(CONFIG.ENUMS.STATUT_LIVRAISON).forEach(status => {
    counts[status] = 0;
  });

  // Compter
  const allDeliveries = getAllDataAsObjects(CONFIG.SHEETS.LIVRAISON);
  allDeliveries.forEach(delivery => {
    const status = delivery.statut;
    if (counts[status] !== undefined) {
      counts[status]++;
    }
  });

  return counts;
}

/**
 * Annule une livraison (change le statut en Annulée)
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

  // Vérifier qu'elle n'est pas déjà livrée
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

/**
 * Obtient les statistiques des livraisons
 * @returns {Object} Statistiques complètes
 */
function getDeliveryStatistics() {
  const allDeliveries = getAllDataAsObjects(CONFIG.SHEETS.LIVRAISON);

  const stats = {
    total: allDeliveries.length,
    byStatus: countDeliveriesByStatus(),
    byPriority: {},
    byTypeAide: {},
    totalPersonnes: 0,
    averageDistance: 0
  };

  // Statistiques détaillées
  let totalDistance = 0;
  let countWithDistance = 0;

  allDeliveries.forEach(delivery => {
    // Par priorité
    const priority = delivery.priorite || 5;
    stats.byPriority[priority] = (stats.byPriority[priority] || 0) + 1;

    // Par type d'aide
    const type = delivery.type_aide || 'inconnu';
    stats.byTypeAide[type] = (stats.byTypeAide[type] || 0) + 1;

    // Total personnes
    stats.totalPersonnes += parseInt(delivery.nombre_personnes) || 0;

    // Distance moyenne (si calculable)
    if (delivery.latitude && delivery.longitude) {
      try {
        const distResult = calculateDistance(
          CONFIG.HQ.LAT,
          CONFIG.HQ.LNG,
          delivery.latitude,
          delivery.longitude
        );
        if (distResult && distResult.distance) {
          totalDistance += distResult.distance;
          countWithDistance++;
        }
      } catch (e) {
        // Ignorer les erreurs de calcul de distance
      }
    }
  });

  if (countWithDistance > 0) {
    stats.averageDistance = Math.round(totalDistance / countWithDistance * 100) / 100;
  }

  return stats;
}

/**
 * Récupère les livraisons pour une date donnée
 * @param {Date} date - Date de livraison
 * @returns {Array<Object>}
 */
function getDeliveriesForDate(date) {
  const startOfDayDate = startOfDay(date);
  const endOfDayDate = endOfDay(date);

  return filterData(CONFIG.SHEETS.LIVRAISON, function (row) {
    if (!row.disponibilite_debut) return false;

    const debutDate = parseDate(row.disponibilite_debut);
    if (!debutDate) return false;

    return debutDate >= startOfDayDate && debutDate <= endOfDayDate;
  });
}

/**
 * Exporte les livraisons en CSV
 * @param {Array<string>} deliveryIds - IDs des livraisons (optionnel, toutes si vide)
 * @returns {string} Contenu CSV
 */
function exportDeliveriesToCsv(deliveryIds = null) {
  let deliveries;

  if (deliveryIds && deliveryIds.length > 0) {
    deliveries = deliveryIds.map(id => getDeliveryById(id)).filter(d => d !== null);
  } else {
    deliveries = getAllDataAsObjects(CONFIG.SHEETS.LIVRAISON);
  }

  // En-têtes CSV
  const headers = [
    'ID Livraison', 'ID Famille', 'Quartier', 'Adresse',
    'Latitude', 'Longitude', 'Disponibilité Début', 'Disponibilité Fin',
    'Nombre Personnes', 'Statut', 'Priorité', 'Type Aide',
    'Besoins Spéciaux', 'Date Création'
  ];

  let csv = headers.join(',') + '\n';

  deliveries.forEach(d => {
    const row = [
      d.id_livraison,
      d.id_famille,
      d.id_quartier,
      `"${d.adresse}"`,
      d.latitude,
      d.longitude,
      d.disponibilite_debut,
      d.disponibilite_fin,
      d.nombre_personnes,
      d.statut,
      d.priorite,
      d.type_aide,
      `"${d.besoins_speciaux || ''}"`,
      d.date_creation
    ];
    csv += row.join(',') + '\n';
  });

  return csv;
}
