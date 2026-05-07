class ApiError extends Error {
  constructor(message, statusCode = null, apiName = null) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.apiName = apiName;
    this.timestamp = new Date();
  }
}

const CACHE_KEY_BENEVOLES = "benevoles_with_vehicle";

// ============================================================
// APPEL API GÉNÉRIQUE
// ============================================================

function callApiWithRetry(url, options = {}, cacheKey = null, cacheDuration = 300) {
  if (cacheKey) {
    const cached = getCachedResponse(cacheKey);
    if (cached) {
      Logger.log(`[API] 📦 Réponse depuis le cache script: ${cacheKey}`);
      return cached;
    }
  }

  let lastError;
  const maxRetries = CONFIG.MAX_RETRIES_API;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      Logger.log(`[API] Tentative ${attempt}/${maxRetries} — ${url.substring(0, 60)}…`);

      const response = UrlFetchApp.fetch(url, {
        muteHttpExceptions: true,
        ...options,
      });

      const statusCode = response.getResponseCode();
      const contentText = response.getContentText();

      if (statusCode < 200 || statusCode >= 300) {
        throw new ApiError(`Erreur HTTP ${statusCode}: ${contentText}`, statusCode);
      }

      let data;
      try {
        data = JSON.parse(contentText);
      } catch (parseError) {
        throw new ApiError(`Erreur parsing JSON: ${parseError.message}`, statusCode);
      }

      if (cacheKey) setCachedResponse(cacheKey, data, cacheDuration);

      return data;
    } catch (error) {
      lastError = error;
      Logger.log(`[API] Tentative ${attempt} échouée: ${error.message}`);

      if (attempt < maxRetries) {
        const delay = CONFIG.BACKOFF_DELAY_MS * Math.pow(2, attempt - 1);
        Utilities.sleep(delay);
      }
    }
  }

  throw new ApiError(
    `Échec après ${maxRetries} tentatives: ${lastError.message}`,
    lastError.statusCode,
  );
}

function buildUrl(baseUrl, params = {}) {
  const queryParts = [];
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      queryParts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
    }
  }
  if (queryParts.length === 0) return baseUrl;
  const separator = baseUrl.includes("?") ? "&" : "?";
  return `${baseUrl}${separator}${queryParts.join("&")}`;
}

// ============================================================
// CACHE SCRIPT (générique)
// ============================================================

const cache = CacheService.getScriptCache();

function getCachedResponse(key) {
  const cached = cache.get(key);
  if (!cached) return null;
  try {
    return JSON.parse(cached);
  } catch (e) {
    return null;
  }
}

function setCachedResponse(key, data, duration = 300) {
  try {
    cache.put(key, JSON.stringify(data), duration);
  } catch (e) {
    Logger.log(`[CACHE] Erreur mise en cache script: ${e.message}`);
  }
}

function invalidateCache(key) {
  cache.remove(key);
}

/**
 * Vide le cache en supprimant toutes les clés connues une par une.
 * Apps Script ne permet pas de lister ou vider le cache globalement —
 * on supprime explicitement les clés utilisées par l'application.
 */
function invalidateAllCache() {
  const keysConnues = [
    `families_${JSON.stringify({ includeHierarchy: false })}`,
    "vehicle_types",
    `quartiers_all`,
    `volunteers_${JSON.stringify({})}`,
    `available_Matin_false`,
    `available_Après-midi_false`,
    `available_Soir_false`,
    `available_Matin_true`,
    `available_Après-midi_true`,
    `available_Soir_true`,
    "villes_all",
  ];

  keysConnues.forEach((key) => {
    try {
      cache.remove(key);
    } catch (e) {
      Logger.log(`[CACHE] ⚠️ Impossible de supprimer la clé "${key}": ${e.message}`);
    }
  });

  invalidateBenevolesCache();

  Logger.log(`[CACHE] 🗑️ ${keysConnues.length + 1} clé(s) de cache supprimée(s)`);
}

// ============================================================
// CACHE UTILISATEUR (bénévoles)
// ============================================================

function getUserCache() {
  return CacheService.getUserCache();
}

function getBenevolesCaches() {
  try {
    const cached = getUserCache().get(CACHE_KEY_BENEVOLES);
    if (!cached) return null;
    const data = JSON.parse(cached);
    Logger.log(`[CACHE] 👤 Bénévoles récupérés depuis le cache utilisateur (${data.length})`);
    return data;
  } catch (e) {
    Logger.log(`[CACHE] ⚠️ Erreur lecture cache bénévoles: ${e.message}`);
    return null;
  }
}

