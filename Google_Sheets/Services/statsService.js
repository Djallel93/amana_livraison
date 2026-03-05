/**
 * ====================================================================
 * STATS_SERVICE.GS - Calcul des statistiques journalières
 * ====================================================================
 */

/**
 * Point d'entrée principal appelé depuis le formulaire HTML.
 * @param {Object} params - { date, occasion, poids_moyen_kg, poids_moyen_hotel_kg }
 * @returns {Object} Données complètes pour l'affichage des statistiques
 */
function getStatsData(params) {
    Logger.log('[STATS] 🚀 Calcul des statistiques pour ' + params.date + ' / ' + params.occasion);

    const date = params.date;
    const occasion = params.occasion;
    const poidsDom = parseFloat(params.poids_moyen_kg) || 0;
    const poidsHot = parseFloat(params.poids_moyen_hotel_kg) || 0;

    const global = _statsGlobal(date, occasion);
    const statuts = _statsStatuts(date, occasion);
    const poids = _statsPoids(date, occasion, poidsDom, poidsHot);
    const routes = _statsRoutes(date, occasion);

    Logger.log('[STATS] ✅ Statistiques calculées');

    return {
        date: date,
        occasion: occasion,
        global: global,
        statuts: statuts,
        poids: poids,
        routes: routes
    };
}

/**
 * Calcule les chiffres globaux : livraisons, routes, parts.
 * @param {string} date
 * @param {string} occasion
 * @returns {Object}
 */
function _statsGlobal(date, occasion) {
    const livraisons = _getLivraisonsForDateOccasion(date, occasion);
    const routes = _getRoutesForDateOccasion(date, occasion);

    const totalParts = livraisons.reduce(function (sum, l) {
        return sum + (parseInt(l.nombre_personnes) || 0);
    }, 0);

    return {
        totalLivraisons: livraisons.length,
        totalRoutes: routes.length,
        totalParts: totalParts
    };
}

/**
 * Calcule la répartition des livraisons par statut.
 * @param {string} date
 * @param {string} occasion
 * @returns {Object}
 */
function _statsStatuts(date, occasion) {
    const livraisons = _getLivraisonsForDateOccasion(date, occasion);
    const counts = {};

    Object.values(CONFIG_ENUMS.STATUT_LIVRAISON).forEach(function (s) {
        counts[s] = 0;
    });

    livraisons.forEach(function (l) {
        if (counts[l.statut] !== undefined) counts[l.statut]++;
    });

    const total = livraisons.length;
    const termines = (counts[CONFIG_ENUMS.STATUT_LIVRAISON.LIVREE] || 0) +
        (counts[CONFIG_ENUMS.STATUT_LIVRAISON.ANNULEE] || 0);
    const pct = total > 0 ? Math.round((termines / total) * 100) : 0;

    return {
        counts: counts,
        total: total,
        pourcentageTermine: pct
    };
}

/**
 * Calcule les données de poids : donné, livré (routes), calculé.
 * @param {string} date
 * @param {string} occasion
 * @param {number} poidsDom  - Poids/personne domicile en kg
 * @param {number} poidsHot  - Poids/personne hôtel en kg
 * @returns {Object}
 */
function _statsPoids(date, occasion, poidsDom, poidsHot) {
    const poidsDonne = getTotalDonatedWeight(date, occasion);
    const nbDons = countDonations(date, occasion);

    const routes = _getRoutesForDateOccasion(date, occasion);
    const poidsLivre = routes.reduce(function (sum, r) {
        return sum + (parseFloat(r.poids_total_kg) || 0);
    }, 0);

    const livraisons = _getLivraisonsForDateOccasion(date, occasion);
    const poidsCalcule = livraisons.reduce(function (sum, l) {
        const parts = parseInt(l.nombre_personnes) || 0;
        const estHotel = l.hotel === true || l.hotel === 'TRUE' || l.hotel === 'true';
        return sum + parts * (estHotel ? poidsHot : poidsDom);
    }, 0);

    return {
        poidsDonne: Math.round(poidsDonne * 10) / 10,
        poidsLivre: Math.round(poidsLivre * 10) / 10,
        poidsCalcule: Math.round(poidsCalcule * 10) / 10,
        nbDons: nbDons
    };
}

/**
 * Retourne la liste des routes avec métriques clés.
 * @param {string} date
 * @param {string} occasion
 * @returns {Array<Object>}
 */
