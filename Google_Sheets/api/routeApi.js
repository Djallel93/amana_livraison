/**
 * ====================================================================
 * ROUTE_API.GS - API Web pour les Actions des Bénévoles
 * ====================================================================
 * 
 * Endpoints pour les bénévoles :
 * - GET /ping - Test de connectivité
 * - POST /start_route - Démarrer une route
 * - POST /confirm_delivery - Confirmer une livraison
 * - POST /skip_delivery - Sauter une livraison
 * 
 * Sécurité : Tous les endpoints (sauf ping) nécessitent un token valide
 */

/**
 * Fonction principale GET - Router
 * @param {Object} e - Event parameters
 * @returns {HtmlOutput|TextOutput}
 */
function doGet(e) {
  const action = e.parameter.action;
  const token = e.parameter.token;

  Logger.log(`[API] 📡 GET /${action} - Token: ${token ? '***' : 'none'}`);

  try {
    // Endpoint ping (pas besoin de token)
    if (action === 'ping') {
      return createJsonResponse({
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: CONFIG.VERSION,
        message: 'API Livraisons opérationnelle'
      });
    }

    // Vérifier le token pour les autres actions
    if (!token) {
      return createErrorResponse('Token manquant', 401);
    }

    const tokenValidation = validateToken(token);
    if (!tokenValidation.valid) {
      return createErrorResponse(tokenValidation.error, 401);
    }

    const routeId = tokenValidation.routeId;

    // Router les actions
    switch (action) {
      case 'start_route':
        return handleStartRoute(routeId, e.parameter);

      case 'confirm_delivery':
        return handleConfirmDelivery(routeId, e.parameter);

      case 'skip_delivery':
        return handleSkipDelivery(routeId, e.parameter);

      default:
        return createErrorResponse('Action invalide', 400);
    }

  } catch (error) {
    Logger.log(`[API] ❌ Erreur: ${error.message}`);
    return createErrorResponse(`Erreur serveur: ${error.message}`, 500);
  }
}

/**
 * Fonction principale POST (même comportement que GET pour simplicité)
 */
function doPost(e) {
  return doGet(e);
}

/**
 * Valide un token
 * @param {string} token - Token à valider
 * @returns {Object} {valid: boolean, routeId: string, error: string}
 */
function validateToken(token) {
  try {
    const tokens = filterData(CONFIG.SHEETS.TOKENS, row => row.token === token);

    if (tokens.length === 0) {
      return { valid: false, error: 'Token invalide' };
    }

    const tokenData = tokens[0];

    // Vérifier l'expiration
    const expiration = parseDate(tokenData.date_expiration);
    if (isTokenExpired(expiration)) {
      return { valid: false, error: 'Token expiré' };
    }

    return {
      valid: true,
      routeId: tokenData.id_route,
      error: null
    };

  } catch (error) {
    Logger.log(`[API] ❌ Erreur validation token: ${error.message}`);
    return { valid: false, error: 'Erreur validation token' };
  }
}

/**
 * Démarre une route
 * @param {string} routeId - ID de la route
 * @param {Object} params - Paramètres
 * @returns {HtmlOutput}
 */
function handleStartRoute(routeId, params) {
  Logger.log(`[API] ▶️ Démarrage route ${routeId}`);

  try {
    const route = getRouteById(routeId);

    if (!route) {
      return createErrorResponse('Route introuvable', 404);
    }

    // Vérifier le statut
    if (route.statut !== CONFIG.ENUMS.STATUT_ROUTE.CONFIRMEE) {
      return createErrorResponse(`Route doit être Confirmée (statut actuel: ${route.statut})`, 400);
    }

    // Mettre à jour le statut de la route
    updateRouteStatus(routeId, CONFIG.ENUMS.STATUT_ROUTE.EN_COURS);

    // Récupérer la première étape
    const etapes = getStopsForRoute(routeId);
    if (etapes.length > 0) {
      const firstEtape = etapes[0];

      // Mettre à jour la première étape
      updateStopStatus(firstEtape.id_etape, CONFIG.ENUMS.STATUT_ETAPE.EN_COURS);

      // Enregistrer l'heure de début
      updateRowById(
        CONFIG.SHEETS.ETAPES_ROUTE,
        firstEtape.id_etape,
        CONFIG.COLUMNS.ETAPES_ROUTE.ID_ETAPE,
        { heure_debut: getCurrentDateTime() }
      );

      // Mettre à jour la livraison
      updateDeliveryStatus(firstEtape.id_livraison, CONFIG.ENUMS.STATUT_LIVRAISON.EN_COURS);
    }

    Logger.log(`[API] ✅ Route ${routeId} démarrée`);

    // Retourner une page HTML de confirmation
    return createSuccessHtml(
      'Route Démarrée',
      `La route ${routeId} a été démarrée avec succès !`,
      '✅'
    );

  } catch (error) {
    Logger.log(`[API] ❌ Erreur démarrage route: ${error.message}`);
    return createErrorResponse(`Erreur: ${error.message}`, 500);
  }
}

