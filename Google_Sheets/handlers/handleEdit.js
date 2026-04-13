/**
 * onEdit installable trigger — watches statut_conditionnement column in Livraison sheet.
 * @param {Object} e - Apps Script edit event
 */
function onEditConditionnement(e) {
  const range = e.range;
  const sheet = range.getSheet();

  if (sheet.getName() !== CONFIG.SHEETS.LIVRAISON) return;
  if (range.getColumn() !== CONFIG.COLUMNS.LIVRAISON.STATUT_CONDITIONNEMENT)
    return;
  if (range.getValue() !== CONFIG.ENUMS.STATUT_CONDITIONNEMENT.PRETE) return;

  const livraisonId = sheet
    .getRange(range.getRow(), CONFIG.COLUMNS.LIVRAISON.ID_LIVRAISON)
    .getValue();
  if (!livraisonId) return;

  Logger.log(
    `[CONDITIONNEMENT] ✏️ Édition manuelle détectée — ${livraisonId} → Prête`,
  );
  _processConditionnementPrete(livraisonId);
}
