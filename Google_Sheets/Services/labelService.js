/**
 * ====================================================================
 * LABEL_SERVICE.GS - Service de Génération des Étiquettes (Google Sheets)
 * ====================================================================
 *
 * Generates a Google Sheet named "date_occasion" with:
 *   - FRONT page: QR codes only (one per slot, same QR for all parts of same delivery)
 *   - BACK page:  Route ID + Delivery ID + Part X/N (mirrored columns, duplex long-edge)
 *   - Pages stacked with blank row separators
 *
 * Layout per "page pair":
 *   [FRONT rows]
 *   [blank separator row]
 *   [BACK  rows]
 *   [blank separator row]
 */

// ============================================================
// CONSTANTS
// ============================================================

/**
 * A4 usable area in Google Sheets pixels (96 dpi).
 * A4 = 794 × 1123 px total; subtract ~40px margins on each axis.
 */
const A4_USABLE_WIDTH_PX  = 754;  // 794 - 40
const A4_USABLE_HEIGHT_PX = 1083; // 1123 - 40

/** Fraction of the cell used by the QR image (leaves padding) */
const QR_CELL_FILL_RATIO = 0.75;

/**
 * Resolution requested from qrserver.com.
 * The IMAGE() formula controls display size; this just needs to be
 * large enough that the QR is crisp at any layout density.
 */
const QR_SOURCE_SIZE_PX = 200;

/** Height of the blank separator row between page sections */
const SEPARATOR_ROW_HEIGHT_PX = 20;

/** Font size for section header rows (FRONT / BACK indicators) */
const HEADER_FONT_SIZE = 8;

// ============================================================
// DYNAMIC CELL DIMENSIONS
// ============================================================

/**
 * Calculates cell dimensions that fill an A4 page exactly for the
 * given rows × cols layout.
 *
 * @param {number} rows - Number of label rows chosen by user
 * @param {number} cols - Number of label cols chosen by user
 * @returns {{ colWidth: number, rowHeight: number, qrSize: number, fontSize: number }}
 */
function calculateCellDimensions(rows, cols) {
  const colWidth  = Math.floor(A4_USABLE_WIDTH_PX  / cols);
  const rowHeight = Math.floor(A4_USABLE_HEIGHT_PX / rows);

  // QR fits inside the smaller dimension, with padding
  const qrSize = Math.floor(Math.min(colWidth, rowHeight) * QR_CELL_FILL_RATIO);

  // Back-label font scales with cell size so text is always readable
  // Clamp between 9 pt (very dense) and 16 pt (sparse layout)
  const fontSize = Math.min(16, Math.max(9, Math.floor(rowHeight / 10)));

  Logger.log(
    `[LABELS] 📐 Layout ${rows}×${cols}: ` +
    `cell ${colWidth}×${rowHeight}px, QR ${qrSize}px, font ${fontSize}pt`
  );

  return { colWidth, rowHeight, qrSize, fontSize };
}

// ============================================================
// MAIN ENTRY POINT
// ============================================================

/**
 * Generates labels for selected routes into a Google Sheet.
 * Called from the menu form via generateLabelsFromForm().
 *
 * @param {Object} params - { routeIds: string[], rows: number, cols: number }
 * @returns {Object} result - { success, processed, errors, documents }
 */
