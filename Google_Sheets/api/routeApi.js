/**
 * ====================================================================
 * ROUTE_API.GS - API Web pour les Actions des Bénévoles
 * ====================================================================
 * Actions disponibles :
 *   ping                - Test de connexion (pas de token requis)
 *   start_route         - Démarre la route + tous les stops → En Cours
 *   confirm_delivery    - Stop → Livrée
 *   skip_delivery       - Stop → ignorée
 *   finish_route        - Route → Terminée
 *   update_stop_status  - Met à jour le statut de conditionnement d'une livraison (sans token)
 */

// ============================================================
// ROUTER PRINCIPAL
// ============================================================

function doGet(e) {
    return routeRequest(e);
}

function doPost(e) {
    return routeRequest(e);
}

function routeRequest(e) {
    const action = e.parameter.action;
    const token = e.parameter.token;

    Logger.log(`[API] 📡 /${action} — token: ${token ? token.substring(0, 8) + '…' : 'aucun'}`);

    try {
        if (action === 'ping') {
            return jsonOk({
                status: 'ok',
                timestamp: new Date().toISOString(),
                version: CONFIG.VERSION,
                message: 'API Livraisons opérationnelle'
            });
        }

        // Endpoint sans token — équipe de conditionnement
        if (action === 'update_stop_status') {
            return handleUpdateStopStatus(e.parameter);
        }

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

function handleStartRoute(routeId) {
    Logger.log(`[API] ▶️ start_route — ${routeId}`);

    const route = getRouteById(routeId);
    if (!route) return htmlError('Route introuvable', `La route ${routeId} est introuvable.`);

    if (route.statut === CONFIG.ENUMS.STATUT_ROUTE.TERMINEE) {
        return htmlInfo('Route déjà terminée', `La route ${routeId} est déjà terminée.`, '🏁');
    }

    updateRouteStatus(routeId, CONFIG.ENUMS.STATUT_ROUTE.EN_COURS);
    Logger.log(`[API] ✅ Route ${routeId} → En Cours`);

    const stops = getDeliveryStopsForRoute(routeId);
    let updated = 0;
    for (const stop of stops) {
        if (stop.statut === CONFIG.ENUMS.STATUT_ETAPE.EN_ATTENTE ||
            stop.statut === CONFIG.ENUMS.STATUT_ETAPE.PRETE) {
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

function handleConfirmDelivery(routeId, params) {
    const livraisonId = params.id_livraison;
    Logger.log(`[API] ✅ confirm_delivery — route ${routeId}, livraison ${livraisonId}`);

    if (!livraisonId) return htmlError('Paramètre manquant', 'id_livraison requis.');

    const stop = findStopByLivraison(routeId, livraisonId);
    if (!stop) return htmlError('Étape introuvable', `Aucune étape pour la livraison ${livraisonId} dans la route ${routeId}.`);

    updateStopStatus(stop.id_etape, CONFIG.ENUMS.STATUT_ETAPE.LIVREE);
    updateRowById(
        CONFIG.SHEETS.ETAPES_ROUTE,
        stop.id_etape,
        CONFIG.COLUMNS.ETAPES_ROUTE.ID_ETAPE,
        { heure_fin: getCurrentDateTime() }
    );
    updateDeliveryStatus(livraisonId, CONFIG.ENUMS.STATUT_LIVRAISON.LIVREE);

    Logger.log(`[API] ✅ Livraison ${livraisonId} → Livrée`);

    return htmlSuccess('Livraison confirmée !', `La livraison a été enregistrée.<br>Merci !`, '✅');
}

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
        { heure_fin: getCurrentDateTime(), commentaire: 'Ignorée par le bénévole' }
    );

    Logger.log(`[API] ⏭️ Livraison ${livraisonId} → ignorée`);

    sendSkipNotificationToAdmin(routeId, livraisonId);

    return htmlSuccess(
        'Livraison ignorée',
        `La livraison a été marquée comme ignorée.<br>L'administrateur a été notifié.`,
        '⏭️'
    );
}

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
            `${pendingStops.length} livraison(s) non traitée(s) : ${ids}.<br>
             Veuillez les marquer comme Livrées ou Ignorées avant de terminer.`
        );
    }

    completeRoute(routeId);
    expireToken(routeId);

    return htmlSuccess(
        'Route terminée !',
        `Merci pour votre aide !<br>La route <strong>${routeId}</strong> est maintenant terminée.`,
        '🏁'
    );
}

