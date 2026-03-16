/**
 * ====================================================================
 * LABEL_SERVICE.GS - Génération des étiquettes (indépendant des routes)
 * ====================================================================
 * Recto : QR codes (paires de colonnes fusionnées)
 * Verso : Famille ID | Part X/N (mirroring horizontal)
 */

const A4_USABLE_WIDTH_PX = 754;
const A4_USABLE_HEIGHT_PX = 1083;
const QR_CELL_FILL_RATIO = 0.75;
const QR_SOURCE_SIZE_PX = 200;
const SEPARATOR_ROW_HEIGHT_PX = 20;

// ============================================================
// DIMENSIONS
// ============================================================

/**
 * Calcule les dimensions en pixels pour un layout rows×cols sur A4.
 * @param {number} rows
 * @param {number} cols
 * @returns {Object}
 */
function calculateCellDimensions(rows, cols) {
  const colWidth = Math.floor(A4_USABLE_WIDTH_PX / cols);
  const rowHeight = Math.floor(A4_USABLE_HEIGHT_PX / rows);
  const leftWidth = Math.floor(colWidth * 2 / 3);
  const rightWidth = colWidth - leftWidth;
  const qrSize = Math.floor(Math.min(colWidth, rowHeight) * QR_CELL_FILL_RATIO);
  const fontSizeId = Math.min(24, Math.max(12, Math.floor(rowHeight / 6)));
  const fontSizePart = Math.min(14, Math.max(9, Math.floor(rowHeight / 12)));

  Logger.log(
    `[ÉTIQUETTES] 📐 Layout ${rows}×${cols} : étiquette ${colWidth}×${rowHeight}px` +
    ` (gauche=${leftWidth} droite=${rightWidth}), QR=${qrSize}px,` +
    ` polices id=${fontSizeId}pt part=${fontSizePart}pt`
  );

  return { leftWidth, rightWidth, rowHeight, qrSize, fontSizeId, fontSizePart };
}

// ============================================================
// POINT D'ENTRÉE PRINCIPAL
// ============================================================

/**
 * Génère les étiquettes pour une date et une occasion données.
 * @param {Object} params - { date, occasion, rows, cols }
 * @returns {Object} { success, processed, errors, documents }
 */
function generateLabels(params) {
  Logger.log('[ÉTIQUETTES] 🚀 Démarrage génération...');
  Logger.log(`[ÉTIQUETTES] Date=${params.date} Occasion=${params.occasion} Format=${params.rows}×${params.cols}`);

  const result = { success: false, processed: 0, errors: [], documents: [] };

  try {
    const rows = parseInt(params.rows) || 7;
    const cols = parseInt(params.cols) || 3;
    const slotsPerPage = rows * cols;

    const livraisons = _getLivraisonsForLabels(params.date, params.occasion);
    Logger.log(`[ÉTIQUETTES] 📦 ${livraisons.length} livraison(s) trouvée(s)`);

    if (livraisons.length === 0) {
      result.errors.push('Aucune livraison trouvée pour cette date et cette occasion');
      return result;
    }

    const allSlots = _buildSlots(livraisons);
    Logger.log(`[ÉTIQUETTES] 🏷️ ${allSlots.length} slot(s) au total`);

    result.processed = livraisons.length;

    const dims = calculateCellDimensions(rows, cols);
    const sheetName = buildSheetName(new Date(params.date), params.occasion);

    const dossier = getDateOccasionFolder(new Date(params.date), params.occasion);
    const ss = _createOrReplaceSpreadsheetInFolder(sheetName, dossier);
    const sheet = ss.getActiveSheet();

    _setColumnWidths(sheet, cols, dims);
    writeAllPages(sheet, allSlots, rows, cols, slotsPerPage, dims);

    const url = ss.getUrl();
    Logger.log(`[ÉTIQUETTES] ✅ Feuille prête : ${url}`);

    result.success = true;
    result.documents.push({ labelCount: allSlots.length, url });
    return result;

  } catch (err) {
    Logger.log(`[ÉTIQUETTES] ❌ Erreur critique : ${err.message}`);
    result.errors.push(`Erreur critique : ${err.message}`);
    return result;
  }
}

// ============================================================
// RÉCUPÉRATION ET CONSTRUCTION DES SLOTS
// ============================================================