function generateLabels(params) {
  Logger.log('[LABELS] 🚀 Starting label generation (Google Sheets)...');
  Logger.log(`[LABELS] Routes: ${params.routeIds.join(', ')}`);
  Logger.log(`[LABELS] Format: ${params.rows}×${params.cols}`);

  const result = {
    success: false,
    processed: 0,
    errors: [],
    documents: []
  };

  try {
    const rows = parseInt(params.rows) || 7;
    const cols = parseInt(params.cols) || 3;
    const slotsPerPage = rows * cols;

    // ── Collect all label slots across all routes ──────────────────
    const allSlots = [];
    let sheetDate = null;
    let sheetOccasion = null;

    for (const routeId of params.routeIds) {
      try {
        const route = getRouteById(routeId);
        if (!route) throw new Error(`Route ${routeId} introuvable`);

        if (!sheetDate && route.date_debut) {
          sheetDate   = new Date(route.date_debut);
          sheetOccasion = route.occasion || 'ponctuelle';
        }

        const livraisons = getDeliveriesForRoute(routeId);
        if (livraisons.length === 0) {
          Logger.log(`[LABELS] ⚠️ No deliveries for ${routeId}, skipping`);
          continue;
        }

        // Build one slot per part per delivery
        for (const livraison of livraisons) {
          const total = parseInt(livraison.nombre_personnes) || 1;
          const confirmUrl = buildConfirmUrl(livraison.id_livraison, routeId);
          const qrUrl = buildQrUrl(confirmUrl);

          for (let part = 1; part <= total; part++) {
            allSlots.push({
              routeId:      String(routeId),
              livraisonId:  String(livraison.id_livraison || ''),
              familleId:    String(livraison.id_famille   || ''),
              part:         part,
              total:        total,
              qrUrl:        qrUrl   // same QR for all parts of same delivery
            });
          }
        }

        result.processed++;

      } catch (err) {
        Logger.log(`[LABELS] ❌ Route ${routeId}: ${err.message}`);
        result.errors.push(`Route ${routeId}: ${err.message}`);
      }
    }

    if (allSlots.length === 0) {
      result.errors.push('Aucune étiquette à générer');
      return result;
    }

    Logger.log(`[LABELS] 📊 Total slots: ${allSlots.length} across ${result.processed} routes`);

    if (!sheetDate)     sheetDate     = new Date();
    if (!sheetOccasion) sheetOccasion = 'ponctuelle';

    // ── Compute cell dimensions for this layout ────────────────────
    const dims = calculateCellDimensions(rows, cols);

    // ── Create (or recreate) the Google Sheet ─────────────────────
    const sheetName = buildSheetName(sheetDate, sheetOccasion);
    const ss        = createOrReplaceSpreadsheet(sheetName);
    const sheet     = ss.getActiveSheet();

    // ── Write all page pairs ───────────────────────────────────────
    writeAllPages(sheet, allSlots, rows, cols, slotsPerPage, dims);

    // ── Freeze nothing, protect nothing, just return URL ──────────
    const url = ss.getUrl();
    Logger.log(`[LABELS] ✅ Spreadsheet ready: ${url}`);

    result.success = true;
    result.documents.push({
      labelCount: allSlots.length,
      routeCount: result.processed,
      url:        url
    });

    return result;

  } catch (err) {
    Logger.log(`[LABELS] ❌ Critical error: ${err.message}`);
    result.errors.push(`Erreur critique: ${err.message}`);
    return result;
  }
}

// ============================================================
// SHEET CREATION
// ============================================================

/**
 * Creates a new spreadsheet, or trashes the existing one with the same name and recreates it.
 * @param {string} name - Spreadsheet name
 * @returns {Spreadsheet}
 */
function createOrReplaceSpreadsheet(name) {
  // Search in Routes folder first, then root
  const folder = getRoutesFolder();
  const existing = folder.getFilesByName(name);
  while (existing.hasNext()) {
    existing.next().setTrashed(true);
    Logger.log(`[LABELS] 🗑️ Trashed existing file: ${name}`);
  }

  const ss   = SpreadsheetApp.create(name);
  const file = DriveApp.getFileById(ss.getId());
  folder.addFile(file);
  DriveApp.getRootFolder().removeFile(file);

  Logger.log(`[LABELS] ✅ Created spreadsheet: ${name}`);
  return ss;
}

// ============================================================
// PAGE WRITING
// ============================================================

/**
 * Writes all front/back page pairs into the sheet.
 *
 * @param {Sheet}    sheet        - Active sheet
 * @param {Object[]} allSlots     - All label slots
 * @param {number}   rows         - Label rows per page
 * @param {number}   cols         - Label cols per page
 * @param {number}   slotsPerPage - rows × cols
 */
function writeAllPages(sheet, allSlots, rows, cols, slotsPerPage, dims) {
  const totalPages = Math.ceil(allSlots.length / slotsPerPage);
  Logger.log(`[LABELS] 📄 Writing ${totalPages} page pair(s)...`);

  // Pre-set column widths (done once for all pages)
  setColumnWidths(sheet, cols, dims.colWidth);

  let currentRow = 1; // 1-indexed

  for (let page = 0; page < totalPages; page++) {
    const pageSlots = allSlots.slice(page * slotsPerPage, (page + 1) * slotsPerPage);

    Logger.log(`[LABELS] ✍️  Page ${page + 1}/${totalPages}: ${pageSlots.length} slots`);

    // ── FRONT (QR codes) ─────────────────────────────────────────
    // currentRow = writeSectionHeader(sheet, currentRow, `▶ RECTO — Page ${page + 1}/${totalPages} (QR codes)`);
    currentRow = writeFrontPage(sheet, currentRow, pageSlots, rows, cols, dims);

    // ── Separator ────────────────────────────────────────────────
    currentRow = writeSeparatorRow(sheet, currentRow);

    // ── BACK (label text, mirrored) ──────────────────────────────
    // currentRow = writeSectionHeader(sheet, currentRow, `◀ VERSO — Page ${page + 1}/${totalPages} (étiquettes) — retourner sur bord LONG`);
    currentRow = writeBackPage(sheet, currentRow, pageSlots, rows, cols, dims);

    // ── Separator between page pairs ─────────────────────────────
    currentRow = writeSeparatorRow(sheet, currentRow);
  }

  Logger.log(`[LABELS] ✅ All pages written. Total rows used: ${currentRow - 1}`);
}