/**
 * Met à jour le statut de conditionnement d'une livraison.
 * Endpoint sans token — réservé à l'équipe de conditionnement interne.
 */
function handleUpdateStopStatus(params) {
    const livraisonId = params.id_livraison;
    const statut = params.statut;

    Logger.log(`[API] 📦 update_stop_status — livraison ${livraisonId}, statut ${statut}`);

    if (!livraisonId) return htmlError('Paramètre manquant', 'id_livraison requis.');
    if (!statut) return htmlError('Paramètre manquant', 'statut requis.');

    const statutsValides = [
        ...Object.values(CONFIG.ENUMS.STATUT_ETAPE)
    ];
    if (!statutsValides.includes(statut)) {
        return htmlError('Statut invalide', `Statut "${statut}" non reconnu.`);
    }

    const livraison = getDeliveryById(livraisonId);
    if (!livraison) {
        return htmlError('Livraison introuvable', `La livraison ${livraisonId} est introuvable.`);
    }

    // Mettre à jour statut_conditionnement sur la livraison
    updateRowById(
        CONFIG.SHEETS.LIVRAISON,
        livraisonId,
        CONFIG.COLUMNS.LIVRAISON.ID_LIVRAISON,
        {
            statut_conditionnement: statut,
            date_modification: getCurrentDateTime()
        }
    );
    Logger.log(`[API] ✅ Livraison ${livraisonId} → statut_conditionnement: ${statut}`);

    // Si un stop existe pour cette livraison, le mettre à jour aussi
    const etapes = filterData(
        CONFIG.SHEETS.ETAPES_ROUTE,
        row => row.id_livraison === livraisonId
    );

    if (etapes.length > 0) {
        const etape = etapes[0];
        updateStopStatus(etape.id_etape, statut);
        Logger.log(`[API] ✅ Étape ${etape.id_etape} → ${statut}`);

        // Vérifier si toutes les livraisons de la route sont Prêtes
        if (statut === CONFIG.ENUMS.STATUT_CONDITIONNEMENT.PRETE) {
            const routeId = etape.id_route;
            if (toutesLivraisonsPretes(routeId)) {
                Logger.log(`[API] 🟢 Toutes livraisons Prêtes pour route ${routeId} → passage Prête`);
                passerRouteEnPrete(routeId);
            }
        }
    } else if (statut === CONFIG.ENUMS.STATUT_CONDITIONNEMENT.PRETE) {
        // Pas de stops encore — on vérifiera à la création des stops dans saveRoute()
        Logger.log(`[API] ℹ️ Aucun stop trouvé pour ${livraisonId} — statut_conditionnement conservé pour vérification ultérieure`);
    }

    return htmlSuccess(
        'Colis marqué Prêt !',
        `La livraison <strong>${livraisonId}</strong> a été marquée comme prête.<br>Merci !`,
        '📦'
    );
}

// ============================================================
// HELPERS MÉTIER
// ============================================================

function completeRoute(routeId) {
    updateRouteStatus(routeId, CONFIG.ENUMS.STATUT_ROUTE.TERMINEE);
    updateRowById(
        CONFIG.SHEETS.ROUTES,
        routeId,
        CONFIG.COLUMNS.ROUTES.ID_ROUTE,
        { date_fin: getCurrentDateTime() }
    );
    Logger.log(`[API] ✅ Route ${routeId} → Terminée`);
}

