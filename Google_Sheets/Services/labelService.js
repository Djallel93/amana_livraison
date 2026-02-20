/**
 * ====================================================================
 * LABEL_SERVICE.GS - Service de Génération des Étiquettes
 * ====================================================================
 * Un seul fichier cumulatif par date/occasion dans Routes/
 * Format recto/verso avec miroir colonnes pour impression dos-à-dos
 * Tailles QR et polices calculées dynamiquement selon la grille
 *
 * Optimisation QR  : 1 seul appel par livraison, blob réutilisé pour toutes les parts
 * Optimisation GAS : saveAndClose() + openById() tous les SAVE_EVERY lots
 *
 * Nom du fichier : Labels_YYYYMMDD_occasion
 * Comportement   : Écrase le fichier existant à chaque génération
 */

// Nombre de lots (paires recto/verso) entre chaque sauvegarde intermédiaire
const SAVE_EVERY = 2;

// ============================================================
// DIMENSIONS DYNAMIQUES
// ============================================================

/**
 * Calcule les dimensions optimales selon la densité de la grille
 * @param {number} rows
 * @param {number} cols
 * @returns {Object} {qrPx, fontIdPt, fontPartPt, spacingPt}
 */
function calculateLabelDimensions(rows, cols) {
  const density = rows * cols;
  let dims;

  if (density <= 9) {
    dims = { qrPx: 150, fontIdPt: 22, fontPartPt: 14, spacingPt: 10 };
  } else if (density <= 20) {
    dims = { qrPx: 110, fontIdPt: 18, fontPartPt: 12, spacingPt: 7 };
  } else if (density <= 35) {
    dims = { qrPx: 100, fontIdPt: 14, fontPartPt: 10, spacingPt: 4 };
  } else {
    dims = { qrPx: 80, fontIdPt: 11, fontPartPt: 8, spacingPt: 3 };
  }

  // ── Calcul du spacer pour aligner recto sur la hauteur naturelle du verso ──
  // Verso = spacingPt(before QR) + qrPx×0.75 (px→pt) + spacingPt(after QR)
  //       + fontPartPt("Scan pour confirmer") + spacingPt(after scan)
  const PX_TO_PT = 0.75;
  const versoHeightPt = dims.spacingPt
    + dims.qrPx * PX_TO_PT
    + dims.spacingPt
    + dims.fontPartPt
    + dims.spacingPt;

  // Recto naturel = paddingTop + 1 ligne texte + paddingBottom
  const rectoNaturalPt = dims.spacingPt + dims.fontIdPt + dims.spacingPt;

  // Spacer injecté dans la sous-cellule centrale pour combler l'écart
  dims.spacerPt = Math.max(1, versoHeightPt - rectoNaturalPt);

  Logger.log(`[LABELS] 📐 Densité ${density} (${rows}×${cols}) → QR:${dims.qrPx}px, ID:${dims.fontIdPt}pt, verso≈${versoHeightPt.toFixed(1)}pt, spacer:${dims.spacerPt.toFixed(1)}pt`);
  return dims;
}

// ============================================================
// POINT D'ENTRÉE PRINCIPAL
// ============================================================

/**
 * Génère les étiquettes pour des routes sélectionnées
 * @param {Object} params - {routeIds, rows, cols}
 * @returns {Object} Résultat
 */