// ────────────────────────────────────────────────────────────
// FRONT PAGE
// ────────────────────────────────────────────────────────────

/**
 * Writes the front page (QR codes only) into the sheet.
 * Returns the next available row index.
 *
 * @param {Sheet}    sheet     - Sheet
 * @param {number}   startRow  - First row to write (1-indexed)
 * @param {Object[]} slots     - Slots for this page (may be < rows×cols for last page)
 * @param {number}   rows      - Label rows
 * @param {number}   cols      - Label cols
 * @returns {number} Next row index after this page
 */
function writeFrontPage(sheet, startRow, slots, rows, cols, dims) {
  for (let r = 0; r < rows; r++) {
    const sheetRow = startRow + r;

    // Set row height dynamically
    sheet.setRowHeight(sheetRow, dims.rowHeight);

    for (let c = 0; c < cols; c++) {
      const idx  = r * cols + c;
      const cell = sheet.getRange(sheetRow, c + 1);

      // Style: white background, centered
      styleLabelCell(cell);

      if (idx < slots.length) {
        const slot = slots[idx];
        // IMAGE mode 4: custom size — must specify height AND width
        cell.setFormula(`=IMAGE("${slot.qrUrl}",4,${dims.qrSize},${dims.qrSize})`);
      }
      // Empty slots stay blank (white)
    }
  }

  // Draw outer border around the whole front page
  drawPageBorder(sheet, startRow, rows, cols);

  return startRow + rows;
}

// ────────────────────────────────────────────────────────────
// BACK PAGE (mirrored columns)
// ────────────────────────────────────────────────────────────

/**
 * Writes the back page (label text) with column mirroring for duplex printing.
 * Mirroring: slot at front col c → back col (cols-1-c)
 * So front [0,1,2] → back [2,1,0] (printed col positions stay aligned when flipped).
 *
 * @param {Sheet}    sheet     - Sheet
 * @param {number}   startRow  - First row to write (1-indexed)
 * @param {Object[]} slots     - Same slots as the corresponding front page
 * @param {number}   rows      - Label rows
 * @param {number}   cols      - Label cols
 * @returns {number} Next row index after this page
 */
function writeBackPage(sheet, startRow, slots, rows, cols, dims) {
  for (let r = 0; r < rows; r++) {
    const sheetRow = startRow + r;
    sheet.setRowHeight(sheetRow, dims.rowHeight);

    for (let c = 0; c < cols; c++) {
      // Mirror: front column c → back column (cols-1-c)
      const frontCol = (cols - 1) - c;
      const idx      = r * cols + frontCol;
      const cell     = sheet.getRange(sheetRow, c + 1);

      styleLabelCell(cell);

      if (idx < slots.length) {
        const slot = slots[idx];
        writeBackCellContent(cell, slot, dims.fontSize);
      }
    }
  }

  drawPageBorder(sheet, startRow, rows, cols);

  return startRow + rows;
}

/**
 * Writes the three lines of text in a back-page label cell.
 * Uses rich text to stack Route ID / Delivery ID / Part on separate lines.
 *
 * @param {Range}  cell - Single cell range
 * @param {Object} slot - { routeId, livraisonId, familleId, part, total }
 */
function writeBackCellContent(cell, slot, fontSize) {
  const routeDisplay    = formatRouteDisplay(slot.routeId);
  const deliveryDisplay = `F_${slot.familleId}`;
  const partDisplay     = `${slot.part} / ${slot.total}`;

  // Build multi-line string
  const text = `${routeDisplay}\n${deliveryDisplay}\n${partDisplay}`;

  cell.setValue(text);
  cell.setFontSize(fontSize);
  cell.setFontWeight('bold');
  cell.setFontColor('#000000');
  cell.setHorizontalAlignment('center');
  cell.setVerticalAlignment('middle');
  cell.setWrap(true);
}

// ============================================================
// HELPERS — FORMATTING
// ============================================================

/**
 * Applies base label cell style (white bg, centered, wrap).
 * @param {Range} cell
 */
function styleLabelCell(cell) {
  cell.setBackground('#FFFFFF');
  cell.setHorizontalAlignment('center');
  cell.setVerticalAlignment('middle');
  cell.setWrap(true);

  // Thin border on all sides
  const borderStyle = SpreadsheetApp.BorderStyle.SOLID;
  cell.setBorder(true, true, true, true, false, false, '#CCCCCC', borderStyle);
}

