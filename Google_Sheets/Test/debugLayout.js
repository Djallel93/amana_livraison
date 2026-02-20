/**
 * LABEL_LAYOUT_TEST.GS
 * ▶ Sélectionner "testLabelLayout" → Exécuter → lien dans les logs
 */

var TEST_ROWS = 5;
var TEST_COLS = 3;

var TEST_DIMS = {
    qrPx: 110,
    fontIdPt: 18,
    fontPartPt: 12,
    spacingPt: 7,
};

var PHANTOM_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYGAAAAAEAAH2FzhVAAAAAElFTkSuQmCC';

function makePhantomBlob() {
    return Utilities.newBlob(Utilities.base64Decode(PHANTOM_B64), 'image/png', 'phantom.png');
}

// Supprime tous les §vides parasites au début d'une cellule (lineSpacing:1.15)
// Doit être appelé APRÈS appendTable/appendTableCell, AVANT d'ajouter du contenu
function clearParasites(cell) {
    while (cell.getNumChildren() > 0) {
        var ch = cell.getChild(0);
        if (ch.getType() === DocumentApp.ElementType.PARAGRAPH && ch.asParagraph().getText() === '') {
            ch.removeFromParent();
        } else {
            break;
        }
    }
}

// ============================================================
function testLabelLayout() {
    var dims = TEST_DIMS;
    Logger.log('TEST ' + TEST_ROWS + 'x' + TEST_COLS + ' — QR:' + dims.qrPx + 'px font:' + dims.fontIdPt + 'pt sp:' + dims.spacingPt + 'pt');

    var existing = DriveApp.getFilesByName('TEST_Label_Layout');
    while (existing.hasNext()) existing.next().setTrashed(true);

    var doc = DocumentApp.create('TEST_Label_Layout');
    var body = doc.getBody();
    body.setMarginTop(15).setMarginBottom(15).setMarginLeft(15).setMarginRight(15);

    var labels = buildFakeLabels(TEST_ROWS * TEST_COLS);
    var phantomBlob = makePhantomBlob();

    Logger.log('Telechargement ' + labels.length + ' QR...');
    var qrBlobs = labels.map(function (lb) { return fetchQr(lb.url, dims.qrPx); });
    Logger.log('QR OK');

    body.appendParagraph('RECTO').setFontSize(8).setForegroundColor('#999999').setSpacingBefore(0).setSpacingAfter(4);
    buildRectoTable(body, labels, dims, phantomBlob);

    body.appendPageBreak();
    body.appendParagraph('VERSO').setFontSize(8).setForegroundColor('#7EA6D0').setSpacingBefore(0).setSpacingAfter(4);
    buildVersoTable(body, labels, dims, qrBlobs);

    doc.saveAndClose();
    Logger.log('OK : https://docs.google.com/document/d/' + doc.getId() + '/edit');
}

// ============================================================
// RECTO
// ============================================================

function buildRectoTable(body, labels, dims, phantomBlob) {
    var rows = TEST_ROWS, cols = TEST_COLS;
    var table = body.appendTable();
    table.setBorderWidth(1).setBorderColor('#333333');

    for (var r = 0; r < rows; r++) {
        var row = table.appendTableRow();
        for (var c = 0; c < cols; c++) {
            var idx = r * cols + c;
            var cell = row.appendTableCell();
            cell.setPaddingTop(0).setPaddingBottom(0).setPaddingLeft(0).setPaddingRight(0);
            clearParasites(cell);  // supprime §vide auto lineSpacing:1.15
            fillRectoCell(cell, idx < labels.length ? labels[idx] : null, dims, phantomBlob);
        }
    }
}