function _statsRoutes(date, occasion) {
    const routes = _getRoutesForDateOccasion(date, occasion);

    return routes.map(function (r) {
        const stops = getDeliveryStopsForRoute(r.id_route);
        return {
            id_route: r.id_route,
            statut: r.statut,
            distance_km: r.distance_totale_km || 0,
            poids_kg: r.poids_total_kg || 0,
            nb_livraisons: stops.length
        };
    });
}

/**
 * Filtre les livraisons par date et occasion.
 * @param {string} date
 * @param {string} occasion
 * @returns {Array<Object>}
 */
function _getLivraisonsForDateOccasion(date, occasion) {
    const cible = new Date(date);
    cible.setHours(0, 0, 0, 0);

    return filterData(CONFIG_SHEETS.SHEETS.LIVRAISON, function (row) {
        if (!row.disponibilite_debut) return false;
        const d = new Date(row.disponibilite_debut);
        d.setHours(0, 0, 0, 0);
        if (d.getTime() !== cible.getTime()) return false;

        // Filtrer par occasion via les routes associées si besoin
        return true;
    });
}

/**
 * Filtre les routes par date et occasion.
 * @param {string} date
 * @param {string} occasion
 * @returns {Array<Object>}
 */
function _getRoutesForDateOccasion(date, occasion) {
    const cible = new Date(date);
    cible.setHours(0, 0, 0, 0);

    return filterData(CONFIG_SHEETS.SHEETS.ROUTES, function (row) {
        if (row.occasion !== occasion) return false;
        if (!row.date_debut) return false;
        const d = new Date(row.date_debut);
        d.setHours(0, 0, 0, 0);
        return d.getTime() === cible.getTime();
    });
}

/**
 * Envoie l'email des statistiques aux destinataires configurés.
 * @param {Object} statsData - Données retournées par getStatsData()
 * @param {Object} params    - { date, occasion, poids_moyen_kg, poids_moyen_hotel_kg }
 * @returns {Object} { success, sent, error }
 */
function sendStatsEmail(statsData, params) {
    Logger.log('[STATS] 📧 Envoi email statistiques...');

    const destinataires = CONFIG_EMAIL.STATS_EMAILS;
    if (!destinataires) {
        return { success: false, error: 'Propriété STATS_EMAILS non configurée.' };
    }

    const emails = destinataires.split(',').map(function (e) { return e.trim(); }).filter(Boolean);
    if (emails.length === 0) {
        return { success: false, error: 'Aucun destinataire valide dans STATS_EMAILS.' };
    }

    const sujet = '📊 Statistiques livraisons — ' + statsData.date + ' (' + statsData.occasion + ')';
    const corps = _buildStatsEmailHtml(statsData, params);

    try {
        MailApp.sendEmail({
            to: emails.join(','),
            subject: sujet,
            htmlBody: corps,
            name: CONFIG_EMAIL.FROM_NAME
        });
        Logger.log('[STATS] ✅ Email envoyé à ' + emails.length + ' destinataire(s)');
        return { success: true, sent: emails.length };
    } catch (err) {
        Logger.log('[STATS] ❌ Erreur envoi email: ' + err.message);
        return { success: false, error: err.message };
    }
}

/**
 * Construit le corps HTML de l'email des statistiques.
 * @param {Object} statsData
 * @param {Object} params
 * @returns {string}
 */
