/**
 * ====================================================================
 * ROUTE_API.GS - API Web pour les Actions des Bénévoles
 * ====================================================================
 * v2.0 - Réécriture complète
 *
 * Actions disponibles :
 *   ping              - Test de connexion (pas de token requis)
 *   start_route       - Démarre la route + tous les stops → En Cours
 *   confirm_delivery  - Stop → Livrée (toujours, peu importe statut précédent)
 *   skip_delivery     - Stop → ignorée (toujours, peu importe statut précédent)
 *   finish_route      - Route → Terminée (seulement si tous stops finaux)
 *
 * Logique token :
 *   - Généré à l'envoi de l'email (via emailService.js)
 *   - Inclus dans chaque URL de bouton de l'email
 *   - Expiré immédiatement quand la route passe à Terminée
 */

// ============================================================
// ROUTER PRINCIPAL
// ============================================================

/**
 * Point d'entrée GET
 */
function doGet(e) {
    return routeRequest(e);
}

/**
 * Point d'entrée POST (même comportement)
 */
function doPost(e) {
    return routeRequest(e);
}

/**
 * Router principal
 */
function routeRequest(e) {
    const action = e.parameter.action;
    const token = e.parameter.token;

    Logger.log(`[API] 📡 /${action} — token: ${token ? token.substring(0, 8) + '…' : 'none'}`);

    try {
        // ── Ping sans token ───────────────────────────────────────
        if (action === 'ping') {
            return jsonOk({
                status: 'ok',
                timestamp: new Date().toISOString(),
                version: CONFIG.VERSION,
                message: 'API Livraisons opérationnelle'
            });
        }

        // ── Toutes les autres actions nécessitent un token ────────
        if (!token) {
            return htmlError('Token manquant', 'Lien invalide ou incomplet.');
        }

        const tv = validateToken(token);
        if (!tv.valid) {
            return htmlError('Lien expiré', tv.error);
        }

        const routeId = tv.routeId;

        switch (action) {
            case 'start_route': return handleStartRoute(routeId);
            case 'confirm_delivery': return handleConfirmDelivery(routeId, e.parameter);
            case 'skip_delivery': return handleSkipDelivery(routeId, e.parameter);
            case 'finish_route': return handleFinishRoute(routeId);
            default:
                return htmlError('Action invalide', `L'action "${action}" n'existe pas.`);
        }

    } catch (err) {
        Logger.log(`[API] ❌ Erreur inattendue: ${err.message}`);
        return htmlError('Erreur serveur', err.message);
    }
}

// ============================================================
// HANDLERS
// ============================================================

/**
 * Démarre la route → En Cours + TOUS les stops de livraison → En Cours
 */
function handleStartRoute(routeId) {
    Logger.log(`[API] ▶️ start_route — ${routeId}`);

    const route = getRouteById(routeId);
    if (!route) return htmlError('Route introuvable', `La route ${routeId} est introuvable.`);

    if (route.statut === CONFIG.ENUMS.STATUT_ROUTE.TERMINEE) {
        return htmlInfo('Route déjà terminée', `La route ${routeId} est déjà terminée.`, '🏁');
    }

    // Mettre à jour le statut de la route
    updateRouteStatus(routeId, CONFIG.ENUMS.STATUT_ROUTE.EN_COURS);
    Logger.log(`[API] ✅ Route ${routeId} → En Cours`);

    // Mettre tous les stops de livraison (pas retour QG) → En Cours
    const stops = getDeliveryStopsForRoute(routeId);
    let updated = 0;
    for (const stop of stops) {
        // Ne pas écraser les stops déjà traités
        if (stop.statut === CONFIG.ENUMS.STATUT_ETAPE.EN_ATTENTE) {
            updateStopStatus(stop.id_etape, CONFIG.ENUMS.STATUT_ETAPE.EN_COURS);
            updated++;
        }
    }

    Logger.log(`[API] ✅ ${updated} étapes passées à En Cours`);

    return htmlSuccess(
        'Route démarrée !',
        `La route <strong>${routeId}</strong> est maintenant en cours.<br>Bonne livraison !`,
        '🚗'
    );
}

