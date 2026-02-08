/**
 * ====================================================================
 * DELIVERY_QUERIES.GS - Requêtes et Statistiques des Livraisons
 * ====================================================================
 * Opérations de lecture et statistiques
 * Fichier 3/3 - ~200 lignes
 */

/**
 * Récupère une livraison par ID
 * @param {string} deliveryId - ID de la livraison
 * @returns {Object|null}
 */
function getDeliveryById(deliveryId) {
    return getRowById(
        CONFIG.SHEETS.LIVRAISON,
        deliveryId,
        CONFIG.COLUMNS.LIVRAISON.ID_LIVRAISON
    );
}

/**
 * Récupère toutes les livraisons avec un statut donné
 * @param {string} status - Statut recherché
 * @returns {Array<Object>}
 */
function getDeliveriesByStatus(status) {
    return filterData(CONFIG.SHEETS.LIVRAISON, function (row) {
        return row.statut === status;
    });
}

/**
 * Récupère les livraisons d'une route
 * @param {string} routeId - ID de la route
 * @returns {Array<Object>}
 */
function getDeliveriesForRoute(routeId) {
    const etapes = filterData(CONFIG.SHEETS.ETAPES_ROUTE, function (row) {
        return row.id_route === routeId;
    });

    const deliveries = [];
    for (const etape of etapes) {
        const delivery = getDeliveryById(etape.id_livraison);
        if (delivery) {
            delivery._ordre_passage = etape.ordre_passage;
            deliveries.push(delivery);
        }
    }

    deliveries.sort((a, b) => a._ordre_passage - b._ordre_passage);

    return deliveries;
}

/**
 * Récupère les livraisons pour une date donnée
 * @param {Date} date - Date de livraison
 * @returns {Array<Object>}
 */
function getDeliveriesForDate(date) {
    const startOfDayDate = startOfDay(date);
    const endOfDayDate = endOfDay(date);

    return filterData(CONFIG.SHEETS.LIVRAISON, function (row) {
        if (!row.disponibilite_debut) return false;

        const debutDate = parseDate(row.disponibilite_debut);
        if (!debutDate) return false;

        return debutDate >= startOfDayDate && debutDate <= endOfDayDate;
    });
}

/**
 * Compte le nombre de livraisons par statut
 * @returns {Object} {Non Assignée: X, Assignée: Y, ...}
 */
function countDeliveriesByStatus() {
    const counts = {};

    Object.values(CONFIG.ENUMS.STATUT_LIVRAISON).forEach(status => {
        counts[status] = 0;
    });

    const allDeliveries = getAllDataAsObjects(CONFIG.SHEETS.LIVRAISON);
    allDeliveries.forEach(delivery => {
        const status = delivery.statut;
        if (counts[status] !== undefined) {
            counts[status]++;
        }
    });

    return counts;
}

/**
 * Obtient les statistiques des livraisons
 * @returns {Object} Statistiques complètes
 */
function getDeliveryStatistics() {
    const allDeliveries = getAllDataAsObjects(CONFIG.SHEETS.LIVRAISON);

    const stats = {
        total: allDeliveries.length,
        byStatus: countDeliveriesByStatus(),
        byPriority: {},
        byTypeAide: {},
        totalPersonnes: 0,
        averageDistance: 0
    };

    let totalDistance = 0;
    let countWithDistance = 0;

    allDeliveries.forEach(delivery => {
        // Par priorité
        const priority = delivery.priorite || 5;
        stats.byPriority[priority] = (stats.byPriority[priority] || 0) + 1;

        // Par type d'aide
        const type = delivery.type_aide || 'inconnu';
        stats.byTypeAide[type] = (stats.byTypeAide[type] || 0) + 1;

        // Total personnes
        stats.totalPersonnes += parseInt(delivery.nombre_personnes) || 0;

        // Distance moyenne (si calculable)
        if (delivery.latitude && delivery.longitude) {
            try {
                const distResult = calculateDistance(
                    CONFIG.HQ.LAT,
                    CONFIG.HQ.LNG,
                    delivery.latitude,
                    delivery.longitude
                );
                if (distResult && distResult.distance) {
                    totalDistance += distResult.distance;
                    countWithDistance++;
                }
            } catch (e) {
                // Ignorer les erreurs de calcul de distance
            }
        }
    });

    if (countWithDistance > 0) {
        stats.averageDistance = Math.round(totalDistance / countWithDistance * 100) / 100;
    }

    return stats;
}

