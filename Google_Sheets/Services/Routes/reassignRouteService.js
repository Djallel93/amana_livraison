// ============================================================
// RÉASSIGNATION — Option 1
// ============================================================

function reassignRoute(params) {
  Logger.log(
    `[RÉASSIGN] 🚀 Début réassignation route ${params.id_route} → bénévole ${params.id_benevole}`,
  );

  const route = getRouteById(params.id_route);
  if (!route) throw new Error(`Route ${params.id_route} introuvable`);

  const statutOriginal = normalizeStatut(route.statut);
  const etaitPrete = statutOriginal === CONFIG.ENUMS.STATUT_ROUTE.PRETE;

  const benevoleResponse = getVolunteerById(params.id_benevole);
  const benevole = extractData(benevoleResponse, ["volunteer", "benevole"]);
  if (!benevole) throw new Error(`Bénévole ${params.id_benevole} introuvable`);

  const vehicule = _getVehiculeBenevole(benevole);
  if (!vehicule)
    throw new Error(
      `Aucun véhicule valide pour le bénévole ${params.id_benevole}`,
    );

  const capaciteKg = parseFloat(vehicule.capaciteKg) || 0;
  const nombrePartMax = parseFloat(vehicule.nombrePartMax) || 0;
  const poidsParPart = parseFloat(route.poids_par_part) || 0;
  const poidsParPartHotel =
    parseFloat(route.poids_par_part_hotel) || poidsParPart;

  const stopsExistants = getDeliveryStopsForRoute(params.id_route);
  const livraisonsExistantes = stopsExistants
    .map((s) => getDeliveryById(s.id_livraison))
    .filter(Boolean);

  const { assignees, surplus } = _fitLivraisons(
    livraisonsExistantes,
    capaciteKg,
    nombrePartMax,
    poidsParPart,
    poidsParPartHotel,
  );

  Logger.log(
    `[RÉASSIGN] Capacité véhicule: ${capaciteKg}kg — assignées: ${assignees.length}, surplus: ${surplus.length}`,
  );

  const hqConfig = getCurrentHqConfig();
  const hqCoords =
    hqConfig && hqConfig.lat && hqConfig.lng
      ? { lat: hqConfig.lat, lng: hqConfig.lng }
      : null;

  let livraisonsFinales = assignees;

  const capaciteOrigKg = _getCapaciteRouteOrigine(
    livraisonsExistantes,
    poidsParPart,
    poidsParPartHotel,
  );
  const plusGrandVehicule = capaciteKg > capaciteOrigKg;

  if (plusGrandVehicule && hqCoords) {
    Logger.log(
      `[RÉASSIGN] Véhicule plus grand — recherche de stops supplémentaires proches`,
    );
    const extras = _chercherStopsProches(
      params.id_route,
      livraisonsExistantes,
      route.date_debut,
      capaciteKg,
      nombrePartMax,
      poidsParPart,
      poidsParPartHotel,
      livraisonsFinales,
    );
    if (extras.length > 0) {
      Logger.log(
        `[RÉASSIGN] ${extras.length} stop(s) supplémentaire(s) trouvé(s)`,
      );
      livraisonsFinales = [...livraisonsFinales, ...extras];
    }
  }

  if (surplus.length > 0) {
    _libererLivraisons(surplus, params.id_route);
    Logger.log(
      `[RÉASSIGN] ${surplus.length} livraison(s) libérée(s) → Non Assignée`,
    );
  }

  let livraisonsOptimisees = livraisonsFinales;
  if (hqCoords && livraisonsFinales.length > 1) {
    livraisonsOptimisees = optimizeDeliveryOrder(livraisonsFinales, hqCoords);
  }

  _supprimerEtapesRoute(params.id_route);
  createOptimizedEtapes(params.id_route, livraisonsOptimisees);

  const poidsTotal = _calculerPoidsTotal(
    livraisonsOptimisees,
    poidsParPart,
    poidsParPartHotel,
  );
  const distanceTotale = hqCoords
    ? calculerDistanceTotaleRoute(livraisonsOptimisees, hqCoords)
    : 0;
  const lienMaps = hqCoords
    ? generateGoogleMapsLink(livraisonsOptimisees, hqCoords)
    : "";

  updateRowById(
    CONFIG.SHEETS.ROUTES,
    params.id_route,
    CONFIG.COLUMNS.ROUTES.ID_ROUTE,
    {
      id_benevole: benevole.id,
      poids_total_kg: Math.round(poidsTotal * 100) / 100,
      distance_totale_km: Math.round(distanceTotale * 100) / 100,
      lien_maps: lienMaps,
      date_modification: getCurrentDateTime(),
    },
  );

  try {
    const adminPhone =
      PropertiesService.getScriptProperties().getProperty("ADMIN_PHONE") || "";
    generateRouteDoc(params.id_route, adminPhone);
    Logger.log(
      `[RÉASSIGN] 📄 Feuille imprimable régénérée pour ${params.id_route}`,
    );
  } catch (err) {
    Logger.log(`[RÉASSIGN] ⚠️ Feuille non régénérée : ${err.message}`);
  }

  if (etaitPrete) {
    const apiWebUrl =
      PropertiesService.getScriptProperties().getProperty(
        "API_LIVRAISON_URL",
      ) || "";
    const adminPhone =
      PropertiesService.getScriptProperties().getProperty("ADMIN_PHONE") || "";
    if (apiWebUrl) {
      try {
        sendRouteEmail(params.id_route, apiWebUrl, adminPhone);
        Logger.log(`[RÉASSIGN] 📧 Email renvoyé pour route ${params.id_route}`);
      } catch (err) {
        Logger.log(`[RÉASSIGN] ⚠️ Email non envoyé : ${err.message}`);
      }
    }
  }

  const benevoleNom = `${benevole.prenom || ""} ${benevole.nom || ""}`.trim();
  Logger.log(
    `[RÉASSIGN] ✅ Route ${params.id_route} réassignée à ${benevoleNom}`,
  );

  return {
    success: true,
    id_route: params.id_route,
    benevole_nom: benevoleNom,
    nb_livraisons: livraisonsOptimisees.length,
    nb_surplus: surplus.length,
    nb_extras: livraisonsFinales.length - assignees.length,
    poids_total_kg: Math.round(poidsTotal * 100) / 100,
    distance_totale_km: Math.round(distanceTotale * 100) / 100,
    email_envoye: etaitPrete,
    lien_maps: lienMaps,
  };
}

