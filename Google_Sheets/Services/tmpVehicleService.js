/**
 * ====================================================================
 * TMP_VEHICLE_SERVICE.GS - Service Véhicules Temporaires
 * ====================================================================
 */

const SHEET_VEHICLE_TMP = "vehicle_tmp";
const HEADERS_VEHICLE_TMP = [
  "id",
  "id_type_vehicule",
  "disponibilite_debut",
  "disponibilite_fin",
  "actif",
];

/**
 * Initialise la feuille vehicle_tmp si elle n'existe pas
 */
function initVehicleTmpSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_VEHICLE_TMP);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_VEHICLE_TMP);
    sheet
      .getRange(1, 1, 1, HEADERS_VEHICLE_TMP.length)
      .setValues([HEADERS_VEHICLE_TMP]);
    Logger.log("[TMP_VEHICLE] ✅ Feuille vehicle_tmp créée");
  } else {
    Logger.log("[TMP_VEHICLE] ℹ️ Feuille vehicle_tmp déjà existante");
  }

  return sheet;
}

/**
 * Génère le prochain ID au format TV001, TV002...
 * @returns {string}
 */
function generateNextTmpVehicleId() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_VEHICLE_TMP);

  if (!sheet || sheet.getLastRow() <= 1) {
    return "TV001";
  }

  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  const numbers = data
    .map((row) => row[0])
    .filter((id) => id && typeof id === "string" && id.startsWith("TV"))
    .map((id) => parseInt(id.substring(2)))
    .filter((n) => !isNaN(n));

  const max = numbers.length > 0 ? Math.max(...numbers) : 0;
  return `TV${String(max + 1).padStart(3, "0")}`;
}

/**
 * Récupère les types de véhicules depuis l'API pour le formulaire
 * @returns {Array<{id, name}>}
 */
function getVehicleTypesForForm() {
  const response = getVehicleTypes();
  if (!response || !response.vehicles) return [];

  return response.vehicles
    .filter((v) => parseFloat(v.capaciteKg) > 0)
    .map((v) => ({ id: v.id, name: v.type }));
}

/**
 * Sauvegarde un nouveau véhicule temporaire depuis le formulaire HTML
 * @param {Object} formData - {id_type_vehicule, disponibilite_debut, disponibilite_fin, actif}
 * @returns {{success: boolean, id?: string, error?: string}}
 */
function saveTmpVehicleFromForm(formData) {
  try {
    initVehicleTmpSheet();

    const id = generateNextTmpVehicleId();
    const sheet =
      SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_VEHICLE_TMP);

    const row = [
      id,
      formData.id_type_vehicule,
      formData.disponibilite_debut,
      formData.disponibilite_fin,
      formData.actif === true || formData.actif === "true",
    ];

    sheet.appendRow(row);
    Logger.log(`[TMP_VEHICLE] ✅ Véhicule temporaire ${id} créé`);
    return { success: true, id };
  } catch (error) {
    Logger.log(`[TMP_VEHICLE] ❌ Erreur: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Retourne les véhicules temporaires disponibles pour une date donnée
 * @param {string} dateLivraison - Format YYYY-MM-DD
 * @returns {Array<Object>}
 */
function getAvailableTmpVehicles(dateLivraison) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_VEHICLE_TMP);

  if (!sheet || sheet.getLastRow() <= 1) return [];

  const targetDate = new Date(dateLivraison);
  targetDate.setHours(0, 0, 0, 0);

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const data = sheet
    .getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn())
    .getValues();

  const rows = data.map((row) => {
    const obj = {};
    headers.forEach((h, i) => (obj[h] = row[i]));
    return obj;
  });

  // Filtrer actif + date
  const active = rows.filter((r) => {
    if (!r.actif) return false;

    const debut = new Date(r.disponibilite_debut);
    debut.setHours(0, 0, 0, 0);
    const fin = new Date(r.disponibilite_fin);
    fin.setHours(0, 0, 0, 0);

    return targetDate >= debut && targetDate <= fin;
  });

  if (active.length === 0) return [];

  // Récupérer les specs depuis l'API
  const vehicleResponse = getVehicleTypes();
  if (!vehicleResponse || !vehicleResponse.vehicles) return [];

  const vehiclesMap = {};
  vehicleResponse.vehicles.forEach((v) => (vehiclesMap[v.id] = v));

  const enriched = active
    .map((r) => {
      const specs = vehiclesMap[r.id_type_vehicule];
      if (!specs) return null;
      const capaciteKg = parseFloat(specs.capaciteKg) || 0;
      if (capaciteKg === 0) return null;
      return {
        ...r,
        type: specs.type,
        capaciteKg,
        nombrePartMax: parseFloat(specs.nombrePartMax) || 0,
      };
    })
    .filter(Boolean);

  // Trier par capaciteKg DESC
  enriched.sort((a, b) => b.capaciteKg - a.capaciteKg);

  Logger.log(
    `[TMP_VEHICLE] ✅ ${enriched.length} véhicule(s) temporaire(s) disponible(s) pour ${dateLivraison}`,
  );
  return enriched;
}

/**
 * Retourne les bénévoles permis sans véhicule, triés par dateInscription ASC
 * @returns {Array<Object>}
 */
function getPermisVolunteers() {
  const response = listVolunteers({ actif: true, statut: "Validé" });
  if (!response || !response.volunteers) return [];

  const permis = response.volunteers.filter((v) => {
    const idVehicule = v.id_vehicule || v.idVehicule;
    return !idVehicule || idVehicule === "";
  });

  permis.sort((a, b) => {
    const da = new Date(a.dateInscription || 0);
    const db = new Date(b.dateInscription || 0);
    return da - db;
  });

  Logger.log(
    `[TMP_VEHICLE] ✅ ${permis.length} bénévole(s) permis sans véhicule`,
  );
  return permis;
}

/**
 * Apparie les véhicules temporaires avec les bénévoles permis
 * @param {string} dateLivraison - Format YYYY-MM-DD
 * @returns {Array<Object>} Bénévoles appariés avec vehicule injecté
 */
function getPairedPermisVolunteers(dateLivraison) {
  const tmpVehicles = getAvailableTmpVehicles(dateLivraison); // triés capacité DESC
  const permisVols = getPermisVolunteers(); // triés dateInscription ASC

  const pairs = [];
  const count = Math.min(tmpVehicles.length, permisVols.length);

  for (let i = 0; i < count; i++) {
    const tmpVehicle = tmpVehicles[i];
    const volunteer = { ...permisVols[i] };

    volunteer.vehicule = {
      id: tmpVehicle.id,
      type: tmpVehicle.type,
      capaciteKg: tmpVehicle.capaciteKg,
      nombrePartMax: tmpVehicle.nombrePartMax,
    };
    volunteer._tmp_vehicule_id = tmpVehicle.id;

    pairs.push(volunteer);
  }

  Logger.log(
    `[TMP_VEHICLE] ✅ ${pairs.length} bénévole(s) permis appairés avec véhicule temporaire`,
  );
  return pairs;
}
