/**
 * ====================================================================
 * VALIDATION_UTILS.GS - Utilitaires de Validation des Données
 * ====================================================================
 */

/**
 * Classe pour gérer les erreurs de validation
 */
class ValidationError extends Error {
  constructor(message, field = null) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
    this.timestamp = new Date();
  }
}

/**
 * Classe pour stocker les résultats de validation
 */
class ValidationResult {
  constructor() {
    this.isValid = true;
    this.errors = [];
    this.warnings = [];
  }

  addError(message, field = null) {
    this.isValid = false;
    this.errors.push({ message, field, type: 'error' });
  }

  addWarning(message, field = null) {
    this.warnings.push({ message, field, type: 'warning' });
  }

  hasErrors() {
    return this.errors.length > 0;
  }

  hasWarnings() {
    return this.warnings.length > 0;
  }

  getErrorMessages() {
    return this.errors.map(e => e.message);
  }

  getWarningMessages() {
    return this.warnings.map(w => w.message);
  }

  getAllMessages() {
    return [...this.errors, ...this.warnings].map(m => m.message);
  }
}

/**
 * Valide les données d'une livraison
 * @param {Object} livraison - Objet livraison
 * @returns {ValidationResult}
 */
function validateLivraison(livraison) {
  const result = new ValidationResult();

  // Champs obligatoires
  if (!livraison.id_famille) {
    result.addError('id_famille est obligatoire', 'id_famille');
  }

  if (!livraison.adresse || livraison.adresse.trim() === '') {
    result.addError('adresse est obligatoire', 'adresse');
  }

  if (!livraison.id_quartier) {
    result.addError('id_quartier est obligatoire', 'id_quartier');
  }

  // Validation des coordonnées GPS
  if (livraison.latitude === undefined || livraison.latitude === null) {
    result.addError('latitude est obligatoire', 'latitude');
  } else if (typeof livraison.latitude !== 'number' ||
    livraison.latitude < -90 || livraison.latitude > 90) {
    result.addError('latitude doit être entre -90 et 90', 'latitude');
  }

  if (livraison.longitude === undefined || livraison.longitude === null) {
    result.addError('longitude est obligatoire', 'longitude');
  } else if (typeof livraison.longitude !== 'number' ||
    livraison.longitude < -180 || livraison.longitude > 180) {
    result.addError('longitude doit être entre -180 et 180', 'longitude');
  }

  // Validation nombre de personnes
  if (livraison.nombre_personnes === undefined || livraison.nombre_personnes === null) {
    result.addError('nombre_personnes est obligatoire', 'nombre_personnes');
  } else if (typeof livraison.nombre_personnes !== 'number' || livraison.nombre_personnes < 1) {
    result.addError('nombre_personnes doit être >= 1', 'nombre_personnes');
  }

  // Validation priorité
  if (livraison.priorite === undefined || livraison.priorite === null) {
    result.addError('priorite est obligatoire', 'priorite');
  } else if (typeof livraison.priorite !== 'number' ||
    livraison.priorite < 1 || livraison.priorite > 5) {
    result.addError('priorite doit être entre 1 et 5', 'priorite');
  }

  // Validation statut
  if (livraison.statut) {
    const validStatuts = Object.values(CONFIG.ENUMS.STATUT_LIVRAISON);
    if (!validStatuts.includes(livraison.statut)) {
      result.addError(
        `statut invalide. Valeurs autorisées: ${validStatuts.join(', ')}`,
        'statut'
      );
    }
  }

  // Validation type_aide
  if (livraison.type_aide) {
    const validTypes = Object.values(CONFIG.ENUMS.TYPE_AIDE);
    if (!validTypes.includes(livraison.type_aide)) {
      result.addError(
        `type_aide invalide. Valeurs autorisées: ${validTypes.join(', ')}`,
        'type_aide'
      );
    }
  }

  // Validation fenêtre de disponibilité
  if (livraison.disponibilite_debut && livraison.disponibilite_fin) {
    const debut = parseDate(livraison.disponibilite_debut);
    const fin = parseDate(livraison.disponibilite_fin);

    if (!debut) {
      result.addError('disponibilite_debut invalide', 'disponibilite_debut');
    }
    if (!fin) {
      result.addError('disponibilite_fin invalide', 'disponibilite_fin');
    }

    if (debut && fin && debut >= fin) {
      result.addError(
        'disponibilite_debut doit être avant disponibilite_fin',
        'disponibilite_debut'
      );
    }
  }

  return result;
}

/**
 * Valide les données d'une route
 * @param {Object} route - Objet route
 * @returns {ValidationResult}
 */