/**
 * Confirme une livraison
 * @param {string} routeId - ID de la route
 * @param {Object} params - Paramètres
 * @returns {HtmlOutput}
 */
function handleConfirmDelivery(routeId, params) {
  const livraisonId = params.id_livraison || params.id_etape;

  Logger.log(`[API] ✅ Confirmation livraison ${livraisonId} (route ${routeId})`);

  try {
    // Trouver l'étape en cours pour cette livraison
    const etapes = filterData(CONFIG.SHEETS.ETAPES_ROUTE, row =>
      row.id_route === routeId &&
      row.id_livraison === livraisonId &&
      row.statut === CONFIG.ENUMS.STATUT_ETAPE.EN_COURS
    );

    if (etapes.length === 0) {
      return createErrorResponse('Étape introuvable ou déjà traitée', 404);
    }

    const etape = etapes[0];

    // 1. Mettre à jour l'étape actuelle : En Cours → Livrée
    updateStopStatus(etape.id_etape, CONFIG.ENUMS.STATUT_ETAPE.LIVREE);

    // Enregistrer l'heure de fin
    updateRowById(
      CONFIG.SHEETS.ETAPES_ROUTE,
      etape.id_etape,
      CONFIG.COLUMNS.ETAPES_ROUTE.ID_ETAPE,
      { heure_fin: getCurrentDateTime() }
    );

    // 2. Mettre à jour la livraison : En Cours → Livrée
    updateDeliveryStatus(etape.id_livraison, CONFIG.ENUMS.STATUT_LIVRAISON.LIVREE);

    // 3. Passer à l'étape suivante
    const toutesEtapes = getStopsForRoute(routeId);
    const currentIndex = toutesEtapes.findIndex(e => e.id_etape === etape.id_etape);

    if (currentIndex !== -1 && currentIndex < toutesEtapes.length - 1) {
      const nextEtape = toutesEtapes[currentIndex + 1];

      // Mettre à jour l'étape suivante : En Attente → En Cours
      updateStopStatus(nextEtape.id_etape, CONFIG.ENUMS.STATUT_ETAPE.EN_COURS);

      updateRowById(
        CONFIG.SHEETS.ETAPES_ROUTE,
        nextEtape.id_etape,
        CONFIG.COLUMNS.ETAPES_ROUTE.ID_ETAPE,
        { heure_debut: getCurrentDateTime() }
      );

      // Mettre à jour la livraison suivante
      updateDeliveryStatus(nextEtape.id_livraison, CONFIG.ENUMS.STATUT_LIVRAISON.EN_COURS);

      Logger.log(`[API] 📍 Prochaine étape: ${nextEtape.id_etape}`);
    } else {
      // C'était la dernière étape - terminer la route
      updateRouteStatus(routeId, CONFIG.ENUMS.STATUT_ROUTE.TERMINEE);

      updateRowById(
        CONFIG.SHEETS.ROUTES,
        routeId,
        CONFIG.COLUMNS.ROUTES.ID_ROUTE,
        { date_fin: getCurrentDateTime() }
      );

      Logger.log(`[API] 🏁 Route ${routeId} terminée`);
    }

    Logger.log(`[API] ✅ Livraison ${livraisonId} confirmée`);

    return createSuccessHtml(
      'Livraison Confirmée',
      `La livraison a été confirmée avec succès !`,
      '✅'
    );

  } catch (error) {
    Logger.log(`[API] ❌ Erreur confirmation: ${error.message}`);
    return createErrorResponse(`Erreur: ${error.message}`, 500);
  }
}

/**
 * Saute une livraison (famille absente, etc.)
 * @param {string} routeId - ID de la route
 * @param {Object} params - Paramètres
 * @returns {HtmlOutput}
 */