function _getLivraisonsForLabels(date, occasion) {
  const cible = new Date(date);
  cible.setHours(0, 0, 0, 0);

  return filterData(CONFIG.SHEETS.LIVRAISON, function (row) {
    if (!row.disponibilite_debut) return false;
    if (row.type_aide !== occasion) return false;
    if (row.statut === CONFIG.ENUMS.STATUT_LIVRAISON.ANNULEE) return false;

    const d = new Date(row.disponibilite_debut);
    d.setHours(0, 0, 0, 0);
    return d.getTime() === cible.getTime();
  });
}

function _buildSlots(livraisons) {
  const apiUrl = PropertiesService.getScriptProperties().getProperty('API_LIVRAISON_URL') || '';
  const slots = [];

  for (const liv of livraisons) {
    const total = parseInt(liv.nombre_personnes) || 1;
    const qrUrl = _buildLabelQrUrl(liv.id_livraison, apiUrl);

    for (let part = 1; part <= total; part++) {
      slots.push({
        familleId: String(liv.id_famille || ''),
        livraisonId: String(liv.id_livraison || ''),
        part,
        total,
        qrUrl
      });
    }
  }

  return slots;
}

function _buildLabelQrUrl(livraisonId, apiUrl) {
  const base = apiUrl || ScriptApp.getService().getUrl() || 'https://script.google.com';
  const url = `${base}?action=confirm_delivery&id_livraison=${encodeURIComponent(livraisonId)}`;
  return `https://api.qrserver.com/v1/create-qr-code/?size=${QR_SOURCE_SIZE_PX}x${QR_SOURCE_SIZE_PX}&data=${encodeURIComponent(url)}`;
}

// ============================================================
// SPREADSHEET
// ============================================================

/**
 * Crée ou remplace un spreadsheet dans le dossier fourni.
 * @param {string} name
 * @param {GoogleAppsScript.Drive.Folder} dossier
 * @returns {GoogleAppsScript.Spreadsheet.Spreadsheet}
 */
function _createOrReplaceSpreadsheetInFolder(name, dossier) {
  const existing = dossier.getFilesByName(name);
  while (existing.hasNext()) {
    existing.next().setTrashed(true);
    Logger.log(`[ÉTIQUETTES] 🗑️ Ancien fichier supprimé : ${name}`);
  }

  const ss = SpreadsheetApp.create(name);
  const file = DriveApp.getFileById(ss.getId());
  dossier.addFile(file);
  DriveApp.getRootFolder().removeFile(file);

  Logger.log(`[ÉTIQUETTES] ✅ Spreadsheet créé dans le sous-dossier : ${name}`);
  return ss;
}

function _setColumnWidths(sheet, cols, dims) {
  for (let c = 0; c < cols; c++) {
    sheet.setColumnWidth(c * 2 + 1, dims.leftWidth);
    sheet.setColumnWidth(c * 2 + 2, dims.rightWidth);
  }
}

// ============================================================
// ÉCRITURE DES PAGES
// ============================================================

function writeAllPages(sheet, allSlots, rows, cols, slotsPerPage, dims) {
  const totalPages = Math.ceil(allSlots.length / slotsPerPage);
  Logger.log(`[ÉTIQUETTES] 📄 Écriture de ${totalPages} paire(s) de pages...`);

  let currentRow = 1;

  for (let page = 0; page < totalPages; page++) {
    const pageSlots = allSlots.slice(page * slotsPerPage, (page + 1) * slotsPerPage);
    Logger.log(`[ÉTIQUETTES] ✍️ Page ${page + 1}/${totalPages} : ${pageSlots.length} slot(s)`);

    currentRow = writeRectoPage(sheet, currentRow, pageSlots, rows, cols, dims);
    currentRow = writeSeparatorRow(sheet, currentRow);
    currentRow = writeVersoPage(sheet, currentRow, pageSlots, rows, cols, dims);
    currentRow = writeSeparatorRow(sheet, currentRow);
  }

  Logger.log(`[ÉTIQUETTES] ✅ Terminé. Lignes utilisées : ${currentRow - 1}`);
}

function writeRectoPage(sheet, startRow, slots, rows, cols, dims) {
  for (let r = 0; r < rows; r++) {
    const sheetRow = startRow + r;
    sheet.setRowHeight(sheetRow, dims.rowHeight);

    for (let c = 0; c < cols; c++) {
      const frontCol = (cols - 1) - c;
      const idx = r * cols + frontCol;
      const colLeft = c * 2 + 1;
      const mergedCell = sheet.getRange(sheetRow, colLeft, 1, 2);

      mergedCell.merge();
      _styleRectoCell(mergedCell);

      if (idx < slots.length) {
        mergedCell.setFormula(
          `=IMAGE("${slots[idx].qrUrl}",4,${dims.qrSize},${dims.qrSize})`
        );
      }
    }
  }

  _drawOuterBorder(sheet, startRow, rows, cols * 2);
  _drawInnerLabelBorders(sheet, startRow, rows, cols);
  return startRow + rows;
}