function generateLabels(params) {
  Logger.log('[LABELS] 🚀 Démarrage génération des étiquettes...');
  Logger.log(`[LABELS] Routes: ${params.routeIds.join(', ')}`);
  Logger.log(`[LABELS] Format: ${params.rows}x${params.cols}`);

  const result = {
    success: false,
    processed: 0,
    errors: [],
    documents: []
  };

  try {
    const allLabels = [];
    let dateDebut = null;
    let occasion = null;

    const dims = calculateLabelDimensions(params.rows || 7, params.cols || 3);

    for (const routeId of params.routeIds) {
      try {
        Logger.log(`[LABELS] 📦 Collecte route ${routeId}...`);

        const route = getRouteById(routeId);
        if (!route) throw new Error(`Route ${routeId} introuvable`);

        if (!dateDebut && route.date_debut) {
          dateDebut = new Date(route.date_debut);
          occasion = route.occasion || 'ponctuelle';
        }

        const livraisons = getDeliveriesForRoute(routeId);
        if (livraisons.length === 0) {
          Logger.log(`[LABELS] ⚠️ Aucune livraison pour ${routeId}, ignorée`);
          continue;
        }

        const labels = createLabelsForRoute(routeId, livraisons, dims);
        Logger.log(`[LABELS]   ${livraisons.length} livraisons → ${labels.length} étiquettes (${livraisons.length} QR téléchargés)`);

        allLabels.push(...labels);
        result.processed++;

      } catch (error) {
        Logger.log(`[LABELS] ❌ Route ${routeId}: ${error.message}`);
        result.errors.push(`Route ${routeId}: ${error.message}`);
      }
    }

    if (allLabels.length === 0) {
      result.errors.push('Aucune étiquette à générer');
      return result;
    }

    Logger.log(`[LABELS] 📊 Total: ${allLabels.length} étiquettes pour ${result.processed} routes`);

    if (!dateDebut) dateDebut = new Date();
    if (!occasion) occasion = 'ponctuelle';

    const docUrl = createSingleLabelsDocument(allLabels, dateDebut, occasion, params, dims);
    Logger.log(`[LABELS] ✅ Document unique: ${docUrl}`);

    result.success = true;
    result.documents.push({
      labelCount: allLabels.length,
      routeCount: result.processed,
      url: docUrl
    });

    return result;

  } catch (error) {
    Logger.log(`[LABELS] ❌ Erreur critique: ${error.message}`);
    result.errors.push(`Erreur: ${error.message}`);
    return result;
  }
}

// ============================================================
// CRÉATION DES ÉTIQUETTES AVEC PRÉ-CHARGEMENT QR
// ============================================================

/**
 * Crée la liste d'étiquettes pour une route
 * ✅ 1 QR par livraison, blob partagé entre toutes les parts
 */
function createLabelsForRoute(routeId, livraisons, dims) {
  const labels = [];

  for (const livraison of livraisons) {
    const n = livraison.nombre_personnes || 1;
    const familleId = String(livraison.id_famille || '');
    const livraisonId = String(livraison.id_livraison || '');
    const confirmUrl = buildConfirmUrl(livraisonId, routeId);

    Logger.log(`[LABELS]   🔲 QR pour ${livraisonId} (${n} part(s))...`);
    const qrBlob = fetchQrCode(confirmUrl, dims.qrPx);

    for (let i = 1; i <= n; i++) {
      labels.push({
        route_id: String(routeId),
        famille_id: familleId,
        livraison_id: livraisonId,
        part: i,
        total: n,
        qr_blob: qrBlob
      });
    }
  }

  return labels;
}

/**
 * Construit l'URL de confirmation
 */
function buildConfirmUrl(livraisonId, routeId) {
  const tokens = filterData(CONFIG.SHEETS.TOKENS, row => row.id_route === routeId);
  const token = tokens.length > 0 ? tokens[0].token : '';
  const apiUrl = PropertiesService.getScriptProperties().getProperty('API_WEB_URL')
    || ScriptApp.getService().getUrl()
    || 'https://script.google.com';

  return `${apiUrl}?action=confirm_delivery&id_livraison=${encodeURIComponent(livraisonId)}&token=${encodeURIComponent(token)}`;
}

// ============================================================
// QR CODE - api.qrserver.com avec retry (max 5 tentatives)
// ============================================================

/**
 * Télécharge un QR code avec retry et backoff progressif
 */
function fetchQrCode(content, sizePx) {
  const size = `${sizePx}x${sizePx}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${size}&data=${encodeURIComponent(content)}`;
  const MAX_RETRIES = 5;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = UrlFetchApp.fetch(qrUrl, { muteHttpExceptions: true });

      if (response.getResponseCode() === 200) {
        Logger.log(`[LABELS] 📷 QR ${size} OK (tentative ${attempt}/${MAX_RETRIES})`);
        return response.getBlob();
      }

      Logger.log(`[LABELS] ⚠️ QR tentative ${attempt}/${MAX_RETRIES}: HTTP ${response.getResponseCode()}`);
    } catch (e) {
      Logger.log(`[LABELS] ⚠️ QR tentative ${attempt}/${MAX_RETRIES}: ${e.message}`);
    }

    if (attempt < MAX_RETRIES) Utilities.sleep(800 * attempt);
  }

  Logger.log(`[LABELS] ❌ QR indisponible après ${MAX_RETRIES} tentatives`);
  return null;
}

