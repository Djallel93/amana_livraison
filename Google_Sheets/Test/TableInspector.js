/**
 * ====================================================================
 * TABLE_INSPECTOR.GS  —  Inspecte les tableaux du document actif
 * ====================================================================
 *
 * ▶ COMMENT L'UTILISER :
 *   1. Ouvre le document Google Docs qui contient ton tableau manuel
 *   2. Ouvre Apps Script (Extensions → Apps Script)
 *   3. Colle ce fichier dans un nouveau .gs
 *   4. Sélectionne "inspectAllTables" → ▶ Exécuter
 *   5. Lis les logs (View → Logs ou Ctrl+Entrée)
 *
 * Inspecte TOUS les tableaux du doc, avec pour chaque :
 *   - Dimensions du tableau (nb lignes × nb colonnes)
 *   - Pour chaque cellule : padding, alignement, couleur de fond
 *   - Pour chaque paragraphe : taille police, bold, alignement, spacing
 *   - Pour chaque image inline : largeur × hauteur
 * ====================================================================
 */

function inspectAllTables() {
  var doc = DocumentApp.getActiveDocument();
  var body = doc.getBody();

  var tables = [];
  for (var i = 0; i < body.getNumChildren(); i++) {
    var child = body.getChild(i);
    if (child.getType() === DocumentApp.ElementType.TABLE) {
      tables.push(child.asTable());
    }
  }

  if (tables.length === 0) {
    Logger.log("❌ Aucun tableau trouvé dans ce document.");
    return;
  }

  Logger.log("════════════════════════════════════════════════════");
  Logger.log("📋 TABLE INSPECTOR — " + tables.length + " tableau(x) trouvé(s)");
  Logger.log("════════════════════════════════════════════════════");

  tables.forEach(function (table, tableIdx) {
    inspectTable(table, tableIdx);
  });

  Logger.log("════════════════════════════════════════════════════");
  Logger.log("✅ Inspection terminée.");
}

// ============================================================
// INSPECTION D'UN TABLEAU
// ============================================================

function inspectTable(table, tableIdx) {
  var numRows = table.getNumRows();
  var numCols = numRows > 0 ? table.getRow(0).getNumCells() : 0;

  Logger.log("");
  Logger.log("┌─────────────────────────────────────────────────");
  Logger.log(
    "│ TABLEAU #" +
      tableIdx +
      "  (" +
      numRows +
      " lignes × " +
      numCols +
      " colonnes)",
  );
  Logger.log(
    "│ Border width : " +
      safeGet(function () {
        return table.getBorderWidth();
      }),
  );
  Logger.log(
    "│ Border color : " +
      safeGet(function () {
        return table.getBorderColor();
      }),
  );
  Logger.log("└─────────────────────────────────────────────────");

  // Inspecter seulement la première ligne ET la dernière si différente
  // (pour ne pas noyer les logs sur les grands tableaux)
  var rowsToInspect = [];
  if (numRows <= 3) {
    for (var r = 0; r < numRows; r++) rowsToInspect.push(r);
  } else {
    rowsToInspect = [0, 1, numRows - 1]; // première, deuxième, dernière
  }

  rowsToInspect.forEach(function (r) {
    var row = table.getRow(r);
    Logger.log("");
    Logger.log("  ── Ligne " + r + " ──────────────────────────────────");

    for (var c = 0; c < row.getNumCells(); c++) {
      inspectCell(row.getCell(c), r, c, "  ");
    }
  });

  if (numRows > 3) {
    Logger.log("");
    Logger.log(
      "  ... (" + (numRows - 3) + " ligne(s) intermédiaire(s) non affichées)",
    );
  }
}

// ============================================================
// INSPECTION D'UNE CELLULE
// ============================================================

