/**
 * ====================================================================
 * API_SERVICE.GS - Service de Communication avec les APIs Externes
 * ====================================================================
 */

/**
 * Classe pour gérer les erreurs API
 */
class ApiError extends Error {
  constructor(message, statusCode = null, apiName = null) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.apiName = apiName;
    this.timestamp = new Date();
  }
}

/**
 * Effectue un appel API avec retry et cache
 * @param {string} url - URL complète de l'endpoint
 * @param {Object} options - Options de la requête
 * @param {string} cacheKey - Clé pour le cache (null = pas de cache)
 * @param {number} cacheDuration - Durée du cache en secondes
 * @returns {Object} Réponse JSON
 */
function callApiWithRetry(url, options = {}, cacheKey = null, cacheDuration = 300) {
  // Vérifier le cache
  if (cacheKey) {
    const cached = getCachedResponse(cacheKey);
    if (cached) {
      Logger.log(`[API] ✅ Réponse depuis le cache: ${cacheKey}`);
      return cached;
    }
  }

  let lastError;
  const maxRetries = CONFIG.MAX_RETRIES_API;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      Logger.log(`[API] 📡 Tentative ${attempt}/${maxRetries}`);

      const response = UrlFetchApp.fetch(url, {
        muteHttpExceptions: true,
        ...options
      });

      const statusCode = response.getResponseCode();
      const contentText = response.getContentText();

      if (statusCode < 200 || statusCode >= 300) {
        throw new ApiError(
          `Erreur HTTP ${statusCode}: ${contentText}`,
          statusCode
        );
      }

      let data;
      try {
        data = JSON.parse(contentText);
      } catch (parseError) {
        throw new ApiError(
          `Erreur parsing JSON: ${parseError.message}`,
          statusCode
        );
      }

      if (cacheKey) {
        setCachedResponse(cacheKey, data, cacheDuration);
      }

      Logger.log(`[API] ✅ Succès (${statusCode})`);
      return data;

    } catch (error) {
      lastError = error;
      Logger.log(`[API] ❌ Tentative ${attempt} échouée: ${error.message}`);

      if (attempt < maxRetries) {
        const delay = CONFIG.BACKOFF_DELAY_MS * Math.pow(2, attempt - 1);
        Logger.log(`[API] ⏳ Attente de ${delay}ms avant nouvelle tentative...`);
        Utilities.sleep(delay);
      }
    }
  }

  throw new ApiError(
    `Échec après ${maxRetries} tentatives: ${lastError.message}`,
    lastError.statusCode
  );
}

/**
 * Construit une URL avec paramètres query
 * @param {string} baseUrl - URL de base
 * @param {Object} params - Paramètres query
 * @returns {string} URL complète
 */
