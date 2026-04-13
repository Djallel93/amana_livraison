/**
 * ====================================================================
 * DELIVERY_SERVICE.GS - Service de Gestion des Livraisons
 * ====================================================================
 * Modifications :
 * - Ajout du flag `etudiant` détecté depuis les spécificités famille
 * - La colonne ETUDIANT est insérée en position 8 dans saveDeliveriesToSheet
 */

/**
 * Vérifie si les spécificités d'une famille contiennent une mention
 * d'étudiant (insensible à la casse, avec ou sans accent, singulier/pluriel).
 * Exemples détectés : "étudiant", "etudiante", "ETUDIANTS", "un étudiant en difficulté"
 *
 * @param {string} specificites - Champ spécificités de la famille
 * @returns {boolean}
 */
function estEtudiant(specificites) {
  if (!specificites || specificites.trim() === "") return false;
  // Couvre : etudiant(e)(s), étudiant(e)(s), ETUDIANT, Étudiante, etc.
  return /[eé]tudiant/i.test(specificites);
}

/**
 * Génère les livraisons à partir des filtres fournis par le formulaire.
 * @param {Object} filters - Filtres du formulaire
 * @returns {Object} Résultat de la génération
 */
function generateDeliveries(filters) {
  Logger.log("[LIVRAISONS] 🚀 Démarrage génération...");

  const result = {
    success: false,
    created: 0,
    skipped: 0,
    errors: [],
    deliveries: [],
  };

  try {
    const families = fetchEligibleFamilies(filters);
    Logger.log(`[LIVRAISONS] 📊 ${families.length} familles récupérées`);

    if (families.length === 0) {
      result.errors.push("Aucune famille ne correspond aux critères");
      return result;
    }

    const limit = filters.nombre || families.length;
    const selected = families.slice(0, limit);

    const toProcess = selected.filter((f) => {
      if (hasActiveLivraison(f.id)) {
        Logger.log(
          `[LIVRAISONS] ⏭️ Famille ${f.id} ignorée — livraison active existante`,
        );
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
    let currentId = getNextIdNumber(
      CONFIG.SHEETS.LIVRAISON,
      "L",
      CONFIG.COLUMNS.LIVRAISON.ID_LIVRAISON,
    );

    for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
      const batch = toProcess.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const total = Math.ceil(toProcess.length / BATCH_SIZE);

      Logger.log(
        `[LIVRAISONS] 📦 Batch ${batchNum}/${total} (${batch.length} familles)`,
      );

      const deliveries = processBatch(batch, filters, currentId);

      if (deliveries.length > 0) {
        result.created += deliveries.length;
        result.deliveries.push(...deliveries);
        currentId += deliveries.length;
      }

      Logger.log(
        `[LIVRAISONS] ✅ Batch ${batchNum}: ${deliveries.length} créées`,
      );
    }

    if (result.deliveries.length > 0) {
      Logger.log(
        `[LIVRAISONS] 🔄 Tri de ${result.deliveries.length} livraisons...`,
      );
      result.deliveries.sort((a, b) => {
        const distDiff = (b._distance || 0) - (a._distance || 0);
        if (distDiff !== 0) return distDiff;
        return a.priorite - b.priorite;
      });

      saveDeliveriesToSheet(result.deliveries);
    }

    result.success = result.created > 0;
    Logger.log(
      `[LIVRAISONS] 🎉 Terminé: ${result.created} créées, ${result.skipped} ignorées`,
    );

    return result;
  } catch (error) {
    Logger.log(`[LIVRAISONS] ❌ Erreur: ${error.message}`);
    result.errors.push(error.message);
    return result;
  }
}

/**
 * Traite un lot de familles : géocodage + création des livraisons.
 * @param {Array} families - Familles du lot
 * @param {Object} filters - Filtres du formulaire
 * @param {number} startId - Numéro de départ pour les IDs
 * @returns {Array} Livraisons créées
 */
function processBatch(families, filters, startId) {
  const deliveries = [];
  const addresses = families.map((f) => f.adresse);
  const geocoded = batchGeocode(addresses);

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

/**
 * Crée un objet livraison à partir des données d'une famille.
 * Détecte automatiquement le flag `etudiant` depuis les spécificités.
 *
 * @param {Object} family - Données famille API
 * @param {Object} coords - Coordonnées GPS {latitude, longitude}
 * @param {Object} filters - Filtres du formulaire
 * @param {number} idNumber - Numéro de l'ID
 * @returns {Object} Livraison
 */
function createDelivery(family, coords, filters, idNumber) {
  const validation = validateFamilyData(family);
  if (validation.hasErrors()) {
    throw new Error(validation.getErrorMessages().join(", "));
  }

  const distance = calculateDistance(
    CONFIG.HQ.LAT,
    CONFIG.HQ.LNG,
    coords.latitude,
    coords.longitude,
  );

  // Détection du statut étudiant depuis les spécificités famille
  const estEtudiantFlag = estEtudiant(family.specificites || "");
  if (estEtudiantFlag) {
    Logger.log(
      `[LIVRAISONS] 🎓 Famille ${family.id} identifiée comme étudiante`,
    );
  }

  const delivery = {
    id_livraison: `L${String(idNumber).padStart(3, "0")}`,
    id_famille: family.id,
    id_quartier: family.idQuartier,
    adresse: family.adresse,
    latitude: coords.latitude,
    longitude: coords.longitude,
    hotel: family.hotel === true || family.hotel === "true" || false,
    etudiant: estEtudiantFlag,
    disponibilite_debut: filters.date_livraison
      ? new Date(filters.date_livraison + " 09:00:00")
      : null,
    disponibilite_fin: filters.date_livraison
      ? new Date(filters.date_livraison + " 18:00:00")
      : null,
    nombre_personnes:
      (parseInt(family.nombreAdulte) || 0) +
      (parseInt(family.nombreEnfant) || 0),
    avec_enfant: (parseInt(family.nombreEnfant) || 0) > 0,
    statut_conditionnement: "En cours",
    statut: CONFIG.ENUMS.STATUT_LIVRAISON.NON_ASSIGNEE,
    priorite: parseInt(family.criticite) || 5,
    type_aide: filters.types_aide?.[0] || CONFIG.ENUMS.TYPE_AIDE.PONCTUELLE,
    besoins_speciaux: family.specificites || "",
    date_creation: getCurrentDateTime(),
    date_modification: getCurrentDateTime(),
    _distance: distance.distance || 0,
  };

  const deliveryValidation = validateLivraison(delivery);
  if (deliveryValidation.hasErrors()) {
    throw new Error(deliveryValidation.getErrorMessages().join(", "));
  }

  return delivery;
}

/**
 * Récupère les familles éligibles depuis l'API selon les filtres.
 * @param {Object} filters - Filtres
 * @returns {Array} Familles
 */
function fetchEligibleFamilies(filters) {
  const apiFilters = { includeHierarchy: false };

  if (filters.types_aide?.length > 0) {
    if (filters.types_aide.includes(CONFIG.ENUMS.TYPE_AIDE.ZAKAT_EL_FITR))
      apiFilters.zakatElFitr = true;
    if (filters.types_aide.includes(CONFIG.ENUMS.TYPE_AIDE.RECOLTE))
      apiFilters.sadaqa = true;
    if (filters.types_aide.includes(CONFIG.ENUMS.TYPE_AIDE.PONCTUELLE))
      apiFilters.sadaqa = true;
  }

  const response = getAllValidatedFamilies(apiFilters);

  if (!response?.families) {
    throw new Error("Erreur récupération familles");
  }

  let families = response.families;

  if (filters.priorites?.length > 0) {
    families = families.filter((f) => {
      const criticite = parseInt(f.criticite) || 5;
      return filters.priorites.includes(criticite);
    });
  }

  if (filters.quartiers?.length > 0) {
    families = families.filter((f) => filters.quartiers.includes(f.idQuartier));
  }

  return families;
}

/**
 * Vérifie si une famille a déjà une livraison active (non livrée/annulée).
 * @param {string} familyId - ID famille
 * @returns {boolean}
 */
function hasActiveLivraison(familyId) {
  const data = getAllData(CONFIG.SHEETS.LIVRAISON);
  const idCol = CONFIG.COLUMNS.LIVRAISON.ID_FAMILLE - 1;
  const statCol = CONFIG.COLUMNS.LIVRAISON.STATUT - 1;

  for (const row of data) {
    if (row[idCol] === familyId) {
      const statut = row[statCol];
      if (
        statut !== CONFIG.ENUMS.STATUT_LIVRAISON.LIVREE &&
        statut !== CONFIG.ENUMS.STATUT_LIVRAISON.ANNULEE
      ) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Retourne le prochain numéro d'ID disponible pour une feuille et un préfixe.
 * @param {string} sheetName
 * @param {string} prefix
 * @param {number} colIndex
 * @returns {number}
 */
function getNextIdNumber(sheetName, prefix, colIndex) {
  const data = getAllData(sheetName);
  if (data.length === 0) return 1;

  const numbers = data
    .map((row) => row[colIndex - 1])
    .filter((id) => id && typeof id === "string" && id.startsWith(prefix))
    .map((id) => parseInt(id.substring(prefix.length)))
    .filter((num) => !isNaN(num));

  return numbers.length > 0 ? Math.max(...numbers) + 1 : 1;
}

/**
 * Sauvegarde les livraisons dans la feuille Google Sheets.
 * L'ordre des colonnes doit correspondre exactement à CONFIG_SHEETS.COLUMNS.LIVRAISON.
 *
 * @param {Array} deliveries - Livraisons à sauvegarder
 */
function saveDeliveriesToSheet(deliveries) {
  if (deliveries.length === 0) return;

  const rows = deliveries.map((d) => [
    d.id_livraison, // 1  ID_LIVRAISON
    d.id_famille, // 2  ID_FAMILLE
    d.id_quartier, // 3  ID_QUARTIER
    d.adresse, // 4  ADRESSE
    d.latitude, // 5  LATITUDE
    d.longitude, // 6  LONGITUDE
    d.hotel === true, // 7  HOTEL
    d.etudiant === true, // 8  ETUDIANT ← nouvelle colonne
    d.disponibilite_debut, // 9  DISPONIBILITE_DEBUT
    d.disponibilite_fin, // 10 DISPONIBILITE_FIN
    d.nombre_personnes, // 11 NOMBRE_PERSONNES
    d.avec_enfant === true, // 12 AVEC_ENFANT
    d.statut_conditionnement || "", // 13 STATUT_CONDITIONNEMENT
    d.statut, // 14 STATUT
    d.priorite, // 15 PRIORITE
    d.type_aide, // 16 TYPE_AIDE
    d.besoins_speciaux, // 17 BESOINS_SPECIAUX
    d.date_creation, // 18 DATE_CREATION
    d.date_modification, // 19 DATE_MODIFICATION
  ]);

  appendRows(CONFIG.SHEETS.LIVRAISON, rows);
  Logger.log(`[LIVRAISONS] 💾 ${rows.length} livraisons sauvegardées`);
}
