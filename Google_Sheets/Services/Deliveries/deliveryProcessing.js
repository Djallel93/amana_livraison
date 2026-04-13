/**
 * ====================================================================
 * DELIVERY_PROCESSING.GS - Batch Geocoding
 * ====================================================================
 * Juste le géocodage batch - c'est tout!
 * ~150 lignes
 */

/**
 * Géocode plusieurs adresses via batch API
 * @param {Array<string>} addresses - Adresses
 * @returns {Object} Map {address: {latitude, longitude}}
 */
function batchGeocode(addresses) {
  const result = {};

  if (addresses.length === 0) return result;

  Logger.log(`[BATCH] 🗺️ Géocodage de ${addresses.length} adresses...`);

  try {
    // Appel batch API (max 100 adresses)
    const LIMIT = 100;

    for (let i = 0; i < addresses.length; i += LIMIT) {
      const batch = addresses.slice(i, i + LIMIT);

      const url = buildUrl(CONFIG.API_GEO.URL, {
        "X-Api-Key": CONFIG.API_GEO.KEY,
      });

      const payload = {
        action: "batchgeocode",
        adresses: batch.map((addr) => ({ adresse: addr })),
      };

      const options = {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify(payload),
      };

      const cacheKey = `batch_geocode_${batch.length}_${batch[0].substring(0, 20)}`;
      const response = callApiWithRetry(url, options, cacheKey, 300);

      // Parser réponse
      if (response && response.results) {
        response.results.forEach((item, index) => {
          const address = batch[index];
          // Structure: item.result.coordinates (not item.coordinates!)
          if (item.success && item.result && item.result.coordinates) {
            result[address] = {
              latitude: item.result.coordinates.latitude,
              longitude: item.result.coordinates.longitude,
            };
          }
        });
      }
    }

    Logger.log(
      `[BATCH] ✅ ${Object.keys(result).length}/${addresses.length} géocodées`,
    );
  } catch (error) {
    Logger.log(`[BATCH] ❌ Erreur: ${error.message}`);

    // Fallback: une par une
    Logger.log(`[BATCH] 🔄 Fallback séquentiel...`);
    for (const address of addresses) {
      try {
        const coords = geocodeAddress(address);
        if (coords && coords.coordinates) {
          result[address] = coords.coordinates;
        }
      } catch (e) {
        Logger.log(`[BATCH] ⚠️ ${address.substring(0, 30)}: ${e.message}`);
      }
    }
  }

  return result;
}

/**
 * Met à jour le statut d'une livraison
 * @param {string} deliveryId - ID livraison
 * @param {string} newStatus - Nouveau statut
 * @returns {boolean}
 */
function updateDeliveryStatus(deliveryId, newStatus) {
  const validStatuts = Object.values(CONFIG.ENUMS.STATUT_LIVRAISON);
  if (!validStatuts.includes(newStatus)) {
    Logger.log(`[DELIVERIES] ❌ Statut invalide: ${newStatus}`);
    return false;
  }

  const updated = updateRowById(
    CONFIG.SHEETS.LIVRAISON,
    deliveryId,
    CONFIG.COLUMNS.LIVRAISON.ID_LIVRAISON,
    {
      statut: newStatus,
      date_modification: getCurrentDateTime(),
    },
  );

  if (updated) {
    Logger.log(`[DELIVERIES] ✅ ${deliveryId} → ${newStatus}`);
  }

  return updated;
}

/**
 * Annule une livraison
 * @param {string} deliveryId - ID livraison
 * @param {string} reason - Raison
 * @returns {boolean}
 */
function cancelDelivery(deliveryId, reason = "") {
  const delivery = getDeliveryById(deliveryId);

  if (!delivery) {
    Logger.log(`[DELIVERIES] ❌ ${deliveryId} introuvable`);
    return false;
  }

  if (delivery.statut === CONFIG.ENUMS.STATUT_LIVRAISON.LIVREE) {
    Logger.log(`[DELIVERIES] ❌ Déjà livrée`);
    return false;
  }

  return updateRowById(
    CONFIG.SHEETS.LIVRAISON,
    deliveryId,
    CONFIG.COLUMNS.LIVRAISON.ID_LIVRAISON,
    {
      statut: CONFIG.ENUMS.STATUT_LIVRAISON.ANNULEE,
      besoins_speciaux:
        delivery.besoins_speciaux + (reason ? `\n[Annulée: ${reason}]` : ""),
      date_modification: getCurrentDateTime(),
    },
  );
}
