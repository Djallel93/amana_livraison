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