/**
 * Confirme une livraison → stop Livrée, delivery Livrée
 * Fonctionne quel que soit le statut précédent du stop.
 */
function handleConfirmDelivery(routeId, params) {
    const livraisonId = params.id_livraison;
    Logger.log(`[API] ✅ confirm_delivery — route ${routeId}, livraison ${livraisonId}`);

    if (!livraisonId) return htmlError('Paramètre manquant', 'id_livraison requis.');

    const stop = findStopByLivraison(routeId, livraisonId);
    if (!stop) return htmlError('Étape introuvable', `Aucune étape pour la livraison ${livraisonId} dans la route ${routeId}.`);

    // Toujours mettre à jour (même si déjà Livrée — idempotent)
    updateStopStatus(stop.id_etape, CONFIG.ENUMS.STATUT_ETAPE.LIVREE);
    updateRowById(
        CONFIG.SHEETS.ETAPES_ROUTE,
        stop.id_etape,
        CONFIG.COLUMNS.ETAPES_ROUTE.ID_ETAPE,
        { heure_fin: getCurrentDateTime() }
    );

    updateDeliveryStatus(livraisonId, CONFIG.ENUMS.STATUT_LIVRAISON.LIVREE);

    Logger.log(`[API] ✅ Livraison ${livraisonId} → Livrée`);

    // Vérifier si la route est complète
    checkAndCompleteRoute(routeId);

    return htmlSuccess(
        'Livraison confirmée !',
        `La livraison a été enregistrée.<br>Merci !`,
        '✅'
    );
}

/**
 * Saute une livraison → stop ignorée, notif admin
 * Fonctionne quel que soit le statut précédent du stop.
 */
function handleSkipDelivery(routeId, params) {
    const livraisonId = params.id_livraison;
    Logger.log(`[API] ⏭️ skip_delivery — route ${routeId}, livraison ${livraisonId}`);

    if (!livraisonId) return htmlError('Paramètre manquant', 'id_livraison requis.');

    const stop = findStopByLivraison(routeId, livraisonId);
    if (!stop) return htmlError('Étape introuvable', `Aucune étape pour la livraison ${livraisonId} dans la route ${routeId}.`);

    updateStopStatus(stop.id_etape, CONFIG.ENUMS.STATUT_ETAPE.IGNOREE);
    updateRowById(
        CONFIG.SHEETS.ETAPES_ROUTE,
        stop.id_etape,
        CONFIG.COLUMNS.ETAPES_ROUTE.ID_ETAPE,
        {
            heure_fin: getCurrentDateTime(),
            commentaire: 'Ignorée par le bénévole'
        }
    );

    Logger.log(`[API] ⏭️ Livraison ${livraisonId} → ignorée`);

    // Notifier l'admin
    sendSkipNotificationToAdmin(routeId, livraisonId);

    // Vérifier si la route est complète
    checkAndCompleteRoute(routeId);

    return htmlSuccess(
        'Livraison ignorée',
        `La livraison a été marquée comme ignorée.<br>L'administrateur a été notifié.`,
        '⏭️'
    );
}

/**
 * Termine manuellement la route (bouton "J'ai fini")
 * Accepté seulement si tous les stops sont dans un état final.
 */
function handleFinishRoute(routeId) {
    Logger.log(`[API] 🏁 finish_route — ${routeId}`);

    const route = getRouteById(routeId);
    if (!route) return htmlError('Route introuvable', `La route ${routeId} est introuvable.`);

    if (route.statut === CONFIG.ENUMS.STATUT_ROUTE.TERMINEE) {
        return htmlInfo('Route déjà terminée', `La route ${routeId} était déjà terminée.`, '🏁');
    }

    const stops = getDeliveryStopsForRoute(routeId);
    const pendingStops = stops.filter(s => !isStopFinal(s.statut));

    if (pendingStops.length > 0) {
        const ids = pendingStops.map(s => s.id_livraison).join(', ');
        return htmlError(
            'Livraisons en attente',
            `${pendingStops.length} livraison(s) ne sont pas encore traitées : ${ids}.<br>
       Veuillez les marquer comme Livrées ou Ignorées avant de terminer.`
        );
    }

    completeRoute(routeId);

    return htmlSuccess(
        'Route terminée !',
        `Merci pour votre aide !<br>La route <strong>${routeId}</strong> est maintenant terminée.`,
        '🏁'
    );
}