// ============================================================
// DOCUMENT UNIQUE - SAUVEGARDE PAR BATCH
// ============================================================

/**
 * Crée (ou recrée) le document unique Labels_YYYYMMDD_occasion
 *
 * Stratégie batch :
 *   - On écrit SAVE_EVERY lots (paires recto/verso) dans le doc ouvert
 *   - On fait saveAndClose() + openById() entre chaque batch
 *   - Chaque ouverture est une référence fraîche → plus d'accumulation mémoire
 */
function createSingleLabelsDocument(allLabels, dateDebut, occasion, config, dims) {
  const rows = config.rows || 7;
  const cols = config.cols || 3;
  const perPage = rows * cols;

  const dateStr = Utilities.formatDate(dateDebut, CONFIG.TIMEZONE || 'Europe/Paris', 'yyyyMMdd');
  const fileName = `Labels_${dateStr}_${occasion}`;

  Logger.log(`[LABELS] 📄 Fichier cible: "${fileName}"`);
  deleteLabelFileIfExists(fileName);

  // Créer le document vide et le déplacer dans Routes/
  const initialDoc = DocumentApp.create(fileName);
  const docId = initialDoc.getId();
  initialDoc.saveAndClose();
  moveFileToRoutesFolder(docId);
  Utilities.sleep(300);

  const totalLots = Math.ceil(allLabels.length / perPage);
  Logger.log(`[LABELS] 📐 ${allLabels.length} étiquettes → ${totalLots} lot(s), batch de ${SAVE_EVERY}`);

  // Découper les lots en batches de SAVE_EVERY
  for (let batchStart = 0; batchStart < totalLots; batchStart += SAVE_EVERY) {
    const batchEnd = Math.min(batchStart + SAVE_EVERY, totalLots);
    Logger.log(`[LABELS] 📝 Batch lots ${batchStart + 1}–${batchEnd}/${totalLots}...`);

    // Ouvrir une référence fraîche pour chaque batch
    const doc = DocumentApp.openById(docId);
    const body = doc.getBody();

    // Réinitialiser les marges (perdues après réouverture)
    body.setMarginTop(10);
    body.setMarginBottom(10);
    body.setMarginLeft(10);
    body.setMarginRight(10);

    for (let lot = batchStart; lot < batchEnd; lot++) {
      const isFirstEverLot = (lot === 0);
      writeLotToBody(body, lot, totalLots, allLabels, perPage, rows, cols, dims, isFirstEverLot);
    }

    Logger.log(`[LABELS] 💾 Sauvegarde batch ${batchStart + 1}–${batchEnd}...`);
    doc.saveAndClose();
    Utilities.sleep(400);
  }

  const docUrl = `https://docs.google.com/document/d/${docId}/edit`;
  Logger.log(`[LABELS] ✅ "${fileName}" généré — ${totalLots} lot(s)`);
  return docUrl;
}

/**
 * Écrit un lot (paire recto/verso) dans un document ouvert
 * @param {Body}    body           - body du document GAS (doc.getBody())
 * @param {number}  lot            - Index du lot courant
 * @param {number}  totalLots      - Nombre total de lots
 * @param {Array}   allLabels      - Toutes les étiquettes
 * @param {number}  perPage        - Étiquettes par page
 * @param {number}  rows
 * @param {number}  cols
 * @param {Object}  dims
 * @param {boolean} isFirstEverLot - true uniquement pour le tout premier lot du document
 */
function writeLotToBody(body, lot, totalLots, allLabels, perPage, rows, cols, dims, isFirstEverLot) {
  const start = lot * perPage;
  const end = Math.min(start + perPage, allLabels.length);
  const pageLabels = allLabels.slice(start, end);

  Logger.log(`[LABELS] ✍️ Lot ${lot + 1}/${totalLots} : étiquettes ${start + 1}–${end}`);

  // ---- PAGE RECTO ----
  if (!isFirstEverLot) body.appendPageBreak();
  appendSectionTitle(body, `RECTO — étiquettes ${start + 1} à ${end} sur ${allLabels.length}`, false);
  appendPrintingHint(body, '↩ Retourner sur le bord LONG (gauche) pour imprimer le verso');
  appendRectoTable(body, pageLabels, rows, cols, dims);

  // ---- PAGE VERSO ----
  body.appendPageBreak();
  appendSectionTitle(body, `VERSO — étiquettes ${start + 1} à ${end} sur ${allLabels.length}`, true);
  appendVersoTable(body, pageLabels, rows, cols, dims);
}

