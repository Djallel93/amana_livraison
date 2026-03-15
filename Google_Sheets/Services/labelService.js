/**
 * ====================================================================
 * LABEL_SERVICE.GS - Génération des Étiquettes (indépendant des routes)
 * ====================================================================
 *
 * Recto et verso utilisent tous les deux cols*2 colonnes.
 * Recto  : chaque paire de colonnes est fusionnée → cellule QR pleine largeur.
 * Verso  : colonne gauche (2/3) = Famille ID | colonne droite (1/3) = Part X/N.
 * La bordure interne gauche/droite du verso est invisible.
 * Après impression et découpe, recto et verso sont parfaitement alignés.
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
 * colWidth = largeur totale d'une étiquette (paire de colonnes).
 * leftWidth / rightWidth = sous-colonnes verso (2/3 - 1/3).
 *
 * @param {number} rows
 * @param {number} cols
 * @returns {{ leftWidth, rightWidth, rowHeight, qrSize, fontSizeId, fontSizePart }}
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
    const ss = createOrReplaceSpreadsheet(sheetName);
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

/**
 * Récupère les livraisons non annulées pour une date et une occasion.
 * @param {string} date
 * @param {string} occasion
 * @returns {Array<Object>}
 */
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

/**
 * Construit un slot par personne (part) par livraison.
 * @param {Array<Object>} livraisons
 * @returns {Array<Object>}
 */
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

/**
 * Construit l'URL du QR code sans token.
 * confirm_delivery résout la route dynamiquement au scan.
 */
function _buildLabelQrUrl(livraisonId, apiUrl) {
  const base = apiUrl || ScriptApp.getService().getUrl() || 'https://script.google.com';
  const url = `${base}?action=confirm_delivery&id_livraison=${encodeURIComponent(livraisonId)}`;
  return `https://api.qrserver.com/v1/create-qr-code/?size=${QR_SOURCE_SIZE_PX}x${QR_SOURCE_SIZE_PX}&data=${encodeURIComponent(url)}`;
}

// ============================================================
// SPREADSHEET
// ============================================================

/**
 * Crée un nouveau spreadsheet ou remplace l'existant portant le même nom.
 */
function createOrReplaceSpreadsheet(name) {
  const folder = getRoutesFolder();
  const existing = folder.getFilesByName(name);
  while (existing.hasNext()) {
    existing.next().setTrashed(true);
    Logger.log(`[ÉTIQUETTES] 🗑️ Ancien fichier supprimé : ${name}`);
  }

  const ss = SpreadsheetApp.create(name);
  const file = DriveApp.getFileById(ss.getId());
  folder.addFile(file);
  DriveApp.getRootFolder().removeFile(file);

  Logger.log(`[ÉTIQUETTES] ✅ Spreadsheet créé : ${name}`);
  return ss;
}

/**
 * Définit les largeurs de toutes les colonnes (cols*2 au total).
 * Appelé une seule fois avant l'écriture des pages.
 */
function _setColumnWidths(sheet, cols, dims) {
  for (let c = 0; c < cols; c++) {
    sheet.setColumnWidth(c * 2 + 1, dims.leftWidth);
    sheet.setColumnWidth(c * 2 + 2, dims.rightWidth);
  }
}

// ============================================================
// ÉCRITURE DES PAGES
// ============================================================

/**
 * Écrit toutes les paires recto/verso dans la feuille.
 */
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

// ============================================================
// PAGE RECTO — QR codes (cols*2 colonnes, paires fusionnées)
// ============================================================

/**
 * Écrit la page recto.
 * Chaque étiquette occupe une paire de colonnes fusionnées → même largeur que le verso.
 * @returns {number} Prochaine ligne disponible
 */