function validateRoute(route) {
  const result = new ValidationResult();

  // Champs obligatoires
  if (!route.id_benevole) {
    result.addError('id_benevole est obligatoire', 'id_benevole');
  }

  if (!route.date_debut) {
    result.addError('date_debut est obligatoire', 'date_debut');
  } else if (!isValidDate(route.date_debut)) {
    result.addError('date_debut invalide', 'date_debut');
  }

  // Validation occasion
  if (route.occasion) {
    const validOccasions = Object.values(CONFIG.ENUMS.OCCASION);
    if (!validOccasions.includes(route.occasion)) {
      result.addError(
        `occasion invalide. Valeurs autorisées: ${validOccasions.join(', ')}`,
        'occasion'
      );
    }
  }

  // Validation statut
  if (route.statut) {
    const validStatuts = Object.values(CONFIG.ENUMS.STATUT_ROUTE);
    if (!validStatuts.includes(route.statut)) {
      result.addError(
        `statut invalide. Valeurs autorisées: ${validStatuts.join(', ')}`,
        'statut'
      );
    }
  }

  // Validation distance
  if (route.distance_totale_km !== undefined && route.distance_totale_km !== null) {
    if (typeof route.distance_totale_km !== 'number' || route.distance_totale_km < 0) {
      result.addError('distance_totale_km doit être >= 0', 'distance_totale_km');
    }

    // Avertissement pour routes très éloignées
    if (route.distance_totale_km > CONFIG.ROUTE_OPTIMIZATION.DISTANCE_LIVRAISON_ISOLEE_KM) {
      result.addWarning(
        `Route très éloignée (${route.distance_totale_km} km). Vérifier l'optimisation.`,
        'distance_totale_km'
      );
    }
  }

  // Validation poids
  if (route.poids_total_kg !== undefined && route.poids_total_kg !== null) {
    if (typeof route.poids_total_kg !== 'number' || route.poids_total_kg < 0) {
      result.addError('poids_total_kg doit être >= 0', 'poids_total_kg');
    }
  }

  // Validation relivre
  if (route.relivre !== undefined && route.relivre !== null) {
    if (typeof route.relivre !== 'boolean') {
      result.addError('relivre doit être un booléen', 'relivre');
    }
  }

  return result;
}

/**
 * Valide les données d'une étape
 * @param {Object} etape - Objet étape
 * @returns {ValidationResult}
 */
function validateEtape(etape) {
  const result = new ValidationResult();

  // Champs obligatoires
  if (!etape.id_route) {
    result.addError('id_route est obligatoire', 'id_route');
  }

  if (!etape.id_livraison) {
    result.addError('id_livraison est obligatoire', 'id_livraison');
  }

  if (etape.ordre_passage === undefined || etape.ordre_passage === null) {
    result.addError('ordre_passage est obligatoire', 'ordre_passage');
  } else if (typeof etape.ordre_passage !== 'number' || etape.ordre_passage < 1) {
    result.addError('ordre_passage doit être >= 1', 'ordre_passage');
  }

  // Validation statut
  if (etape.statut) {
    const validStatuts = Object.values(CONFIG.ENUMS.STATUT_ETAPE);
    if (!validStatuts.includes(etape.statut)) {
      result.addError(
        `statut invalide. Valeurs autorisées: ${validStatuts.join(', ')}`,
        'statut'
      );
    }
  }

  // Validation heures
  if (etape.heure_debut && etape.heure_fin) {
    const debut = parseDate(etape.heure_debut);
    const fin = parseDate(etape.heure_fin);

    if (!debut) {
      result.addError('heure_debut invalide', 'heure_debut');
    }
    if (!fin) {
      result.addError('heure_fin invalide', 'heure_fin');
    }

    if (debut && fin && debut >= fin) {
      result.addError('heure_debut doit être avant heure_fin', 'heure_debut');
    }
  }

  return result;
}

/**
 * Valide les données de famille retournées par l'API
 * @param {Object} famille - Données famille
 * @returns {ValidationResult}
 */
function validateFamilyData(famille) {
  const result = new ValidationResult();

  if (!famille) {
    result.addError('Données famille manquantes');
    return result;
  }

  if (!famille.id) {
    result.addError('ID famille manquant');
  }

  if (!famille.adresse) {
    result.addError('Adresse manquante');
  }

  // Vérifier nombre de personnes
  const adultes = parseInt(famille.adultes) || 0;
  const enfants = parseInt(famille.enfants) || 0;
  const total = adultes + enfants;

  if (total < 1) {
    result.addError('Nombre total de personnes invalide');
  }

  return result;
}

/**
 * Valide les données de bénévole retournées par l'API
 * @param {Object} benevole - Données bénévole
 * @returns {ValidationResult}
 */
function validateVolunteerData(benevole) {
  const result = new ValidationResult();

  if (!benevole) {
    result.addError('Données bénévole manquantes');
    return result;
  }

  if (!benevole.id) {
    result.addError('ID bénévole manquant');
  }

  if (!benevole.nom) {
    result.addError('Nom manquant');
  }

  if (!benevole.email) {
    result.addError('Email manquant');
  } else if (!isValidEmail(benevole.email)) {
    result.addError('Email invalide');
  }

  return result;
}