function setBenevolesCaches(benevoles) {
  try {
    getUserCache().put(
      CACHE_KEY_BENEVOLES,
      JSON.stringify(benevoles),
      CONFIG.API_BENEVOLES.CACHE_DURATION,
    );
    Logger.log(`[CACHE] 👤 ${benevoles.length} bénévole(s) mis en cache utilisateur`);
  } catch (e) {
    Logger.log(`[CACHE] ⚠️ Erreur écriture cache bénévoles: ${e.message}`);
  }
}

function invalidateBenevolesCache() {
  try {
    getUserCache().remove(CACHE_KEY_BENEVOLES);
    Logger.log("[CACHE] 🗑️ Cache utilisateur bénévoles invalidé");
    return { success: true };
  } catch (e) {
    Logger.log(`[CACHE] ❌ Erreur invalidation cache bénévoles: ${e.message}`);
    return { success: false, error: e.message };
  }
}

// ============================================================
// API FAMILLES
// ============================================================

function pingFamilyApi() {
  const url = buildUrl(CONFIG.API_FAMILLES.URL, {
    action: CONFIG.API_FAMILLES.ENDPOINTS.PING,
  });
  return callApiWithRetry(url, {}, null, 0);
}

function getAllValidatedFamilies(filters = {}) {
  const params = {
    action: CONFIG.API_FAMILLES.ENDPOINTS.ALL_FAMILIES,
    apiKey: CONFIG.API_FAMILLES.KEY,
    ...filters,
  };
  const url = buildUrl(CONFIG.API_FAMILLES.URL, params);
  return callApiWithRetry(
    url,
    {},
    `families_${JSON.stringify(filters)}`,
    CONFIG.API_FAMILLES.CACHE_DURATION,
  );
}

function getFamilyById(familyId) {
  const url = buildUrl(CONFIG.API_FAMILLES.URL, {
    action: CONFIG.API_FAMILLES.ENDPOINTS.GET_FAMILY,
    id: familyId,
    apiKey: CONFIG.API_FAMILLES.KEY,
  });
  return callApiWithRetry(
    url,
    {},
    `family_${familyId}`,
    CONFIG.API_FAMILLES.CACHE_DURATION,
  );
}

// ============================================================
// API BÉNÉVOLES
// ============================================================

function pingVolunteerApi() {
  const url = buildUrl(CONFIG.API_BENEVOLES.URL, {
    action: CONFIG.API_BENEVOLES.ENDPOINTS.PING,
  });
  return callApiWithRetry(url, {}, null, 0);
}

function listVolunteers(filters = {}) {
  const params = {
    action: CONFIG.API_BENEVOLES.ENDPOINTS.LIST_VOLUNTEERS,
    apiKey: CONFIG.API_BENEVOLES.KEY,
    ...filters,
  };
  const url = buildUrl(CONFIG.API_BENEVOLES.URL, params);
  return callApiWithRetry(
    url,
    {},
    `volunteers_${JSON.stringify(filters)}`,
    CONFIG.API_BENEVOLES.CACHE_DURATION,
  );
}

function getVolunteerById(volunteerId) {
  const url = buildUrl(CONFIG.API_BENEVOLES.URL, {
    action: CONFIG.API_BENEVOLES.ENDPOINTS.GET_VOLUNTEER,
    id: volunteerId,
    apiKey: CONFIG.API_BENEVOLES.KEY,
  });
  return callApiWithRetry(
    url,
    {},
    `volunteer_${volunteerId}`,
    CONFIG.API_BENEVOLES.CACHE_DURATION,
  );
}

function getAvailableVolunteers(disponibilite, courtDelaiOnly = false) {
  const url = buildUrl(CONFIG.API_BENEVOLES.URL, {
    action: CONFIG.API_BENEVOLES.ENDPOINTS.GET_AVAILABLE_VOLUNTEERS,
    disponibilite: disponibilite,
    courtDelaiOnly: courtDelaiOnly,
    apiKey: CONFIG.API_BENEVOLES.KEY,
  });
  return callApiWithRetry(
    url,
    {},
    `available_${disponibilite}_${courtDelaiOnly}`,
    60,
  );
}

