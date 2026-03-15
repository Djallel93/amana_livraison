/**
 * ====================================================================
 * ROUTE_API.GS - API Web pour les Actions des Bénévoles
 * ====================================================================
 * Actions disponibles :
 *   ping                - Test de connexion (sans token)
 *   start_route         - Démarre la route (token requis)
 *   confirm_delivery    - Stop → Livrée (token optionnel — QR étiquette accepté)
 *   skip_delivery       - Stop → ignorée (token requis)
 *   finish_route        - Route → Terminée (token requis)
 *   update_stop_status  - Statut conditionnement (sans token)
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

        if (action === 'update_stop_status') {
            return handleUpdateStopStatus(e.parameter);
        }

        // confirm_delivery accepte les requêtes avec ou sans token (QR étiquette)
        if (action === 'confirm_delivery') {
            return handleConfirmDelivery(token, e.parameter);
        }

        // Toutes les autres actions nécessitent un token valide
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
            case 'skip_delivery': return handleSkipDelivery(routeId, e.parameter);
            case 'finish_route': return handleFinishRoute(routeId);
            default:
                return htmlError('Action invalide', `L'action "${action}" n'existe pas.`);
        }

    } catch (err) {
        Logger.log(`[API] ❌ Erreur inattendue : ${err.message}`);
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

    const stops = getDeliveryStopsForRoute(routeId);
    let updated = 0;
    for (const stop of stops) {
        if (stop.statut === CONFIG.ENUMS.STATUT_ETAPE.EN_ATTENTE ||
            stop.statut === CONFIG.ENUMS.STATUT_ETAPE.PRETE) {
            updateStopStatus(stop.id_etape, CONFIG.ENUMS.STATUT_ETAPE.EN_COURS);
            updated++;
        }
    }

    Logger.log(`[API] ✅ Route ${routeId} → En Cours, ${updated} étapes mises à jour`);

    return htmlSuccess(
        'Route démarrée !',
        `La route <strong>${routeId}</strong> est maintenant en cours.<br>Bonne livraison !`,
        '🚗'
    );
}

/**
 * Confirme une livraison.
 * Accepte un token (lien email) ou aucun token (scan QR étiquette).
 * Lorsqu'il n'y a pas de token, la route est résolue dynamiquement
 * depuis l'id_livraison.
 *
 * @param {string|undefined} token
 * @param {Object} params
 */
function handleConfirmDelivery(token, params) {
    const livraisonId = params.id_livraison;
    Logger.log(`[API] ✅ confirm_delivery — livraison ${livraisonId}, token: ${token ? 'présent' : 'absent (QR étiquette)'}`);

    if (!livraisonId) return htmlError('Paramètre manquant', 'id_livraison requis.');

    let routeId;

    if (token) {
        const tv = validateToken(token);
        if (!tv.valid) return htmlError('Lien expiré', tv.error);
        routeId = tv.routeId;
    } else {
        routeId = _resolveRouteFromLivraison(livraisonId);
        if (!routeId) {
            return htmlError(
                'Route introuvable',
                `Aucune route active trouvée pour la livraison ${livraisonId}.`
            );
        }
    }

    const stop = findStopByLivraison(routeId, livraisonId);
    if (!stop) {
        return htmlError(
            'Étape introuvable',
            `Aucune étape pour la livraison ${livraisonId} dans la route ${routeId}.`
        );
    }

    if (stop.statut === CONFIG.ENUMS.STATUT_ETAPE.LIVREE) {
        return htmlInfo('Déjà livrée', `La livraison ${livraisonId} a déjà été confirmée.`, '✅');
    }

    updateStopStatus(stop.id_etape, CONFIG.ENUMS.STATUT_ETAPE.LIVREE);
    updateRowById(
        CONFIG.SHEETS.ETAPES_ROUTE,
        stop.id_etape,
        CONFIG.COLUMNS.ETAPES_ROUTE.ID_ETAPE,
        { heure_fin: getCurrentDateTime() }
    );
    updateDeliveryStatus(livraisonId, CONFIG.ENUMS.STATUT_LIVRAISON.LIVREE);

    Logger.log(`[API] ✅ Livraison ${livraisonId} → Livrée (route ${routeId})`);

    return htmlSuccess('Livraison confirmée !', `La livraison a été enregistrée.<br>Merci !`, '✅');
}

