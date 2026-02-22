/**
 * ====================================================================
 * EMAIL_SERVICE.GS - Service d'Envoi des Emails aux Bénévoles
 * ====================================================================
 * v2.1 — Fix: getConfirmedRoutesForSending robuste aux types Sheets
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
 * @param {string} routeId
 * @returns {string}
 */
function generateOrGetToken(routeId) {
  const existing = filterData(CONFIG.SHEETS.TOKENS, row => String(row.id_route) === String(routeId));

  for (const row of existing) {
    const exp = parseDate(row.date_expiration);
    if (exp && !isTokenExpired(exp)) {
      Logger.log(`[EMAIL] 🔑 Token existant réutilisé pour ${routeId}`);
      return row.token;
    }
  }

  const token = generateSecureToken();
  const expiration = generateTokenExpiration(CONFIG.TOKENS.EXPIRATION_HOURS);
  const now = getCurrentDateTime();

  appendRow(CONFIG.SHEETS.TOKENS, [routeId, token, expiration, now]);
  Logger.log(`[EMAIL] 🔑 Nouveau token généré pour ${routeId}`);
  return token;
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
       style="background:#f0f4f8;padding:28px 0;">
  <tr><td align="center">
  <table width="620" cellpadding="0" cellspacing="0" border="0"
         style="max-width:620px;width:100%;">

    <!-- HEADER -->
    <tr><td style="background:linear-gradient(135deg,#4facfe 0%,#00f2fe 100%);
                   border-radius:16px 16px 0 0;padding:40px 40px 32px;text-align:center;">
      <div style="font-size:42px;margin-bottom:12px;">🚗</div>
      <h1 style="color:#fff;margin:0 0 8px;font-size:26px;font-weight:700;">
        Votre itinéraire de livraison
      </h1>
      <p style="color:rgba(255,255,255,.9);margin:0;font-size:15px;">
        Route <strong>${route.id_route}</strong>${dateFormatted ? ' &nbsp;·&nbsp; ' + dateFormatted : ''}
      </p>
    </td></tr>

    <!-- BODY -->
    <tr><td style="background:#fff;padding:40px;">

      <p style="color:#2d3748;font-size:16px;margin:0 0 28px;line-height:1.7;">
        Bonjour <strong>${benevolePrenom}</strong>,<br><br>
        Merci pour votre aide ! Voici votre itinéraire pour aujourd'hui.
        Vous avez <strong>${stops.length} livraison(s)</strong> à effectuer.
      </p>

      <!-- BOUTON DÉMARRER -->
      <div style="text-align:center;margin-bottom:36px;">
        <a href="${startUrl}"
           style="display:inline-block;padding:16px 44px;
                  background:linear-gradient(135deg,#4facfe 0%,#00f2fe 100%);
                  color:#fff;text-decoration:none;border-radius:50px;
                  font-size:16px;font-weight:700;
                  box-shadow:0 8px 24px rgba(79,172,254,.4);">
          ▶&nbsp; Je commence ma livraison
        </a>
      </div>

      <!-- LIEN MAPS -->
      ${route.lien_maps ? `
      <div style="background:#ebf8ff;border-left:4px solid #4facfe;
                  border-radius:8px;padding:16px 20px;margin-bottom:36px;">
        <p style="margin:0 0 6px;color:#2c5282;font-weight:700;font-size:14px;">
          🗺️ Itinéraire Google Maps
        </p>
        <a href="${route.lien_maps}"
           style="color:#3182ce;font-size:14px;word-break:break-all;">
          Ouvrir l'itinéraire complet →
        </a>
      </div>` : ''}

      <hr style="border:none;border-top:2px solid #e2e8f0;margin:0 0 28px;">

      <h2 style="color:#2d3748;font-size:18px;font-weight:700;margin:0 0 18px;">
        📦 Vos ${stops.length} livraison(s)
      </h2>

      ${buildStopsTable(stops, baseUrl)}

      <hr style="border:none;border-top:2px solid #e2e8f0;margin:32px 0 28px;">

      <!-- BOUTON TERMINER -->
      <div style="text-align:center;margin-bottom:10px;">
        <a href="${finishUrl}"
           style="display:inline-block;padding:16px 44px;
                  background:linear-gradient(135deg,#38a169 0%,#276749 100%);
                  color:#fff;text-decoration:none;border-radius:50px;
                  font-size:16px;font-weight:700;
                  box-shadow:0 8px 24px rgba(56,161,105,.4);">
          🏁&nbsp; J'ai fini ma livraison
        </a>
      </div>
      <p style="text-align:center;color:#a0aec0;font-size:12px;margin:0;">
        À utiliser quand toutes les livraisons sont traitées.
      </p>

    </td></tr>

    <!-- FOOTER -->
    <tr><td style="background:#2d3748;border-radius:0 0 16px 16px;
                   padding:24px 40px;text-align:center;">
      <p style="color:#a0aec0;font-size:13px;margin:0 0 8px;">
        Un problème ? Contactez l'administrateur
      </p>
      ${adminPhone
      ? `<a href="tel:${adminPhone.replace(/\s/g, '')}"
              style="color:#4facfe;font-size:20px;font-weight:700;text-decoration:none;">
             📞 ${adminPhone}
           </a>`
      : ''}
      <p style="color:#718096;font-size:11px;margin:14px 0 0;">
        ${CONFIG.EMAIL.FROM_NAME} &nbsp;·&nbsp; Lien valide ${CONFIG.TOKENS.EXPIRATION_HOURS}h
      </p>
    </td></tr>

  </table>
  </td></tr>
</table>
</body>
</html>`;
}

/**
 * Tableau HTML des livraisons dans l'email.
 */
function buildStopsTable(stops, baseUrl) {
  if (stops.length === 0) return '<p style="color:#718096;">Aucune livraison.</p>';

  const rows = stops.map((stop, idx) => {
    const confirmUrl = `${baseUrl}&action=confirm_delivery&id_livraison=${encodeURIComponent(stop.id_livraison)}`;
    const skipUrl = `${baseUrl}&action=skip_delivery&id_livraison=${encodeURIComponent(stop.id_livraison)}`;
    const mapsLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(stop.adresse)}`;

    const phones = [stop.telephone, stop.telephoneBis]
      .filter(p => p && String(p).trim())
      .map(p => `<a href="tel:${String(p).replace(/\s/g, '')}"
                    style="color:#3182ce;text-decoration:none;">${p}</a>`)
      .join(' &nbsp;|&nbsp; ');

    const rowBg = idx % 2 === 0 ? '#ffffff' : '#f7fafc';

    return `
<table width="100%" cellpadding="0" cellspacing="0" border="0"
       style="background:${rowBg};border-radius:10px;margin-bottom:10px;
              border:1px solid #e2e8f0;overflow:hidden;">
  <tr>
    <td width="44" style="background:linear-gradient(135deg,#4facfe,#00f2fe);
                          text-align:center;vertical-align:middle;padding:0 8px;">
      <span style="color:#fff;font-size:18px;font-weight:700;">${idx + 1}</span>
    </td>
    <td style="padding:14px 16px;vertical-align:top;">
      <p style="margin:0 0 4px;font-size:12px;color:#718096;">
        Famille <strong style="color:#2d3748;">${stop.id_famille}</strong>
        &nbsp;·&nbsp;
        <strong style="color:#2d3748;">${stop.nombre_personnes}</strong> pers.
      </p>
      <a href="${mapsLink}"
         style="color:#2d3748;font-size:14px;font-weight:600;
                text-decoration:none;display:block;margin-bottom:5px;">
        📍 ${stop.adresse}
      </a>
      ${phones ? `<p style="margin:0;font-size:13px;color:#4a5568;">📞 ${phones}</p>` : ''}
    </td>
    <td width="110" style="padding:12px 14px;vertical-align:middle;text-align:right;">
      <a href="${confirmUrl}"
         style="display:block;padding:8px 12px;margin-bottom:6px;
                background:#38a169;color:#fff;text-decoration:none;
                border-radius:8px;font-size:13px;font-weight:700;text-align:center;">
        ✅ Livré
      </a>
      <a href="${skipUrl}"
         style="display:block;padding:8px 12px;
                background:#e53e3e;color:#fff;text-decoration:none;
                border-radius:8px;font-size:13px;font-weight:700;text-align:center;">
        ⏭️ Ignoré
      </a>
    </td>
  </tr>
</table>`;
  }).join('');

  return `<div>${rows}</div>`;
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