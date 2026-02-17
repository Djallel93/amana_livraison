/**
 * ====================================================================
 * DRIVE_UTILS.GS - Utilitaires Google Drive
 * ====================================================================
 * Fonctions pour gérer les dossiers et fichiers Drive
 */

/**
 * Crée ou récupère un dossier Drive de manière récursive
 * @param {string} folderPath - Chemin du dossier (ex: "Routes/20260215_zakat")
 * @returns {Folder} Objet Folder Google Drive
 */
function getOrCreateDriveFolder(folderPath) {
    const parts = folderPath.split('/').filter(p => p.trim() !== '');
    let currentFolder = DriveApp.getRootFolder();

    for (const part of parts) {
        const folders = currentFolder.getFoldersByName(part);

        if (folders.hasNext()) {
            currentFolder = folders.next();
            Logger.log(`[DRIVE] ✅ Dossier existant: ${part}`);
        } else {
            currentFolder = currentFolder.createFolder(part);
            Logger.log(`[DRIVE] ✅ Dossier créé: ${part}`);
        }
    }

    return currentFolder;
}

/**
 * Génère l'URL Google Maps pour une route complète
 * @param {Array<Object>} deliveries - Livraisons avec adresse, latitude, longitude
 * @param {Object} hqCoords - Coordonnées du QG {lat, lng, adresse}
 * @returns {string} URL Google Maps
 */
function generateGoogleMapsUrl(deliveries, hqCoords) {
    if (!deliveries || deliveries.length === 0) {
        return '';
    }

    // Construire l'URL Google Maps avec directions
    let waypoints = [];

    // Départ: QG
    if (hqCoords && hqCoords.adresse) {
        waypoints.push(encodeURIComponent(hqCoords.adresse));
    }

    // Arrêts intermédiaires
    for (const delivery of deliveries) {
        if (delivery.adresse) {
            waypoints.push(encodeURIComponent(delivery.adresse));
        }
    }

    // Retour: QG
    if (hqCoords && hqCoords.adresse) {
        waypoints.push(encodeURIComponent(hqCoords.adresse));
    }

    // Format: https://www.google.com/maps/dir/Point1/Point2/Point3/...
    const url = 'https://www.google.com/maps/dir/' + waypoints.join('/');

    Logger.log(`[DRIVE] 🗺️ URL Maps générée: ${waypoints.length} points`);

    return url;
}

/**
 * Obtient l'URL d'un dossier Drive
 * @param {Folder} folder - Objet Folder
 * @returns {string} URL du dossier
 */
function getDriveFolderUrl(folder) {
    return folder.getUrl();
}

/**
 * Crée le chemin du dossier pour une route
 * @param {Date} date - Date de la route
 * @param {string} occasion - Type d'occasion
 * @returns {string} Chemin du dossier
 */
function createRouteFolderPath(date, occasion) {
    return generateFolderName(date, occasion);
}

/**
 * Déplace un fichier vers un dossier
 * @param {File} file - Fichier à déplacer
 * @param {Folder} folder - Dossier de destination
 */
function moveFileToFolder(file, folder) {
    folder.addFile(file);
    DriveApp.getRootFolder().removeFile(file);
    Logger.log(`[DRIVE] 📁 Fichier déplacé vers: ${folder.getName()}`);
}

/**
 * Recherche un fichier dans un dossier
 * @param {Folder} folder - Dossier où chercher
 * @param {string} fileName - Nom du fichier
 * @returns {File|null} Fichier trouvé ou null
 */
function findFileInFolder(folder, fileName) {
    const files = folder.getFilesByName(fileName);
    return files.hasNext() ? files.next() : null;
}