function handleSkipDelivery(routeId, params) {
    const livraisonId = params.id_livraison;
    Logger.log(`[API] ⏭️ skip_delivery — route ${routeId}, livraison ${livraisonId}`);

    if (!livraisonId) return htmlError('Paramètre manquant', 'id_livraison requis.');

    const stop = findStopByLivraison(routeId, livraisonId);
    if (!stop) {
        return htmlError(
            'Étape introuvable',
            `Aucune étape pour la livraison ${livraisonId} dans la route ${routeId}.`
        );
    }

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
 * Endpoint sans token — équipe de conditionnement interne.
 */
function handleUpdateStopStatus(params) {
    const livraisonId = params.id_livraison;
    const statut = params.statut;

    Logger.log(`[API] 📦 update_stop_status — livraison ${livraisonId}, statut ${statut}`);

    if (!livraisonId) return htmlError('Paramètre manquant', 'id_livraison requis.');
    if (!statut) return htmlError('Paramètre manquant', 'statut requis.');

    const statutsValides = [...Object.values(CONFIG.ENUMS.STATUT_ETAPE)];
    if (!statutsValides.includes(statut)) {
        return htmlError('Statut invalide', `Statut "${statut}" non reconnu.`);
    }

    const livraison = getDeliveryById(livraisonId);
    if (!livraison) {
        return htmlError('Livraison introuvable', `La livraison ${livraisonId} est introuvable.`);
    }

    updateRowById(
        CONFIG.SHEETS.LIVRAISON,
        livraisonId,
        CONFIG.COLUMNS.LIVRAISON.ID_LIVRAISON,
        { statut_conditionnement: statut, date_modification: getCurrentDateTime() }
    );

    Logger.log(`[API] ✅ Livraison ${livraisonId} → statut_conditionnement: ${statut}`);

    if (statut === CONFIG.ENUMS.STATUT_CONDITIONNEMENT.PRETE) {
        _processConditionnementPrete(livraisonId);
    }

    return htmlSuccess(
        'Colis marqué Prêt !',
        `La livraison <strong>${livraisonId}</strong> a été marquée comme prête.<br>Merci !`,
        '📦'
    );
}

// ============================================================
// RÉSOLUTION DYNAMIQUE DE LA ROUTE
// ============================================================

/**
 * Retrouve la route active contenant une livraison donnée.
 * Utilisé pour les scans QR étiquettes (sans token).
 * Priorité : En Cours > Prête > Confirmée > Brouillon.
 *
 * @param {string} livraisonId
 * @returns {string|null} ID de la route ou null si introuvable
 */
function _resolveRouteFromLivraison(livraisonId) {
    const etapes = filterData(
        CONFIG.SHEETS.ETAPES_ROUTE,
        row => row.id_livraison === livraisonId
    );

    if (etapes.length === 0) {
        Logger.log(`[API] ⚠️ Aucune étape trouvée pour livraison ${livraisonId}`);
        return null;
    }

    const priorite = {
        [CONFIG.ENUMS.STATUT_ROUTE.EN_COURS]: 4,
        [CONFIG.ENUMS.STATUT_ROUTE.PRETE]: 3,
        [CONFIG.ENUMS.STATUT_ROUTE.CONFIRMEE]: 2,
        [CONFIG.ENUMS.STATUT_ROUTE.BROUILLON]: 1,
        [CONFIG.ENUMS.STATUT_ROUTE.TERMINEE]: 0,
        [CONFIG.ENUMS.STATUT_ROUTE.ANNULEE]: 0
    };

    let meilleure = null;
    let meilleureScore = -1;

    for (const etape of etapes) {
        const route = getRouteById(etape.id_route);
        if (!route) continue;

        const score = priorite[normalizeStatut(route.statut)] || 0;
        if (score > meilleureScore) {
            meilleureScore = score;
            meilleure = route.id_route;
        }
    }

    Logger.log(`[API] 🔍 Route résolue pour livraison ${livraisonId} : ${meilleure}`);
    return meilleure;
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
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

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
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
            padding: 48px 40px;
            text-align: center;
            max-width: 420px;
            width: 100%;
        }

        .emoji {
            font-size: 72px;
            margin-bottom: 24px;
            line-height: 1;
        }

        h1 {
            font-size: 22px;
            font-weight: 700;

            color: $ {
                textColor
            }

            ;
            margin-bottom: 16px;
        }

        .message {
            font-size: 15px;
            color: #4a5568;
            line-height: 1.7;
            padding: 16px;

            background: $ {
                bgColor
            }

            ;
            border-radius: 8px;

            border-left: 4px solid $ {
                accentColor
            }

            ;
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

function jsonOk(data) {
    return ContentService
        .createTextOutput(JSON.stringify(data))
        .setMimeType(ContentService.MimeType.JSON);
}