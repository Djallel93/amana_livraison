/**
 * ====================================================================
 * STOP_SERVICE.GS - Service de Gestion des Étapes
 * ====================================================================
 */

/**
 * Génère les étapes pour des routes sélectionnées
 * @param {Array<string>} routeIds - IDs des routes
 * @returns {Object} Résultat de la génération
 */
function generateStops(routeIds) {
  Logger.log('[STOPS] 🚀 Démarrage génération des étapes...');
  Logger.log(`[STOPS] Routes sélectionnées: ${routeIds.join(', ')}`);

  const result = {
    success: false,
    processed: 0,
    errors: [],
    routes: []
  };

  try {
    for (const routeId of routeIds) {
      try {
        Logger.log(`[STOPS] 📍 Traitement route ${routeId}...`);

        // 1. Récupérer la route
        const route = getRouteById(routeId);
        if (!route) {
          throw new Error(`Route ${routeId} introuvable`);
        }

        // Vérifier le statut
        if (route.statut !== CONFIG.ENUMS.STATUT_ROUTE.BROUILLON) {
          throw new Error(`Route ${routeId} n'est pas en statut Brouillon (${route.statut})`);
        }

        // 2. Récupérer les livraisons (via etapes_route existantes)
        const livraisons = getDeliveriesForRoute(routeId);
        if (livraisons.length === 0) {
          throw new Error(`Aucune livraison trouvée pour la route ${routeId}`);
        }

        Logger.log(`[STOPS]   ${livraisons.length} livraisons à organiser`);

        // 3. Optimiser l'ordre des étapes (TSP)
        const orderedStops = optimizeStopsOrder(livraisons);
        Logger.log(`[STOPS]   ✅ Ordre optimisé via TSP`);

        // 4. Mettre à jour l'ordre des étapes existantes
        updateStopsOrder(routeId, orderedStops);
        Logger.log(`[STOPS]   ✅ Ordre des étapes mis à jour`);

        // 5. Générer le document Google
        const docUrl = generateRouteDocument(routeId, route, orderedStops);
        Logger.log(`[STOPS]   ✅ Document généré: ${docUrl}`);

        // 6. Générer et sauvegarder le token
        const token = generateSecureToken();
        saveToken(routeId, token);
        Logger.log(`[STOPS]   ✅ Token généré et sauvegardé`);

        // 7. Envoyer l'email au bénévole
        const emailSent = sendRouteEmail(routeId, route, orderedStops, docUrl, token);
        if (emailSent) {
          Logger.log(`[STOPS]   ✅ Email envoyé au bénévole`);
        }

        // 8. Mettre à jour le statut de la route
        updateRouteStatus(routeId, CONFIG.ENUMS.STATUT_ROUTE.CONFIRMEE);

        result.processed++;
        result.routes.push({
          id: routeId,
          etapes: orderedStops.length,
          docUrl: docUrl
        });

      } catch (error) {
        Logger.log(`[STOPS] ❌ Erreur route ${routeId}: ${error.message}`);
        result.errors.push(`Route ${routeId}: ${error.message}`);
      }
    }

    result.success = result.processed > 0;

    Logger.log('[STOPS] ========================================');
    Logger.log(`[STOPS] ✅ Génération terminée`);
    Logger.log(`[STOPS] Routes traitées: ${result.processed}`);
    Logger.log(`[STOPS] Erreurs: ${result.errors.length}`);
    Logger.log('[STOPS] ========================================');

    return result;

  } catch (error) {
    Logger.log(`[STOPS] ❌ Erreur critique: ${error.message}`);
    result.errors.push(`Erreur critique: ${error.message}`);
    return result;
  }
}

/**
 * Optimise l'ordre des étapes (TSP simplifié - nearest neighbor)
 * @param {Array} livraisons - Livraisons à organiser
 * @returns {Array} Livraisons ordonnées
 */
function optimizeStopsOrder(livraisons) {
  // PRIORITÉ 1 : Trier par fenêtre de disponibilité (plus tôt en premier)
  livraisons.sort((a, b) => {
    if (a.disponibilite_debut && b.disponibilite_debut) {
      return new Date(a.disponibilite_debut) - new Date(b.disponibilite_debut);
    }
    return 0;
  });

  // PRIORITÉ 2 : Appliquer nearest-neighbor pour optimiser la distance
  const ordered = [];
  const remaining = [...livraisons];

  // Départ : HQ
  let currentLat = CONFIG.HQ.LAT;
  let currentLng = CONFIG.HQ.LNG;

  while (remaining.length > 0) {
    // Trouver la livraison la plus proche
    let minDistance = Infinity;
    let closestIndex = 0;

    for (let i = 0; i < remaining.length; i++) {
      const distance = calculerDistanceHaversine(
        currentLat,
        currentLng,
        remaining[i].latitude,
        remaining[i].longitude
      );

      if (distance < minDistance) {
        minDistance = distance;
        closestIndex = i;
      }
    }

    // Ajouter la livraison la plus proche
    const closest = remaining.splice(closestIndex, 1)[0];
    ordered.push(closest);

    // Mettre à jour la position actuelle
    currentLat = closest.latitude;
    currentLng = closest.longitude;
  }

  return ordered;
}

