/**
 * ====================================================================
 * LABEL_SERVICE.GS - Service de Génération des Étiquettes
 * ====================================================================
 */

/**
 * Génère les étiquettes pour des routes sélectionnées
 * @param {Object} params - Paramètres {routeIds, rows, cols}
 * @returns {Object} Résultat de la génération
 */
function generateLabels(params) {
  Logger.log('[LABELS] 🚀 Démarrage génération des étiquettes...');
  Logger.log(`[LABELS] Routes: ${params.routeIds.join(', ')}`);
  Logger.log(`[LABELS] Format: ${params.rows}x${params.cols}`);

  const result = {
    success: false,
    processed: 0,
    errors: [],
    documents: []
  };

  try {
    for (const routeId of params.routeIds) {
      try {
        Logger.log(`[LABELS] 📄 Traitement route ${routeId}...`);

        const route = getRouteById(routeId);
        if (!route) {
          throw new Error(`Route ${routeId} introuvable`);
        }

        const livraisons = getDeliveriesForRoute(routeId);
        if (livraisons.length === 0) {
          throw new Error(`Aucune livraison pour route ${routeId}`);
        }

        Logger.log(`[LABELS]   ${livraisons.length} livraisons`);

        const labels = createLabelsForRoute(routeId, livraisons);
        Logger.log(`[LABELS]   ${labels.length} étiquettes`);

        const docUrl = createLabelsDocument(routeId, route, labels, params);
        Logger.log(`[LABELS]   ✅ Document: ${docUrl}`);

        result.processed++;
        result.documents.push({
          routeId: routeId,
          labelCount: labels.length,
          url: docUrl
        });

      } catch (error) {
        Logger.log(`[LABELS] ❌ Route ${routeId}: ${error.message}`);
        result.errors.push(`Route ${routeId}: ${error.message}`);
      }
    }

    result.success = result.processed > 0;
    Logger.log(`[LABELS] ✅ Terminé: ${result.processed} routes`);

    return result;

  } catch (error) {
    Logger.log(`[LABELS] ❌ Erreur critique: ${error.message}`);
    result.errors.push(`Erreur: ${error.message}`);
    return result;
  }
}

function createLabelsForRoute(routeId, livraisons) {
  const labels = [];

  for (const livraison of livraisons) {
    const n = livraison.nombre_personnes || 1;

    for (let i = 1; i <= n; i++) {
      const confirmUrl = buildConfirmUrl(livraison.id_livraison, routeId);
      const qrUrl = `https://chart.googleapis.com/chart?cht=qr&chs=100x100&chl=${encodeURIComponent(confirmUrl)}`;

      labels.push({
        route_id: routeId,
        famille_id: livraison.id_famille,
        livraison_id: livraison.id_livraison,
        part: i,
        total: n,
        qr_url: qrUrl
      });
    }
  }

  return labels;
}

function buildConfirmUrl(livraisonId, routeId) {
  const tokens = filterData(CONFIG.SHEETS.TOKENS, row => row.id_route === routeId);
  const token = tokens.length > 0 ? tokens[0].token : '';
  const apiUrl = PropertiesService.getScriptProperties().getProperty('API_WEB_URL') || ScriptApp.getService().getUrl();

  return `${apiUrl}?action=confirm_delivery&id_livraison=${livraisonId}&token=${token}`;
}

function createLabelsDocument(routeId, route, labels, config) {
  try {
    const folder = getOrCreateDriveFolder(generateFolderName(new Date(route.date_debut), route.occasion));
    const doc = DocumentApp.create(`Labels_${routeId}`);
    const docFile = DriveApp.getFileById(doc.getId());

    folder.addFile(docFile);
    DriveApp.getRootFolder().removeFile(docFile);

    const body = doc.getBody();
    body.clear();
    body.setMarginTop(20);
    body.setMarginBottom(20);
    body.setMarginLeft(20);
    body.setMarginRight(20);

    const perPage = config.rows * config.cols;
    const pages = Math.ceil(labels.length / perPage);

    for (let p = 0; p < pages; p++) {
      const start = p * perPage;
      const end = Math.min(start + perPage, labels.length);
      const pageLabels = labels.slice(start, end);

      const table = body.appendTable();

      for (let r = 0; r < config.rows; r++) {
        const tableRow = table.appendTableRow();

        for (let c = 0; c < config.cols; c++) {
          const idx = r * config.cols + c;
          const cell = tableRow.appendTableCell();
          cell.setPaddingTop(8);
          cell.setPaddingBottom(8);
          cell.setPaddingLeft(8);
          cell.setPaddingRight(8);

          if (idx < pageLabels.length) {
            const label = pageLabels[idx];

            const p1 = cell.appendParagraph('');
            const t1 = p1.appendText(`R_${label.route_id.replace('R', '')}`);
            t1.setFontSize(16);
            t1.setBold(true);

            try {
              const qrBlob = UrlFetchApp.fetch(label.qr_url).getBlob();
              const p2 = cell.appendParagraph('');
              p2.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
              const img = p2.appendInlineImage(qrBlob);
              img.setWidth(60);
              img.setHeight(60);
            } catch (e) {
              Logger.log(`[LABELS] ⚠️ QR code error: ${e.message}`);
            }

            const p3 = cell.appendParagraph('');
            const t3 = p3.appendText(`F_${label.famille_id.replace('F', '')}`);
            t3.setFontSize(16);
            t3.setBold(true);

            const p4 = cell.appendParagraph('');
            p4.setAlignment(DocumentApp.HorizontalAlignment.RIGHT);
            const t4 = p4.appendText(`${label.part}/${label.total}`);
            t4.setFontSize(10);
          } else {
            cell.appendParagraph('');
          }
        }
      }

      table.setBorderWidth(1);
      table.setBorderColor('#CCCCCC');

      if (p < pages - 1) {
        body.appendPageBreak();
      }
    }

    doc.saveAndClose();
    return doc.getUrl();

  } catch (error) {
    Logger.log(`[LABELS] ❌ Document error: ${error.message}`);
    throw error;
  }
}

function getConfirmedRoutesForLabels() {
  try {
    const routes = filterData(CONFIG.SHEETS.ROUTES, row =>
      row.statut === CONFIG.ENUMS.STATUT_ROUTE.CONFIRMEE
    );

    return routes.map(route => {
      const deliveries = getDeliveriesForRoute(route.id_route);
      const total = deliveries.reduce((sum, d) => sum + (d.nombre_personnes || 1), 0);

      return {
        id_route: route.id_route,
        nombre_livraisons: deliveries.length,
        total_personnes: total
      };
    });
  } catch (error) {
    Logger.log(`[LABELS] ❌ Error: ${error.message}`);
    return [];
  }
}
