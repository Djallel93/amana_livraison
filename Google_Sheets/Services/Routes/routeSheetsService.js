/**
 * ====================================================================
 * ROUTE_SHEET_SERVICE.GS - Génération de la feuille imprimable par route
 * ====================================================================
 * Remplace routeDocService.js (Google Doc → Google Sheet).
 *
 * Structure de la feuille :
 *   Ligne 1 : Titre   "Route R001 — Prénom Nom"  (cellule fusionnée, gras)
 *   Ligne 2 : Date    (cellule fusionnée, italique)
 *   Ligne 3 : vide
 *   Ligne 4 : En-têtes colonnes (#, Famille, Adresse, Téléphone, Tél. bis, Personnes)
 *   Lignes 5+ : Données des stops
 *   Dernière ligne : Contact administrateur (cellule fusionnée)
 */

/**
 * Génère un Google Sheet imprimable pour une route donnée.
 * @param {string} routeId
 * @param {string} adminPhone
 * @returns {string} URL du spreadsheet généré
 */
function generateRouteDoc(routeId, adminPhone) {
  Logger.log(`[SHEET_ROUTE] 🚀 Génération feuille pour route ${routeId}`);

  const route = getRouteById(routeId);
  if (!route) throw new Error(`Route ${routeId} introuvable`);

  const benevoleResp = getVolunteerById(route.id_benevole);
  const benevole = extractData(benevoleResp, ["volunteer", "benevole"]);
  const benevoleNom = benevole
    ? `${benevole.prenom || ""} ${benevole.nom || ""}`.trim()
    : String(route.id_benevole);

  const stops = getDeliveryStopsForRoute(routeId);
  if (stops.length === 0)
    throw new Error(`Aucune étape pour la route ${routeId}`);

  const stopsAvecDonnees = _enrichirStops(stops);

  const dateRoute =
    route.date_debut instanceof Date
      ? route.date_debut
      : new Date(route.date_debut);
  const occasion = route.occasion || "ponctuelle";

  const dossier = getDateOccasionFolder(dateRoute, occasion);
  const nomFichier = `${routeId}_${benevoleNom.replace(/\s+/g, "_")}`;

  _supprimerFichierExistant(dossier, nomFichier);

  const ss = SpreadsheetApp.create(nomFichier);
  const fichier = DriveApp.getFileById(ss.getId());
  dossier.addFile(fichier);
  DriveApp.getRootFolder().removeFile(fichier);

  _construireFeuille(
    ss,
    routeId,
    benevoleNom,
    dateRoute,
    stopsAvecDonnees,
    adminPhone,
  );

  const url = DriveApp.getFileById(ss.getId()).getUrl();
  Logger.log(`[SHEET_ROUTE] ✅ Feuille générée : ${url}`);
  return url;
}

// ============================================================
// ENRICHISSEMENT DES STOPS
// ============================================================

/**
 * Enrichit chaque stop avec adresse, téléphones et nombre de personnes.
 * (Même logique que l'ancienne version Doc)
 * @param {Array<Object>} stops
 * @returns {Array<Object>}
 */
function _enrichirStops(stops) {
  return stops.map(function (stop) {
    const livraison = getDeliveryById(stop.id_livraison);
    if (!livraison) {
      return {
        ordre: stop.ordre_passage,
        id_famille: stop.id_livraison,
        adresse: "— adresse inconnue —",
        telephone: "",
        telephone_bis: "",
        nombre_personnes: "?",
      };
    }

    let telephone = "";
    let telephoneBis = "";

    try {
      const familleResp = getFamilyById(livraison.id_famille);
      const famille = extractData(familleResp, ["family", "famille"]);
      if (famille) {
        telephone = famille.telephone || "";
        telephoneBis = famille.telephoneBis || "";
      }
    } catch (err) {
      Logger.log(
        `[SHEET_ROUTE] ⚠️ Téléphone famille ${livraison.id_famille} : ${err.message}`,
      );
    }

    return {
      ordre: stop.ordre_passage,
      id_famille: livraison.id_famille,
      adresse: livraison.adresse || "—",
      telephone: String(telephone),
      telephone_bis: String(telephoneBis),
      nombre_personnes: livraison.nombre_personnes || 1,
    };
  });
}

// ============================================================
// CONSTRUCTION DE LA FEUILLE
// ============================================================

/**
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
 * @param {string}  routeId
 * @param {string}  benevoleNom
 * @param {Date}    dateRoute
 * @param {Array}   stops
 * @param {string}  adminPhone
 */
