/**
 * ====================================================================
 * ROUTE_API.GS - API Web pour les Actions des Bénévoles
 * ====================================================================
 * Actions :
 *   ping                - Test de connexion (sans token)
 *   start_route         - Démarre la route (token requis)
 *   confirm_delivery    - Stop → Livrée (token optionnel — QR étiquette accepté)
 *   skip_delivery       - Stop → Ignorée (token requis)
 *   finish_route        - Route → Terminée (token requis)
 *   update_stop_status  - Statut conditionnement (sans token)
 */

function doGet(e) {
  return routeRequest(e);
}

function doPost(e) {
  return routeRequest(e);
}

function routeRequest(e) {
  const action = e.parameter.action;
  const token = e.parameter.token;

  Logger.log(
    `[API] 📡 /${action} — token: ${token ? token.substring(0, 8) + "…" : "aucun"}`,
  );

  try {
    if (action === "ping") {
      return jsonOk({
        status: "ok",
        timestamp: new Date().toISOString(),
        version: CONFIG.VERSION,
        message: "API Livraisons opérationnelle",
      });
    }

    if (action === "update_stop_status") {
      return handleUpdateStopStatus(e.parameter);
    }

    if (action === "confirm_delivery") {
      return handleConfirmDelivery(token, e.parameter);
    }

    if (!token) {
      return htmlError("Token manquant", "Lien invalide ou incomplet.");
    }

    const tv = validateToken(token);
    if (!tv.valid) {
      return htmlError("Lien expiré", tv.error);
    }

    const routeId = tv.routeId;

    switch (action) {
      case "start_route":
        return handleStartRoute(routeId);
      case "skip_delivery":
        return handleSkipDelivery(routeId, e.parameter);
      case "finish_route":
        return handleFinishRoute(routeId);
      default:
        return htmlError(
          "Action invalide",
          `L'action "${action}" n'existe pas.`,
        );
    }
  } catch (err) {
    Logger.log(`[API] ❌ Erreur inattendue : ${err.message}`);
    return htmlError("Erreur serveur", err.message);
  }
}

// ============================================================
// HANDLERS
// ============================================================

function handleStartRoute(routeId) {
  Logger.log(`[API] ▶️ Démarrage route — ${routeId}`);

  const route = getRouteById(routeId);
  if (!route)
    return htmlError(
      "Route introuvable",
      `La route ${routeId} est introuvable.`,
    );

  if (route.statut === CONFIG.ENUMS.STATUT_ROUTE.TERMINEE) {
    return htmlInfo(
      "Route déjà terminée",
      `La route ${routeId} est déjà terminée.`,
      "🏁",
    );
  }

  _demarrerRoute(routeId);

  Logger.log(`[API] ✅ Route ${routeId} → En Cours`);
  return htmlSuccess(
    "Route démarrée !",
    `La route <strong>${routeId}</strong> est maintenant en cours.<br>Bonne livraison !`,
    "🚗",
  );
}

function handleConfirmDelivery(token, params) {
  const livraisonId = params.id_livraison;
  Logger.log(
    `[API] ✅ Confirmation livraison — ${livraisonId}, token: ${token ? "présent" : "absent (QR étiquette)"}`,
  );

  if (!livraisonId)
    return htmlError("Paramètre manquant", "id_livraison requis.");

  let routeId;
  if (token) {
    const tv = validateToken(token);
    if (!tv.valid) return htmlError("Lien expiré", tv.error);
    routeId = tv.routeId;
  } else {
    routeId = _resolveRouteFromLivraison(livraisonId);
    if (!routeId) {
      return htmlError(
        "Route introuvable",
        `Aucune route active trouvée pour la livraison ${livraisonId}.`,
      );
    }
  }

  const stop = findStopByLivraison(routeId, livraisonId);
  if (!stop) {
    return htmlError(
      "Étape introuvable",
      `Aucune étape pour la livraison ${livraisonId} dans la route ${routeId}.`,
    );
  }

  if (stop.statut === CONFIG.ENUMS.STATUT_ETAPE.LIVREE) {
    return htmlWarning(
      "Déjà confirmée",
      `Cette livraison a déjà été marquée comme <strong>livrée</strong>.<br>Aucune action supplémentaire n'est nécessaire.`,
      "⚠️",
    );
  }

  if (stop.statut === CONFIG.ENUMS.STATUT_ETAPE.IGNOREE) {
    Logger.log(
      `[API] ℹ️ Livraison ${livraisonId} précédemment ignorée — confirmation autorisée (famille rappelée)`,
    );
  }

  _assurerRouteEnCours(routeId);

  updateStopStatus(stop.id_etape, CONFIG.ENUMS.STATUT_ETAPE.LIVREE);
  updateRowById(
    CONFIG.SHEETS.ETAPES_ROUTE,
    stop.id_etape,
    CONFIG.COLUMNS.ETAPES_ROUTE.ID_ETAPE,
    { heure_fin: getCurrentDateTime() },
  );
  updateDeliveryStatus(livraisonId, CONFIG.ENUMS.STATUT_LIVRAISON.LIVREE);

  Logger.log(`[API] ✅ Livraison ${livraisonId} → Livrée (route ${routeId})`);
  return htmlSuccess(
    "Livraison confirmée !",
    `La livraison a bien été enregistrée.<br>Merci !`,
    "✅",
  );
}