// ============================================================
// DIVISION — Option 2
// ============================================================

function splitRoute(params) {
  Logger.log(
    `[DIVISION] 🚀 Division route ${params.id_route} → ${(params.benevole_ids || []).length} bénévoles`,
  );

  const route = getRouteById(params.id_route);
  if (!route) throw new Error(`Route ${params.id_route} introuvable`);

  const etaitPrete =
    normalizeStatut(route.statut) === CONFIG.ENUMS.STATUT_ROUTE.PRETE;

  const stopsExistants = getDeliveryStopsForRoute(params.id_route);
  const livraisons = stopsExistants
    .map((s) => getDeliveryById(s.id_livraison))
    .filter(Boolean);

  if (livraisons.length === 0) throw new Error("Aucune livraison à diviser");

  const poidsParPart = parseFloat(route.poids_par_part) || 0;
  const poidsParPartHotel =
    parseFloat(route.poids_par_part_hotel) || poidsParPart;

  const benevoles = _chargerBenevolesAvecVehicule(params.benevole_ids);
  benevoles.sort((a, b) => b.capaciteKg - a.capaciteKg);

  Logger.log(
    `[DIVISION] ${benevoles.length} bénévole(s) chargé(s), ${livraisons.length} livraison(s) à répartir`,
  );

  const attribution = _repartirLivraisons(
    livraisons,
    benevoles,
    poidsParPart,
    poidsParPartHotel,
  );

  const hqConfig = getCurrentHqConfig();
  const hqCoords =
    hqConfig && hqConfig.lat && hqConfig.lng
      ? { lat: hqConfig.lat, lng: hqConfig.lng }
      : null;

  updateRowById(
    CONFIG.SHEETS.ROUTES,
    params.id_route,
    CONFIG.COLUMNS.ROUTES.ID_ROUTE,
    {
      statut: CONFIG.ENUMS.STATUT_ROUTE.ANNULEE,
      date_modification: getCurrentDateTime(),
    },
  );
  Logger.log(`[DIVISION] Route originale ${params.id_route} → Annulée`);

  if (attribution.nonAssignees.length > 0) {
    _libererLivraisons(attribution.nonAssignees, params.id_route);
    Logger.log(
      `[DIVISION] ${attribution.nonAssignees.length} livraison(s) non assignée(s) libérée(s)`,
    );
  }

  const nouvellesRoutes = [];
  const apiWebUrl =
    PropertiesService.getScriptProperties().getProperty("API_LIVRAISON_URL") ||
    "";
  const adminPhone =
    PropertiesService.getScriptProperties().getProperty("ADMIN_PHONE") || "";

  for (const tranche of attribution.tranches) {
    if (tranche.livraisons.length === 0) continue;

    const nouvelleRoute = _creerNouvelleRoute(
      tranche,
      route,
      hqCoords,
      poidsParPart,
      poidsParPartHotel,
    );

    if (!nouvelleRoute) continue;

    if (etaitPrete && apiWebUrl) {
      try {
        sendRouteEmail(nouvelleRoute.id_route, apiWebUrl, adminPhone);
        Logger.log(
          `[DIVISION] 📧 Email envoyé pour nouvelle route ${nouvelleRoute.id_route}`,
        );
        nouvelleRoute.email_envoye = true;
      } catch (err) {
        Logger.log(
          `[DIVISION] ⚠️ Email non envoyé pour ${nouvelleRoute.id_route} : ${err.message}`,
        );
        nouvelleRoute.email_envoye = false;
      }
    }

    nouvellesRoutes.push(nouvelleRoute);
  }

  Logger.log(
    `[DIVISION] ✅ ${nouvellesRoutes.length} nouvelle(s) route(s) créée(s)`,
  );

  return {
    success: true,
    id_route_originale: params.id_route,
    nouvelles_routes: nouvellesRoutes,
    nb_non_assignees: attribution.nonAssignees.length,
    email_envoye: etaitPrete,
  };
}

