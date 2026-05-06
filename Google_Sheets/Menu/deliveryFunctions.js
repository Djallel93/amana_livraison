function showGenerateDeliveriesForm() {
  if (!isApiConfigured()) {
    SpreadsheetApp.getUi().alert(
      "Configuration Manquante",
      CONFIG.MESSAGES.ERROR_API_KEY_MISSING,
      SpreadsheetApp.getUi().ButtonSet.OK,
    );
    return;
  }

  const html = HtmlService.createTemplateFromFile("ui/deliveryForm")
    .evaluate()
    .setWidth(1200)
    .setHeight(800)
    .setTitle("📦 Générer des Livraisons");

  SpreadsheetApp.getUi().showModalDialog(html, "Générer des Livraisons");
}

function showManualDeliveryForm() {
  if (!isApiConfigured()) {
    SpreadsheetApp.getUi().alert(
      "Configuration Manquante",
      CONFIG.MESSAGES.ERROR_API_KEY_MISSING,
      SpreadsheetApp.getUi().ButtonSet.OK,
    );
    return;
  }

  const html = HtmlService.createTemplateFromFile("ui/manualDeliveryForm")
    .evaluate()
    .setWidth(1200)
    .setHeight(800)
    .setTitle("➕ Générer Livraisons - Manuellement");

  SpreadsheetApp.getUi().showModalDialog(html, "Générer Livraisons - Manuellement");
}

function viewAllDeliveries() {
  const ui = SpreadsheetApp.getUi();

  try {
    const stats = getDeliveryStatistics();

    let message = `📊 STATISTIQUES DES LIVRAISONS\n\n`;
    message += `Total : ${stats.total} livraisons\n\n`;
    message += `Par Statut :\n`;

    Object.entries(stats.byStatus).forEach(([status, count]) => {
      if (count > 0) message += `  • ${status} : ${count}\n`;
    });

    message += `\nTotal Personnes : ${stats.totalPersonnes}\n`;

    if (stats.averageDistance > 0) {
      message += `Distance Moyenne : ${stats.averageDistance} km\n`;
    }

    ui.alert("Statistiques des Livraisons", message, ui.ButtonSet.OK);

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEETS.LIVRAISON);
    if (sheet) ss.setActiveSheet(sheet);
  } catch (error) {
    ui.alert("Erreur", error.message, ui.ButtonSet.OK);
  }
}

function searchDelivery() {
  const ui = SpreadsheetApp.getUi();

  const response = ui.prompt(
    "Rechercher une Livraison",
    "Entrez l'ID de la livraison (ex: L001) ou l'ID de la famille :",
    ui.ButtonSet.OK_CANCEL,
  );

  if (response.getSelectedButton() !== ui.Button.OK) return;

  const searchTerm = response.getResponseText().trim();

  if (!searchTerm) {
    ui.alert("Erreur", "Veuillez entrer un ID de recherche", ui.ButtonSet.OK);
    return;
  }

  try {
    let delivery = getDeliveryById(searchTerm);

    if (!delivery) {
      const deliveries = filterData(CONFIG.SHEETS.LIVRAISON, function (row) {
        return row.id_famille === searchTerm;
      });
      if (deliveries.length > 0) delivery = deliveries[0];
    }

    if (!delivery) {
      ui.alert(
        "Introuvable",
        `Aucune livraison trouvée pour "${searchTerm}"`,
        ui.ButtonSet.OK,
      );
      return;
    }

    let message = `📦 DÉTAILS DE LA LIVRAISON\n\n`;
    message += `ID Livraison : ${delivery.id_livraison}\n`;
    message += `Famille : ${delivery.id_famille}\n`;
    message += `Quartier : ${delivery.id_quartier}\n`;
    message += `Adresse : ${delivery.adresse}\n`;
    message += `Personnes : ${delivery.nombre_personnes}\n`;
    message += `Avec enfant : ${delivery.avec_enfant ? "Oui" : "Non"}\n`;
    message += `Statut : ${delivery.statut}\n`;
    message += `Conditionnement : ${delivery.statut_conditionnement || "En attente"}\n`;
    message += `Priorité : ${delivery.priorite}\n`;
    message += `Type : ${delivery.type_aide}\n`;

    if (delivery.besoins_speciaux) {
      message += `\nBesoins spéciaux :\n${delivery.besoins_speciaux}\n`;
    }

    ui.alert("Détails de la Livraison", message, ui.ButtonSet.OK);

    const sheet = getSheet(CONFIG.SHEETS.LIVRAISON);
    const rowIndex = delivery._rowIndex;
    if (rowIndex) {
      sheet.setActiveRange(sheet.getRange(rowIndex, 1, 1, sheet.getLastColumn()));
      SpreadsheetApp.getActiveSpreadsheet().setActiveSheet(sheet);
    }
  } catch (error) {
    ui.alert("Erreur", error.message, ui.ButtonSet.OK);
  }
}