function writeRectoPage(sheet, startRow, slots, rows, cols, dims) {
  for (let r = 0; r < rows; r++) {
    const sheetRow = startRow + r;
    sheet.setRowHeight(sheetRow, dims.rowHeight);

    for (let c = 0; c < cols; c++) {
      // Même miroir que le verso : col c → slot (cols-1-c)
      // Garantit que recto et verso pointent vers le même id_livraison après découpe
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

// ============================================================
// PAGE VERSO — Famille + Part (cols*2 colonnes, non fusionnées)
// ============================================================

/**
 * Écrit la page verso avec mirroring horizontal pour impression recto/verso bord long.
 * Slot en position frontCol (recto) → position miroir sur le verso.
 * @returns {number} Prochaine ligne disponible
 */
function writeVersoPage(sheet, startRow, slots, rows, cols, dims) {
  for (let r = 0; r < rows; r++) {
    const sheetRow = startRow + r;
    sheet.setRowHeight(sheetRow, dims.rowHeight);

    for (let c = 0; c < cols; c++) {
      // Miroir horizontal : étiquette recto col c → verso col (cols-1-c)
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
        cellLeft.setFontSize(dims.fontSizeId);
        cellLeft.setFontWeight('bold');
        cellLeft.setFontColor('#000000');
        cellLeft.setHorizontalAlignment('center');
        cellLeft.setVerticalAlignment('middle');
        cellLeft.setWrap(false);

        cellRight.setValue(`${slot.part}/${slot.total}`);
        cellRight.setFontSize(dims.fontSizePart);
        cellRight.setFontWeight('normal');
        cellRight.setFontColor('#333333');
        cellRight.setHorizontalAlignment('center');
        cellRight.setVerticalAlignment('bottom');
        cellRight.setWrap(false);
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
  cell.setBackground('#FFFFFF');
  cell.setHorizontalAlignment('center');
  cell.setVerticalAlignment('middle');
  cell.setBorder(
    true, true, true, true, false, false,
    '#CCCCCC', SpreadsheetApp.BorderStyle.SOLID
  );
}

/**
 * Cellule verso gauche : pas de bordure droite (invisible entre gauche et droite).
 */
function _styleVersoLeft(cell) {
  cell.setBackground('#FFFFFF');
  cell.setBorder(
    true, true, true, false, false, false,
    '#CCCCCC', SpreadsheetApp.BorderStyle.SOLID
  );
}

/**
 * Cellule verso droite : pas de bordure gauche (invisible entre gauche et droite).
 */
function _styleVersoRight(cell) {
  cell.setBackground('#FFFFFF');
  cell.setBorder(
    true, false, true, true, false, false,
    '#CCCCCC', SpreadsheetApp.BorderStyle.SOLID
  );
}

/**
 * Bordure extérieure épaisse autour de la page entière.
 */
function _drawOuterBorder(sheet, startRow, rows, totalCols) {
  sheet.getRange(startRow, 1, rows, totalCols)
    .setBorder(
      true, true, true, true, null, null,
      '#000000', SpreadsheetApp.BorderStyle.SOLID_MEDIUM
    );
}

/**
 * Bordures verticales épaisses entre chaque étiquette.
 * Tracées sur le bord droit de la colonne droite de chaque paire, sauf la dernière.
 */
function _drawInnerLabelBorders(sheet, startRow, rows, cols) {
  for (let c = 0; c < cols - 1; c++) {
    const sepCol = c * 2 + 2;
    sheet.getRange(startRow, sepCol, rows, 1)
      .setBorder(
        false, false, false, true, false, false,
        '#000000', SpreadsheetApp.BorderStyle.SOLID_MEDIUM
      );
  }
}

/**
 * Ligne séparatrice entre recto et verso.
 * @returns {number} Prochaine ligne disponible
 */
function writeSeparatorRow(sheet, rowIndex) {
  sheet.setRowHeight(rowIndex, SEPARATOR_ROW_HEIGHT_PX);
  return rowIndex + 1;
}

// ============================================================
// UTILITAIRES
// ============================================================

/**
 * Construit le nom du spreadsheet.
 * Ex : "20260215_zakat_el_fitr"
 */
function buildSheetName(date, occasion) {
  const dateStr = Utilities.formatDate(date, CONFIG.TIMEZONE || 'Europe/Paris', 'yyyyMMdd');
  return `${dateStr}_${occasion}`;
}

/**
 * Retourne les routes confirmées/en cours avec leur nombre de livraisons.
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