// ============================================================
// HELPERS PARTAGÉS
// ============================================================

function _getVehiculeBenevole(benevole) {
  const vehiculeId = benevole.id_vehicule || benevole.idVehicule;
  if (!vehiculeId) return null;
  const resp = getVehicleTypes();
  if (!resp || !resp.vehicles) return null;
  return resp.vehicles.find((v) => String(v.id) === String(vehiculeId)) || null;
}

function _getCapaciteRouteOrigine(livraisons, poidsParPart, poidsParPartHotel) {
  return _calculerPoidsTotal(livraisons, poidsParPart, poidsParPartHotel);
}

function _calculerPoidsTotal(livraisons, poidsParPart, poidsParPartHotel) {
  return livraisons.reduce((sum, l) => {
    const parts = parseInt(l.nombre_personnes) || 0;
    const estHotel =
      l.hotel === true || l.hotel === "TRUE" || l.hotel === "true";
    return sum + parts * (estHotel ? poidsParPartHotel : poidsParPart);
  }, 0);
}

function _fitLivraisons(
  livraisons,
  capaciteKg,
  nombrePartMax,
  poidsParPart,
  poidsParPartHotel,
) {
  const assignees = [];
  const surplus = [];
  let poidsActuel = 0;
  let partsActuel = 0;

  for (const liv of livraisons) {
    const parts = parseInt(liv.nombre_personnes) || 0;
    const estHotel =
      liv.hotel === true || liv.hotel === "TRUE" || liv.hotel === "true";
    const poids = parts * (estHotel ? poidsParPartHotel : poidsParPart);

    if (
      poidsActuel + poids <= capaciteKg &&
      partsActuel + parts <= nombrePartMax
    ) {
      assignees.push(liv);
      poidsActuel += poids;
      partsActuel += parts;
    } else {
      surplus.push(liv);
    }
  }

  return { assignees, surplus };
}

function _libererLivraisons(livraisons, routeId) {
  for (const liv of livraisons) {
    updateDeliveryStatus(
      liv.id_livraison,
      CONFIG.ENUMS.STATUT_LIVRAISON.NON_ASSIGNEE,
    );

    const etapes = filterData(
      CONFIG.SHEETS.ETAPES_ROUTE,
      (row) =>
        row.id_route === routeId && row.id_livraison === liv.id_livraison,
    );
    for (const etape of etapes) {
      deleteRowById(
        CONFIG.SHEETS.ETAPES_ROUTE,
        etape.id_etape,
        CONFIG.COLUMNS.ETAPES_ROUTE.ID_ETAPE,
      );
    }
  }
}

