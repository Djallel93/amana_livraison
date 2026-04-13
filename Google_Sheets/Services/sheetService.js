/**
 * 📝 Update a specific cell by finding the row with a matching ID
 */
function updateCellByRowId(
  sheetName,
  idValue,
  idColumnName,
  targetColumnName,
  newValue,
) {
  try {
    const sheet = getSheet(sheetName);
    const headers = sheet
      .getRange(1, 1, 1, sheet.getLastColumn())
      .getValues()[0];

    // Find column indices
    const idColIndex = headers.indexOf(idColumnName);
    const targetColIndex = headers.indexOf(targetColumnName);

    if (idColIndex === -1) {
      throw new Error(`Column "${idColumnName}" not found in ${sheetName}`);
    }
    if (targetColIndex === -1) {
      throw new Error(`Column "${targetColumnName}" not found in ${sheetName}`);
    }

    // Find the row with matching ID
    const dataRange = sheet.getRange(
      2,
      idColIndex + 1,
      sheet.getLastRow() - 1,
      1,
    );
    const ids = dataRange.getValues();

    let rowIndex = -1;
    for (let i = 0; i < ids.length; i++) {
      if (ids[i][0] === idValue) {
        rowIndex = i + 2; // +2 because: +1 for header, +1 for 0-based index
        break;
      }
    }

    if (rowIndex === -1) {
      Logger.log(`[SHEETS] ⚠️ ID "${idValue}" not found in ${sheetName}`);
      return false;
    }

    // Update the cell
    sheet.getRange(rowIndex, targetColIndex + 1).setValue(newValue);
    Logger.log(
      `[SHEETS] ✅ Updated ${sheetName} row ${rowIndex}, column "${targetColumnName}" to: ${newValue}`,
    );

    return true;
  } catch (error) {
    Logger.log(`[SHEETS] ❌ Error updating cell: ${error.message}`);
    return false;
  }
}