function getVolunteersWithVehicle(forceRefresh = false) {
  if (!forceRefresh) {
    const cached = getBenevolesCaches();
    if (cached) return cached;
  }

  Logger.log("[API] 🔄 Chargement des bénévoles depuis l'API (3 créneaux)...");
  const creneaux = ["Matin", "Après-midi", "Soir"];

  const responses = creneaux.map((creneau) => {
    try {
      const resp = getAvailableVolunteers(creneau);
      return { creneau, volunteers: resp && resp.volunteers ? resp.volunteers : [] };
    } catch (e) {
      Logger.log(`[API] ⚠️ Erreur créneau ${creneau}: ${e.message}`);
      return { creneau, volunteers: [] };
    }
  });

  const vehiclesResponse = getVehicleTypes();
  if (!vehiclesResponse || !vehiclesResponse.vehicles) {
    Logger.log("[API] ❌ Impossible de récupérer les types de véhicules");
    return [];
  }

  const vehiclesMap = {};
  vehiclesResponse.vehicles.forEach((v) => {
    vehiclesMap[v.id] = v;
  });

  const byId = {};
  responses.forEach(({ creneau, volunteers }) => {
    volunteers.forEach((benevole) => {
      if (!byId[benevole.id]) {
        byId[benevole.id] = { ...benevole, disponibilites: [] };
      }
      if (!byId[benevole.id].disponibilites.includes(creneau)) {
        byId[benevole.id].disponibilites.push(creneau);
      }
    });
  });

  const result = [];
  for (const benevole of Object.values(byId)) {
    const vehiculeId = benevole.id_vehicule || benevole.idVehicule;
    if (!vehiculeId) continue;

    const vehicule = vehiclesMap[vehiculeId];
    if (!vehicule) continue;

    const capaciteKg = parseFloat(vehicule.capaciteKg) || 0;
    if (capaciteKg === 0) continue;

    result.push({ ...benevole, vehicule });
  }

  Logger.log(`[API] ✅ ${result.length} bénévoles avec véhicule valide`);
  setBenevolesCaches(result);

  return result;
}

function getVehicleTypes() {
  const url = buildUrl(CONFIG.API_BENEVOLES.URL, {
    action: CONFIG.API_BENEVOLES.ENDPOINTS.GET_VEHICLES,
    apiKey: CONFIG.API_BENEVOLES.KEY,
  });
  return callApiWithRetry(
    url,
    {},
    "vehicle_types",
    CONFIG.API_BENEVOLES.CACHE_DURATION,
  );
}

// ============================================================
// API GEO
// ============================================================

function pingGeoApi() {
  const url = buildUrl(CONFIG.API_GEO.URL, {
    action: CONFIG.API_GEO.ENDPOINTS.PING,
    "X-Api-Key": CONFIG.API_GEO.KEY,
  });
  return callApiWithRetry(url, {}, null, 0);
}

function geocodeAddress(adresse, ville = null, codePostal = null) {
  const params = {
    action: CONFIG.API_GEO.ENDPOINTS.GEOCODE,
    adresse,
    "X-Api-Key": CONFIG.API_GEO.KEY,
  };
  if (ville) params.ville = ville;
  if (codePostal) params.codePostal = codePostal;
  const url = buildUrl(CONFIG.API_GEO.URL, params);
  return callApiWithRetry(
    url,
    {},
    `geocode_${adresse}_${ville}_${codePostal}`,
    CONFIG.API_GEO.CACHE_DURATION,
  );
}

function resolveLocation(lat, lng) {
  const url = buildUrl(CONFIG.API_GEO.URL, {
    action: CONFIG.API_GEO.ENDPOINTS.RESOLVE_LOCATION,
    lat,
    lng,
    "X-Api-Key": CONFIG.API_GEO.KEY,
  });
  return callApiWithRetry(
    url,
    {},
    `location_${lat}_${lng}`,
    CONFIG.API_GEO.CACHE_DURATION,
  );
}

function calculateDistance(lat1, lng1, lat2, lng2) {
  const url = buildUrl(CONFIG.API_GEO.URL, {
    action: CONFIG.API_GEO.ENDPOINTS.CALCULATE_DISTANCE,
    lat1,
    lng1,
    lat2,
    lng2,
    "X-Api-Key": CONFIG.API_GEO.KEY,
  });
  return callApiWithRetry(
    url,
    {},
    `distance_${lat1}_${lng1}_${lat2}_${lng2}`,
    CONFIG.API_GEO.CACHE_DURATION,
  );
}

function getAllQuartiers(idSecteur = null) {
  const params = {
    action: CONFIG.API_GEO.ENDPOINTS.GET_QUARTIERS,
    "X-Api-Key": CONFIG.API_GEO.KEY,
  };
  if (idSecteur) params.idSecteur = idSecteur;
  const url = buildUrl(CONFIG.API_GEO.URL, params);
  return callApiWithRetry(
    url,
    {},
    `quartiers_${idSecteur || "all"}`,
    CONFIG.API_GEO.CACHE_DURATION,
  );
}

