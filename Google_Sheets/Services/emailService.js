/**
 * ====================================================================
 * EMAIL_SERVICE.GS - Service d'Envoi des Emails aux Bénévoles
 * ====================================================================
 * v2.2 — Feature: force_active column on tokens
 *
 * Token validity logic:
 *   force_active = true  → always valid (expiration ignored)
 *   force_active = false AND current_time < expiration  → valid
 *   force_active = false AND current_time >= expiration → invalid
 */

// ============================================================
// POINT D'ENTRÉE PRINCIPAL
// ============================================================

/**
 * Envoie les emails pour une liste de routes confirmées.
 * @param {string[]} routeIds
 * @returns {Object} { success, sent, errors[] }
 */
function sendRouteEmails(routeIds) {
  Logger.log(`[EMAIL] 🚀 Envoi emails pour ${routeIds.length} route(s)…`);

  const result = { success: false, sent: 0, errors: [] };

  const apiWebUrl = PropertiesService.getScriptProperties().getProperty('API_WEB_URL') || '';
  const adminPhone = PropertiesService.getScriptProperties().getProperty('ADMIN_PHONE') || '';

  if (!apiWebUrl) {
    result.errors.push('API_WEB_URL non configurée (Menu > Configuration > Configurer API Web)');
    return result;
  }

  for (const routeId of routeIds) {
    try {
      Logger.log(`[EMAIL] 📧 Traitement route ${routeId}…`);
      sendRouteEmail(routeId, apiWebUrl, adminPhone);
      result.sent++;
      Logger.log(`[EMAIL] ✅ Email envoyé pour route ${routeId}`);
    } catch (err) {
      Logger.log(`[EMAIL] ❌ Route ${routeId}: ${err.message}`);
      result.errors.push(`Route ${routeId} : ${err.message}`);
    }
  }

  result.success = result.sent > 0;
  Logger.log(`[EMAIL] 🎉 Terminé: ${result.sent} envoyés, ${result.errors.length} erreurs`);
  return result;
}

// ============================================================
// ENVOI D'UN EMAIL UNIQUE
// ============================================================

/**
 * Envoie l'email itinéraire au bénévole d'une route.
 * @param {string} routeId
 * @param {string} apiWebUrl
 * @param {string} adminPhone
 */
function sendRouteEmail(routeId, apiWebUrl, adminPhone) {
  const route = getRouteById(routeId);
  if (!route) throw new Error(`Route ${routeId} introuvable`);

  if (normalizeStatut(route.statut) !== CONFIG.ENUMS.STATUT_ROUTE.CONFIRMEE) {
    throw new Error(`Route ${routeId} n'est pas Confirmée (statut: [${route.statut}])`);
  }

  // Récupérer le bénévole
  const benevoleResponse = getVolunteerById(route.id_benevole);
  const benevole = extractData(benevoleResponse, ['volunteer', 'benevole']);

  if (!benevole || !benevole.email) {
    throw new Error(`Bénévole ${route.id_benevole} introuvable ou sans email`);
  }

  // Générer ou réutiliser le token
  const token = generateOrGetToken(routeId);

  // Étapes de livraison
  const stops = getDeliveryStopsForRoute(routeId);
  if (stops.length === 0) throw new Error(`Aucune étape de livraison pour ${routeId}`);

  // Enrichir avec données famille
  const stopsWithData = buildStopsData(stops);

  // Construire et envoyer l'email
  const emailHtml = buildEmailHtml({ route, benevole, stops: stopsWithData, token, apiWebUrl, adminPhone });
  const subject = `🗺️ Votre itinéraire de livraison — Route ${routeId}`;

  MailApp.sendEmail({
    to: benevole.email,
    subject: subject,
    htmlBody: emailHtml,
    name: CONFIG.EMAIL.FROM_NAME
  });

  Logger.log(`[EMAIL] 📬 Envoyé à ${benevole.email} pour route ${routeId}`);
}

// ============================================================
// TOKEN
// ============================================================

/**
 * Génère ou réutilise un token valide pour la route.
 * Les nouveaux tokens ont force_active = false par défaut.
 * Un token existant est réutilisé s'il est encore valide selon isTokenValid().
 *
 * @param {string} routeId
 * @returns {string}
 */
