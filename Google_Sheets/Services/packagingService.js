/**
 * ====================================================================
 * PACKAGING_SERVICE.GS - Feuille de Conditionnement
 * ====================================================================
 */

const PACKAGING_QR_SIZE_PX = 200;
const PACKAGING_COL_WIDTH = 120;
const PACKAGING_ROW_HEIGHT = 110;
const PACKAGING_HEADER_H = 30;

/**
 * Point d'entrée appelé depuis le formulaire HTML.
 * @param {Object} params - { date, occasion }
 * @returns {Object} { success, url, count, errors }
 */
function generatePackagingSheet(params) {
    Logger.log(`[CONDITIONNEMENT] 🚀 Génération pour ${params.date} / ${params.occasion}`);

    const result = { success: false, url: '', count: 0, errors: [] };

    try {
        const apiWebUrl = PropertiesService.getScriptProperties().getProperty('API_WEB_URL') || '';
        if (!apiWebUrl) {
            result.errors.push('API_WEB_URL non configurée (Menu > Configuration > Configurer API Web)');
            return result;
        }

        const livraisons = _getLivraisonsForPackaging(params.date, params.occasion);
        Logger.log(`[CONDITIONNEMENT] 📦 ${livraisons.length} livraisons trouvées`);

        if (livraisons.length === 0) {
            result.errors.push('Aucune livraison trouvée pour cette date et cette occasion');
            return result;
        }

        const sheetName = `packaging_${params.date.replace(/-/g, '')}_${params.occasion}`;
        const ss = _createOrReplaceSheet(sheetName);
        const sheet = ss.getActiveSheet();

        _writePackagingSheet(sheet, livraisons, apiWebUrl);

        result.url = ss.getUrl();
        result.count = livraisons.length;
        result.success = true;

        Logger.log(`[CONDITIONNEMENT] ✅ Feuille créée: ${result.url}`);
        return result;

    } catch (err) {
        Logger.log(`[CONDITIONNEMENT] ❌ Erreur critique: ${err.message}`);
        result.errors.push(`Erreur critique: ${err.message}`);
        return result;
    }
}

/**
 * Filtre les livraisons par date et type_aide (= occasion).
 */
function _getLivraisonsForPackaging(date, occasion) {
    const cible = new Date(date);
    cible.setHours(0, 0, 0, 0);

    return filterData(CONFIG.SHEETS.LIVRAISON, function (row) {
        if (!row.disponibilite_debut) return false;

        const d = new Date(row.disponibilite_debut);
        d.setHours(0, 0, 0, 0);
        if (d.getTime() !== cible.getTime()) return false;

        if (row.type_aide !== occasion) return false;

        return row.statut !== CONFIG.ENUMS.STATUT_LIVRAISON.ANNULEE;
    });
}

/**
 * Crée ou recrée le Google Sheet de conditionnement dans le dossier Routes.
 */
function _createOrReplaceSheet(name) {
    const folder = getRoutesFolder();
    const existing = folder.getFilesByName(name);

    while (existing.hasNext()) {
        existing.next().setTrashed(true);
        Logger.log(`[CONDITIONNEMENT] 🗑️ Ancienne feuille supprimée: ${name}`);
    }

    const ss = SpreadsheetApp.create(name);
    const file = DriveApp.getFileById(ss.getId());
    folder.addFile(file);
    DriveApp.getRootFolder().removeFile(file);

    Logger.log(`[CONDITIONNEMENT] ✅ Feuille créée: ${name}`);
    return ss;
}

/**
 * Écrit les en-têtes et les données dans la feuille.
 */