function handleSkipDelivery(routeId, params) {
  const livraisonId = params.id_livraison;
  Logger.log(
    `[API] ⏭️ Livraison ignorée — route ${routeId}, livraison ${livraisonId}`,
  );

  if (!livraisonId)
    return htmlError("Paramètre manquant", "id_livraison requis.");

  const stop = findStopByLivraison(routeId, livraisonId);
  if (!stop) {
    return htmlError(
      "Étape introuvable",
      `Aucune étape pour la livraison ${livraisonId} dans la route ${routeId}.`,
    );
  }

  if (stop.statut === CONFIG.ENUMS.STATUT_ETAPE.IGNOREE) {
    return htmlWarning(
      "Déjà ignorée",
      `Cette livraison a déjà été marquée comme <strong>ignorée</strong>.<br>Si la famille vous a rappelé, utilisez le bouton <strong>Livré</strong>.`,
      "⚠️",
    );
  }

  if (stop.statut === CONFIG.ENUMS.STATUT_ETAPE.LIVREE) {
    return htmlWarning(
      "Livraison déjà effectuée",
      `Cette livraison a déjà été marquée comme <strong>livrée</strong>.<br>Elle ne peut pas être ignorée.`,
      "⚠️",
    );
  }

  _assurerRouteEnCours(routeId);

  updateStopStatus(stop.id_etape, CONFIG.ENUMS.STATUT_ETAPE.IGNOREE);
  updateRowById(
    CONFIG.SHEETS.ETAPES_ROUTE,
    stop.id_etape,
    CONFIG.COLUMNS.ETAPES_ROUTE.ID_ETAPE,
    { heure_fin: getCurrentDateTime(), commentaire: "Ignorée par le bénévole" },
  );

  Logger.log(`[API] ⏭️ Livraison ${livraisonId} → Ignorée`);
  sendSkipNotificationToAdmin(routeId, livraisonId);

  return htmlSuccess(
    "Livraison ignorée",
    `La livraison a été marquée comme ignorée.<br>L'administrateur a été notifié.`,
    "⏭️",
  );
}

function handleFinishRoute(routeId) {
  Logger.log(`[API] 🏁 Fin de route — ${routeId}`);

  const route = getRouteById(routeId);
  if (!route)
    return htmlError(
      "Route introuvable",
      `La route ${routeId} est introuvable.`,
    );

  if (route.statut === CONFIG.ENUMS.STATUT_ROUTE.TERMINEE) {
    return htmlInfo(
      "Route déjà terminée",
      `La route ${routeId} était déjà terminée.`,
      "🏁",
    );
  }

  const stops = getDeliveryStopsForRoute(routeId);
  const stopsPendants = stops.filter((s) => !isStopFinal(s.statut));

  if (stopsPendants.length > 0) {
    const ids = stopsPendants.map((s) => s.id_livraison).join(", ");
    return htmlError(
      "Livraisons en attente",
      `${stopsPendants.length} livraison(s) non traitée(s) : ${ids}.<br>
      Veuillez les marquer comme <strong>Livrées</strong> ou <strong>Ignorées</strong> avant de terminer.`,
    );
  }

  completeRoute(routeId);
  expireToken(routeId);

  return htmlSuccess(
    "Route terminée !",
    `Merci pour votre aide !<br>La route <strong>${routeId}</strong> est maintenant terminée.`,
    "🏁",
  );
}