function generateOrGetToken(routeId) {
  const existing = filterData(CONFIG.SHEETS.TOKENS, row => String(row.id_route) === String(routeId));

  for (const row of existing) {
    const expiration = parseDate(row.date_expiration);
    // Use the unified validity check (respects force_active)
    if (isTokenValid(row.force_active, expiration)) {
      Logger.log(`[EMAIL] 🔑 Token existant réutilisé pour ${routeId}`);
      return row.token;
    }
  }

  const token = generateSecureToken();
  const expiration = generateTokenExpiration(CONFIG.TOKENS.EXPIRATION_HOURS);
  const now = getCurrentDateTime();

  // Columns: id_route | token | date_expiration | date_creation | force_active
  appendRow(CONFIG.SHEETS.TOKENS, [routeId, token, expiration, now, false]);
  Logger.log(`[EMAIL] 🔑 Nouveau token généré pour ${routeId} (force_active: false)`);
  return token;
}

/**
 * Détermine si un token est valide selon la logique force_active.
 *
 * Règles :
 *   force_active = true  → toujours valide (expiration ignorée)
 *   force_active = false AND current_time < expiration  → valide
 *   force_active = false AND current_time >= expiration → invalide
 *
 * @param {boolean|string} forceActive - Valeur du champ force_active
 * @param {Date|null}       expiration  - Date d'expiration du token
 * @returns {boolean}
 */
function isTokenValid(forceActive, expiration) {
  // Normalise la valeur force_active (Sheets peut retourner boolean ou string)
  const active = forceActive === true || forceActive === 'true' || forceActive === 'TRUE';

  if (active) {
    // force_active = true → always valid
    return true;
  }

  // force_active = false → check expiration
  if (!expiration) return false;
  return !isTokenExpired(expiration);
}

/**
 * Génère un token aléatoire de 32 caractères.
 */
function generateSecureToken() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let t = '';
  for (let i = 0; i < CONFIG.TOKENS.LENGTH; i++) {
    t += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return t;
}

// ============================================================
// DONNÉES DES STOPS
// ============================================================

/**
 * Enrichit chaque stop avec adresse, famille, téléphones.
 * @param {Object[]} stops
 * @returns {Object[]}
 */
function buildStopsData(stops) {
  return stops.map(stop => {
    const delivery = getDeliveryById(stop.id_livraison);
    if (!delivery) {
      Logger.log(`[EMAIL] ⚠️ Livraison ${stop.id_livraison} introuvable`);
      return {
        ...stop,
        adresse: '— adresse inconnue —',
        id_famille: stop.id_livraison,
        nombre_personnes: '?',
        telephone: '',
        telephoneBis: ''
      };
    }

    let telephone = '', telephoneBis = '';
    try {
      const familleResp = getFamilyById(delivery.id_famille);
      const famille = extractData(familleResp, ['family', 'famille']);
      if (famille) {
        telephone = famille.telephone || '';
        telephoneBis = famille.telephoneBis || '';
      }
    } catch (err) {
      Logger.log(`[EMAIL] ⚠️ Téléphone famille ${delivery.id_famille}: ${err.message}`);
    }

    return {
      ...stop,
      adresse: delivery.adresse || '—',
      id_famille: delivery.id_famille,
      nombre_personnes: delivery.nombre_personnes || 1,
      telephone,
      telephoneBis
    };
  });
}

// ============================================================
// CONSTRUCTEUR HTML EMAIL
// ============================================================

/**
 * Construit le HTML complet de l'email itinéraire.
 * Optimisé pour lecture et utilisation sur téléphone.
 */
