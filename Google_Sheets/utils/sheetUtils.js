/**
 * ====================================================================
 * SHEET_UTILS.GS - Utilitaires Google Sheets
 * ====================================================================
 */

/**
 * Obtient la feuille active du spreadsheet
 * @param {string} sheetName - Nom de la feuille
 * @returns {Sheet} L'objet Sheet
 * @throws {Error} Si la feuille n'existe pas
 */
function getSheet(sheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    throw new Error(`La feuille "${sheetName}" n'existe pas dans le spreadsheet`);
  }

  return sheet;
}

/**
 * Crée une nouvelle feuille si elle n'existe pas
 * @param {string} sheetName - Nom de la feuille
 * @param {Array<string>} headers - En-têtes des colonnes
 * @returns {Sheet} L'objet Sheet
 */
function createSheetIfNotExists(sheetName, headers = []) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);

    // Ajouter les en-têtes si fournis
    if (headers.length > 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }

    Logger.log(`[SHEETS] ✅ Feuille créée: ${sheetName}`);
  }

  return sheet;
}

/**
 * Obtient toutes les données d'une feuille (sans en-tête)
 * @param {string} sheetName - Nom de la feuille
 * @returns {Array<Array>} Tableau 2D des données
 */
function getAllData(sheetName) {
  const sheet = getSheet(sheetName);
  const lastRow = sheet.getLastRow();

  if (lastRow <= 1) {
    return []; // Pas de données (seulement l'en-tête)
  }

  return sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
}

/**
 * Obtient toutes les données avec en-têtes sous forme d'objets
 * @param {string} sheetName - Nom de la feuille
 * @returns {Array<Object>} Tableau d'objets
 */
function getAllDataAsObjects(sheetName) {
  const sheet = getSheet(sheetName);
  const lastRow = sheet.getLastRow();

  if (lastRow <= 1) {
    return [];
  }

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();

  return data.map(row => {
    const obj = {};
    headers.forEach((header, index) => {
      obj[header] = row[index];
    });
    return obj;
  });
}

/**
 * Ajoute une nouvelle ligne à la fin de la feuille
 * @param {string} sheetName - Nom de la feuille
 * @param {Array} rowData - Données de la ligne
 * @returns {number} Index de la ligne ajoutée
 */
function appendRow(sheetName, rowData) {
  const sheet = getSheet(sheetName);
  sheet.appendRow(rowData);

  const lastRow = sheet.getLastRow();
  Logger.log(`[SHEETS] ✅ Ligne ajoutée dans ${sheetName} à l'index ${lastRow}`);

  return lastRow;
}

/**
 * Ajoute plusieurs lignes à la fin de la feuille
 * @param {string} sheetName - Nom de la feuille
 * @param {Array<Array>} rowsData - Tableau de lignes
 * @returns {number} Nombre de lignes ajoutées
 */
function appendRows(sheetName, rowsData) {
  if (rowsData.length === 0) return 0;

  const sheet = getSheet(sheetName);
  const startRow = sheet.getLastRow() + 1;

  sheet.getRange(startRow, 1, rowsData.length, rowsData[0].length).setValues(rowsData);

  Logger.log(`[SHEETS] ✅ ${rowsData.length} lignes ajoutées dans ${sheetName}`);

  return rowsData.length;
}

/**
 * Met à jour une ligne existante
 * @param {string} sheetName - Nom de la feuille
 * @param {number} rowIndex - Index de la ligne (commence à 1)
 * @param {Array} rowData - Nouvelles données
 */
function updateRow(sheetName, rowIndex, rowData) {
  const sheet = getSheet(sheetName);
  sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);

  Logger.log(`[SHEETS] ✅ Ligne ${rowIndex} mise à jour dans ${sheetName}`);
}

/**
 * Met à jour une cellule spécifique
 * @param {string} sheetName - Nom de la feuille
 * @param {number} row - Index de la ligne
 * @param {number} col - Index de la colonne
 * @param {*} value - Nouvelle valeur
 */
function updateCell(sheetName, row, col, value) {
  const sheet = getSheet(sheetName);
  sheet.getRange(row, col).setValue(value);

  Logger.log(`[SHEETS] ✅ Cellule (${row},${col}) mise à jour dans ${sheetName}`);
}

/**
 * Supprime une ligne
 * @param {string} sheetName - Nom de la feuille
 * @param {number} rowIndex - Index de la ligne
 */