// ============================================================
// HELPERS MÉTIER
// ============================================================

/**
 * Vérifie si tous les stops de livraison sont dans un état final,
 * et si oui, termine la route + expire le token.
 */
function checkAndCompleteRoute(routeId) {
    const stops = getDeliveryStopsForRoute(routeId);

    const allDone = stops.every(s => isStopFinal(s.statut));

    if (allDone) {
        Logger.log(`[API] 🏁 Tous les stops finaux → Route ${routeId} terminée automatiquement`);
        completeRoute(routeId);
    }
}

/**
 * Passe la route à Terminée et expire son token.
 */
function completeRoute(routeId) {
    updateRouteStatus(routeId, CONFIG.ENUMS.STATUT_ROUTE.TERMINEE);

    updateRowById(
        CONFIG.SHEETS.ROUTES,
        routeId,
        CONFIG.COLUMNS.ROUTES.ID_ROUTE,
        { date_fin: getCurrentDateTime() }
    );

    expireToken(routeId);

    Logger.log(`[API] ✅ Route ${routeId} → Terminée, token expiré`);
}

/**
 * Expire immédiatement le token d'une route.
 */
function expireToken(routeId) {
    try {
        const tokens = filterData(CONFIG.SHEETS.TOKENS, row => row.id_route === routeId);
        if (tokens.length === 0) return;

        const tokenRow = tokens[0];
        updateRowById(
            CONFIG.SHEETS.TOKENS,
            tokenRow.token,
            CONFIG.COLUMNS.TOKENS.TOKEN,
            { date_expiration: getCurrentDateTime() }  // maintenant = expiré
        );

        Logger.log(`[API] 🔒 Token expiré pour route ${routeId}`);
    } catch (err) {
        Logger.log(`[API] ⚠️ Impossible d'expirer le token: ${err.message}`);
    }
}

/**
 * Retourne le stop d'une route pour une livraison donnée.
 * Cherche sans contrainte de statut (permissif).
 */
function findStopByLivraison(routeId, livraisonId) {
    const stops = filterData(
        CONFIG.SHEETS.ETAPES_ROUTE,
        row => row.id_route === routeId && row.id_livraison === livraisonId
    );
    return stops.length > 0 ? stops[0] : null;
}

/**
 * Retourne tous les stops de livraison (exclut retour QG).
 * Triés par ordre_passage.
 */
function getDeliveryStopsForRoute(routeId) {
    const stops = filterData(
        CONFIG.SHEETS.ETAPES_ROUTE,
        row => row.id_route === routeId &&
            row.id_livraison !== null &&
            row.id_livraison !== ''
    );
    return stops.sort((a, b) => (a.ordre_passage || 0) - (b.ordre_passage || 0));
}

/**
 * Retourne les stops d'une route (alias utilisé dans l'ancien code).
 */
function getStopsForRoute(routeId) {
    return getDeliveryStopsForRoute(routeId);
}

/**
 * Un stop est "final" s'il est Livrée ou ignorée.
 */
function isStopFinal(statut) {
    return statut === CONFIG.ENUMS.STATUT_ETAPE.LIVREE ||
        statut === CONFIG.ENUMS.STATUT_ETAPE.IGNOREE;
}

/**
 * Met à jour le statut d'un stop (étape).
 */
function updateStopStatus(etapeId, newStatut) {
    updateRowById(
        CONFIG.SHEETS.ETAPES_ROUTE,
        etapeId,
        CONFIG.COLUMNS.ETAPES_ROUTE.ID_ETAPE,
        { statut: newStatut }
    );
}