function updateDeliveryStatuses() {
  const ui = SpreadsheetApp.getUi();

  const response = ui.alert(
    "Mettre à Jour les Statuts",
    "Cette fonction permet de synchroniser les statuts des livraisons.\n\nContinuer ?",
    ui.ButtonSet.YES_NO,
  );

  if (response !== ui.Button.YES) return;

  try {
    const stats = countDeliveriesByStatus();

    let message = "Statuts actuels :\n\n";
    Object.entries(stats).forEach(([status, count]) => {
      message += `${status} : ${count}\n`;
    });

    message += "\nLes statuts sont mis à jour automatiquement lors de la gestion des routes.";
    ui.alert("Statuts des Livraisons", message, ui.ButtonSet.OK);
  } catch (error) {
    ui.alert("Erreur", error.message, ui.ButtonSet.OK);
  }
}

function showPackagingForm() {
  const html = HtmlService.createTemplateFromFile("ui/packagingForm")
    .evaluate()
    .setWidth(1200)
    .setHeight(800)
    .setTitle("📦 Feuille de Préparation");

  SpreadsheetApp.getUi().showModalDialog(html, "Feuille de Préparation");
}

function generatePackagingSheetFromForm(params) {
  try {
    Logger.log(`[MENU] 📦 Génération feuille conditionnement: ${JSON.stringify(params)}`);
    return generatePackagingSheet(params);
  } catch (error) {
    Logger.log(`[MENU] ❌ Erreur: ${error.message}`);
    throw error;
  }
}

function getQuartiersForDeliveryForm() {
  try {
    const response = getAllQuartiers();
    if (!response || !response.quartiers) return [];
    return response.quartiers.map((q) => ({ id: q.id, nom: q.nom }));
  } catch (error) {
    Logger.log(`[FORM] ❌ Erreur récupération quartiers: ${error.message}`);
    return [];
  }
}

function generateDeliveriesFromForm(filters) {
  try {
    Logger.log("[FORM] 📝 Génération depuis formulaire...");
    Logger.log(`[FORM] Filtres: ${JSON.stringify(filters)}`);

    const result = generateDeliveries(filters);
    const { deliveries, ...lightResult } = result;

    Logger.log(
      `[FORM] ✅ Génération terminée: ${lightResult.created} créées, ${lightResult.skipped} ignorées`,
    );

    return lightResult;
  } catch (error) {
    Logger.log(`[FORM] ❌ Erreur: ${error.message}`);
    throw error;
  }
}

// ============================================================
// GÉNÉRATION MANUELLE — FONCTIONS SERVEUR
// ============================================================

/**
 * Charge toutes les familles validées pour le formulaire manuel.
 * @returns {Array<Object>}
 */