function writeVersoPage(sheet, startRow, slots, rows, cols, dims) {
  for (let r = 0; r < rows; r++) {
    const sheetRow = startRow + r;
    sheet.setRowHeight(sheetRow, dims.rowHeight);

    for (let c = 0; c < cols; c++) {
      const frontCol = (cols - 1) - c;
      const idx = r * cols + frontCol;
      const colLeft = c * 2 + 1;
      const colRight = c * 2 + 2;
      const cellLeft = sheet.getRange(sheetRow, colLeft);
      const cellRight = sheet.getRange(sheetRow, colRight);

      _styleVersoLeft(cellLeft);
      _styleVersoRight(cellRight);

      if (idx < slots.length) {
        const slot = slots[idx];
        cellLeft.setValue(`F_${slot.familleId}`);
        cellLeft.setFontSize(dims.fontSizeId).setFontWeight('bold').setFontColor('#000000');
        cellLeft.setHorizontalAlignment('center').setVerticalAlignment('middle').setWrap(false);

        cellRight.setValue(`${slot.part}/${slot.total}`);
        cellRight.setFontSize(dims.fontSizePart).setFontWeight('normal').setFontColor('#333333');
        cellRight.setHorizontalAlignment('center').setVerticalAlignment('bottom').setWrap(false);
      }
    }
  }

  _drawOuterBorder(sheet, startRow, rows, cols * 2);
  _drawInnerLabelBorders(sheet, startRow, rows, cols);
  return startRow + rows;
}

// ============================================================
// STYLES ET BORDURES
// ============================================================

function _styleRectoCell(cell) {
  cell.setBackground('#FFFFFF').setHorizontalAlignment('center').setVerticalAlignment('middle');
  cell.setBorder(true, true, true, true, false, false, '#CCCCCC', SpreadsheetApp.BorderStyle.SOLID);
}

function _styleVersoLeft(cell) {
  cell.setBackground('#FFFFFF');
  cell.setBorder(true, true, true, false, false, false, '#CCCCCC', SpreadsheetApp.BorderStyle.SOLID);
}

function _styleVersoRight(cell) {
  cell.setBackground('#FFFFFF');
  cell.setBorder(true, false, true, true, false, false, '#CCCCCC', SpreadsheetApp.BorderStyle.SOLID);
}

function _drawOuterBorder(sheet, startRow, rows, totalCols) {
  sheet.getRange(startRow, 1, rows, totalCols)
    .setBorder(true, true, true, true, null, null, '#000000', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
}

function _drawInnerLabelBorders(sheet, startRow, rows, cols) {
  for (let c = 0; c < cols - 1; c++) {
    const sepCol = c * 2 + 2;
    sheet.getRange(startRow, sepCol, rows, 1)
      .setBorder(false, false, false, true, false, false, '#000000', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  }
}

function writeSeparatorRow(sheet, rowIndex) {
  sheet.setRowHeight(rowIndex, SEPARATOR_ROW_HEIGHT_PX);
  return rowIndex + 1;
}

// ============================================================
// UTILITAIRES
// ============================================================

function buildSheetName(date, occasion) {
  const dateStr = Utilities.formatDate(date, CONFIG.TIMEZONE || 'Europe/Paris', 'yyyyMMdd');
  return `${dateStr}_${occasion}`;
}

/**
 * Conservé pour compatibilité future.
 * @returns {Array<Object>}
 */
function getConfirmedRoutesForLabels() {
  try {
    const validStatuts = [CONFIG.ENUMS.STATUT_ROUTE.CONFIRMEE, CONFIG.ENUMS.STATUT_ROUTE.EN_COURS];
    const routes = filterData(CONFIG.SHEETS.ROUTES, row => validStatuts.includes(row.statut));

    return routes.map(route => {
      const deliveries = getDeliveriesForRoute(route.id_route);
      const totalPersonnes = deliveries.reduce((sum, d) => sum + (parseInt(d.nombre_personnes) || 1), 0);
      return { id_route: route.id_route, nombre_livraisons: deliveries.length, total_personnes: totalPersonnes };
    });
  } catch (err) {
    Logger.log(`[ÉTIQUETTES] ❌ Erreur récupération routes : ${err.message}`);
    return [];
  }
}