function handleUpdateStopStatus(params) {
  const livraisonId = params.id_livraison;
  const statut = params.statut;

  Logger.log(
    `[API] 📦 Mise à jour conditionnement — livraison ${livraisonId}, statut ${statut}`,
  );

  if (!livraisonId)
    return htmlError("Paramètre manquant", "id_livraison requis.");
  if (!statut) return htmlError("Paramètre manquant", "statut requis.");

  const statutsValides = [...Object.values(CONFIG.ENUMS.STATUT_ETAPE)];
  if (!statutsValides.includes(statut)) {
    return htmlError("Statut invalide", `Statut "${statut}" non reconnu.`);
  }

  const livraison = getDeliveryById(livraisonId);
  if (!livraison) {
    return htmlError(
      "Livraison introuvable",
      `La livraison ${livraisonId} est introuvable.`,
    );
  }

  if (
    livraison.statut_conditionnement ===
    CONFIG.ENUMS.STATUT_CONDITIONNEMENT.PRETE
  ) {
    return htmlWarning(
      "Colis déjà prêt",
      `Ce colis a déjà été marqué comme <strong>prêt</strong>.<br>Aucune action supplémentaire n'est nécessaire.`,
      "⚠️",
    );
  }

  updateRowById(
    CONFIG.SHEETS.LIVRAISON,
    livraisonId,
    CONFIG.COLUMNS.LIVRAISON.ID_LIVRAISON,
    { statut_conditionnement: statut, date_modification: getCurrentDateTime() },
  );

  Logger.log(
    `[API] ✅ Livraison ${livraisonId} → statut_conditionnement: ${statut}`,
  );

  if (statut === CONFIG.ENUMS.STATUT_CONDITIONNEMENT.PRETE) {
    _processConditionnementPrete(livraisonId);
  }

  return htmlSuccess(
    "Colis marqué Prêt !",
    `La livraison <strong>${livraisonId}</strong> a été marquée comme prête.<br>Merci !`,
    "📦",
  );
}

// ============================================================
// HELPERS INTERNES
// ============================================================

function _assurerRouteEnCours(routeId) {
  const route = getRouteById(routeId);
  if (!route) return;
  if (route.statut === CONFIG.ENUMS.STATUT_ROUTE.EN_COURS) return;

  Logger.log(
    `[API] ▶️ Démarrage automatique de la route ${routeId} (statut actuel: ${route.statut})`,
  );
  _demarrerRoute(routeId);
}

function _demarrerRoute(routeId) {
  updateRouteStatus(routeId, CONFIG.ENUMS.STATUT_ROUTE.EN_COURS);

  const stops = getDeliveryStopsForRoute(routeId);
  stops.forEach((stop) => {
    if (
      stop.statut === CONFIG.ENUMS.STATUT_ETAPE.EN_ATTENTE ||
      stop.statut === CONFIG.ENUMS.STATUT_ETAPE.PRETE
    ) {
      updateStopStatus(stop.id_etape, CONFIG.ENUMS.STATUT_ETAPE.EN_COURS);
    }
  });
}

function _resolveRouteFromLivraison(livraisonId) {
  const etapes = filterData(
    CONFIG.SHEETS.ETAPES_ROUTE,
    (row) => row.id_livraison === livraisonId,
  );

  if (etapes.length === 0) {
    Logger.log(
      `[API] ⚠️ Aucune étape trouvée pour la livraison ${livraisonId}`,
    );
    return null;
  }

  const priorite = {
    [CONFIG.ENUMS.STATUT_ROUTE.EN_COURS]: 4,
    [CONFIG.ENUMS.STATUT_ROUTE.PRETE]: 3,
    [CONFIG.ENUMS.STATUT_ROUTE.CONFIRMEE]: 2,
    [CONFIG.ENUMS.STATUT_ROUTE.BROUILLON]: 1,
    [CONFIG.ENUMS.STATUT_ROUTE.TERMINEE]: 0,
    [CONFIG.ENUMS.STATUT_ROUTE.ANNULEE]: 0,
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

  Logger.log(
    `[API] 🔍 Route résolue pour livraison ${livraisonId} : ${meilleure}`,
  );
  return meilleure;
}
