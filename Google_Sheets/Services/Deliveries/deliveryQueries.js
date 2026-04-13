/**
 * ====================================================================
 * DELIVERY_QUERIES.GS - Requêtes et Statistiques des Livraisons
 * ====================================================================
 */

function getDeliveryById(deliveryId) {
  return getRowById(
    CONFIG.SHEETS.LIVRAISON,
    deliveryId,
    CONFIG.COLUMNS.LIVRAISON.ID_LIVRAISON,
  );
}

function getDeliveriesByStatus(status) {
  return filterData(CONFIG.SHEETS.LIVRAISON, function (row) {
    return row.statut === status;
  });
}

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

function countDeliveriesByStatus() {
  const counts = {};

  Object.values(CONFIG.ENUMS.STATUT_LIVRAISON).forEach((status) => {
    counts[status] = 0;
  });

  const allDeliveries = getAllDataAsObjects(CONFIG.SHEETS.LIVRAISON);
  allDeliveries.forEach((delivery) => {
    const status = delivery.statut;
    if (counts[status] !== undefined) {
      counts[status]++;
    }
  });

  return counts;
}

function getDeliveryStatistics() {
  const allDeliveries = getAllDataAsObjects(CONFIG.SHEETS.LIVRAISON);

  const stats = {
    total: allDeliveries.length,
    byStatus: countDeliveriesByStatus(),
    byPriority: {},
    byTypeAide: {},
    totalPersonnes: 0,
    averageDistance: 0,
  };

  let totalDistance = 0;
  let countWithDistance = 0;

  allDeliveries.forEach((delivery) => {
    const priority = delivery.priorite || 5;
    stats.byPriority[priority] = (stats.byPriority[priority] || 0) + 1;

    const type = delivery.type_aide || "inconnu";
    stats.byTypeAide[type] = (stats.byTypeAide[type] || 0) + 1;

    stats.totalPersonnes += parseInt(delivery.nombre_personnes) || 0;

    if (delivery.latitude && delivery.longitude) {
      try {
        const distResult = calculateDistance(
          CONFIG.HQ.LAT,
          CONFIG.HQ.LNG,
          delivery.latitude,
          delivery.longitude,
        );
        if (distResult && distResult.distance) {
          totalDistance += distResult.distance;
          countWithDistance++;
        }
      } catch (e) {
        // distance non calculable, ignorée
      }
    }
  });

  if (countWithDistance > 0) {
    stats.averageDistance =
      Math.round((totalDistance / countWithDistance) * 100) / 100;
  }

  return stats;
}

function exportDeliveriesToCsv(deliveryIds = null) {
  let deliveries;

  if (deliveryIds && deliveryIds.length > 0) {
    deliveries = deliveryIds
      .map((id) => getDeliveryById(id))
      .filter((d) => d !== null);
  } else {
    deliveries = getAllDataAsObjects(CONFIG.SHEETS.LIVRAISON);
  }

  const headers = [
    "ID Livraison",
    "ID Famille",
    "Quartier",
    "Adresse",
    "Latitude",
    "Longitude",
    "Disponibilité Début",
    "Disponibilité Fin",
    "Nombre Personnes",
    "Statut",
    "Priorité",
    "Type Aide",
    "Besoins Spéciaux",
    "Date Création",
  ];

  let csv = headers.join(",") + "\n";

  deliveries.forEach((d) => {
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
      `"${d.besoins_speciaux || ""}"`,
      d.date_creation,
    ];
    csv += row.join(",") + "\n";
  });

  return csv;
}

function searchDeliveries(criteria) {
  return filterData(CONFIG.SHEETS.LIVRAISON, function (row) {
    if (criteria.statut && row.statut !== criteria.statut) return false;
    if (criteria.priorite && row.priorite !== criteria.priorite) return false;
    if (criteria.type_aide && row.type_aide !== criteria.type_aide)
      return false;
    if (criteria.quartier && row.id_quartier !== criteria.quartier)
      return false;
    if (criteria.famille && row.id_famille !== criteria.famille) return false;
    return true;
  });
}

function countDeliveriesByQuartier() {
  const counts = {};
  const deliveries = getAllDataAsObjects(CONFIG.SHEETS.LIVRAISON);

  deliveries.forEach((d) => {
    const quartier = d.id_quartier;
    counts[quartier] = (counts[quartier] || 0) + 1;
  });

  return counts;
}

/**
 * Retourne les livraisons non assignées pour une date,
 * en excluant celles avec des besoins spéciaux (traitement manuel uniquement).
 */
function getUnassignedDeliveriesForDate(date) {
  const deliveries = getDeliveriesForDate(new Date(date));

  return deliveries.filter((d) => {
    if (d.statut !== CONFIG.ENUMS.STATUT_LIVRAISON.NON_ASSIGNEE) return false;
    if (d.besoins_speciaux && d.besoins_speciaux.trim() !== "") {
      Logger.log(
        `[LIVRAISONS] ⏭️ Livraison ${d.id_livraison} exclue du planning — besoins spéciaux`,
      );
      return false;
    }
    return true;
  });
}

function canAssignDelivery(deliveryId) {
  const delivery = getDeliveryById(deliveryId);

  if (!delivery) {
    return { canAssign: false, reason: "Livraison introuvable" };
  }

  if (delivery.statut !== CONFIG.ENUMS.STATUT_LIVRAISON.NON_ASSIGNEE) {
    return { canAssign: false, reason: `Statut actuel: ${delivery.statut}` };
  }

  if (delivery.besoins_speciaux && delivery.besoins_speciaux.trim() !== "") {
    return {
      canAssign: false,
      reason: "Besoins spéciaux — assignation manuelle requise",
    };
  }

  return { canAssign: true };
}

function getDeliveriesSummary() {
  const stats = getDeliveryStatistics();

  return {
    total: stats.total,
    nonAssignees:
      stats.byStatus[CONFIG.ENUMS.STATUT_LIVRAISON.NON_ASSIGNEE] || 0,
    assignees: stats.byStatus[CONFIG.ENUMS.STATUT_LIVRAISON.ASSIGNEE] || 0,
    enCours: stats.byStatus[CONFIG.ENUMS.STATUT_LIVRAISON.EN_COURS] || 0,
    livrees: stats.byStatus[CONFIG.ENUMS.STATUT_LIVRAISON.LIVREE] || 0,
    totalPersonnes: stats.totalPersonnes,
    averageDistance: stats.averageDistance,
  };
}

function isHqReturnDeliveryId(deliveryId) {
  return deliveryId === null || deliveryId === "" || deliveryId === undefined;
}

function getRouteEtapesStatistics(routeId) {
  const allEtapes = filterData(
    CONFIG.SHEETS.ETAPES_ROUTE,
    (row) => row.id_route === routeId,
  );

  const stats = {
    total: allEtapes.length,
    deliveries: 0,
    hqReturns: 0,
    byStatus: {},
  };

  allEtapes.forEach((etape) => {
    if (isHqReturnDeliveryId(etape.id_livraison)) {
      stats.hqReturns++;
    } else {
      stats.deliveries++;
    }

    const status = etape.statut;
    stats.byStatus[status] = (stats.byStatus[status] || 0) + 1;
  });

  return stats;
}

function getAllEtapesForRoute(routeId, includeHq = true) {
  const allEtapes = filterData(
    CONFIG.SHEETS.ETAPES_ROUTE,
    (row) => row.id_route === routeId,
  );

  if (includeHq) return allEtapes;

  return allEtapes.filter((etape) => !isHqReturnDeliveryId(etape.id_livraison));
}