function _construireFeuille(
  ss,
  routeId,
  benevoleNom,
  dateRoute,
  stops,
  adminPhone,
) {
  const sheet = ss.getActiveSheet();
  sheet.setName(routeId);

  const NB_COLS = 6; // #, Famille, Adresse, Téléphone, Tél. bis, Personnes

  // ── Formatage de la date ──────────────────────────────────────────────────
  const dateFormatee =
    dateRoute instanceof Date && !isNaN(dateRoute.getTime())
      ? dateRoute.toLocaleDateString("fr-FR", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      : String(dateRoute);

  let currentRow = 1;

  // ── Ligne 1 : Titre ───────────────────────────────────────────────────────
  const titreRange = sheet.getRange(currentRow, 1, 1, NB_COLS);
  titreRange.merge();
  titreRange.setValue(`Route ${routeId} — ${benevoleNom}`);
  titreRange
    .setFontSize(16)
    .setFontWeight("bold")
    .setVerticalAlignment("middle")
    .setHorizontalAlignment("left")
    .setBackground("#2d3748")
    .setFontColor("#ffffff");
  sheet.setRowHeight(currentRow, 40);
  currentRow++;

  // ── Ligne 2 : Date ────────────────────────────────────────────────────────
  const dateRange = sheet.getRange(currentRow, 1, 1, NB_COLS);
  dateRange.merge();
  dateRange.setValue(dateFormatee);
  dateRange
    .setFontSize(11)
    .setFontStyle("italic")
    .setFontColor("#666666")
    .setHorizontalAlignment("left")
    .setVerticalAlignment("middle");
  sheet.setRowHeight(currentRow, 24);
  currentRow++;

  // ── Ligne 3 : Espacement ──────────────────────────────────────────────────
  sheet.setRowHeight(currentRow, 8);
  currentRow++;

  // ── Ligne 4 : En-têtes ────────────────────────────────────────────────────
  const headers = [
    "#",
    "Famille",
    "Adresse",
    "Téléphone",
    "Tél. bis",
    "Personnes",
  ];
  const headerRange = sheet.getRange(currentRow, 1, 1, NB_COLS);
  headerRange.setValues([headers]);
  headerRange
    .setFontWeight("bold")
    .setFontSize(10)
    .setBackground("#4a5568")
    .setFontColor("#ffffff")
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle");
  sheet.setRowHeight(currentRow, 28);
  currentRow++;

  const dataStartRow = currentRow;

  // ── Lignes de données ─────────────────────────────────────────────────────
  if (stops.length > 0) {
    const rows = stops.map(function (stop, index) {
      return [
        stop.ordre,
        stop.id_famille,
        stop.adresse,
        stop.telephone,
        stop.telephone_bis,
        stop.nombre_personnes,
      ];
    });

    const dataRange = sheet.getRange(currentRow, 1, rows.length, NB_COLS);
    dataRange.setValues(rows);
    dataRange.setFontSize(10).setVerticalAlignment("middle");

    // Alternance de couleurs
    stops.forEach(function (_, index) {
      const rowRange = sheet.getRange(currentRow + index, 1, 1, NB_COLS);
      rowRange.setBackground(index % 2 === 0 ? "#ffffff" : "#f7fafc");
      sheet.setRowHeight(currentRow + index, 22);
    });

    // Adresse (col 3) : retour à la ligne activé
    sheet.getRange(currentRow, 3, rows.length, 1).setWrap(true);

    // Alignement colonne Personnes (col 6) : centré
    sheet
      .getRange(currentRow, 6, rows.length, 1)
      .setHorizontalAlignment("center");

    currentRow += rows.length;
  }

  // ── Ligne d'espacement avant footer ──────────────────────────────────────
  sheet.setRowHeight(currentRow, 8);
  currentRow++;

  // ── Ligne admin phone ─────────────────────────────────────────────────────
  if (adminPhone) {
    const footerRange = sheet.getRange(currentRow, 1, 1, NB_COLS);
    footerRange.merge();
    footerRange.setValue(`📞 Contact administrateur : ${adminPhone}`);
    footerRange
      .setFontSize(11)
      .setFontWeight("bold")
      .setHorizontalAlignment("center")
      .setVerticalAlignment("middle")
      .setBackground("#edf2f7")
      .setFontColor("#2d3748");
    sheet.setRowHeight(currentRow, 30);
    currentRow++;
  }

  // ── Bordures sur la zone de données (en-tête + données) ──────────────────
  if (stops.length > 0) {
    const tableRange = sheet.getRange(
      dataStartRow - 1,
      1,
      stops.length + 1,
      NB_COLS,
    );
    tableRange.setBorder(
      true,
      true,
      true,
      true,
      true,
      true,
      "#e2e8f0",
      SpreadsheetApp.BorderStyle.SOLID,
    );
  }

  // ── Largeurs de colonnes ──────────────────────────────────────────────────
  // Col 1 : # → étroit
  sheet.setColumnWidth(1, 35);
  // Col 2 : Famille → ajusté au contenu
  sheet.autoResizeColumn(2);
  // Col 3 : Adresse → large fixe (contenu variable)
  sheet.setColumnWidth(3, 220);
  // Col 4 : Téléphone → ajusté
  sheet.autoResizeColumn(4);
  // Col 5 : Tél. bis → ajusté
  sheet.autoResizeColumn(5);
  // Col 6 : Personnes → étroit
  sheet.setColumnWidth(6, 75);

  Logger.log(
    `[SHEET_ROUTE] ✅ Feuille construite : ${stops.length} stop(s), admin=${adminPhone || "aucun"}`,
  );
}

// ============================================================
// UTILITAIRE
// ============================================================

/**
 * Supprime un fichier portant le même nom dans le dossier (Spreadsheet ou Doc).
 * @param {GoogleAppsScript.Drive.Folder} dossier
 * @param {string} nom
 */
function _supprimerFichierExistant(dossier, nom) {
  const fichiers = dossier.getFilesByName(nom);
  while (fichiers.hasNext()) {
    fichiers.next().setTrashed(true);
    Logger.log(`[SHEET_ROUTE] 🗑️ Ancien fichier supprimé : ${nom}`);
  }
}