/**
 * Draws a thicker outer border around a block of rows×cols.
 * @param {Sheet}  sheet
 * @param {number} startRow - 1-indexed
 * @param {number} rows
 * @param {number} cols
 */
function drawPageBorder(sheet, startRow, rows, cols) {
  const range = sheet.getRange(startRow, 1, rows, cols);
  const thick = SpreadsheetApp.BorderStyle.SOLID_MEDIUM;
  range.setBorder(true, true, true, true, null, null, '#000000', thick);
}

/**
 * Sets all label column widths (done once at the start).
 * @param {Sheet}  sheet
 * @param {number} cols
 */
function setColumnWidths(sheet, cols, colWidth) {
  for (let c = 1; c <= cols; c++) {
    sheet.setColumnWidth(c, colWidth);
  }
}

/**
 * Writes a thin separator row and returns the next row index.
 * @param {Sheet}  sheet
 * @param {number} rowIndex - 1-indexed
 * @returns {number} Next row index
 */
function writeSeparatorRow(sheet, rowIndex) {
  sheet.setRowHeight(rowIndex, SEPARATOR_ROW_HEIGHT_PX);
  sheet.getRange(rowIndex, 1).setValue('');
  return rowIndex + 1;
}

/**
 * Writes a small section header row (e.g. "▶ RECTO — Page 1/3").
 * @param {Sheet}  sheet
 * @param {number} rowIndex - 1-indexed
 * @param {string} label
 * @returns {number} Next row index
 */
function writeSectionHeader(sheet, rowIndex, label) {
  sheet.setRowHeight(rowIndex, 18);
  const cell = sheet.getRange(rowIndex, 1);
  cell.setValue(label);
  cell.setFontSize(HEADER_FONT_SIZE);
  cell.setFontColor('#888888');
  cell.setFontStyle('italic');
  return rowIndex + 1;
}

// ============================================================
// HELPERS — IDs / URLs
// ============================================================

/**
 * Formats a route ID for display on the back label.
 * e.g. "R001" → "R_001", "R1" → "R_001"
 * @param {string} routeId
 * @returns {string}
 */
function formatRouteDisplay(routeId) {
  const num = String(routeId).replace(/^R0*/, '') || '0';
  return `R_${num.padStart(3, '0')}`;
}

/**
 * Builds the delivery confirmation URL (same logic as before).
 * @param {string} livraisonId
 * @param {string} routeId
 * @returns {string}
 */
function buildConfirmUrl(livraisonId, routeId) {
  const tokens = filterData(CONFIG.SHEETS.TOKENS, row => row.id_route === routeId);
  const token  = tokens.length > 0 ? tokens[0].token : '';
  const apiUrl = PropertiesService.getScriptProperties().getProperty('API_WEB_URL')
    || ScriptApp.getService().getUrl()
    || 'https://script.google.com';

  return `${apiUrl}?action=confirm_delivery&id_livraison=${encodeURIComponent(livraisonId)}&token=${encodeURIComponent(token)}`;
}

/**
 * Builds the QR code image URL using api.qrserver.com.
 * @param {string} content - URL to encode
 * @returns {string} Image URL
 */
function buildQrUrl(content) {
  const size = `${QR_SOURCE_SIZE_PX}x${QR_SOURCE_SIZE_PX}`;
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}&data=${encodeURIComponent(content)}`;
}

/**
 * Builds the spreadsheet name from date and occasion.
 * e.g. "20260215_zakat_el_fitr"
 * @param {Date}   date
 * @param {string} occasion
 * @returns {string}
 */
function buildSheetName(date, occasion) {
  const dateStr = Utilities.formatDate(date, CONFIG.TIMEZONE || 'Europe/Paris', 'yyyyMMdd');
  return `${dateStr}_${occasion}`;
}

// ============================================================
// ROUTES CONFIRMÉES (for the label form — unchanged API)
// ============================================================

/**
 * Returns confirmed/in-progress routes with delivery counts.
 * Called by the labelForm.html UI.
 * @returns {Array<Object>}
 */
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
      const deliveries    = getDeliveriesForRoute(route.id_route);
      const totalPersonnes = deliveries.reduce((sum, d) => sum + (parseInt(d.nombre_personnes) || 1), 0);
      return {
        id_route:          route.id_route,
        nombre_livraisons: deliveries.length,
        total_personnes:   totalPersonnes
      };
    });

  } catch (error) {
    Logger.log(`[LABELS] ❌ Error fetching routes: ${error.message}`);
    return [];
  }
}