function inspectCell(cell, r, c, indent) {
  Logger.log("");
  Logger.log(indent + "  ┌ Cellule [" + r + "][" + c + "]");
  Logger.log(
    indent +
      "  │  background   : " +
      safeGet(function () {
        return cell.getBackgroundColor();
      }),
  );
  Logger.log(
    indent +
      "  │  paddingTop    : " +
      safeGet(function () {
        return cell.getPaddingTop();
      }) +
      "pt",
  );
  Logger.log(
    indent +
      "  │  paddingBottom : " +
      safeGet(function () {
        return cell.getPaddingBottom();
      }) +
      "pt",
  );
  Logger.log(
    indent +
      "  │  paddingLeft   : " +
      safeGet(function () {
        return cell.getPaddingLeft();
      }) +
      "pt",
  );
  Logger.log(
    indent +
      "  │  paddingRight  : " +
      safeGet(function () {
        return cell.getPaddingRight();
      }) +
      "pt",
  );
  Logger.log(
    indent +
      "  │  verticalAlign : " +
      safeGet(function () {
        return cell.getVerticalAlignment();
      }),
  );
  Logger.log(
    indent +
      "  │  width         : " +
      safeGet(function () {
        return cell.getWidth();
      }) +
      "pt",
  );
  Logger.log(indent + "  │  numChildren   : " + cell.getNumChildren());

  // Parcourir les enfants (paragraphes, tableaux imbriqués)
  for (var i = 0; i < cell.getNumChildren(); i++) {
    var child = cell.getChild(i);
    var type = child.getType();

    if (type === DocumentApp.ElementType.PARAGRAPH) {
      inspectParagraph(child.asParagraph(), i, indent + "  ");
    } else if (type === DocumentApp.ElementType.TABLE) {
      Logger.log(
        indent + "  │  [" + i + "] Tableau imbriqué → inspection récursive",
      );
      inspectTable(child.asTable(), "imbriqué@[" + r + "][" + c + "]");
    } else {
      Logger.log(indent + "  │  [" + i + "] Élément type: " + type);
    }
  }
}

// ============================================================
// INSPECTION D'UN PARAGRAPHE
// ============================================================

function inspectParagraph(para, idx, indent) {
  var text = para.getText();
  var textShort = text.length > 30 ? text.substring(0, 30) + "…" : text;
  var textDisplay = text === "" ? "(vide)" : '"' + textShort + '"';

  Logger.log(indent + "  │  [§" + idx + "] " + textDisplay);
  Logger.log(
    indent +
      "  │       align        : " +
      safeGet(function () {
        return para.getAlignment();
      }),
  );
  Logger.log(
    indent +
      "  │       spacingBefore : " +
      safeGet(function () {
        return para.getSpacingBefore();
      }) +
      "pt",
  );
  Logger.log(
    indent +
      "  │       spacingAfter  : " +
      safeGet(function () {
        return para.getSpacingAfter();
      }) +
      "pt",
  );
  Logger.log(
    indent +
      "  │       lineSpacing   : " +
      safeGet(function () {
        return para.getLineSpacing();
      }),
  );
  Logger.log(
    indent +
      "  │       fontSize      : " +
      safeGet(function () {
        return para.editAsText().getFontSize(0);
      }) +
      "pt",
  );
  Logger.log(
    indent +
      "  │       bold          : " +
      safeGet(function () {
        return para.editAsText().isBold(0);
      }),
  );
  Logger.log(
    indent +
      "  │       color         : " +
      safeGet(function () {
        return para.editAsText().getForegroundColor(0);
      }),
  );

  // Images inline dans ce paragraphe
  for (var i = 0; i < para.getNumChildren(); i++) {
    var child = para.getChild(i);
    if (child.getType() === DocumentApp.ElementType.INLINE_IMAGE) {
      var img = child.asInlineImage();
      Logger.log(
        indent +
          "  │       [img] width=" +
          img.getWidth() +
          "px  height=" +
          img.getHeight() +
          "px",
      );
    }
  }
}

// ============================================================
// HELPER — évite que les exceptions cassent l'inspection
// ============================================================

function safeGet(fn) {
  try {
    var val = fn();
    return val === null || val === undefined ? "(null)" : val;
  } catch (e) {
    return "(erreur: " + e.message + ")";
  }
}