/**
 * Exporte les livraisons en CSV
 * @param {Array<string>} deliveryIds - IDs des livraisons (optionnel, toutes si vide)
 * @returns {string} Contenu CSV
 */
function exportDeliveriesToCsv(deliveryIds = null) {
    let deliveries;

    if (deliveryIds && deliveryIds.length > 0) {
        deliveries = deliveryIds.map(id => getDeliveryById(id)).filter(d => d !== null);
    } else {
        deliveries = getAllDataAsObjects(CONFIG.SHEETS.LIVRAISON);
    }

    // En-têtes CSV
    const headers = [
        'ID Livraison', 'ID Famille', 'Quartier', 'Adresse',
        'Latitude', 'Longitude', 'Disponibilité Début', 'Disponibilité Fin',
        'Nombre Personnes', 'Statut', 'Priorité', 'Type Aide',
        'Besoins Spéciaux', 'Date Création'
    ];

    let csv = headers.join(',') + '\n';

    deliveries.forEach(d => {
        const row = [
            d.id_livraison,
            d.id_famille,
            d.id_quartier,
            `"${d.adresse}"`,
            d.latitude,
            d.longitude,
            d.disponibilite_debut,
            d.disponibilite_fin,
            d.nombre_personnes,
            d.statut,
            d.priorite,
            d.type_aide,
            `"${d.besoins_speciaux || ''}"`,
            d.date_creation
        ];
        csv += row.join(',') + '\n';
    });

    return csv;
}

/**
 * Recherche des livraisons par critères multiples
 * @param {Object} criteria - {statut?, priorite?, type_aide?, quartier?, famille?}
 * @returns {Array<Object>}
 */
function searchDeliveries(criteria) {
    return filterData(CONFIG.SHEETS.LIVRAISON, function (row) {
        if (criteria.statut && row.statut !== criteria.statut) return false;
        if (criteria.priorite && row.priorite !== criteria.priorite) return false;
        if (criteria.type_aide && row.type_aide !== criteria.type_aide) return false;
        if (criteria.quartier && row.id_quartier !== criteria.quartier) return false;
        if (criteria.famille && row.id_famille !== criteria.famille) return false;

        return true;
    });
}

/**
 * Compte les livraisons par quartier
 * @returns {Object} {quartierId: count}
 */
function countDeliveriesByQuartier() {
    const counts = {};
    const deliveries = getAllDataAsObjects(CONFIG.SHEETS.LIVRAISON);

    deliveries.forEach(d => {
        const quartier = d.id_quartier;
        counts[quartier] = (counts[quartier] || 0) + 1;
    });

    return counts;
}

/**
 * Obtient les livraisons non assignées pour une date
 * @param {string} date - Date au format YYYY-MM-DD
 * @returns {Array<Object>}
 */
function getUnassignedDeliveriesForDate(date) {
    const deliveries = getDeliveriesForDate(new Date(date));

    return deliveries.filter(d =>
        d.statut === CONFIG.ENUMS.STATUT_LIVRAISON.NON_ASSIGNEE
    );
}

/**
 * Vérifie si une livraison peut être assignée à une route
 * @param {string} deliveryId - ID de la livraison
 * @returns {Object} {canAssign: boolean, reason?: string}
 */
function canAssignDelivery(deliveryId) {
    const delivery = getDeliveryById(deliveryId);

    if (!delivery) {
        return { canAssign: false, reason: 'Livraison introuvable' };
    }

    if (delivery.statut !== CONFIG.ENUMS.STATUT_LIVRAISON.NON_ASSIGNEE) {
        return { canAssign: false, reason: `Statut actuel: ${delivery.statut}` };
    }

    return { canAssign: true };
}

/**
 * Obtient un résumé des livraisons pour le dashboard
 * @returns {Object} Résumé pour affichage
 */
function getDeliveriesSummary() {
    const stats = getDeliveryStatistics();

    return {
        total: stats.total,
        nonAssignees: stats.byStatus[CONFIG.ENUMS.STATUT_LIVRAISON.NON_ASSIGNEE] || 0,
        assignees: stats.byStatus[CONFIG.ENUMS.STATUT_LIVRAISON.ASSIGNEE] || 0,
        enCours: stats.byStatus[CONFIG.ENUMS.STATUT_LIVRAISON.EN_COURS] || 0,
        livrees: stats.byStatus[CONFIG.ENUMS.STATUT_LIVRAISON.LIVREE] || 0,
        totalPersonnes: stats.totalPersonnes,
        averageDistance: stats.averageDistance
    };
}