function getAllFamiliesForManualForm() {
  try {
    Logger.log("[FORM MANUEL] 🔄 Chargement de toutes les familles...");

    const response = getAllValidatedFamilies({ includeHierarchy: false });

    if (!response || !response.families) {
      Logger.log("[FORM MANUEL] ⚠️ Aucune famille retournée par l'API");
      return [];
    }

    const families = response.families.map((f) => ({
      id: f.id,
      nom: f.nom || "",
      prenom: f.prenom || "",
      adresse: f.adresse || "",
      idQuartier: f.idQuartier || "",
      criticite: parseInt(f.criticite) || 5,
      nombreAdulte: parseInt(f.nombreAdulte) || 0,
      nombreEnfant: parseInt(f.nombreEnfant) || 0,
      hotel: f.hotel === true || f.hotel === "true" || false,
      specificites: f.specificites || "",
    }));

    Logger.log(`[FORM MANUEL] ✅ ${families.length} familles chargées`);
    return families;
  } catch (error) {
    Logger.log(`[FORM MANUEL] ❌ Erreur chargement familles: ${error.message}`);
    throw error;
  }
}

/**
 * Valide une liste d'IDs de familles saisie manuellement.
 * Charge toutes les familles une seule fois puis filtre localement.
 * @param {string[]} ids
 * @returns {{ valides: Array, introuvables: string[], doublons: string[] }}
 */
function validateFamilyIds(ids) {
  try {
    Logger.log(`[FORM MANUEL] 🔍 Validation de ${ids.length} ID(s)...`);

    const response = getAllValidatedFamilies({ includeHierarchy: false });

    if (!response || !response.families) {
      throw new Error("Impossible de récupérer les familles depuis l'API");
    }

    const familyMap = {};
    response.families.forEach((f) => {
      familyMap[String(f.id)] = f;
    });

    const seen = new Set();
    const valides = [];
    const introuvables = [];
    const doublons = [];

    ids.forEach((id) => {
      const idStr = String(id).trim();
      if (!idStr) return;

      if (seen.has(idStr)) {
        doublons.push(idStr);
        return;
      }
      seen.add(idStr);

      const famille = familyMap[idStr];
      if (famille) {
        valides.push({
          id: idStr,
          nom: famille.nom || "",
          prenom: famille.prenom || "",
          adresse: famille.adresse || "",
          idQuartier: famille.idQuartier || "",
          criticite: parseInt(famille.criticite) || 5,
          nombreAdulte: parseInt(famille.nombreAdulte) || 0,
          nombreEnfant: parseInt(famille.nombreEnfant) || 0,
          hotel: famille.hotel === true || famille.hotel === "true" || false,
          specificites: famille.specificites || "",
        });
      } else {
        introuvables.push(idStr);
      }
    });

    Logger.log(
      `[FORM MANUEL] ✅ ${valides.length} valides, ${introuvables.length} introuvables, ${doublons.length} doublons`,
    );

    return { valides, introuvables, doublons };
  } catch (error) {
    Logger.log(`[FORM MANUEL] ❌ Erreur validation IDs: ${error.message}`);
    throw error;
  }
}

/**
 * Vérifie quels IDs de familles ont déjà une livraison active.
 * Retourne uniquement les IDs concernés.
 * @param {string[]} ids
 * @returns {string[]}
 */
function checkActiveLivraisonsForFamilies(ids) {
  try {
    Logger.log(`[FORM MANUEL] 🔍 Vérification livraisons actives pour ${ids.length} famille(s)...`);
    const actives = ids.filter((id) => hasActiveLivraison(id));
    Logger.log(`[FORM MANUEL] ✅ ${actives.length} famille(s) avec livraison active`);
    return actives;
  } catch (error) {
    Logger.log(`[FORM MANUEL] ❌ Erreur vérification livraisons actives: ${error.message}`);
    throw error;
  }
}

/**
 * Génère les livraisons depuis le formulaire manuel.
 * Chaque famille peut être forcée individuellement via la propriété _force.
 * @param {Object} params - { families, date_livraison, types_aide, occasion }
 * @returns {Object} { success, created, skipped, forced, errors }
 */
