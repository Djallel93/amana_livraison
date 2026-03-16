/**
 * ====================================================================
 * DRIVE_UTILS.GS - Utilitaires Google Drive
 * ====================================================================
 * Structure :
 *   Routes/
 *     └── YYYYMMDD_occasion/
 *           ├── Labels_...
 *           ├── packaging_...
 *           └── RouteID_Benevole
 */

/**
 * Récupère ou crée le dossier racine "Routes".
 * @returns {GoogleAppsScript.Drive.Folder}
 */
function getRoutesFolder() {
    const NOM_RACINE = (CONFIG.DRIVE && CONFIG.DRIVE.FOLDER_ROOT) ? CONFIG.DRIVE.FOLDER_ROOT : 'Routes';
    const dossiers = DriveApp.getFoldersByName(NOM_RACINE);

    if (dossiers.hasNext()) {
        const dossier = dossiers.next();
        Logger.log(`[DRIVE] 📁 Dossier racine trouvé : "${NOM_RACINE}" (${dossier.getId()})`);
        return dossier;
    }

    const nouveau = DriveApp.createFolder(NOM_RACINE);
    Logger.log(`[DRIVE] ✅ Dossier racine créé : "${NOM_RACINE}" (${nouveau.getId()})`);
    return nouveau;
}

/**
 * Récupère ou crée le sous-dossier YYYYMMDD_occasion dans Routes/.
 * Utilisé par les étiquettes, la feuille de conditionnement et les docs de route.
 * @param {Date|string} date
 * @param {string} occasion
 * @returns {GoogleAppsScript.Drive.Folder}
 */
function getDateOccasionFolder(date, occasion) {
    const racine = getRoutesFolder();

    const dateObj = date instanceof Date ? date : new Date(date);
    const dateStr = Utilities.formatDate(dateObj, CONFIG.TIMEZONE || 'Europe/Paris', 'yyyyMMdd');
    const nomSousDossier = `${dateStr}_${occasion}`;

    const sousDossiers = racine.getFoldersByName(nomSousDossier);
    if (sousDossiers.hasNext()) {
        const sousDossier = sousDossiers.next();
        Logger.log(`[DRIVE] 📁 Sous-dossier trouvé : "${nomSousDossier}" (${sousDossier.getId()})`);
        return sousDossier;
    }

    const nouveau = racine.createFolder(nomSousDossier);
    Logger.log(`[DRIVE] ✅ Sous-dossier créé : "${nomSousDossier}" (${nouveau.getId()})`);
    return nouveau;
}

/**
 * Cherche un fichier par nom dans le dossier Routes/.
 * @param {string} nomFichier
 * @returns {GoogleAppsScript.Drive.File|null}
 */
function findLabelFileInRoutes(nomFichier) {
    const dossier = getRoutesFolder();
    const fichiers = dossier.getFilesByName(nomFichier);

    if (fichiers.hasNext()) {
        const fichier = fichiers.next();
        Logger.log(`[DRIVE] 📄 Fichier existant trouvé : "${nomFichier}" (${fichier.getId()})`);
        return fichier;
    }

    return null;
}

/**
 * Supprime un fichier du dossier Routes/ s'il existe.
 * @param {string} nomFichier
 * @returns {boolean}
 */
function deleteLabelFileIfExists(nomFichier) {
    const fichier = findLabelFileInRoutes(nomFichier);

    if (fichier) {
        fichier.setTrashed(true);
        Logger.log(`[DRIVE] 🗑️ Fichier supprimé : "${nomFichier}"`);
        return true;
    }

    Logger.log(`[DRIVE] ℹ️ Aucun fichier existant à supprimer : "${nomFichier}"`);
    return false;
}

/**
 * Déplace un fichier Google Doc vers le dossier Routes/.
 * @param {string} fileId
 * @returns {GoogleAppsScript.Drive.File}
 */
function moveFileToRoutesFolder(fileId) {
    const dossier = getRoutesFolder();
    const fichier = DriveApp.getFileById(fileId);

    dossier.addFile(fichier);
    DriveApp.getRootFolder().removeFile(fichier);

    Logger.log(`[DRIVE] ✅ Fichier déplacé vers Routes/ : ${fichier.getName()}`);
    return fichier;
}