/**
 * ✨ UPDATED: Updates the order of existing etapes
 * @param {string} routeId - Route ID
 * @param {Array} orderedLivraisons - Deliveries in optimized order
 */
function updateStopsOrder(routeId, orderedLivraisons) {
  Logger.log(`[STOPS] 🔄 Mise à jour de l'ordre des étapes pour ${routeId}...`);
  
  // Get existing etapes
  const existingEtapes = filterData(CONFIG.SHEETS.ETAPES_ROUTE, row => 
    row.id_route === routeId
  );
  
  // Update ordre_passage based on TSP optimization
  orderedLivraisons.forEach((livraison, index) => {
    const etape = existingEtapes.find(e => e.id_livraison === livraison.id_livraison);
    
    if (etape) {
      updateRowById(
        CONFIG.SHEETS.ETAPES_ROUTE,
        etape.id_etape,
        CONFIG.COLUMNS.ETAPES_ROUTE.ID_ETAPE,
        { ordre_passage: index + 1 }
      );
    }
  });
  
  Logger.log(`[STOPS] ✅ Ordre optimisé pour ${orderedLivraisons.length} étapes`);
}

/**
 * Génère un document Google pour la route
 * @param {string} routeId - ID de la route
 * @param {Object} route - Données de la route
 * @param {Array} livraisons - Livraisons ordonnées
 * @returns {string} URL du document
 */
function generateRouteDocument(routeId, route, livraisons) {
  try {
    // 1. Créer le dossier si nécessaire
    const folderName = generateFolderName(new Date(route.date_debut), route.occasion);
    const folder = getOrCreateDriveFolder(folderName);

    // 2. Créer le document
    const docName = `${CONFIG.DRIVE.FILE_PREFIXES.ROUTE}${routeId}`;
    const doc = DocumentApp.create(docName);
    const docId = doc.getId();
    const docFile = DriveApp.getFileById(docId);

    // Déplacer dans le dossier
    folder.addFile(docFile);
    DriveApp.getRootFolder().removeFile(docFile);

    const body = doc.getBody();
    body.clear();

    // 3. En-tête
    const header = body.appendParagraph(`Route ${routeId} - ${route.occasion}`);
    header.setHeading(DocumentApp.ParagraphHeading.HEADING1);
    header.setAlignment(DocumentApp.HorizontalAlignment.CENTER);

    body.appendParagraph(`Date: ${formatDate(new Date(route.date_debut), 'dd/MM/yyyy')}`);
    body.appendParagraph(`Bénévole: ${route.id_benevole}`);
    body.appendParagraph(`Distance totale: ${route.distance_totale_km} km`);
    body.appendParagraph(`Poids total: ${route.poids_total_kg} kg`);
    body.appendParagraph('');

    // 4. Tableau des étapes
    const tableTitle = body.appendParagraph('Itinéraire');
    tableTitle.setHeading(DocumentApp.ParagraphHeading.HEADING2);

    const tableData = [
      ['#', 'ID Livraison', 'Adresse', 'Personnes', 'Notes']
    ];

    livraisons.forEach((livraison, index) => {
      tableData.push([
        String(index + 1),
        livraison.id_livraison,
        livraison.adresse,
        String(livraison.nombre_personnes),
        livraison.besoins_speciaux || '-'
      ]);
    });

    const table = body.appendTable(tableData);
    table.setBorderWidth(1);

    // Style du header du tableau
    const headerRow = table.getRow(0);
    for (let i = 0; i < headerRow.getNumCells(); i++) {
      headerRow.getCell(i).setBackgroundColor('#667eea');
      headerRow.getCell(i).getChild(0).asParagraph().setForegroundColor('#ffffff');
      headerRow.getCell(i).getChild(0).asParagraph().setBold(true);
    }

    doc.saveAndClose();

    // Mettre à jour la route avec l'URL du dossier
    updateRowById(
      CONFIG.SHEETS.ROUTES,
      routeId,
      CONFIG.COLUMNS.ROUTES.ID_ROUTE,
      { dossier_drive: folder.getUrl() }
    );

    return doc.getUrl();

  } catch (error) {
    Logger.log(`[STOPS] ❌ Erreur génération document: ${error.message}`);
    throw error;
  }
}

