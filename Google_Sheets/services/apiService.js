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
      // Logger.log(`[API] 📡 Tentative ${attempt}/${maxRetries}: ${url}`);
      Logger.log(`[API] 📡 Tentative ${attempt}/${maxRetries}`);

      const response = UrlFetchApp.fetch(url, {
        muteHttpExceptions: true,
        ...options
      });

      const statusCode = response.getResponseCode();
      const contentText = response.getContentText();

      // Vérifier le statut HTTP
      if (statusCode < 200 || statusCode >= 300) {
        throw new ApiError(
          `Erreur HTTP ${statusCode}: ${contentText}`,
          statusCode
        );
      }

      // Parser la réponse JSON
      let data;
      try {
        data = JSON.parse(contentText);
      } catch (parseError) {
        throw new ApiError(
          `Erreur parsing JSON: ${parseError.message}`,
          statusCode
        );
      }

      // Mettre en cache si demandé
      if (cacheKey) {
        setCachedResponse(cacheKey, data, cacheDuration);
      }

      // Logger.log(`[API] ✅ Succès (${statusCode}): ${url}`);
      Logger.log(`[API] ✅ Succès (${statusCode})`);
      return data;

    } catch (error) {
      lastError = error;
      Logger.log(`[API] ❌ Tentative ${attempt} échouée: ${error.message}`);

      // Si c'est la dernière tentative, ne pas attendre
      if (attempt < maxRetries) {
        // Backoff exponentiel: 1s, 2s, 4s...
        const delay = CONFIG.BACKOFF_DELAY_MS * Math.pow(2, attempt - 1);
        Logger.log(`[API] ⏳ Attente de ${delay}ms avant nouvelle tentative...`);
        Utilities.sleep(delay);
      }
    }
  }

  // Toutes les tentatives ont échoué
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

  if (queryParts.length === 0) {
    return baseUrl;
  }

  const separator = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${separator}${queryParts.join('&')}`;
}

/**
 * Gestion du cache
 */

const cache = CacheService.getScriptCache();

/**
 * Obtient une réponse depuis le cache
 * @param {string} key - Clé du cache
 * @returns {Object|null}
 */
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

/**
 * Met en cache une réponse
 * @param {string} key - Clé du cache
 * @param {Object} data - Données à cacher
 * @param {number} duration - Durée en secondes
 */
function setCachedResponse(key, data, duration = 300) {
  try {
    cache.put(key, JSON.stringify(data), duration);
    Logger.log(`[CACHE] ✅ Réponse mise en cache: ${key} (${duration}s)`);
  } catch (e) {
    Logger.log(`[CACHE] ⚠️ Erreur mise en cache: ${e.message}`);
  }
}

/**
 * Invalide le cache pour une clé
 * @param {string} key - Clé à invalider
 */
function invalidateCache(key) {
  cache.remove(key);
  Logger.log(`[CACHE] 🗑️ Cache invalidé: ${key}`);
}

/**
 * Invalide tout le cache
 */
function invalidateAllCache() {
  cache.removeAll();
  Logger.log(`[CACHE] 🗑️ Tout le cache invalidé`);
}

// ========================================
// API FAMILLES
// ========================================

/**
 * Ping l'API Familles
 * @returns {Object} Statut de l'API
 */
function pingFamilyApi() {
  const url = buildUrl(CONFIG.API_FAMILLES.URL, {
    action: CONFIG.API_FAMILLES.ENDPOINTS.PING
  });

  return callApiWithRetry(url, {}, null, 0); // Pas de cache pour ping
}

/**
 * Récupère toutes les familles validées avec filtres
 * @param {Object} filters - Filtres (zakatElFitr, sadaqa, orderBy, etc.)
 * @returns {Object} Liste des familles
 */
function getAllValidatedFamilies(filters = {}) {
  const params = {
    action: CONFIG.API_FAMILLES.ENDPOINTS.ALL_FAMILIES,
    apiKey: CONFIG.API_FAMILLES.KEY,
    includeHierarchy: true,
    ...filters
  };

  const url = buildUrl(CONFIG.API_FAMILLES.URL, params);
  const cacheKey = `families_${JSON.stringify(filters)}`;

  return callApiWithRetry(url, {}, cacheKey, CONFIG.API_FAMILLES.CACHE_DURATION);
}

/**
 * Récupère une famille par ID
 * @param {string} familyId - ID de la famille
 * @returns {Object} Données de la famille
 */
function getFamilyById(familyId) {
  const url = buildUrl(CONFIG.API_FAMILLES.URL, {
    action: CONFIG.API_FAMILLES.ENDPOINTS.GET_FAMILY,
    id: familyId,
    apiKey: CONFIG.API_FAMILLES.KEY
  });

  const cacheKey = `family_${familyId}`;

  return callApiWithRetry(url, {}, cacheKey, CONFIG.API_FAMILLES.CACHE_DURATION);
}

// ========================================
// API BÉNÉVOLES
// ========================================

/**
 * Ping l'API Bénévoles
 * @returns {Object} Statut de l'API
 */
function pingVolunteerApi() {
  const url = buildUrl(CONFIG.API_BENEVOLES.URL, {
    action: CONFIG.API_BENEVOLES.ENDPOINTS.PING
  });

  return callApiWithRetry(url, {}, null, 0);
}

/**
 * Liste tous les bénévoles avec filtres
 * @param {Object} filters - Filtres (actif, statut, confiance)
 * @returns {Object} Liste des bénévoles
 */
function listVolunteers(filters = {}) {
  const params = {
    action: CONFIG.API_BENEVOLES.ENDPOINTS.LIST_VOLUNTEERS,
    apiKey: CONFIG.API_BENEVOLES.KEY,
    ...filters
  };

  const url = buildUrl(CONFIG.API_BENEVOLES.URL, params);
  const cacheKey = `volunteers_${JSON.stringify(filters)}`;

  return callApiWithRetry(url, {}, cacheKey, CONFIG.API_BENEVOLES.CACHE_DURATION);
}

/**
 * Récupère un bénévole par ID
 * @param {string} volunteerId - ID du bénévole
 * @returns {Object} Données du bénévole
 */
function getVolunteerById(volunteerId) {
  const url = buildUrl(CONFIG.API_BENEVOLES.URL, {
    action: CONFIG.API_BENEVOLES.ENDPOINTS.GET_VOLUNTEER,
    id: volunteerId,
    apiKey: CONFIG.API_BENEVOLES.KEY
  });

  const cacheKey = `volunteer_${volunteerId}`;

  return callApiWithRetry(url, {}, cacheKey, CONFIG.API_BENEVOLES.CACHE_DURATION);
}

/**
 * Récupère les disponibilités d'un bénévole
 * @param {string} volunteerId - ID du bénévole
 * @returns {Object} Disponibilités
 */
function getVolunteerAvailability(volunteerId) {
  const url = buildUrl(CONFIG.API_BENEVOLES.URL, {
    action: CONFIG.API_BENEVOLES.ENDPOINTS.GET_AVAILABILITY,
    volunteerId: volunteerId,
    apiKey: CONFIG.API_BENEVOLES.KEY
  });

  const cacheKey = `availability_${volunteerId}`;

  return callApiWithRetry(url, {}, cacheKey, 60); // Cache court (1 min)
}

/**
 * Récupère les bénévoles disponibles pour un créneau
 * @param {string} disponibilite - Créneau (Matin, Après-midi, etc.)
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

  const cacheKey = `available_${disponibilite}_${courtDelaiOnly}`;

  return callApiWithRetry(url, {}, cacheKey, 60);
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

  const cacheKey = 'vehicle_types';

  return callApiWithRetry(url, {}, cacheKey, CONFIG.API_BENEVOLES.CACHE_DURATION);
}

// ========================================
// API GEO
// ========================================

/**
 * Ping l'API GEO
 * @returns {Object} Statut de l'API
 */
function pingGeoApi() {
  const url = buildUrl(CONFIG.API_GEO.URL, {
    action: CONFIG.API_GEO.ENDPOINTS.PING,
    'X-Api-Key': CONFIG.API_GEO.KEY
  });

  return callApiWithRetry(url, {}, null, 0);
}

/**
 * Géocode une adresse
 * @param {string} adresse - Adresse à géocoder
 * @param {string} ville - Ville (optionnel)
 * @param {string} codePostal - Code postal (optionnel)
 * @returns {Object} Coordonnées GPS
 */
function geocodeAddress(adresse, ville = null, codePostal = null) {
  const params = {
    action: CONFIG.API_GEO.ENDPOINTS.GEOCODE,
    adresse: adresse,
    'X-Api-Key': CONFIG.API_GEO.KEY
  };

  if (ville) params.ville = ville;
  if (codePostal) params.codePostal = codePostal;

  const url = buildUrl(CONFIG.API_GEO.URL, params);
  const cacheKey = `geocode_${adresse}_${ville}_${codePostal}`;

  return callApiWithRetry(url, {}, cacheKey, CONFIG.API_GEO.CACHE_DURATION);
}

/**
 * Résout la hiérarchie complète (Ville > Secteur > Quartier)
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {Object} Hiérarchie complète
 */
function resolveLocation(lat, lng) {
  const url = buildUrl(CONFIG.API_GEO.URL, {
    action: CONFIG.API_GEO.ENDPOINTS.RESOLVE_LOCATION,
    lat: lat,
    lng: lng,
    'X-Api-Key': CONFIG.API_GEO.KEY
  });

  const cacheKey = `location_${lat}_${lng}`;

  return callApiWithRetry(url, {}, cacheKey, CONFIG.API_GEO.CACHE_DURATION);
}

/**
 * Calcule la distance entre 2 points GPS
 * @param {number} lat1 - Latitude point 1
 * @param {number} lng1 - Longitude point 1
 * @param {number} lat2 - Latitude point 2
 * @param {number} lng2 - Longitude point 2
 * @returns {Object} Distance en km
 */
function calculateDistance(lat1, lng1, lat2, lng2) {
  const url = buildUrl(CONFIG.API_GEO.URL, {
    action: CONFIG.API_GEO.ENDPOINTS.CALCULATE_DISTANCE,
    lat1: lat1,
    lng1: lng1,
    lat2: lat2,
    lng2: lng2,
    'X-Api-Key': CONFIG.API_GEO.KEY
  });

  const cacheKey = `distance_${lat1}_${lng1}_${lat2}_${lng2}`;

  return callApiWithRetry(url, {}, cacheKey, CONFIG.API_GEO.CACHE_DURATION);
}

/**
 * Récupère tous les quartiers
 * @param {string} idSecteur - Filtrer par secteur (optionnel)
 * @returns {Object} Liste des quartiers
 */
function getAllQuartiers(idSecteur = null) {
  const params = {
    action: CONFIG.API_GEO.ENDPOINTS.GET_QUARTIERS,
    'X-Api-Key': CONFIG.API_GEO.KEY
  };

  if (idSecteur) params.idSecteur = idSecteur;

  const url = buildUrl(CONFIG.API_GEO.URL, params);
  const cacheKey = `quartiers_${idSecteur || 'all'}`;

  return callApiWithRetry(url, {}, cacheKey, CONFIG.API_GEO.CACHE_DURATION);
}

/**
 * Récupère un quartier par ID
 * @param {string} quartierId - ID du quartier
 * @returns {Object} Données du quartier
 */
function getQuartierById(quartierId) {
  const url = buildUrl(CONFIG.API_GEO.URL, {
    action: CONFIG.API_GEO.ENDPOINTS.GET_QUARTIER,
    id: quartierId,
    'X-Api-Key': CONFIG.API_GEO.KEY
  });

  const cacheKey = `quartier_${quartierId}`;

  return callApiWithRetry(url, {}, cacheKey, CONFIG.API_GEO.CACHE_DURATION);
}

/**
 * Récupère toutes les villes
 * @returns {Object} Liste des villes
 */
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

/**
 * Vérifie que toutes les APIs sont accessibles
 * @returns {Object} Statut de chaque API
 */
function checkAllApis() {
  const results = {
    timestamp: new Date(),
    apis: {}
  };

  // API Familles
  try {
    const familyPing = pingFamilyApi();
    results.apis.familles = {
      status: 'ok',
      version: familyPing.version || 'unknown',
      message: familyPing.message || ''
    };
  } catch (error) {
    results.apis.familles = {
      status: 'error',
      message: error.message
    };
  }

  // API Bénévoles
  try {
    const volunteerPing = pingVolunteerApi();
    results.apis.benevoles = {
      status: 'ok',
      version: volunteerPing.version || 'unknown',
      message: volunteerPing.message || ''
    };
  } catch (error) {
    results.apis.benevoles = {
      status: 'error',
      message: error.message
    };
  }

  // API GEO
  try {
    const geoPing = pingGeoApi();
    results.apis.geo = {
      status: 'ok',
      version: geoPing.version || 'unknown',
      message: geoPing.message || ''
    };
  } catch (error) {
    results.apis.geo = {
      status: 'error',
      message: error.message
    };
  }

  return results;
}

/**
 * Log le statut de toutes les APIs
 */
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