function _supprimerEtapesRoute(routeId) {
  const etapes = filterData(
    CONFIG.SHEETS.ETAPES_ROUTE,
    (row) => row.id_route === routeId,
  );
  for (const etape of etapes) {
    deleteRowById(
      CONFIG.SHEETS.ETAPES_ROUTE,
      etape.id_etape,
      CONFIG.COLUMNS.ETAPES_ROUTE.ID_ETAPE,
    );
  }
  Logger.log(
    `[RÉASSIGN] 🗑️ ${etapes.length} étape(s) supprimée(s) pour route ${routeId}`,
  );
}

function _chercherStopsProches(
  routeId,
  livraisonsExistantes,
  dateLivraison,
  capaciteKg,
  nombrePartMax,
  poidsParPart,
  poidsParPartHotel,
  dejaAssignees,
) {
  const DISTANCE_PROXIMITE = CONFIG.ROUTE_OPTIMIZATION.DISTANCE_PROXIMITE_KM;

  const centroide = calculerCentre(livraisonsExistantes);
  const poidsDejaAssigne = _calculerPoidsTotal(
    dejaAssignees,
    poidsParPart,
    poidsParPartHotel,
  );
  const partsDejaAssignees = dejaAssignees.reduce(
    (s, l) => s + (parseInt(l.nombre_personnes) || 0),
    0,
  );

  const dateObj =
    dateLivraison instanceof Date ? dateLivraison : new Date(dateLivraison);
  const livraisonsDisponibles = getDeliveriesForDate(dateObj).filter((l) => {
    if (l.statut !== CONFIG.ENUMS.STATUT_LIVRAISON.NON_ASSIGNEE) return false;
    if (l.besoins_speciaux && l.besoins_speciaux.trim() !== "") return false;
    return true;
  });

  const dejaAssigneesIds = new Set(dejaAssignees.map((l) => l.id_livraison));
  const extras = [];
  let poidsActuel = poidsDejaAssigne;
  let partsActuel = partsDejaAssignees;

  for (const liv of livraisonsDisponibles) {
    if (dejaAssigneesIds.has(liv.id_livraison)) continue;

    const dist = calculerDistanceHaversine(
      centroide.lat,
      centroide.lng,
      liv.latitude,
      liv.longitude,
    );
    if (dist > DISTANCE_PROXIMITE) continue;

    const parts = parseInt(liv.nombre_personnes) || 0;
    const estHotel =
      liv.hotel === true || liv.hotel === "TRUE" || liv.hotel === "true";
    const poids = parts * (estHotel ? poidsParPartHotel : poidsParPart);

    if (
      poidsActuel + poids <= capaciteKg &&
      partsActuel + parts <= nombrePartMax
    ) {
      extras.push(liv);
      poidsActuel += poids;
      partsActuel += parts;
      updateDeliveryStatus(
        liv.id_livraison,
        CONFIG.ENUMS.STATUT_LIVRAISON.ASSIGNEE,
      );
    }
  }

  return extras;
}

function _chargerBenevolesAvecVehicule(benevoleIds) {
  const resp = getVehicleTypes();
  const vehiclesMap = {};
  if (resp && resp.vehicles) {
    resp.vehicles.forEach((v) => {
      vehiclesMap[v.id] = v;
    });
  }

  return benevoleIds
    .map((id) => {
      const bResp = getVolunteerById(id);
      const b = extractData(bResp, ["volunteer", "benevole"]);
      if (!b) return null;

      const vehiculeId = b.id_vehicule || b.idVehicule;
      const vehicule = vehiculeId ? vehiclesMap[vehiculeId] : null;
      if (!vehicule) return null;

      return {
        id: b.id,
        nom: `${b.prenom || ""} ${b.nom || ""}`.trim(),
        capaciteKg: parseFloat(vehicule.capaciteKg) || 0,
        nombrePartMax: parseFloat(vehicule.nombrePartMax) || 0,
        vehicule_type: vehicule.type,
      };
    })
    .filter(Boolean);
}