/**
 * Valide un email
 * @param {string} email - Adresse email
 * @returns {boolean}
 */
function isValidEmail(email) {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
}

/**
 * Valide un numéro de téléphone français
 * @param {string} phone - Numéro de téléphone
 * @returns {boolean}
 */
function isValidPhoneFr(phone) {
  // Format: +33 X XX XX XX XX ou 0X XX XX XX XX
  const regex = /^(?:(?:\+33\s?[1-9])|(?:0[1-9]))(?:\s?\d{2}){4}$/;
  return regex.test(phone);
}

/**
 * Valide un ID avec préfixe
 * @param {string} id - ID à valider
 * @param {string} prefix - Préfixe attendu (ex: 'L', 'R', 'E')
 * @returns {boolean}
 */
function isValidIdWithPrefix(id, prefix) {
  if (!id || typeof id !== 'string') return false;

  const regex = new RegExp(`^${prefix}\\d{3,}$`);
  return regex.test(id);
}

/**
 * Valide une URL
 * @param {string} url - URL à valider
 * @returns {boolean}
 */
function isValidUrl(url) {
  try {
    new URL(url);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Valide un objet contre un schéma
 * @param {Object} obj - Objet à valider
 * @param {Object} schema - Schéma de validation {champ: {required, type, min, max}}
 * @returns {ValidationResult}
 */
function validateAgainstSchema(obj, schema) {
  const result = new ValidationResult();

  for (const [field, rules] of Object.entries(schema)) {
    const value = obj[field];

    // Champ requis
    if (rules.required && (value === undefined || value === null || value === '')) {
      result.addError(`${field} est obligatoire`, field);
      continue;
    }

    // Si le champ n'est pas requis et est vide, sauter les autres validations
    if (!rules.required && (value === undefined || value === null || value === '')) {
      continue;
    }

    // Type de données
    if (rules.type) {
      const actualType = typeof value;
      if (actualType !== rules.type) {
        result.addError(
          `${field} doit être de type ${rules.type} (reçu: ${actualType})`,
          field
        );
      }
    }

    // Valeurs min/max pour les nombres
    if (rules.type === 'number') {
      if (rules.min !== undefined && value < rules.min) {
        result.addError(`${field} doit être >= ${rules.min}`, field);
      }
      if (rules.max !== undefined && value > rules.max) {
        result.addError(`${field} doit être <= ${rules.max}`, field);
      }
    }

    // Longueur min/max pour les strings
    if (rules.type === 'string') {
      if (rules.minLength !== undefined && value.length < rules.minLength) {
        result.addError(`${field} doit contenir au moins ${rules.minLength} caractères`, field);
      }
      if (rules.maxLength !== undefined && value.length > rules.maxLength) {
        result.addError(`${field} doit contenir au maximum ${rules.maxLength} caractères`, field);
      }
    }

    // Valeurs autorisées (enum)
    if (rules.enum && !rules.enum.includes(value)) {
      result.addError(
        `${field} doit être parmi: ${rules.enum.join(', ')}`,
        field
      );
    }

    // Validation personnalisée
    if (rules.custom && typeof rules.custom === 'function') {
      const customResult = rules.custom(value);
      if (customResult !== true) {
        result.addError(customResult || `${field} invalide`, field);
      }
    }
  }

  return result;
}

/**
 * Valide la capacité d'un véhicule par rapport au poids de la route
 * @param {number} capaciteKg - Capacité du véhicule
 * @param {number} poidsRouteKg - Poids de la route
 * @returns {ValidationResult}
 */
function validateVehicleCapacity(capaciteKg, poidsRouteKg) {
  const result = new ValidationResult();

  if (poidsRouteKg > capaciteKg) {
    result.addError(
      `Poids de la route (${poidsRouteKg} kg) dépasse la capacité du véhicule (${capaciteKg} kg)`,
      'capacite'
    );
  } else if (poidsRouteKg > capaciteKg * 0.9) {
    result.addWarning(
      `Poids de la route proche de la capacité maximale (${Math.round(poidsRouteKg / capaciteKg * 100)}%)`,
      'capacite'
    );
  }

  return result;
}

/**
 * Vérifie si une liste d'IDs contient des doublons
 * @param {Array<string>} ids - Liste d'IDs
 * @returns {ValidationResult}
 */
function checkDuplicateIds(ids) {
  const result = new ValidationResult();
  const seen = new Set();
  const duplicates = [];

  for (const id of ids) {
    if (seen.has(id)) {
      duplicates.push(id);
    } else {
      seen.add(id);
    }
  }

  if (duplicates.length > 0) {
    result.addError(
      `IDs en double détectés: ${duplicates.join(', ')}`,
      'ids'
    );
  }

  return result;
}