/**
 * Valide un token depuis la feuille tokens.
 */
function validateToken(token) {
    try {
        const rows = filterData(CONFIG.SHEETS.TOKENS, row => row.token === token);

        if (rows.length === 0) {
            return { valid: false, error: 'Token invalide ou introuvable.' };
        }

        const tokenData = rows[0];
        const expiration = parseDate(tokenData.date_expiration);

        if (!expiration || isTokenExpired(expiration)) {
            return { valid: false, error: 'Ce lien a expiré. Contactez l\'administrateur.' };
        }

        return { valid: true, routeId: tokenData.id_route, error: null };

    } catch (err) {
        Logger.log(`[API] ❌ validateToken: ${err.message}`);
        return { valid: false, error: 'Erreur de validation du token.' };
    }
}

/**
 * Envoie une notification à l'admin pour une livraison ignorée.
 */
function sendSkipNotificationToAdmin(routeId, livraisonId) {
    try {
        const delivery = getDeliveryById(livraisonId);
        if (!delivery) return;

        MailApp.sendEmail({
            to: CONFIG.EMAIL.ADMIN_EMAIL,
            subject: `⏭️ Livraison ignorée — ${livraisonId} (Route ${routeId})`,
            body:
                `Une livraison a été ignorée par un bénévole.\n\n` +
                `Route    : ${routeId}\n` +
                `Livraison: ${livraisonId}\n` +
                `Famille  : ${delivery.id_famille}\n` +
                `Adresse  : ${delivery.adresse}\n` +
                `Date     : ${getCurrentDateTime()}\n\n` +
                `Actions possibles :\n` +
                `- Réassigner à un autre bénévole\n` +
                `- Contacter la famille\n`
        });

        Logger.log(`[API] 📧 Notification admin envoyée pour ${livraisonId}`);
    } catch (err) {
        Logger.log(`[API] ⚠️ Notification admin échouée: ${err.message}`);
    }
}

// ============================================================
// RÉPONSES HTML
// ============================================================

/**
 * Page de succès (vert)
 */
function htmlSuccess(title, bodyHtml, emoji) {
    return buildHtmlPage(title, bodyHtml, emoji, '#22543d', '#c6f6d5', '#38a169');
}

/**
 * Page d'info (bleu)
 */
function htmlInfo(title, bodyHtml, emoji) {
    return buildHtmlPage(title, bodyHtml, emoji, '#2c5282', '#bee3f8', '#3182ce');
}

/**
 * Page d'erreur (rouge)
 */
function htmlError(title, bodyHtml) {
    return buildHtmlPage(title, bodyHtml, '⚠️', '#742a2a', '#fed7d7', '#e53e3e');
}

/**
 * Constructeur de page HTML de feedback.
 */
function buildHtmlPage(title, bodyHtml, emoji, textColor, bgColor, accentColor) {
    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', Arial, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 20px;
    }
    .card {
      background: white;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.25);
      padding: 48px 40px;
      text-align: center;
      max-width: 420px;
      width: 100%;
    }
    .emoji { font-size: 72px; margin-bottom: 24px; line-height: 1; }
    h1 {
      font-size: 22px;
      font-weight: 700;
      color: ${textColor};
      margin-bottom: 16px;
    }
    .message {
      font-size: 15px;
      color: #4a5568;
      line-height: 1.7;
      padding: 16px;
      background: ${bgColor};
      border-radius: 8px;
      border-left: 4px solid ${accentColor};
    }
    .timestamp {
      margin-top: 24px;
      font-size: 12px;
      color: #a0aec0;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="emoji">${emoji}</div>
    <h1>${title}</h1>
    <div class="message">${bodyHtml}</div>
    <div class="timestamp">${new Date().toLocaleString('fr-FR')}</div>
  </div>
</body>
</html>`;

    return HtmlService.createHtmlOutput(html);
}

/**
 * Réponse JSON (pour ping et debug)
 */
function jsonOk(data) {
    return ContentService
        .createTextOutput(JSON.stringify(data))
        .setMimeType(ContentService.MimeType.JSON);
}