function buildUrl(baseUrl, params = {}) {
  const queryParts = [];

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      queryParts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
    }
  }

  if (queryParts.length === 0) return baseUrl;

  const separator = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${separator}${queryParts.join('&')}`;
}

// ========================================
// GESTION DU CACHE
// ========================================

const cache = CacheService.getScriptCache();

function getCachedResponse(key) {
  const cached = cache.get(key);
  if (!cached) return null;
  try {
    return JSON.parse(cached);
  } catch (e) {
    Logger.log(`[CACHE] ⚠️ Erreur parsing cache pour ${key}`);
    return null;
  }
}

function setCachedResponse(key, data, duration = 300) {
  try {
    cache.put(key, JSON.stringify(data), duration);
    Logger.log(`[CACHE] ✅ Réponse mise en cache: ${key} (${duration}s)`);
  } catch (e) {
    Logger.log(`[CACHE] ⚠️ Erreur mise en cache: ${e.message}`);
  }
}

function invalidateCache(key) {
  cache.remove(key);
  Logger.log(`[CACHE] 🗑️ Cache invalidé: ${key}`);
}

function invalidateAllCache() {
  cache.removeAll();
  Logger.log(`[CACHE] 🗑️ Tout le cache invalidé`);
}

// ========================================
// API FAMILLES
// ========================================

function pingFamilyApi() {
  const url = buildUrl(CONFIG.API_FAMILLES.URL, {
    action: CONFIG.API_FAMILLES.ENDPOINTS.PING
  });
  return callApiWithRetry(url, {}, null, 0);
}

function getAllValidatedFamilies(filters = {}) {
  const params = {
    action: CONFIG.API_FAMILLES.ENDPOINTS.ALL_FAMILIES,
    apiKey: CONFIG.API_FAMILLES.KEY,
    ...filters
  };
  const url = buildUrl(CONFIG.API_FAMILLES.URL, params);
  const cacheKey = `families_${JSON.stringify(filters)}`;
  return callApiWithRetry(url, {}, cacheKey, CONFIG.API_FAMILLES.CACHE_DURATION);
}

function getFamilyById(familyId) {
  const url = buildUrl(CONFIG.API_FAMILLES.URL, {
    action: CONFIG.API_FAMILLES.ENDPOINTS.GET_FAMILY,
    id: familyId,
    apiKey: CONFIG.API_FAMILLES.KEY
  });
  return callApiWithRetry(url, {}, `family_${familyId}`, CONFIG.API_FAMILLES.CACHE_DURATION);
}

// ========================================
// API BÉNÉVOLES
// ========================================

function pingVolunteerApi() {
  const url = buildUrl(CONFIG.API_BENEVOLES.URL, {
    action: CONFIG.API_BENEVOLES.ENDPOINTS.PING
  });
  return callApiWithRetry(url, {}, null, 0);
}

function listVolunteers(filters = {}) {
  const params = {
    action: CONFIG.API_BENEVOLES.ENDPOINTS.LIST_VOLUNTEERS,
    apiKey: CONFIG.API_BENEVOLES.KEY,
    ...filters
  };
  const url = buildUrl(CONFIG.API_BENEVOLES.URL, params);
  return callApiWithRetry(url, {}, `volunteers_${JSON.stringify(filters)}`, CONFIG.API_BENEVOLES.CACHE_DURATION);
}

function getVolunteerById(volunteerId) {
  const url = buildUrl(CONFIG.API_BENEVOLES.URL, {
    action: CONFIG.API_BENEVOLES.ENDPOINTS.GET_VOLUNTEER,
    id: volunteerId,
    apiKey: CONFIG.API_BENEVOLES.KEY
  });
  return callApiWithRetry(url, {}, `volunteer_${volunteerId}`, CONFIG.API_BENEVOLES.CACHE_DURATION);
}

function getVolunteerAvailability(volunteerId) {
  const url = buildUrl(CONFIG.API_BENEVOLES.URL, {
    action: CONFIG.API_BENEVOLES.ENDPOINTS.GET_AVAILABILITY,
    volunteerId: volunteerId,
    apiKey: CONFIG.API_BENEVOLES.KEY
  });
  return callApiWithRetry(url, {}, `availability_${volunteerId}`, 60);
}

/**
 * Récupère les bénévoles disponibles pour un créneau (usage UI/planning manuel)
 * ⚠️ NE PAS UTILISER pour la planification automatique des routes.
 *    Utiliser getVolunteersWithVehicle() à la place.
 *
 * @param {string}  disponibilite  - Créneau (Matin, Après-midi, etc.)
 * @param {boolean} courtDelaiOnly - Court délai uniquement
 * @returns {Object} Liste des bénévoles disponibles
 */
function getAvailableVolunteers(disponibilite, courtDelaiOnly = false) {
  const url = buildUrl(CONFIG.API_BENEVOLES.URL, {
    action: CONFIG.API_BENEVOLES.ENDPOINTS.GET_AVAILABLE_VOLUNTEERS,
    disponibilite: disponibilite,
    courtDelaiOnly: courtDelaiOnly,
    apiKey: CONFIG.API_BENEVOLES.KEY
  });
  return callApiWithRetry(url, {}, `available_${disponibilite}_${courtDelaiOnly}`, 60);
}

/**
 * Récupère les bénévoles avec un véhicule valide pour la planification de routes.
 *
 * Exclut :
 * - Bénévoles inactifs ou non validés
 * - Bénévoles sans véhicule renseigné
 * - Bénévoles avec véhicule type "Permis" ou "Sans permis" (capaciteKg = 0)
 *
 * @returns {Array<Object>} Bénévoles enrichis avec vehicule.capaciteKg > 0
 */
function getVolunteersWithVehicle() {
  // 1. Récupérer tous les bénévoles actifs et validés
  const response = listVolunteers({ actif: true, statut: 'Validé' });

  if (!response || !response.volunteers) {
    Logger.log('[API] ⚠️ Aucun bénévole retourné par listVolunteers');
    return [];
  }

  const vehiclesResponse = getVehicleTypes();
  if (!vehiclesResponse || !vehiclesResponse.vehicles) {
    Logger.log('[API] ⚠️ Impossible de récupérer les types de véhicules');
    return [];
  }

  const vehiclesMap = {};
  vehiclesResponse.vehicles.forEach(v => {
    vehiclesMap[v.id] = v;
  });

  // 2. Enrichir chaque bénévole avec son véhicule et filtrer
  const result = [];

  for (const benevole of response.volunteers) {
    // Récupérer l'id du véhicule (snake_case depuis l'API)
    const vehiculeId = benevole.id_vehicule || benevole.idVehicule;

    if (!vehiculeId) {
      Logger.log(`[API] ⏭️ ${benevole.nom} ignoré — pas de véhicule renseigné`);
      continue;
    }

    const vehicule = vehiclesMap[vehiculeId];

    if (!vehicule) {
      Logger.log(`[API] ⏭️ ${benevole.nom} ignoré — véhicule id=${vehiculeId} introuvable`);
      continue;
    }

    // Exclure capaciteKg = 0 (Permis, Sans permis)
    const capaciteKg = parseFloat(vehicule.capaciteKg) || 0;
    if (capaciteKg === 0) {
      Logger.log(`[API] ⏭️ ${benevole.nom} ignoré — véhicule "${vehicule.type}" (capaciteKg=0)`);
      continue;
    }

    result.push({ ...benevole, vehicule });
  }

  Logger.log(`[API] ✅ ${result.length} bénévoles avec véhicule valide sur ${response.volunteers.length} total`);
  return result;
}

/**
 * Récupère tous les types de véhicules
 * @returns {Object} Liste des véhicules
 */
function getVehicleTypes() {
  const url = buildUrl(CONFIG.API_BENEVOLES.URL, {
    action: CONFIG.API_BENEVOLES.ENDPOINTS.GET_VEHICLES,
    apiKey: CONFIG.API_BENEVOLES.KEY
  });
  return callApiWithRetry(url, {}, 'vehicle_types', CONFIG.API_BENEVOLES.CACHE_DURATION);
}

// ========================================
// API GEO
// ========================================

function pingGeoApi() {
  const url = buildUrl(CONFIG.API_GEO.URL, {
    action: CONFIG.API_GEO.ENDPOINTS.PING,
    'X-Api-Key': CONFIG.API_GEO.KEY
  });
  return callApiWithRetry(url, {}, null, 0);
}

function geocodeAddress(adresse, ville = null, codePostal = null) {
  const params = {
    action: CONFIG.API_GEO.ENDPOINTS.GEOCODE,
    adresse: adresse,
    'X-Api-Key': CONFIG.API_GEO.KEY
  };
  if (ville) params.ville = ville;
  if (codePostal) params.codePostal = codePostal;

  const url = buildUrl(CONFIG.API_GEO.URL, params);
  return callApiWithRetry(url, {}, `geocode_${adresse}_${ville}_${codePostal}`, CONFIG.API_GEO.CACHE_DURATION);
}

function resolveLocation(lat, lng) {
  const url = buildUrl(CONFIG.API_GEO.URL, {
    action: CONFIG.API_GEO.ENDPOINTS.RESOLVE_LOCATION,
    lat: lat,
    lng: lng,
    'X-Api-Key': CONFIG.API_GEO.KEY
  });
  return callApiWithRetry(url, {}, `location_${lat}_${lng}`, CONFIG.API_GEO.CACHE_DURATION);
}

function calculateDistance(lat1, lng1, lat2, lng2) {
  const url = buildUrl(CONFIG.API_GEO.URL, {
    action: CONFIG.API_GEO.ENDPOINTS.CALCULATE_DISTANCE,
    lat1: lat1, lng1: lng1, lat2: lat2, lng2: lng2,
    'X-Api-Key': CONFIG.API_GEO.KEY
  });
  return callApiWithRetry(url, {}, `distance_${lat1}_${lng1}_${lat2}_${lng2}`, CONFIG.API_GEO.CACHE_DURATION);
}

function getAllQuartiers(idSecteur = null) {
  const params = {
    action: CONFIG.API_GEO.ENDPOINTS.GET_QUARTIERS,
    'X-Api-Key': CONFIG.API_GEO.KEY
  };
  if (idSecteur) params.idSecteur = idSecteur;
  const url = buildUrl(CONFIG.API_GEO.URL, params);
  return callApiWithRetry(url, {}, `quartiers_${idSecteur || 'all'}`, CONFIG.API_GEO.CACHE_DURATION);
}

function getQuartierById(quartierId) {
  const url = buildUrl(CONFIG.API_GEO.URL, {
    action: CONFIG.API_GEO.ENDPOINTS.GET_QUARTIER,
    id: quartierId,
    'X-Api-Key': CONFIG.API_GEO.KEY
  });
  return callApiWithRetry(url, {}, `quartier_${quartierId}`, CONFIG.API_GEO.CACHE_DURATION);
}

function getAllVilles() {
  const url = buildUrl(CONFIG.API_GEO.URL, {
    action: CONFIG.API_GEO.ENDPOINTS.GET_VILLES,
    'X-Api-Key': CONFIG.API_GEO.KEY
  });
  return callApiWithRetry(url, {}, 'villes_all', CONFIG.API_GEO.CACHE_DURATION);
}

// ========================================
// FONCTIONS HELPER
// ========================================

function checkAllApis() {
  const results = { timestamp: new Date(), apis: {} };

  try {
    const familyPing = pingFamilyApi();
    results.apis.familles = { status: 'ok', version: familyPing.version || 'unknown', message: familyPing.message || '' };
  } catch (error) {
    results.apis.familles = { status: 'error', message: error.message };
  }

  try {
    const volunteerPing = pingVolunteerApi();
    results.apis.benevoles = { status: 'ok', version: volunteerPing.version || 'unknown', message: volunteerPing.message || '' };
  } catch (error) {
    results.apis.benevoles = { status: 'error', message: error.message };
  }

  try {
    const geoPing = pingGeoApi();
    results.apis.geo = { status: 'ok', version: geoPing.version || 'unknown', message: geoPing.message || '' };
  } catch (error) {
    results.apis.geo = { status: 'error', message: error.message };
  }

  return results;
}

function logApiStatus() {
  const status = checkAllApis();
  Logger.log('========================================');
  Logger.log('STATUT DES APIS EXTERNES');
  Logger.log('========================================');
  Logger.log(`Timestamp: ${status.timestamp}`);
  Logger.log('');
  for (const [apiName, apiStatus] of Object.entries(status.apis)) {
    const emoji = apiStatus.status === 'ok' ? '✅' : '❌';
    Logger.log(`${emoji} ${apiName.toUpperCase()}`);
    Logger.log(`   Status: ${apiStatus.status}`);
    if (apiStatus.version) Logger.log(`   Version: ${apiStatus.version}`);
    Logger.log(`   Message: ${apiStatus.message}`);
    Logger.log('');
  }
  Logger.log('========================================');
}

// ========================================
// API WRAPPERS - BATCH
// ========================================

function callBatchGeocode(addresses) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEO_API_KEY');
  const baseUrl = PropertiesService.getScriptProperties().getProperty('GEO_API_URL');

  if (!apiKey || !baseUrl) throw new Error('Configuration API GEO manquante (GEO_API_KEY ou GEO_API_URL)');

  const options = {
    method: 'post',
    muteHttpExceptions: true,
    headers: { 'Content-Type': 'application/json' },
    payload: JSON.stringify({ action: 'batchgeocode', adresses: addresses.map(addr => ({ adresse: addr })) })
  };

  const response = UrlFetchApp.fetch(baseUrl + '?X-Api-Key=' + apiKey, options);
  if (response.getResponseCode() !== 200) throw new Error('API GEO error: HTTP ' + response.getResponseCode());
  return JSON.parse(response.getContentText());
}

function callBatchResolveLocation(coordinates) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEO_API_KEY');
  const baseUrl = PropertiesService.getScriptProperties().getProperty('GEO_API_URL');

  if (!apiKey || !baseUrl) throw new Error('Configuration API GEO manquante (GEO_API_KEY ou GEO_API_URL)');

  const options = {
    method: 'post',
    muteHttpExceptions: true,
    headers: { 'Content-Type': 'application/json' },
    payload: JSON.stringify({ action: 'batchresolvelocation', coordinates: coordinates })
  };

  const response = UrlFetchApp.fetch(baseUrl + '?X-Api-Key=' + apiKey, options);
  if (response.getResponseCode() !== 200) throw new Error('API GEO error: HTTP ' + response.getResponseCode());
  return JSON.parse(response.getContentText());
}

function callBatchCalculateDistance(reference, coordinates) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEO_API_KEY');
  const baseUrl = PropertiesService.getScriptProperties().getProperty('GEO_API_URL');

  if (!apiKey || !baseUrl) throw new Error('Configuration API GEO manquante (GEO_API_KEY ou GEO_API_URL)');

  const options = {
    method: 'post',
    muteHttpExceptions: true,
    headers: { 'Content-Type': 'application/json' },
    payload: JSON.stringify({ action: 'batchcalculatedistance', reference: reference, coordinates: coordinates })
  };

  const response = UrlFetchApp.fetch(baseUrl + '?X-Api-Key=' + apiKey, options);
  if (response.getResponseCode() !== 200) throw new Error('API GEO error: HTTP ' + response.getResponseCode());
  return JSON.parse(response.getContentText());
}