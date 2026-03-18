/**
 * ====================================================================
 * ROUTE_API_HELPERS.GS - Constructeurs HTML et Utilitaires API
 * ====================================================================
 */

// ============================================================
// RÉPONSE JSON
// ============================================================

function jsonOk(data) {
    return ContentService
        .createTextOutput(JSON.stringify(data))
        .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// CONSTRUCTEURS DE PAGES HTML
// ============================================================

function htmlSuccess(titre, corpsHtml, emoji) {
    return _buildPage(titre, corpsHtml, emoji, {
        textColor: '#065f46',
        bgColor: '#d1fae5',
        accentColor: '#38a169',
        badgeColor: '#38a169',
        badgeLabel: 'Succès'
    });
}

function htmlInfo(titre, corpsHtml, emoji) {
    return _buildPage(titre, corpsHtml, emoji, {
        textColor: '#0c4a6e',
        bgColor: '#e0f2fe',
        accentColor: '#3182ce',
        badgeColor: '#3182ce',
        badgeLabel: 'Info'
    });
}

function htmlWarning(titre, corpsHtml, emoji) {
    return _buildPage(titre, corpsHtml, emoji, {
        textColor: '#92400e',
        bgColor: '#fef3c7',
        accentColor: '#d97706',
        badgeColor: '#d97706',
        badgeLabel: 'Attention'
    });
}

function htmlError(titre, corpsHtml) {
    return _buildPage(titre, corpsHtml, '⚠️', {
        textColor: '#7f1d1d',
        bgColor: '#fee2e2',
        accentColor: '#e53e3e',
        badgeColor: '#e53e3e',
        badgeLabel: 'Erreur'
    });
}

function _buildPage(titre, corpsHtml, emoji, couleurs) {
    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${titre}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', Arial, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 20px;
    }
    .card {
      background: white;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.25);
      padding: 40px 32px 32px;
      text-align: center;
      max-width: 420px;
      width: 100%;
    }
    .badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      background: ${couleurs.badgeColor};
      color: #fff;
      margin-bottom: 16px;
    }
    .emoji {
      font-size: 64px;
      margin-bottom: 16px;
      line-height: 1;
    }
    h1 {
      font-size: 20px;
      font-weight: 700;
      color: ${couleurs.textColor};
      margin-bottom: 14px;
    }
    .message {
      font-size: 14px;
      color: #4a5568;
      line-height: 1.7;
      padding: 14px 16px;
      background: ${couleurs.bgColor};
      border-radius: 8px;
      border-left: 4px solid ${couleurs.accentColor};
      text-align: left;
      margin-bottom: 20px;
    }
    .btn-close {
      display: inline-block;
      padding: 10px 28px;
      background: ${couleurs.accentColor};
      color: #fff;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      font-family: inherit;
      text-decoration: none;
      transition: opacity 0.15s;
    }
    .btn-close:hover { opacity: 0.85; }
    .timestamp {
      margin-top: 16px;
      font-size: 11px;
      color: #a0aec0;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">${couleurs.badgeLabel}</div>
    <div class="emoji">${emoji}</div>
    <h1>${titre}</h1>
    <div class="message">${corpsHtml}</div>
    <button class="btn-close" onclick="window.close()">Fermer</button>
    <div class="timestamp">${new Date().toLocaleString('fr-FR')}</div>
    </div>
</body>
</html>`;

    return HtmlService.createHtmlOutput(html);
}

// ============================================================
// HELPERS MÉTIER (dupliqués depuis metier.js pour clarté API)
// ============================================================

function normalizeStatut(val) {
    if (!val) return '';
    if (val instanceof Date) return '';
    return String(val).trim();
}

function extractData(response, keys) {
    if (!response) return null;
    for (const key of keys) {
        if (response[key]) return response[key];
    }
    return response;
}