/**
 * Obtient ou crée un dossier Google Drive
 * @param {string} folderName - Nom du dossier
 * @returns {Folder} Dossier Google Drive
 */
function getOrCreateDriveFolder(folderName) {
  const rootFolderName = CONFIG.DRIVE.FOLDER_ROOT;

  // Trouver ou créer le dossier racine "Routes"
  let rootFolder;
  const rootFolders = DriveApp.getFoldersByName(rootFolderName);
  if (rootFolders.hasNext()) {
    rootFolder = rootFolders.next();
  } else {
    rootFolder = DriveApp.createFolder(rootFolderName);
  }

  // Trouver ou créer le sous-dossier (date_occasion)
  let folder;
  const folders = rootFolder.getFoldersByName(folderName);
  if (folders.hasNext()) {
    folder = folders.next();
  } else {
    folder = rootFolder.createFolder(folderName);
  }

  return folder;
}

/**
 * Envoie l'email de route au bénévole
 * @param {string} routeId - ID de la route
 * @param {Object} route - Données de la route
 * @param {Array} livraisons - Livraisons ordonnées
 * @param {string} docUrl - URL du document
 * @param {string} token - Token sécurisé
 * @returns {boolean}
 */
function sendRouteEmail(routeId, route, livraisons, docUrl, token) {
  try {
    // 1. Récupérer les infos du bénévole
    const benevole = getVolunteerById(route.id_benevole);
    if (!benevole || !benevole.email) {
      throw new Error(`Email du bénévole ${route.id_benevole} introuvable`);
    }

    // 2. Construire l'URL Google Maps pour toute la route
    const mapsUrl = buildGoogleMapsUrl(livraisons, route.relivre);

    // 3. Construire le HTML de l'email
    const emailHtml = buildRouteEmailHtml({
      route: route,
      benevole: benevole,
      livraisons: livraisons,
      docUrl: docUrl,
      mapsUrl: mapsUrl,
      token: token
    });

    // 4. Envoyer l'email
    MailApp.sendEmail({
      to: benevole.email,
      subject: `${CONFIG.EMAIL.SUBJECT_ROUTE} - ${routeId}`,
      htmlBody: emailHtml,
      name: CONFIG.EMAIL.FROM_NAME
    });

    Logger.log(`[STOPS] ✅ Email envoyé à ${benevole.email}`);
    return true;

  } catch (error) {
    Logger.log(`[STOPS] ❌ Erreur envoi email: ${error.message}`);
    return false;
  }
}

/**
 * Construit l'URL Google Maps pour la route complète
 * @param {Array} livraisons - Livraisons ordonnées
 * @param {boolean} relivre - Retour au HQ
 * @returns {string} URL Google Maps
 */
function buildGoogleMapsUrl(livraisons, relivre) {
  const waypoints = [];

  // Départ : HQ
  waypoints.push(`${CONFIG.HQ.LAT},${CONFIG.HQ.LNG}`);

  // Toutes les livraisons
  livraisons.forEach(livraison => {
    waypoints.push(`${livraison.latitude},${livraison.longitude}`);
  });

  // Retour au HQ si relivre
  if (relivre) {
    waypoints.push(`${CONFIG.HQ.LAT},${CONFIG.HQ.LNG}`);
  }

  // Construire l'URL
  const baseUrl = 'https://www.google.com/maps/dir/';
  return baseUrl + waypoints.join('/');
}

/**
 * Construit le HTML de l'email de route
 * @param {Object} data - Données pour l'email
 * @returns {string} HTML
 */