function fillRectoCell(outerCell, label, dims, phantomBlob) {
    var sp = dims.spacingPt;

    var inner = outerCell.appendTable();
    inner.setBorderWidth(0);
    var innerRow = inner.appendTableRow();

    // ── GAUCHE : R_001 ──
    var lc = innerRow.appendTableCell();
    clearParasites(lc);  // <-- clé du fix
    lc.setBackgroundColor('#000000');
    lc.setVerticalAlignment(DocumentApp.VerticalAlignment.CENTER);
    lc.setPaddingTop(sp).setPaddingBottom(sp).setPaddingLeft(sp + 2).setPaddingRight(sp);
    var pL = lc.appendParagraph(label ? label.route : '');
    pL.setAlignment(DocumentApp.HorizontalAlignment.LEFT).setSpacingBefore(0).setSpacingAfter(0).setLineSpacing(100);
    pL.editAsText().setFontSize(dims.fontIdPt).setBold(true).setForegroundColor('#FFFFFF');

    // ── CENTRE : fantôme invisible + F_12345 ──
    var cc = innerRow.appendTableCell();
    clearParasites(cc);  // <-- clé du fix
    cc.setBackgroundColor('#000000');
    cc.setVerticalAlignment(DocumentApp.VerticalAlignment.CENTER);
    cc.setPaddingTop(sp).setPaddingBottom(sp).setPaddingLeft(sp).setPaddingRight(sp);

    var pGhost = cc.appendParagraph('');
    pGhost.setAlignment(DocumentApp.HorizontalAlignment.CENTER).setSpacingBefore(0).setSpacingAfter(0).setLineSpacing(100);
    var ghost = pGhost.appendInlineImage(phantomBlob);
    ghost.setWidth(dims.qrPx).setHeight(dims.qrPx);

    var pFam = cc.appendParagraph(label ? label.famille : '');
    pFam.setAlignment(DocumentApp.HorizontalAlignment.CENTER).setSpacingBefore(0).setSpacingAfter(0).setLineSpacing(100);
    pFam.editAsText().setFontSize(dims.fontIdPt).setBold(true).setForegroundColor('#FFFFFF');

    // ── DROITE : 1/3 aligné en bas ──
    var rc = innerRow.appendTableCell();
    clearParasites(rc);  // <-- clé du fix
    rc.setBackgroundColor('#000000');
    rc.setVerticalAlignment(DocumentApp.VerticalAlignment.BOTTOM);
    rc.setPaddingTop(sp).setPaddingBottom(sp).setPaddingLeft(sp).setPaddingRight(sp + 2);
    var pR = rc.appendParagraph(label ? label.part : '');
    pR.setAlignment(DocumentApp.HorizontalAlignment.CENTER).setSpacingBefore(0).setSpacingAfter(0).setLineSpacing(100);
    pR.editAsText().setFontSize(dims.fontPartPt).setBold(false).setForegroundColor('#FFFFFF');
}

// ============================================================
// VERSO
// ============================================================

function buildVersoTable(body, labels, dims, qrBlobs) {
    var rows = TEST_ROWS, cols = TEST_COLS, sp = dims.spacingPt;
    var table = body.appendTable();
    table.setBorderWidth(1).setBorderColor('#333333');

    for (var r = 0; r < rows; r++) {
        var row = table.appendTableRow();
        for (var c = 0; c < cols; c++) {
            var mirrorC = (cols - 1) - c;
            var idx = r * cols + mirrorC;
            var cell = row.appendTableCell();
            clearParasites(cell);
            cell.setPaddingTop(sp).setPaddingBottom(sp).setPaddingLeft(sp).setPaddingRight(sp);
            fillVersoCell(cell, idx < labels.length ? qrBlobs[idx] : null, dims);
        }
    }
}

function fillVersoCell(cell, qrBlob, dims) {
    var pQr = cell.appendParagraph('');
    pQr.setAlignment(DocumentApp.HorizontalAlignment.CENTER).setSpacingBefore(0).setSpacingAfter(0).setLineSpacing(100);
    if (qrBlob) {
        var img = pQr.appendInlineImage(qrBlob);
        img.setWidth(dims.qrPx).setHeight(dims.qrPx);
    } else {
        pQr.appendText('[QR ' + dims.qrPx + 'px]').setFontSize(dims.fontPartPt).setForegroundColor('#AAAAAA');
    }
    var pScan = cell.appendParagraph('Scan pour confirmer');
    pScan.setAlignment(DocumentApp.HorizontalAlignment.CENTER).setSpacingBefore(0).setSpacingAfter(0).setLineSpacing(100);
    pScan.editAsText().setFontSize(dims.fontPartPt).setForegroundColor('#555555');
}

// ============================================================
// HELPERS
// ============================================================

function fetchQr(url, sizePx) {
    try {
        var resp = UrlFetchApp.fetch(
            'https://api.qrserver.com/v1/create-qr-code/?size=' + sizePx + 'x' + sizePx + '&data=' + encodeURIComponent(url),
            { muteHttpExceptions: true }
        );
        return resp.getResponseCode() === 200 ? resp.getBlob() : null;
    } catch (e) { return null; }
}

function buildFakeLabels(n) {
    var routes = ['R_001', 'R_002', 'R_003'], result = [];
    for (var i = 0; i < n; i++) {
        var total = (i % 3) + 1, part = (i % total) + 1;
        result.push({ route: routes[i % 3], famille: 'F_' + (10000 + i), part: part + '/' + total, url: 'https://example.com/confirm?id=' + i });
    }
    return result;
}