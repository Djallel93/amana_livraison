/**
 * ====================================================================
 * DATE_UTILS.GS - Utilitaires de Gestion des Dates
 * ====================================================================
 */

/**
 * Obtient la date/heure actuelle formatée
 * @param {string} format - Format souhaité ('date', 'datetime', 'time')
 * @returns {string} Date formatée
 */
function getCurrentDateTime(format = 'datetime') {
  const now = new Date();

  switch (format) {
    case 'date':
      return Utilities.formatDate(now, CONFIG.TIMEZONE, 'yyyy-MM-dd');
    case 'time':
      return Utilities.formatDate(now, CONFIG.TIMEZONE, 'HH:mm:ss');
    case 'datetime':
    default:
      return Utilities.formatDate(now, CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
  }
}

/**
 * Formate une date selon le format spécifié
 * @param {Date} date - Objet Date
 * @param {string} format - Format (ex: 'yyyy-MM-dd', 'dd/MM/yyyy HH:mm')
 * @returns {string} Date formatée
 */
function formatDate(date, format = 'yyyy-MM-dd HH:mm:ss') {
  if (!date || !(date instanceof Date)) {
    return '';
  }

  return Utilities.formatDate(date, CONFIG.TIMEZONE, format);
}

/**
 * Parse une chaîne de date en objet Date
 * @param {string} dateString - Chaîne de date
 * @returns {Date|null} Objet Date ou null si invalide
 */
function parseDate(dateString) {
  if (!dateString) return null;

  try {
    const date = new Date(dateString);
    return isNaN(date.getTime()) ? null : date;
  } catch (e) {
    Logger.log(`[DATE_UTILS] ⚠️ Erreur parsing date: ${dateString}`);
    return null;
  }
}

/**
 * Vérifie si une date est valide
 * @param {Date|string} date - Date à vérifier
 * @returns {boolean}
 */
function isValidDate(date) {
  if (!date) return false;

  const d = date instanceof Date ? date : parseDate(date);
  return d !== null && !isNaN(d.getTime());
}

/**
 * Ajoute des jours à une date
 * @param {Date} date - Date de départ
 * @param {number} days - Nombre de jours à ajouter
 * @returns {Date}
 */
function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Ajoute des heures à une date
 * @param {Date} date - Date de départ
 * @param {number} hours - Nombre d'heures à ajouter
 * @returns {Date}
 */
function addHours(date, hours) {
  const result = new Date(date);
  result.setHours(result.getHours() + hours);
  return result;
}

/**
 * Calcule la différence en jours entre 2 dates
 * @param {Date} date1 - Première date
 * @param {Date} date2 - Deuxième date
 * @returns {number} Différence en jours
 */
function daysDifference(date1, date2) {
  const oneDay = 24 * 60 * 60 * 1000; // millisecondes dans un jour
  return Math.round(Math.abs((date1 - date2) / oneDay));
}

/**
 * Calcule la différence en heures entre 2 dates
 * @param {Date} date1 - Première date
 * @param {Date} date2 - Deuxième date
 * @returns {number} Différence en heures
 */
function hoursDifference(date1, date2) {
  const oneHour = 60 * 60 * 1000;
  return Math.round(Math.abs((date1 - date2) / oneHour));
}

/**
 * Calcule la différence en minutes entre 2 dates
 * @param {Date} date1 - Première date
 * @param {Date} date2 - Deuxième date
 * @returns {number} Différence en minutes
 */
function minutesDifference(date1, date2) {
  const oneMinute = 60 * 1000;
  return Math.round(Math.abs((date1 - date2) / oneMinute));
}

/**
 * Vérifie si une date est dans le passé
 * @param {Date} date - Date à vérifier
 * @returns {boolean}
 */
function isPastDate(date) {
  return date < new Date();
}

/**
 * Vérifie si une date est dans le futur
 * @param {Date} date - Date à vérifier
 * @returns {boolean}
 */
function isFutureDate(date) {
  return date > new Date();
}

/**
 * Vérifie si une date est aujourd'hui
 * @param {Date} date - Date à vérifier
 * @returns {boolean}
 */
function isToday(date) {
  const today = new Date();
  return date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear();
}

/**
 * Obtient le début de la journée (00:00:00)
 * @param {Date} date - Date
 * @returns {Date}
 */
function startOfDay(date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

/**
 * Obtient la fin de la journée (23:59:59)
 * @param {Date} date - Date
 * @returns {Date}
 */
function endOfDay(date) {
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result;
}

/**
 * Vérifie si une heure est dans une plage horaire
 * @param {Date} datetime - Date/heure à vérifier
 * @param {Date} start - Début de la plage
 * @param {Date} end - Fin de la plage
 * @returns {boolean}
 */
function isInTimeWindow(datetime, start, end) {
  return datetime >= start && datetime <= end;
}

/**
 * Formate une durée en minutes en format lisible
 * @param {number} minutes - Durée en minutes
 * @returns {string} Format "Xh Ymin"
 */
function formatDuration(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (hours === 0) {
    return `${mins}min`;
  } else if (mins === 0) {
    return `${hours}h`;
  } else {
    return `${hours}h ${mins}min`;
  }
}

/**
 * Génère un nom de dossier basé sur la date et l'occasion
 * Format: YYYYMMdd_{occasion}
 * @param {Date} date - Date
 * @param {string} occasion - Type d'occasion
 * @returns {string}
 */
function generateFolderName(date, occasion) {
  const dateStr = Utilities.formatDate(date, CONFIG.TIMEZONE, 'yyyyMMdd');
  return `${dateStr}_${occasion}`;
}

/**
 * Parse un nom de dossier pour extraire la date et l'occasion
 * @param {string} folderName - Nom du dossier (ex: "20260215_zakat_el_fitr")
 * @returns {Object} {date: Date, occasion: string}
 */
function parseFolderName(folderName) {
  const parts = folderName.split('_');

  if (parts.length < 2) {
    return { date: null, occasion: null };
  }

  const dateStr = parts[0]; // YYYYMMDD
  const year = parseInt(dateStr.substring(0, 4));
  const month = parseInt(dateStr.substring(4, 6)) - 1; // Mois commence à 0
  const day = parseInt(dateStr.substring(6, 8));

  const date = new Date(year, month, day);
  const occasion = parts.slice(1).join('_');

  return { date, occasion };
}

/**
 * Obtient le timestamp actuel (en secondes)
 * @returns {number}
 */
function getTimestamp() {
  return Math.floor(Date.now() / 1000);
}

/**
 * Convertit un timestamp en Date
 * @param {number} timestamp - Timestamp en secondes
 * @returns {Date}
 */
function timestampToDate(timestamp) {
  return new Date(timestamp * 1000);
}

/**
 * Vérifie si un token a expiré
 * @param {Date} expirationDate - Date d'expiration
 * @returns {boolean}
 */
function isTokenExpired(expirationDate) {
  return new Date() > expirationDate;
}

/**
 * Génère une date d'expiration pour un token
 * @param {number} hours - Nombre d'heures de validité
 * @returns {Date}
 */
function generateTokenExpiration(hours = CONFIG.TOKENS.EXPIRATION_HOURS) {
  return addHours(new Date(), hours);
}

/**
 * Formate une date pour Google Maps URL (ISO 8601)
 * @param {Date} date - Date
 * @returns {string}
 */
function formatDateForMaps(date) {
  return date.toISOString();
}

/**
 * Obtient le jour de la semaine en français
 * @param {Date} date - Date
 * @returns {string}
 */
function getDayOfWeekFr(date) {
  const days = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  return days[date.getDay()];
}

/**
 * Obtient le mois en français
 * @param {Date} date - Date
 * @returns {string}
 */
function getMonthFr(date) {
  const months = [
    'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
  ];
  return months[date.getMonth()];
}

/**
 * Formate une date en format "lisible" français
 * Ex: "Lundi 15 Février 2026 à 14h30"
 * @param {Date} date - Date
 * @returns {string}
 */
function formatDateReadableFr(date) {
  const day = getDayOfWeekFr(date);
  const dayNum = date.getDate();
  const month = getMonthFr(date);
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${day} ${dayNum} ${month} ${year} à ${hours}h${minutes}`;
}

/**
 * Crée une plage de dates
 * @param {Date} start - Date de début
 * @param {Date} end - Date de fin
 * @returns {Array<Date>} Tableau de dates
 */
function createDateRange(start, end) {
  const dates = [];
  let current = new Date(start);

  while (current <= end) {
    dates.push(new Date(current));
    current = addDays(current, 1);
  }

  return dates;
}

/**
 * Vérifie si deux plages de dates se chevauchent
 * @param {Date} start1 - Début plage 1
 * @param {Date} end1 - Fin plage 1
 * @param {Date} start2 - Début plage 2
 * @param {Date} end2 - Fin plage 2
 * @returns {boolean}
 */
function dateRangesOverlap(start1, end1, start2, end2) {
  return start1 <= end2 && start2 <= end1;
}

/**
 * Obtient la semaine de l'année
 * @param {Date} date - Date
 * @returns {number}
 */
function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}