function generateManualDeliveriesFromForm(params) {
  try {
    Logger.log("[FORM MANUEL] 🚀 Génération manuelle...");
    Logger.log(
      `[FORM MANUEL] ${params.families.length} famille(s), date: ${params.date_livraison}`,
    );

    const result = {
      success: false,
      created: 0,
      skipped: 0,
      forced: 0,
      errors: [],
    };

    if (!params.families || params.families.length === 0) {
      result.errors.push("Aucune famille sélectionnée");
      return result;
    }

    const addresses = params.families.map((f) => f.adresse);
    const geocoded = batchGeocode(addresses);

    let currentId = getNextIdNumber(
      CONFIG.SHEETS.LIVRAISON,
      "L",
      CONFIG.COLUMNS.LIVRAISON.ID_LIVRAISON,
    );

    const deliveriesToSave = [];

    params.families.forEach((family) => {
      try {
        const livraisonActive = hasActiveLivraison(family.id);

        if (livraisonActive && !family._force) {
          Logger.log(`[FORM MANUEL] ⏭️ Famille ${family.id} ignorée — livraison active`);
          result.skipped++;
          return;
        }

        if (livraisonActive && family._force) {
          Logger.log(`[FORM MANUEL] ⚡ Famille ${family.id} forcée malgré livraison active`);
          result.forced++;
        }

        const coords = geocoded[family.adresse];

        if (!coords || !coords.latitude || !coords.longitude) {
          Logger.log(`[FORM MANUEL] ⚠️ Géocodage échoué pour famille ${family.id}`);
          result.errors.push(`Famille ${family.id} : géocodage échoué`);
          return;
        }

        const distance = calculateDistance(
          CONFIG.HQ.LAT,
          CONFIG.HQ.LNG,
          coords.latitude,
          coords.longitude,
        );

        const estEtudiantFlag = estEtudiant(family.specificites || "");

        const delivery = {
          id_livraison: `L${String(currentId).padStart(3, "0")}`,
          id_famille: family.id,
          id_quartier: family.idQuartier,
          adresse: family.adresse,
          latitude: coords.latitude,
          longitude: coords.longitude,
          hotel: family.hotel === true || family.hotel === "true" || false,
          etudiant: estEtudiantFlag,
          disponibilite_debut: params.date_livraison
            ? new Date(params.date_livraison + " 09:00:00")
            : null,
          disponibilite_fin: params.date_livraison
            ? new Date(params.date_livraison + " 18:00:00")
            : null,
          nombre_personnes:
            (parseInt(family.nombreAdulte) || 0) +
            (parseInt(family.nombreEnfant) || 0),
          avec_enfant: (parseInt(family.nombreEnfant) || 0) > 0,
          statut_conditionnement: "En cours",
          statut: CONFIG.ENUMS.STATUT_LIVRAISON.NON_ASSIGNEE,
          priorite: parseInt(family.criticite) || 5,
          type_aide: params.types_aide?.[0] || CONFIG.ENUMS.TYPE_AIDE.PONCTUELLE,
          besoins_speciaux: family.specificites || "",
          date_creation: getCurrentDateTime(),
          date_modification: getCurrentDateTime(),
          _distance: distance.distance || 0,
        };

        const validation = validateLivraison(delivery);
        if (validation.hasErrors()) {
          result.errors.push(
            `Famille ${family.id} : ${validation.getErrorMessages().join(", ")}`,
          );
          return;
        }

        deliveriesToSave.push(delivery);
        currentId++;
        result.created++;
      } catch (err) {
        Logger.log(`[FORM MANUEL] ❌ Famille ${family.id}: ${err.message}`);
        result.errors.push(`Famille ${family.id} : ${err.message}`);
      }
    });

    if (deliveriesToSave.length > 0) {
      deliveriesToSave.sort((a, b) => (b._distance || 0) - (a._distance || 0));
      saveDeliveriesToSheet(deliveriesToSave);
    }

    result.success = result.created > 0;

    Logger.log(
      `[FORM MANUEL] 🎉 Terminé: ${result.created} créées, ${result.skipped} ignorées, ${result.forced} forcées`,
    );

    return result;
  } catch (error) {
    Logger.log(`[FORM MANUEL] ❌ Erreur critique: ${error.message}`);
    throw error;
  }
}