function buildEmailHtml(ctx) {
  const { route, benevole, stops, token, apiWebUrl, adminPhone } = ctx;

  const baseUrl = `${apiWebUrl}?token=${encodeURIComponent(token)}`;
  const startUrl = `${baseUrl}&action=start_route`;
  const finishUrl = `${baseUrl}&action=finish_route`;

  const benevolePrenom = benevole.prenom || benevole.nom || 'Bénévole';
  const dateFormatted = formatDateFr(route.date_debut);

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>Itinéraire — ${route.id_route}</title>
</head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:'Segoe UI',Arial,sans-serif;">

<table width="100%" cellpadding="0" cellspacing="0" border="0"
       style="background:#f0f4f8;padding:12px 0;">
  <tr><td align="center">
  <table width="600" cellpadding="0" cellspacing="0" border="0"
         style="max-width:600px;width:100%;">

    <!-- HEADER -->
    <tr><td style="background:linear-gradient(135deg,#4facfe 0%,#00f2fe 100%);
                   border-radius:12px 12px 0 0;padding:20px 20px 16px;text-align:center;">
      <p style="color:#fff;margin:0;font-size:22px;font-weight:700;line-height:1.3;">
        🚗 Route <strong>${route.id_route}</strong>
      </p>
      ${dateFormatted ? `<p style="color:rgba(255,255,255,.85);margin:4px 0 0;font-size:13px;">${dateFormatted}</p>` : ''}
    </td></tr>

    <!-- BODY -->
    <tr><td style="background:#fff;padding:16px;">

      <p style="color:#2d3748;font-size:14px;margin:0 0 16px;line-height:1.5;">
        Bonjour <strong>${benevolePrenom}</strong> — <strong>${stops.length} livraison(s)</strong> aujourd'hui.
      </p>

      <!-- BOUTONS MAPS + DÉMARRER -->
      ${route.lien_maps ? `
      <a href="${route.lien_maps}"
         style="display:block;padding:13px 16px;margin-bottom:10px;
                background:linear-gradient(135deg,#38b2ac 0%,#2c7a7b 100%);
                color:#fff;text-decoration:none;border-radius:10px;
                font-size:15px;font-weight:700;text-align:center;
                box-shadow:0 4px 12px rgba(56,178,172,.35);">
        🗺️&nbsp; Itinéraire Google Maps
      </a>` : ''}
      <a href="${startUrl}"
         style="display:block;padding:13px 16px;margin-bottom:16px;
                background:linear-gradient(135deg,#4facfe 0%,#00f2fe 100%);
                color:#fff;text-decoration:none;border-radius:10px;
                font-size:15px;font-weight:700;text-align:center;
                box-shadow:0 4px 12px rgba(79,172,254,.35);">
        ▶&nbsp; Je commence ma livraison
      </a>

      <hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 16px;">

      ${buildStopsTable(stops, baseUrl)}

      <hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0;">

      <!-- BOUTON TERMINER -->
      <a href="${finishUrl}"
         style="display:block;padding:13px 16px;
                background:linear-gradient(135deg,#38a169 0%,#276749 100%);
                color:#fff;text-decoration:none;border-radius:10px;
                font-size:15px;font-weight:700;text-align:center;
                box-shadow:0 4px 12px rgba(56,161,105,.35);">
        🏁&nbsp; J'ai fini ma livraison
      </a>
      <p style="text-align:center;color:#a0aec0;font-size:11px;margin:8px 0 0;">
        À utiliser quand toutes les livraisons sont traitées.
      </p>

    </td></tr>

    <!-- FOOTER -->
    <tr><td style="background:#2d3748;border-radius:0 0 12px 12px;
                   padding:14px 20px;text-align:center;">
      ${adminPhone
      ? `<a href="tel:${adminPhone.replace(/\s/g, '')}"
               style="color:#4facfe;font-size:18px;font-weight:700;text-decoration:none;">
              📞 ${adminPhone}
            </a>
           <p style="color:#718096;font-size:11px;margin:6px 0 0;">
             Un problème ? Appelez l'administrateur
           </p>`
      : `<p style="color:#a0aec0;font-size:12px;margin:0;">
             Un problème ? Contactez l'administrateur
           </p>`
    }
    </td></tr>

  </table>
  </td></tr>
</table>
</body>
</html>`;
}

/**
 * Cartes de livraison dans l'email — optimisées mobile.
 * Boutons Livré / Ignoré en bas de chaque carte, côte à côte.
 */
function buildStopsTable(stops, baseUrl) {
  if (stops.length === 0) return '<p style="color:#718096;font-size:13px;">Aucune livraison.</p>';

  const cards = stops.map((stop, idx) => {
    const confirmUrl = `${baseUrl}&action=confirm_delivery&id_livraison=${encodeURIComponent(stop.id_livraison)}`;
    const skipUrl = `${baseUrl}&action=skip_delivery&id_livraison=${encodeURIComponent(stop.id_livraison)}`;
    const mapsLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(stop.adresse)}`;

    const phones = [stop.telephone, stop.telephoneBis]
      .filter(p => p && String(p).trim())
      .map(p => `<a href="tel:${String(p).replace(/\s/g, '')}"
                    style="color:#3182ce;text-decoration:none;font-weight:600;">${p}</a>`)
      .join(' &nbsp;·&nbsp; ');

    return `
<table width="100%" cellpadding="0" cellspacing="0" border="0"
       style="border-radius:10px;margin-bottom:10px;
              border:1px solid #e2e8f0;overflow:hidden;">
  <!-- STOP HEADER: number + meta -->
  <tr>
    <td width="36" style="background:linear-gradient(135deg,#4facfe,#00f2fe);
                          text-align:center;vertical-align:middle;padding:0 6px;">
      <span style="color:#fff;font-size:16px;font-weight:700;">${idx + 1}</span>
    </td>
    <td style="background:#f7fafc;padding:8px 12px;vertical-align:middle;">
      <span style="font-size:12px;color:#718096;">
        Famille <strong style="color:#2d3748;">${stop.id_famille}</strong>
        &nbsp;·&nbsp;
        <strong style="color:#2d3748;">${stop.nombre_personnes}</strong> pers.
      </span>
    </td>
  </tr>
  <!-- ADDRESS + PHONE -->
  <tr>
    <td colspan="2" style="padding:10px 12px;background:#fff;">
      <a href="${mapsLink}"
         style="color:#2d3748;font-size:14px;font-weight:600;
                text-decoration:none;display:block;margin-bottom:${phones ? '6px' : '0'};">
        📍 ${stop.adresse}
      </a>
      ${phones ? `<span style="font-size:13px;color:#4a5568;">📞 ${phones}</span>` : ''}
    </td>
  </tr>
  <!-- ACTION BUTTONS -->
  <tr>
    <td colspan="2" style="padding:0;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td width="50%" style="padding:0;">
            <a href="${confirmUrl}"
               style="display:block;padding:11px 8px;
                      background:#38a169;color:#fff;text-decoration:none;
                      font-size:14px;font-weight:700;text-align:center;">
              ✅ Livré
            </a>
          </td>
          <td width="50%" style="padding:0;border-left:2px solid #fff;">
            <a href="${skipUrl}"
               style="display:block;padding:11px 8px;
                      background:#e53e3e;color:#fff;text-decoration:none;
                      font-size:14px;font-weight:700;text-align:center;">
              ⏭️ Ignoré
            </a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
  }).join('');

  return `<div>${cards}</div>`;
}

// ============================================================
// APPELÉE DEPUIS LE MENU (formulaire sendRoutesForm)
// ============================================================

/**
 * Retourne les routes Confirmées pour le formulaire d'envoi.
 * Robuste aux types Google Sheets (Date objects, espaces, accents).
 * @returns {Object[]}
 */
function getConfirmedRoutesForSending() {
  Logger.log('[EMAIL] 🔍 getConfirmedRoutesForSending…');

  try {
    const allRoutes = getAllDataAsObjects(CONFIG.SHEETS.ROUTES);
    Logger.log(`[EMAIL] Total routes dans sheet: ${allRoutes.length}`);

    if (allRoutes.length > 0) {
      const sample = allRoutes[0];
      Logger.log(`[EMAIL] Exemple statut brut: [${sample.statut}] type=${typeof sample.statut}`);
      Logger.log(`[EMAIL] normalizeStatut: [${normalizeStatut(sample.statut)}]`);
      Logger.log(`[EMAIL] CONFIG.CONFIRMEE: [${CONFIG.ENUMS.STATUT_ROUTE.CONFIRMEE}]`);
    }

    const confirmed = allRoutes.filter(route =>
      normalizeStatut(route.statut) === CONFIG.ENUMS.STATUT_ROUTE.CONFIRMEE
    );

    Logger.log(`[EMAIL] Routes confirmées trouvées: ${confirmed.length}`);

    return confirmed.map(route => {
      const stops = getDeliveryStopsForRoute(route.id_route);

      let benevoleNom = String(route.id_benevole);
      try {
        const resp = getVolunteerById(route.id_benevole);
        const vol = extractData(resp, ['volunteer', 'benevole']);
        if (vol) benevoleNom = `${vol.prenom || ''} ${vol.nom || ''}`.trim();
      } catch (_) { }

      return {
        id_route: String(route.id_route),
        benevole_nom: benevoleNom,
        nombre_livraisons: stops.length,
        distance_km: route.distance_totale_km || 0,
        date_debut: formatDateForUi(route.date_debut)
      };
    });

  } catch (err) {
    Logger.log(`[EMAIL] ❌ getConfirmedRoutesForSending: ${err.message}`);
    throw err;
  }
}

// ============================================================
// UTILITAIRES
// ============================================================

/**
 * Normalise un statut : trim des espaces.
 * Gère les objets Date que Sheets retourne parfois pour des cellules mal typées.
 * @param {*} val
 * @returns {string}
 */
function normalizeStatut(val) {
  if (!val) return '';
  if (val instanceof Date) return '';
  return String(val).trim();
}

/**
 * Extrait la donnée utile d'une réponse API selon clés candidates.
 * @param {Object} response
 * @param {string[]} keys
 * @returns {Object|null}
 */
function extractData(response, keys) {
  if (!response) return null;
  for (const key of keys) {
    if (response[key]) return response[key];
  }
  return response;
}

/**
 * Formate une date en français long (pour l'email).
 * @param {Date|string} val
 * @returns {string}
 */
function formatDateFr(val) {
  if (!val) return '';
  try {
    const d = val instanceof Date ? val : new Date(val);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
  } catch (_) { return String(val); }
}

/**
 * Formate une date pour l'UI du formulaire (court).
 * @param {Date|string} val
 * @returns {string}
 */
function formatDateForUi(val) {
  if (!val) return '';
  try {
    const d = val instanceof Date ? val : new Date(val);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch (_) { return String(val); }
}

// ============================================================
// DEBUG — Exécuter depuis l'éditeur Apps Script pour diagnostiquer
// ============================================================

/**
 * Lance depuis l'éditeur Apps Script (Run > debugRoutesSheet)
 * pour voir exactement ce que Sheets retourne.
 */
function debugRoutesSheet() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(CONFIG.SHEETS.ROUTES);

  if (!sheet) {
    Logger.log('❌ Feuille "' + CONFIG.SHEETS.ROUTES + '" introuvable');
    return;
  }

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  Logger.log('HEADERS: ' + JSON.stringify(headers));

  if (sheet.getLastRow() < 2) {
    Logger.log('Aucune donnée (0 lignes)');
    return;
  }

  const firstRow = sheet.getRange(2, 1, 1, sheet.getLastColumn()).getValues()[0];
  Logger.log('ROW 1 RAW: ' + JSON.stringify(firstRow));

  const objects = getAllDataAsObjects(CONFIG.SHEETS.ROUTES);
  Logger.log(`getAllDataAsObjects → ${objects.length} objets`);

  if (objects.length > 0) {
    const r = objects[0];
    Logger.log('  .statut         = [' + r.statut + ']  type=' + typeof r.statut);
    Logger.log('  normalizeStatut = [' + normalizeStatut(r.statut) + ']');
    Logger.log('  CONFIG.CONFIRM  = [' + CONFIG.ENUMS.STATUT_ROUTE.CONFIRMEE + ']');
    Logger.log('  match?          = ' + (normalizeStatut(r.statut) === CONFIG.ENUMS.STATUT_ROUTE.CONFIRMEE));
  }

  const result = getConfirmedRoutesForSending();
  Logger.log(`getConfirmedRoutesForSending → ${result.length} routes`);
  if (result.length > 0) Logger.log('  Première: ' + JSON.stringify(result[0]));
}