function handleSkipDelivery(routeId, params) {
  const livraisonId = params.id_livraison || params.id_etape;

  Logger.log(`[API] ⏭️ Saut livraison ${livraisonId} (route ${routeId})`);

  try {
    // Trouver l'étape en cours
    const etapes = filterData(CONFIG.SHEETS.ETAPES_ROUTE, row =>
      row.id_route === routeId &&
      row.id_livraison === livraisonId &&
      row.statut === CONFIG.ENUMS.STATUT_ETAPE.EN_COURS
    );

    if (etapes.length === 0) {
      return createErrorResponse('Étape introuvable ou déjà traitée', 404);
    }

    const etape = etapes[0];

    // 1. Mettre à jour l'étape : En Cours → Sautée
    updateStopStatus(etape.id_etape, CONFIG.ENUMS.STATUT_ETAPE.SAUTEE);

    updateRowById(
      CONFIG.SHEETS.ETAPES_ROUTE,
      etape.id_etape,
      CONFIG.COLUMNS.ETAPES_ROUTE.ID_ETAPE,
      {
        heure_fin: getCurrentDateTime(),
        commentaire: 'Sautée par le bénévole'
      }
    );

    // 2. Remettre la livraison en Non Assignée (pour réassignation)
    updateDeliveryStatus(etape.id_livraison, CONFIG.ENUMS.STATUT_LIVRAISON.NON_ASSIGNEE);

    // 3. Envoyer notification à l'admin
    sendSkipNotificationToAdmin(routeId, etape.id_livraison);

    // 4. Passer à l'étape suivante
    const toutesEtapes = getStopsForRoute(routeId);
    const currentIndex = toutesEtapes.findIndex(e => e.id_etape === etape.id_etape);

    if (currentIndex !== -1 && currentIndex < toutesEtapes.length - 1) {
      const nextEtape = toutesEtapes[currentIndex + 1];

      updateStopStatus(nextEtape.id_etape, CONFIG.ENUMS.STATUT_ETAPE.EN_COURS);

      updateRowById(
        CONFIG.SHEETS.ETAPES_ROUTE,
        nextEtape.id_etape,
        CONFIG.COLUMNS.ETAPES_ROUTE.ID_ETAPE,
        { heure_debut: getCurrentDateTime() }
      );

      updateDeliveryStatus(nextEtape.id_livraison, CONFIG.ENUMS.STATUT_LIVRAISON.EN_COURS);
    }

    Logger.log(`[API] ⏭️ Livraison ${livraisonId} sautée`);

    return createSuccessHtml(
      'Livraison Sautée',
      `La livraison a été marquée comme sautée. L'administrateur a été notifié.`,
      '⏭️'
    );

  } catch (error) {
    Logger.log(`[API] ❌ Erreur saut: ${error.message}`);
    return createErrorResponse(`Erreur: ${error.message}`, 500);
  }
}

/**
 * Envoie une notification à l'admin pour une livraison sautée
 * @param {string} routeId - ID de la route
 * @param {string} livraisonId - ID de la livraison
 */
function sendSkipNotificationToAdmin(routeId, livraisonId) {
  try {
    const delivery = getDeliveryById(livraisonId);
    const route = getRouteById(routeId);

    if (!delivery || !route) {
      return;
    }

    const subject = CONFIG.EMAIL.SUBJECT_ADMIN_SKIP;
    const body = `
Bonjour,

Une livraison a été sautée par un bénévole :

Route : ${routeId}
Livraison : ${livraisonId}
Famille : ${delivery.id_famille}
Adresse : ${delivery.adresse}
Date : ${getCurrentDateTime()}

Actions possibles :
- Réassigner à un autre bénévole
- Contacter la famille pour reprogrammer

Cordialement,
Système de Gestion des Livraisons
    `;

    MailApp.sendEmail({
      to: CONFIG.EMAIL.ADMIN_EMAIL,
      subject: subject,
      body: body
    });

    Logger.log(`[API] 📧 Notification admin envoyée pour livraison ${livraisonId}`);

  } catch (error) {
    Logger.log(`[API] ⚠️ Erreur envoi notification admin: ${error.message}`);
  }
}

/**
 * Crée une réponse JSON
 * @param {Object} data - Données à retourner
 * @returns {TextOutput}
 */
function createJsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Crée une réponse d'erreur
 * @param {string} message - Message d'erreur
 * @param {number} code - Code HTTP
 * @returns {TextOutput}
 */
function createErrorResponse(message, code) {
  const response = {
    error: true,
    message: message,
    code: code,
    timestamp: new Date().toISOString()
  };

  return ContentService
    .createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Crée une page HTML de succès
 * @param {string} title - Titre
 * @param {string} message - Message
 * @param {string} emoji - Emoji
 * @returns {HtmlOutput}
 */
function createSuccessHtml(title, message, emoji) {
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: Arial, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    }
    .container {
      background: white;
      padding: 40px;
      border-radius: 12px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.2);
      text-align: center;
      max-width: 400px;
    }
    .emoji {
      font-size: 64px;
      margin-bottom: 20px;
    }
    h1 {
      color: #2d3748;
      margin-bottom: 15px;
      font-size: 24px;
    }
    p {
      color: #4a5568;
      line-height: 1.6;
      margin-bottom: 30px;
    }
    .button {
      display: inline-block;
      padding: 12px 30px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      text-decoration: none;
      border-radius: 6px;
      font-weight: 600;
    }
    .timestamp {
      margin-top: 20px;
      font-size: 12px;
      color: #a0aec0;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="emoji">${emoji}</div>
    <h1>${title}</h1>
    <p>${message}</p>
    <div class="timestamp">${new Date().toLocaleString('fr-FR')}</div>
  </div>
</body>
</html>
  `;

  return HtmlService.createHtmlOutput(html);
}