function deleteRow(sheetName, rowIndex) {
  const sheet = getSheet(sheetName);
  sheet.deleteRow(rowIndex);

  Logger.log(`[SHEETS] ✅ Ligne ${rowIndex} supprimée de ${sheetName}`);
}

/**
 * Trouve une ligne par valeur dans une colonne spécifique
 * @param {string} sheetName - Nom de la feuille
 * @param {number} colIndex - Index de la colonne (commence à 1)
 * @param {*} value - Valeur à rechercher
 * @returns {number|null} Index de la ligne ou null si non trouvé
 */
function findRowByValue(sheetName, colIndex, value) {
  const sheet = getSheet(sheetName);
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) { // Commence à 1 pour sauter l'en-tête
    if (data[i][colIndex - 1] === value) {
      return i + 1; // +1 car les indices Google Sheets commencent à 1
    }
  }

  return null;
}

/**
 * Trouve toutes les lignes qui correspondent à un critère
 * @param {string} sheetName - Nom de la feuille
 * @param {number} colIndex - Index de la colonne
 * @param {*} value - Valeur à rechercher
 * @returns {Array<number>} Indices des lignes trouvées
 */
function findAllRowsByValue(sheetName, colIndex, value) {
  const sheet = getSheet(sheetName);
  const data = sheet.getDataRange().getValues();
  const rowIndices = [];

  for (let i = 1; i < data.length; i++) {
    if (data[i][colIndex - 1] === value) {
      rowIndices.push(i + 1);
    }
  }

  return rowIndices;
}

/**
 * Filtre les données selon un prédicat
 * @param {string} sheetName - Nom de la feuille
 * @param {Function} predicate - Fonction de filtrage (row => boolean)
 * @returns {Array<Object>} Lignes filtrées avec leurs indices
 */
function filterData(sheetName, predicate) {
  const sheet = getSheet(sheetName);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const data = getAllData(sheetName);

  return data
    .map((row, index) => {
      const obj = {};
      headers.forEach((header, colIndex) => {
        obj[header] = row[colIndex];
      });
      obj._rowIndex = index + 2; // +2 car on saute l'en-tête et les indices commencent à 1
      return obj;
    })
    .filter(predicate);
}

/**
 * Génère le prochain ID avec préfixe
 * @param {string} sheetName - Nom de la feuille
 * @param {string} prefix - Préfixe (ex: 'L', 'R', 'E')
 * @param {number} colIndex - Index de la colonne contenant les IDs
 * @returns {string} Nouvel ID (ex: 'L001', 'R042')
 */
function generateNextId(sheetName, prefix, colIndex) {
  const sheet = getSheet(sheetName);
  const data = getAllData(sheetName);

  if (data.length === 0) {
    return `${prefix}001`; // Premier ID
  }

  // Extraire les numéros existants
  const numbers = data
    .map(row => row[colIndex - 1])
    .filter(id => id && typeof id === 'string' && id.startsWith(prefix))
    .map(id => parseInt(id.substring(prefix.length)))
    .filter(num => !isNaN(num));

  const maxNumber = numbers.length > 0 ? Math.max(...numbers) : 0;
  const nextNumber = maxNumber + 1;

  // Formater avec padding (ex: 001, 042)
  return `${prefix}${String(nextNumber).padStart(3, '0')}`;
}

/**
 * Vérifie si un ID existe déjà
 * @param {string} sheetName - Nom de la feuille
 * @param {string} id - ID à vérifier
 * @param {number} colIndex - Index de la colonne des IDs
 * @returns {boolean}
 */
function idExists(sheetName, id, colIndex) {
  return findRowByValue(sheetName, colIndex, id) !== null;
}

/**
 * Compte le nombre de lignes correspondant à un critère
 * @param {string} sheetName - Nom de la feuille
 * @param {number} colIndex - Index de la colonne
 * @param {*} value - Valeur à compter
 * @returns {number}
 */
function countRowsByValue(sheetName, colIndex, value) {
  return findAllRowsByValue(sheetName, colIndex, value).length;
}

/**
 * Obtient une ligne complète par ID
 * @param {string} sheetName - Nom de la feuille
 * @param {string} id - ID à rechercher
 * @param {number} idColIndex - Index de la colonne des IDs
 * @returns {Object|null} Objet avec les données de la ligne ou null
 */