// ============================================================
// TITRES ET INDICATIONS
// ============================================================

function appendSectionTitle(body, title, isVerso) {
  const p = body.appendParagraph(title);
  p.setFontSize(7);
  p.setForegroundColor(isVerso ? '#7EA6D0' : '#AAAAAA');
  p.setSpacingAfter(2);
  p.setSpacingBefore(0);
}

function appendPrintingHint(body, hint) {
  const p = body.appendParagraph(hint);
  p.setFontSize(7);
  p.setForegroundColor('#BBBBBB');
  p.setItalic(true);
  p.setSpacingAfter(3);
  p.setSpacingBefore(0);
}

// ============================================================
// PAGE RECTO - tableau externe + tableau interne 1×3 par cellule
// ============================================================

function appendRectoTable(body, labels, rows, cols, dims) {
  const outerTable = body.appendTable();
  outerTable.setBorderWidth(1);
  outerTable.setBorderColor('#888888');

  for (let r = 0; r < rows; r++) {
    const tableRow = outerTable.appendTableRow();

    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      const outerCell = tableRow.appendTableCell();
      outerCell.setPaddingTop(0);
      outerCell.setPaddingBottom(0);
      outerCell.setPaddingLeft(0);
      outerCell.setPaddingRight(0);

      if (idx < labels.length) {
        fillRectoCell(outerCell, labels[idx], dims);
      } else {
        outerCell.appendParagraph('');
      }
    }
  }
}

/**
 * Tableau interne 1×3 dans chaque cellule recto — fond noir, texte blanc
 *
 * ┌────────────┬─────────────┬──────┐
 * │  R_001     │   F_12345   │      │
 * │  (gauche)  │  (centré)   │  1/3 │ ← centré bas
 * └────────────┴─────────────┴──────┘
 */
function fillRectoCell(outerCell, label, dims) {
  outerCell.clear();

  const routeNum = String(label.route_id).replace(/^R0*/, '') || '0';
  const routeDisplay = `R_${routeNum.padStart(3, '0')}`;
  const familleDisplay = `F_${String(label.famille_id)}`;
  const partDisplay = `${label.part}/${label.total}`;

  const innerTable = outerCell.appendTable();
  innerTable.setBorderWidth(0);
  const innerRow = innerTable.appendTableRow();

  // ── GAUCHE : R_001, aligné gauche, centré vertical ──
  const leftCell = innerRow.appendTableCell();
  leftCell.setBackgroundColor('#000000');
  leftCell.setVerticalAlignment(DocumentApp.VerticalAlignment.CENTER);
  leftCell.setPaddingTop(0);    // hauteur pilotée par spacer de la cellule centrale
  leftCell.setPaddingBottom(0);
  leftCell.setPaddingLeft(dims.spacingPt + 2);
  leftCell.setPaddingRight(dims.spacingPt);
  const pLeft = leftCell.appendParagraph(routeDisplay);
  pLeft.setAlignment(DocumentApp.HorizontalAlignment.LEFT);
  const tLeft = pLeft.editAsText();
  tLeft.setFontSize(dims.fontIdPt);
  tLeft.setBold(true);
  tLeft.setForegroundColor('#FFFFFF');

  // ── CENTRE : F_12345, centré horizontal et vertical ──
  // Un spacer invisible est ajouté pour que la hauteur du recto
  // s'aligne sur celle du verso (contrôlée par le QR code).
  const centerCell = innerRow.appendTableCell();
  centerCell.setBackgroundColor('#000000');
  centerCell.setVerticalAlignment(DocumentApp.VerticalAlignment.CENTER);
  centerCell.setPaddingTop(0);   // géré par spacer
  centerCell.setPaddingBottom(0);
  centerCell.setPaddingLeft(dims.spacingPt);
  centerCell.setPaddingRight(dims.spacingPt);

  // Spacer supérieur (invisible) — pousse le texte vers le centre
  const pSpacerTop = centerCell.appendParagraph('');
  pSpacerTop.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  pSpacerTop.editAsText().setFontSize(dims.spacerPt / 2);
  pSpacerTop.setSpacingBefore(0);
  pSpacerTop.setSpacingAfter(0);

  const pCenter = centerCell.appendParagraph(familleDisplay);
  pCenter.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  const tCenter = pCenter.editAsText();
  tCenter.setFontSize(dims.fontIdPt);
  tCenter.setBold(true);
  tCenter.setForegroundColor('#FFFFFF');

  // Spacer inférieur (symétrique)
  const pSpacerBot = centerCell.appendParagraph('');
  pSpacerBot.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  pSpacerBot.editAsText().setFontSize(dims.spacerPt / 2);
  pSpacerBot.setSpacingBefore(0);
  pSpacerBot.setSpacingAfter(0);

  // ── DROITE : 1/3, centré horizontal, aligné en bas ──
  const rightCell = innerRow.appendTableCell();
  rightCell.setBackgroundColor('#000000');
  rightCell.setVerticalAlignment(DocumentApp.VerticalAlignment.BOTTOM);
  rightCell.setPaddingTop(0);   // hauteur pilotée par spacer de la cellule centrale
  rightCell.setPaddingBottom(dims.spacingPt);
  rightCell.setPaddingLeft(dims.spacingPt);
  rightCell.setPaddingRight(dims.spacingPt + 2);
  const pRight = rightCell.appendParagraph(partDisplay);
  pRight.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  const tRight = pRight.editAsText();
  tRight.setFontSize(dims.fontPartPt);
  tRight.setBold(false);
  tRight.setForegroundColor('#FFFFFF');
}

