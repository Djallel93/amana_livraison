/**
 * ====================================================================
 * DRIVE_UTILS.GS - Utilitaires Google Drive
 * ====================================================================
 * Structure simplifiée :
 *   Routes/
 *     └── Labels_YYYYMMDD_occasion.gdoc  ← fichier unique cumulatif
 */

/**
 * Récupère ou crée le dossier racine "Routes"
 * @returns {Folder}
 */
function getRoutesFolder() {
    const ROOT_NAME = (CONFIG.DRIVE && CONFIG.DRIVE.FOLDER_ROOT) ? CONFIG.DRIVE.FOLDER_ROOT : 'Routes';
    const folders = DriveApp.getFoldersByName(ROOT_NAME);

    if (folders.hasNext()) {
        const folder = folders.next();
        Logger.log(`[DRIVE] 📁 Dossier trouvé: "${ROOT_NAME}" (${folder.getId()})`);
        return folder;
    }

    const newFolder = DriveApp.createFolder(ROOT_NAME);
    Logger.log(`[DRIVE] ✅ Dossier créé: "${ROOT_NAME}" (${newFolder.getId()})`);
    return newFolder;
}

/**
 * Cherche un fichier par nom dans le dossier Routes/
 * @param {string} fileName - Nom du fichier
 * @returns {File|null}
 */
function findLabelFileInRoutes(fileName) {
    const folder = getRoutesFolder();
    const files = folder.getFilesByName(fileName);

    if (files.hasNext()) {
        const file = files.next();
        Logger.log(`[DRIVE] 📄 Fichier existant trouvé: "${fileName}" (${file.getId()})`);
        return file;
    }

    return null;
}

/**
 * Supprime un fichier du dossier Routes/ s'il existe
 * @param {string} fileName - Nom du fichier
 * @returns {boolean} true si supprimé
 */
function deleteLabelFileIfExists(fileName) {
    const file = findLabelFileInRoutes(fileName);

    if (file) {
        file.setTrashed(true);
        Logger.log(`[DRIVE] 🗑️ Fichier supprimé: "${fileName}"`);
        return true;
    }

    Logger.log(`[DRIVE] ℹ️ Aucun fichier existant à supprimer: "${fileName}"`);
    return false;
}

/**
 * Déplace un fichier Google Doc vers le dossier Routes/
 * (retire de MyDrive racine après création via DocumentApp)
 * @param {string} fileId - ID du fichier
 * @returns {File}
 */
function moveFileToRoutesFolder(fileId) {
    const folder = getRoutesFolder();
    const file = DriveApp.getFileById(fileId);

    folder.addFile(file);
    DriveApp.getRootFolder().removeFile(file);

    Logger.log(`[DRIVE] ✅ Fichier déplacé vers Routes/: ${file.getName()}`);
    return file;
}