function getRowById(sheetName, id, idColIndex) {
  const rowIndex = findRowByValue(sheetName, idColIndex, id);

  if (!rowIndex) {
    return null;
  }

  const sheet = getSheet(sheetName);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const rowData = sheet.getRange(rowIndex, 1, 1, sheet.getLastColumn()).getValues()[0];

  const obj = { _rowIndex: rowIndex };
  headers.forEach((header, index) => {
    obj[header] = rowData[index];
  });

  return obj;
}

/**
 * Met à jour une ligne par ID
 * @param {string} sheetName - Nom de la feuille
 * @param {string} id - ID de la ligne
 * @param {number} idColIndex - Index de la colonne des IDs
 * @param {Object} updates - Objet avec les colonnes à mettre à jour
 * @returns {boolean} true si mise à jour réussie
 */
function updateRowById(sheetName, id, idColIndex, updates) {
  const rowIndex = findRowByValue(sheetName, idColIndex, id);

  if (!rowIndex) {
    Logger.log(`[SHEETS] ⚠️ ID ${id} non trouvé dans ${sheetName}`);
    return false;
  }

  const sheet = getSheet(sheetName);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  // Mettre à jour chaque colonne spécifiée
  Object.entries(updates).forEach(([columnName, value]) => {
    const colIndex = headers.indexOf(columnName);
    if (colIndex !== -1) {
      updateCell(sheetName, rowIndex, colIndex + 1, value);
    }
  });

  Logger.log(`[SHEETS] ✅ Ligne avec ID ${id} mise à jour dans ${sheetName}`);
  return true;
}

/**
 * Supprime une ligne par ID
 * @param {string} sheetName - Nom de la feuille
 * @param {string} id - ID de la ligne
 * @param {number} idColIndex - Index de la colonne des IDs
 * @returns {boolean} true si suppression réussie
 */
function deleteRowById(sheetName, id, idColIndex) {
  const rowIndex = findRowByValue(sheetName, idColIndex, id);

  if (!rowIndex) {
    Logger.log(`[SHEETS] ⚠️ ID ${id} non trouvé dans ${sheetName}`);
    return false;
  }

  deleteRow(sheetName, rowIndex);
  Logger.log(`[SHEETS] ✅ Ligne avec ID ${id} supprimée de ${sheetName}`);
  return true;
}

/**
 * Efface toutes les données d'une feuille (garde l'en-tête)
 * @param {string} sheetName - Nom de la feuille
 */
function clearAllData(sheetName) {
  const sheet = getSheet(sheetName);
  const lastRow = sheet.getLastRow();

  if (lastRow > 1) {
    sheet.deleteRows(2, lastRow - 1);
    Logger.log(`[SHEETS] ✅ Toutes les données effacées de ${sheetName}`);
  }
}

/**
 * Trie une feuille par colonne
 * @param {string} sheetName - Nom de la feuille
 * @param {number} colIndex - Index de la colonne de tri
 * @param {boolean} ascending - true pour ordre croissant
 */
function sortSheetByColumn(sheetName, colIndex, ascending = true) {
  const sheet = getSheet(sheetName);
  const lastRow = sheet.getLastRow();

  if (lastRow <= 1) return; // Pas de données à trier

  const range = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn());
  range.sort({ column: colIndex, ascending: ascending });

  Logger.log(`[SHEETS] ✅ ${sheetName} trié par colonne ${colIndex}`);
}

/**
 * Obtient les valeurs d'une colonne spécifique
 * @param {string} sheetName - Nom de la feuille
 * @param {number} colIndex - Index de la colonne
 * @param {boolean} skipHeader - Sauter l'en-tête
 * @returns {Array} Valeurs de la colonne
 */
function getColumnValues(sheetName, colIndex, skipHeader = true) {
  const sheet = getSheet(sheetName);
  const lastRow = sheet.getLastRow();

  const startRow = skipHeader ? 2 : 1;
  const numRows = skipHeader ? lastRow - 1 : lastRow;

  if (numRows <= 0) return [];

  return sheet.getRange(startRow, colIndex, numRows, 1).getValues().flat();
}

/**
 * Obtient les valeurs uniques d'une colonne
 * @param {string} sheetName - Nom de la feuille
 * @param {number} colIndex - Index de la colonne
 * @returns {Array} Valeurs uniques
 */
function getUniqueColumnValues(sheetName, colIndex) {
  const values = getColumnValues(sheetName, colIndex, true);
  return [...new Set(values.filter(v => v !== ''))];
}
