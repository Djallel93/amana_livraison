/**
 * ====================================================================
 * DONATION_SERVICE.GS - Lecture des données de donations
 * ====================================================================
 */

/**
 * Retourne toutes les donations pour une date et une occasion données.
 * @param {string} date      - Format YYYY-MM-DD
 * @param {string} occasion  - Valeur de CONFIG.ENUMS.OCCASION
 * @returns {Array<Object>}
 */
function getDonationsForDate(date, occasion) {
    const cible = new Date(date);
    cible.setHours(0, 0, 0, 0);

    return filterData(CONFIG_SHEETS.SHEETS.DONATIONS, function (row) {
        if (!row.date) return false;
        if (row.occasion !== occasion) return false;

        const rowDate = new Date(row.date);
        rowDate.setHours(0, 0, 0, 0);
        return rowDate.getTime() === cible.getTime();
    });
}

/**
 * Calcule le poids total des donations pour une date et une occasion.
 * @param {string} date
 * @param {string} occasion
 * @returns {number} Poids total en kg
 */
function getTotalDonatedWeight(date, occasion) {
    const donations = getDonationsForDate(date, occasion);
    return donations.reduce(function (sum, row) {
        return sum + (parseFloat(row.poids_kg) || 0);
    }, 0);
}

/**
 * Retourne le nombre de donations pour une date et une occasion.
 * @param {string} date
 * @param {string} occasion
 * @returns {number}
 */
function countDonations(date, occasion) {
    return getDonationsForDate(date, occasion).length;
}