function buildRouteEmailHtml(data) {
  const { route, benevole, livraisons, docUrl, mapsUrl, token } = data;

  // URL de base de l'API web
  const apiBaseUrl = PropertiesService.getScriptProperties().getProperty('API_WEB_URL') ||
    ScriptApp.getService().getUrl();

  const startUrl = `${apiBaseUrl}?action=start_route&id_route=${route.id_route}&token=${token}`;

  let html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px;
      border-radius: 10px 10px 0 0;
      text-align: center;
    }
    .content {
      background: #f9f9f9;
      padding: 30px;
      border-radius: 0 0 10px 10px;
    }
    .info-box {
      background: white;
      padding: 15px;
      border-left: 4px solid #667eea;
      margin: 20px 0;
    }
    .button {
      display: inline-block;
      padding: 12px 30px;
      background: #667eea;
      color: white !important;
      text-decoration: none;
      border-radius: 5px;
      margin: 10px 5px;
      font-weight: bold;
    }
    .button:hover {
      background: #5568d3;
    }
    .stops-table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
      background: white;
    }
    .stops-table th {
      background: #667eea;
      color: white;
      padding: 10px;
      text-align: left;
    }
    .stops-table td {
      padding: 10px;
      border-bottom: 1px solid #ddd;
    }
    .stops-table tr:hover {
      background: #f5f5f5;
    }
    .footer {
      text-align: center;
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #ddd;
      color: #666;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>🗺️ Votre Itinéraire de Livraison</h1>
    <p>Route ${route.id_route}</p>
  </div>
  
  <div class="content">
    <p>Bonjour ${benevole.prenom || benevole.nom},</p>
    
    <p>Voici votre itinéraire de livraison pour le <strong>${formatDate(new Date(route.date_debut), 'dd/MM/yyyy')}</strong>.</p>
    
    <div class="info-box">
      <h3>📊 Résumé de votre route</h3>
      <p>
        <strong>Nombre d'arrêts :</strong> ${livraisons.length}<br>
        <strong>Distance totale :</strong> ${route.distance_totale_km} km<br>
        <strong>Poids total :</strong> ${route.poids_total_kg} kg
      </p>
    </div>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="${mapsUrl}" class="button" target="_blank">
        📍 Ouvrir dans Google Maps
      </a>
      <a href="${docUrl}" class="button" target="_blank">
        📄 Voir le Document Détaillé
      </a>
      <a href="${startUrl}" class="button" target="_blank">
        ▶️ Démarrer la Route
      </a>
    </div>
    
    <h3>📍 Vos Arrêts</h3>
    <table class="stops-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Adresse</th>
          <th>Personnes</th>
        </tr>
      </thead>
      <tbody>
  `;

  livraisons.forEach((livraison, index) => {
    const stopMapsUrl = `https://www.google.com/maps/search/?api=1&query=${livraison.latitude},${livraison.longitude}`;

    html += `
        <tr>
          <td><strong>${index + 1}</strong></td>
          <td>
            <a href="${stopMapsUrl}" target="_blank" style="color: #667eea; text-decoration: none;">
              ${livraison.adresse}
            </a>
            ${livraison.besoins_speciaux ? `<br><small style="color: #666;">ℹ️ ${livraison.besoins_speciaux}</small>` : ''}
          </td>
          <td>${livraison.nombre_personnes}</td>
        </tr>
    `;
  });

  html += `
      </tbody>
    </table>
    
    <p>Merci pour votre engagement ! 🙏</p>
    
    <div class="footer">
      <p>${CONFIG.EMAIL.FROM_NAME}</p>
      <p>En cas de problème, contactez-nous à ${CONFIG.EMAIL.ADMIN_EMAIL}</p>
    </div>
  </div>
</body>
</html>
  `;

  return html;
}

/**
 * Génère un token sécurisé
 * @returns {string}
 */
function generateSecureToken() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < CONFIG.TOKENS.LENGTH; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

/**
 * Sauvegarde un token
 * @param {string} routeId - ID de la route
 * @param {string} token - Token
 */
function saveToken(routeId, token) {
  const expiration = generateTokenExpiration();

  const rowData = [
    routeId,
    token,
    expiration,
    getCurrentDateTime()
  ];

  appendRow(CONFIG.SHEETS.TOKENS, rowData);
  Logger.log(`[TOKENS] ✅ Token sauvegardé pour route ${routeId}`);
}

/**
 * Récupère les étapes d'une route
 * @param {string} routeId - ID de la route
 * @returns {Array}
 */
function getStopsForRoute(routeId) {
  const etapes = filterData(CONFIG.SHEETS.ETAPES_ROUTE, row => row.id_route === routeId);

  // Enrichir avec les livraisons
  return etapes.map(etape => {
    const livraison = getDeliveryById(etape.id_livraison);
    return {
      ...etape,
      livraison: livraison
    };
  }).sort((a, b) => a.ordre_passage - b.ordre_passage);
}

/**
 * Met à jour le statut d'une étape
 * @param {string} etapeId - ID de l'étape
 * @param {string} newStatus - Nouveau statut
 * @returns {boolean}
 */
function updateStopStatus(etapeId, newStatus) {
  const validStatuts = Object.values(CONFIG.ENUMS.STATUT_ETAPE);
  if (!validStatuts.includes(newStatus)) {
    Logger.log(`[STOPS] ❌ Statut invalide: ${newStatus}`);
    return false;
  }

  return updateRowById(
    CONFIG.SHEETS.ETAPES_ROUTE,
    etapeId,
    CONFIG.COLUMNS.ETAPES_ROUTE.ID_ETAPE,
    { statut: newStatus }
  );
}