function _repartirLivraisons(
  livraisons,
  benevoles,
  poidsParPart,
  poidsParPartHotel,
) {
  const tranches = benevoles.map((b) => ({
    benevole: b,
    livraisons: [],
    poidsActuel: 0,
    partsActuel: 0,
  }));
  const nonAssignees = [];

  for (const liv of livraisons) {
    const parts = parseInt(liv.nombre_personnes) || 0;
    const estHotel =
      liv.hotel === true || liv.hotel === "TRUE" || liv.hotel === "true";
    const poids = parts * (estHotel ? poidsParPartHotel : poidsParPart);

    let assignee = false;
    for (const tranche of tranches) {
      const poidsFutur = tranche.poidsActuel + poids;
      const partsFutur = tranche.partsActuel + parts;
      if (
        poidsFutur <= tranche.benevole.capaciteKg &&
        partsFutur <= tranche.benevole.nombrePartMax
      ) {
        tranche.livraisons.push(liv);
        tranche.poidsActuel += poids;
        tranche.partsActuel += parts;
        assignee = true;
        break;
      }
    }
    if (!assignee) nonAssignees.push(liv);
  }

  return { tranches, nonAssignees };
}

function _creerNouvelleRoute(
  tranche,
  routeOriginale,
  hqCoords,
  poidsParPart,
  poidsParPartHotel,
) {
  try {
    let livraisonsOptimisees = tranche.livraisons;
    if (hqCoords && tranche.livraisons.length > 1) {
      livraisonsOptimisees = optimizeDeliveryOrder(
        tranche.livraisons,
        hqCoords,
      );
    }

    const poidsTotal = _calculerPoidsTotal(
      livraisonsOptimisees,
      poidsParPart,
      poidsParPartHotel,
    );
    const distanceTotale = hqCoords
      ? calculerDistanceTotaleRoute(livraisonsOptimisees, hqCoords)
      : 0;
    const lienMaps = hqCoords
      ? generateGoogleMapsLink(livraisonsOptimisees, hqCoords)
      : "";

    const routeId = generateNextId(
      CONFIG.SHEETS.ROUTES,
      "R",
      CONFIG.COLUMNS.ROUTES.ID_ROUTE,
    );

    const rowData = [
      routeId,
      tranche.benevole.id,
      "",
      "",
      routeOriginale.date_debut,
      null,
      routeOriginale.occasion,
      CONFIG.ENUMS.STATUT_ROUTE.PRETE,
      Math.round(distanceTotale * 100) / 100,
      Math.round(poidsTotal * 100) / 100,
      poidsParPart,
      poidsParPartHotel,
      true,
      lienMaps,
      "",
      getCurrentDateTime(),
      getCurrentDateTime(),
    ];

    appendRow(CONFIG.SHEETS.ROUTES, rowData);
    Logger.log(
      `[DIVISION] ✅ Nouvelle route ${routeId} créée pour ${tranche.benevole.nom}`,
    );

    createOptimizedEtapes(routeId, livraisonsOptimisees);

    for (const liv of livraisonsOptimisees) {
      updateDeliveryStatus(
        liv.id_livraison,
        CONFIG.ENUMS.STATUT_LIVRAISON.ASSIGNEE,
      );
    }

    try {
      const adminPhone =
        PropertiesService.getScriptProperties().getProperty("ADMIN_PHONE") ||
        "";
      generateRouteDoc(routeId, adminPhone);
    } catch (err) {
      Logger.log(
        `[DIVISION] ⚠️ Feuille non générée pour ${routeId} : ${err.message}`,
      );
    }

    return {
      id_route: routeId,
      benevole_nom: tranche.benevole.nom,
      nb_livraisons: livraisonsOptimisees.length,
      poids_total_kg: Math.round(poidsTotal * 100) / 100,
      distance_totale_km: Math.round(distanceTotale * 100) / 100,
      lien_maps: lienMaps,
      email_envoye: false,
    };
  } catch (err) {
    Logger.log(
      `[DIVISION] ❌ Erreur création route pour ${tranche.benevole.nom} : ${err.message}`,
    );
    return null;
  }
}