function _writePackagingSheet(sheet, livraisons, apiWebUrl) {
    const headers = [
        'ID Livraison', 'Hôtel', 'Nb Personnes', 'Avec Enfant', 'Besoins Spéciaux', 'QR Code'
    ];

    const COL_COUNT = headers.length;

    // Largeurs de colonnes
    sheet.setColumnWidth(1, 110);
    sheet.setColumnWidth(2, 70);
    sheet.setColumnWidth(3, 90);
    sheet.setColumnWidth(4, 90);
    sheet.setColumnWidth(5, 220);
    sheet.setColumnWidth(6, PACKAGING_COL_WIDTH);

    // En-tête
    sheet.setRowHeight(1, PACKAGING_HEADER_H);
    const headerRange = sheet.getRange(1, 1, 1, COL_COUNT);
    headerRange.setValues([headers]);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#2d3748');
    headerRange.setFontColor('#ffffff');
    headerRange.setHorizontalAlignment('center');
    headerRange.setVerticalAlignment('middle');

    // Lignes de données
    for (let i = 0; i < livraisons.length; i++) {
        const liv = livraisons[i];
        const rowIndex = i + 2;

        sheet.setRowHeight(rowIndex, PACKAGING_ROW_HEIGHT);

        const qrUrl = _buildPackagingQrUrl(liv.id_livraison, apiWebUrl);
        const qrFormula = `=IMAGE("${qrUrl}",4,${PACKAGING_QR_SIZE_PX - 20},${PACKAGING_QR_SIZE_PX - 20})`;

        const rowData = [
            liv.id_livraison,
            liv.hotel === true || liv.hotel === 'TRUE' ? '✓' : '',
            liv.nombre_personnes || 0,
            liv.avec_enfant === true || liv.avec_enfant === 'TRUE' ? '✓' : '',
            liv.besoins_speciaux || ''
        ];

        const dataRange = sheet.getRange(rowIndex, 1, 1, COL_COUNT - 1);
        dataRange.setValues([rowData]);
        dataRange.setVerticalAlignment('middle');

        const bgColor = i % 2 === 0 ? '#ffffff' : '#f7fafc';
        sheet.getRange(rowIndex, 1, 1, COL_COUNT).setBackground(bgColor);

        // QR code dans la dernière colonne
        sheet.getRange(rowIndex, COL_COUNT).setFormula(qrFormula);
        sheet.getRange(rowIndex, COL_COUNT).setHorizontalAlignment('center');
        sheet.getRange(rowIndex, COL_COUNT).setVerticalAlignment('middle');

        // Colonne statut_conditionnement : colorer si déjà Prête
        if (liv.statut_conditionnement === CONFIG.ENUMS.STATUT_CONDITIONNEMENT.PRETE) {
            sheet.getRange(rowIndex, 1, 1, COL_COUNT).setBackground('#c6f6d5');
        }
    }

    // Bordures globales
    const fullRange = sheet.getRange(1, 1, livraisons.length + 1, COL_COUNT);
    fullRange.setBorder(true, true, true, true, true, true, '#e2e8f0', SpreadsheetApp.BorderStyle.SOLID);

    // Figer la ligne d'en-tête
    sheet.setFrozenRows(1);

    Logger.log(`[CONDITIONNEMENT] ✅ ${livraisons.length} lignes écrites`);
}

/**
 * Construit l'URL encodée dans le QR code de conditionnement.
 * Pas de token requis — endpoint ouvert pour l'équipe interne.
 */
function _buildPackagingQrUrl(livraisonId, apiWebUrl) {
    const url = `${apiWebUrl}?action=update_stop_status&id_livraison=${encodeURIComponent(livraisonId)}&statut=${encodeURIComponent(CONFIG.ENUMS.STATUT_CONDITIONNEMENT.PRETE)}`;
    return `https://api.qrserver.com/v1/create-qr-code/?size=${PACKAGING_QR_SIZE_PX}x${PACKAGING_QR_SIZE_PX}&data=${encodeURIComponent(url)}`;
}

/**
 * Vérifie si toutes les livraisons d'une route ont statut_conditionnement = Prête.
 * @param {string} routeId
 * @returns {boolean}
 */
function toutesLivraisonsPretes(routeId) {
    const stops = getDeliveryStopsForRoute(routeId);

    if (stops.length === 0) return false;

    for (const stop of stops) {
        const livraison = getDeliveryById(stop.id_livraison);
        if (!livraison) return false;
        if (livraison.statut_conditionnement !== CONFIG.ENUMS.STATUT_CONDITIONNEMENT.PRETE) {
            return false;
        }
    }

    return true;
}

/**
 * Passe une route au statut Prête et envoie l'email au bénévole.
 * @param {string} routeId
 */
function passerRouteEnPrete(routeId) {
    Logger.log(`[CONDITIONNEMENT] 🟢 Route ${routeId} → Prête`);

    updateRouteStatus(routeId, CONFIG.ENUMS.STATUT_ROUTE.PRETE);

    try {
        const apiWebUrl = PropertiesService.getScriptProperties().getProperty('API_WEB_URL') || '';
        const adminPhone = PropertiesService.getScriptProperties().getProperty('ADMIN_PHONE') || '';

        if (!apiWebUrl) {
            Logger.log(`[CONDITIONNEMENT] ⚠️ API_WEB_URL non configurée — email non envoyé`);
            return;
        }

        sendRouteEmail(routeId, apiWebUrl, adminPhone);
        Logger.log(`[CONDITIONNEMENT] 📧 Email envoyé au bénévole pour route ${routeId}`);

    } catch (err) {
        Logger.log(`[CONDITIONNEMENT] ❌ Erreur envoi email route ${routeId}: ${err.message}`);
    }
}