function _buildStatsEmailHtml(statsData, params) {
    const s = statsData;
    const g = s.global;
    const p = s.poids;
    const st = s.statuts;

    const labelOccasion = {
        'zakat_el_fitr': '🌙 Zakat El Fitr',
        'recolte': '🌾 Récolte',
        'ponctuelle': '📦 Ponctuelle'
    }[s.occasion] || s.occasion;

    const statusRows = Object.entries(st.counts).map(function (entry) {
        return '<tr><td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;">' + entry[0] +
            '</td><td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;font-weight:700;">' +
            entry[1] + '</td></tr>';
    }).join('');

    return '<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"></head><body ' +
        'style="margin:0;padding:0;background:#f0f4f8;font-family:Arial,sans-serif;">' +
        '<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px;">' +
        '<table width="600" style="max-width:600px;width:100%;">' +

        '<tr><td style="background:linear-gradient(135deg,#4facfe,#00f2fe);border-radius:12px 12px 0 0;' +
        'padding:28px;text-align:center;">' +
        '<p style="color:#fff;font-size:22px;font-weight:700;margin:0;">📊 Statistiques Livraisons</p>' +
        '<p style="color:rgba(255,255,255,.85);font-size:13px;margin:6px 0 0;">' + s.date + ' · ' + labelOccasion + '</p>' +
        '</td></tr>' +

        '<tr><td style="background:#fff;padding:24px;">' +

        '<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">' +
        '<tr>' +
        '<td style="background:#f0f7ff;border-radius:8px;padding:16px;text-align:center;width:33%;">' +
        '<div style="font-size:28px;font-weight:700;color:#4facfe;">' + g.totalLivraisons + '</div>' +
        '<div style="font-size:12px;color:#718096;">Livraisons</div></td>' +
        '<td width="12"></td>' +
        '<td style="background:#f0f7ff;border-radius:8px;padding:16px;text-align:center;width:33%;">' +
        '<div style="font-size:28px;font-weight:700;color:#4facfe;">' + g.totalRoutes + '</div>' +
        '<div style="font-size:12px;color:#718096;">Routes</div></td>' +
        '<td width="12"></td>' +
        '<td style="background:#f0f7ff;border-radius:8px;padding:16px;text-align:center;width:33%;">' +
        '<div style="font-size:28px;font-weight:700;color:#4facfe;">' + g.totalParts + '</div>' +
        '<div style="font-size:12px;color:#718096;">Parts</div></td>' +
        '</tr></table>' +

        '<p style="font-size:14px;font-weight:700;color:#2d3748;margin:0 0 8px;">Progression</p>' +
        '<div style="background:#e2e8f0;border-radius:20px;height:16px;overflow:hidden;margin-bottom:16px;">' +
        '<div style="background:linear-gradient(135deg,#4facfe,#00f2fe);height:100%;width:' + st.pourcentageTermine + '%;border-radius:20px;"></div>' +
        '</div>' +
        '<p style="text-align:center;font-size:13px;color:#718096;margin:0 0 20px;">' + st.pourcentageTermine + '% complété</p>' +

        '<p style="font-size:14px;font-weight:700;color:#2d3748;margin:0 0 8px;">Statuts</p>' +
        '<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;margin-bottom:20px;">' +
        statusRows + '</table>' +

        '<p style="font-size:14px;font-weight:700;color:#2d3748;margin:0 0 8px;">Poids</p>' +
        '<table width="100%" cellpadding="0" cellspacing="0">' +
        '<tr><td style="padding:8px 12px;background:#f0f7ff;border-radius:8px 8px 0 0;font-size:13px;">⚖️ Poids donné (' + p.nbDons + ' don(s))</td>' +
        '<td style="padding:8px 12px;background:#f0f7ff;border-radius:8px 8px 0 0;font-weight:700;text-align:right;">' + p.poidsDonne + ' kg</td></tr>' +
        '<tr><td style="padding:8px 12px;font-size:13px;">🚗 Poids livré (routes)</td>' +
        '<td style="padding:8px 12px;font-weight:700;text-align:right;">' + p.poidsLivre + ' kg</td></tr>' +
        '<tr><td style="padding:8px 12px;background:#f0f7ff;border-radius:0 0 8px 8px;font-size:13px;">🧮 Poids calculé (parts × poids)</td>' +
        '<td style="padding:8px 12px;background:#f0f7ff;border-radius:0 0 8px 8px;font-weight:700;text-align:right;">' + p.poidsCalcule + ' kg</td></tr>' +
        '</table>' +

        '</td></tr>' +

        '<tr><td style="background:#2d3748;border-radius:0 0 12px 12px;padding:16px;text-align:center;">' +
        '<p style="color:#a0aec0;font-size:12px;margin:0;">Association AMANA · Généré automatiquement</p>' +
        '</td></tr>' +

        '</table></td></tr></table></body></html>';
}

function sendScheduledStatsEmail() {
    const date = '2026-03-18';
    const occasion = 'zakat_el_fitr';
    const poidsDom = 20;
    const poidsHot = 15;

    const params = { date, occasion, poids_moyen_kg: poidsDom, poids_moyen_hotel_kg: poidsHot };
    const stats = getStatsData(params);

    if (stats.global.totalLivraisons === 0) {
        Logger.log('[STATS PLANIFIÉ] ⏭️ Aucune livraison trouvée, email non envoyé');
        return;
    }

    sendStatsEmail(stats, params);
}