function expireToken(routeId) {
    try {
        const tokens = filterData(CONFIG.SHEETS.TOKENS, row => String(row.id_route) === String(routeId));
        if (tokens.length === 0) return;

        const tokenRow = tokens[0];
        updateRowById(
            CONFIG.SHEETS.TOKENS,
            tokenRow.token,
            CONFIG.COLUMNS.TOKENS.TOKEN,
            { date_expiration: getCurrentDateTime() }
        );
        Logger.log(`[API] 🔒 Token expiré pour route ${routeId}`);
    } catch (err) {
        Logger.log(`[API] ⚠️ Impossible d'expirer le token: ${err.message}`);
    }
}

function findStopByLivraison(routeId, livraisonId) {
    const stops = filterData(
        CONFIG.SHEETS.ETAPES_ROUTE,
        row => row.id_route === routeId && row.id_livraison === livraisonId
    );
    return stops.length > 0 ? stops[0] : null;
}

function getDeliveryStopsForRoute(routeId) {
    const stops = filterData(
        CONFIG.SHEETS.ETAPES_ROUTE,
        row => row.id_route === routeId &&
            row.id_livraison !== null &&
            row.id_livraison !== ''
    );
    return stops.sort((a, b) => (a.ordre_passage || 0) - (b.ordre_passage || 0));
}

function getStopsForRoute(routeId) {
    return getDeliveryStopsForRoute(routeId);
}

function isStopFinal(statut) {
    return statut === CONFIG.ENUMS.STATUT_ETAPE.LIVREE ||
        statut === CONFIG.ENUMS.STATUT_ETAPE.IGNOREE;
}

function updateStopStatus(etapeId, newStatut) {
    updateRowById(
        CONFIG.SHEETS.ETAPES_ROUTE,
        etapeId,
        CONFIG.COLUMNS.ETAPES_ROUTE.ID_ETAPE,
        { statut: newStatut }
    );
}

function validateToken(token) {
    try {
        const rows = filterData(CONFIG.SHEETS.TOKENS, row => row.token === token);

        if (rows.length === 0) {
            return { valid: false, routeId: null, error: 'Token invalide ou introuvable.' };
        }

        const tokenData = rows[0];
        const expiration = parseDate(tokenData.date_expiration);

        if (!isTokenValid(tokenData.force_active, expiration)) {
            return { valid: false, routeId: null, error: 'Ce lien a expiré. Contactez l\'administrateur.' };
        }

        return { valid: true, routeId: tokenData.id_route, error: null };

    } catch (err) {
        Logger.log(`[API] ❌ validateToken: ${err.message}`);
        return { valid: false, routeId: null, error: 'Erreur de validation du token.' };
    }
}

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

function htmlSuccess(title, bodyHtml, emoji) {
    return buildHtmlPage(title, bodyHtml, emoji, '#22543d', '#c6f6d5', '#38a169');
}

function htmlInfo(title, bodyHtml, emoji) {
    return buildHtmlPage(title, bodyHtml, emoji, '#2c5282', '#bee3f8', '#3182ce');
}

function htmlError(title, bodyHtml) {
    return buildHtmlPage(title, bodyHtml, '⚠️', '#742a2a', '#fed7d7', '#e53e3e');
}

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
        h1 { font-size: 22px; font-weight: 700; color: ${textColor}; margin-bottom: 16px; }
        .message {
        font-size: 15px;
        color: #4a5568;
        line-height: 1.7;
        padding: 16px;
        background: ${bgColor};
        border-radius: 8px;
        border-left: 4px solid ${accentColor};
        }
        .timestamp { margin-top: 24px; font-size: 12px; color: #a0aec0; }
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

function jsonOk(data) {
    return ContentService
        .createTextOutput(JSON.stringify(data))
        .setMimeType(ContentService.MimeType.JSON);
}