// ============================================================
// PAGE VERSO (colonnes miroir)
// ============================================================

function appendVersoTable(body, labels, rows, cols, dims) {
  const table = body.appendTable();
  table.setBorderWidth(1);
  table.setBorderColor('#888888');

  for (let r = 0; r < rows; r++) {
    const tableRow = table.appendTableRow();

    for (let c = 0; c < cols; c++) {
      const mirrorC = (cols - 1) - c;
      const idx = r * cols + mirrorC;

      const cell = tableRow.appendTableCell();
      setLabelCellPadding(cell, dims.spacingPt);

      if (idx < labels.length) {
        fillVersoCell(cell, labels[idx], dims);
      } else {
        cell.appendParagraph('');
      }
    }
  }
}

function fillVersoCell(cell, label, dims) {
  cell.clear();

  const pQr = cell.appendParagraph('');
  pQr.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  pQr.setSpacingBefore(dims.spacingPt);
  pQr.setSpacingAfter(dims.spacingPt);

  if (label.qr_blob) {
    const img = pQr.appendInlineImage(label.qr_blob);
    img.setWidth(dims.qrPx);
    img.setHeight(dims.qrPx);
  } else {
    const t = pQr.appendText('[QR indisponible]');
    t.setFontSize(dims.fontPartPt);
    t.setForegroundColor('#AAAAAA');
  }

  const pScan = cell.appendParagraph('Scan pour confirmer');
  pScan.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  pScan.setFontSize(dims.fontPartPt);
  pScan.setSpacingBefore(0);
  pScan.setSpacingAfter(dims.spacingPt);
}

// ============================================================
// HELPERS
// ============================================================

function setLabelCellPadding(cell, spacingPt) {
  const pad = Math.max(3, spacingPt);
  cell.setPaddingTop(pad);
  cell.setPaddingBottom(pad);
  cell.setPaddingLeft(pad + 2);
  cell.setPaddingRight(pad + 2);
}

// ============================================================
// ROUTES CONFIRMÉES (pour le formulaire)
// ============================================================

function getConfirmedRoutesForLabels() {
  try {
    const validStatuts = [
      CONFIG.ENUMS.STATUT_ROUTE.CONFIRMEE,
      CONFIG.ENUMS.STATUT_ROUTE.EN_COURS
    ];

    const routes = filterData(CONFIG.SHEETS.ROUTES, row =>
      validStatuts.includes(row.statut)
    );

    return routes.map(route => {
      const deliveries = getDeliveriesForRoute(route.id_route);
      const total = deliveries.reduce((sum, d) => sum + (d.nombre_personnes || 1), 0);
      return {
        id_route: route.id_route,
        nombre_livraisons: deliveries.length,
        total_personnes: total
      };
    });

  } catch (error) {
    Logger.log(`[LABELS] ❌ Erreur récupération routes: ${error.message}`);
    return [];
  }
}