function getQuartierById(quartierId) {
  const url = buildUrl(CONFIG.API_GEO.URL, {
    action: CONFIG.API_GEO.ENDPOINTS.GET_QUARTIER,
    id: quartierId,
    "X-Api-Key": CONFIG.API_GEO.KEY,
  });
  return callApiWithRetry(
    url,
    {},
    `quartier_${quartierId}`,
    CONFIG.API_GEO.CACHE_DURATION,
  );
}

function getAllVilles() {
  const url = buildUrl(CONFIG.API_GEO.URL, {
    action: CONFIG.API_GEO.ENDPOINTS.GET_VILLES,
    "X-Api-Key": CONFIG.API_GEO.KEY,
  });
  return callApiWithRetry(url, {}, "villes_all", CONFIG.API_GEO.CACHE_DURATION);
}

// ============================================================
// DIAGNOSTIC
// ============================================================

function checkAllApis() {
  const results = { timestamp: new Date(), apis: {} };

  try {
    const r = pingFamilyApi();
    results.apis.familles = {
      status: "ok",
      version: r.version || "inconnu",
      message: r.message || "",
    };
  } catch (error) {
    results.apis.familles = { status: "erreur", message: error.message };
  }

  try {
    const r = pingVolunteerApi();
    results.apis.benevoles = {
      status: "ok",
      version: r.version || "inconnu",
      message: r.message || "",
    };
  } catch (error) {
    results.apis.benevoles = { status: "erreur", message: error.message };
  }

  try {
    const r = pingGeoApi();
    results.apis.geo = {
      status: "ok",
      version: r.version || "inconnu",
      message: r.message || "",
    };
  } catch (error) {
    results.apis.geo = { status: "erreur", message: error.message };
  }

  return results;
}

function logApiStatus() {
  const status = checkAllApis();
  Logger.log("=== STATUT DES APIS ===");
  for (const [nom, s] of Object.entries(status.apis)) {
    Logger.log(`${s.status === "ok" ? "✅" : "❌"} ${nom.toUpperCase()} — ${s.message}`);
  }
}

// ============================================================
// BATCH GEO
// ============================================================

function callBatchGeocode(addresses) {
  const apiKey = PropertiesService.getScriptProperties().getProperty("GEO_API_KEY");
  const baseUrl = PropertiesService.getScriptProperties().getProperty("GEO_API_URL");
  if (!apiKey || !baseUrl) throw new Error("Configuration API GEO manquante");

  const options = {
    method: "post",
    muteHttpExceptions: true,
    headers: { "Content-Type": "application/json" },
    payload: JSON.stringify({
      action: "batchgeocode",
      adresses: addresses.map((addr) => ({ adresse: addr })),
    }),
  };

  const response = UrlFetchApp.fetch(baseUrl + "?X-Api-Key=" + apiKey, options);
  if (response.getResponseCode() !== 200)
    throw new Error("API GEO erreur: HTTP " + response.getResponseCode());
  return JSON.parse(response.getContentText());
}

function callBatchResolveLocation(coordinates) {
  const apiKey = PropertiesService.getScriptProperties().getProperty("GEO_API_KEY");
  const baseUrl = PropertiesService.getScriptProperties().getProperty("GEO_API_URL");
  if (!apiKey || !baseUrl) throw new Error("Configuration API GEO manquante");

  const options = {
    method: "post",
    muteHttpExceptions: true,
    headers: { "Content-Type": "application/json" },
    payload: JSON.stringify({ action: "batchresolvelocation", coordinates }),
  };

  const response = UrlFetchApp.fetch(baseUrl + "?X-Api-Key=" + apiKey, options);
  if (response.getResponseCode() !== 200)
    throw new Error("API GEO erreur: HTTP " + response.getResponseCode());
  return JSON.parse(response.getContentText());
}

function callBatchCalculateDistance(reference, coordinates) {
  const apiKey = PropertiesService.getScriptProperties().getProperty("GEO_API_KEY");
  const baseUrl = PropertiesService.getScriptProperties().getProperty("GEO_API_URL");
  if (!apiKey || !baseUrl) throw new Error("Configuration API GEO manquante");

  const options = {
    method: "post",
    muteHttpExceptions: true,
    headers: { "Content-Type": "application/json" },
    payload: JSON.stringify({
      action: "batchcalculatedistance",
      reference,
      coordinates,
    }),
  };

  const response = UrlFetchApp.fetch(baseUrl + "?X-Api-Key=" + apiKey, options);
  if (response.getResponseCode() !== 200)
    throw new Error("API GEO erreur: HTTP " + response.getResponseCode());
  return JSON.parse(response.getContentText());
}