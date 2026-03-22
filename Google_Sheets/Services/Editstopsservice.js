// ============================================================
// SUPPRESSION D'UN STOP
// ============================================================

function removeStop(params) {
    Logger.log(`[EDIT STOPS] 🗑️ Suppression stop — étape: ${params.id_etape}, livraison: ${params.id_livraison}, route: ${params.id_route}`);

    const route = getRouteById(params.id_route);
    if (!route) throw new Error(`Route ${params.id_route} introuvable`);

    const etaitPrete = normalizeStatut(route.statut) === CONFIG.ENUMS.STATUT_ROUTE.PRETE;

    deleteRowById(CONFIG.SHEETS.ETAPES_ROUTE, params.id_etape, CONFIG.COLUMNS.ETAPES_ROUTE.ID_ETAPE);
    Logger.log(`[EDIT STOPS] ✅ Étape ${params.id_etape} supprimée`);

    updateDeliveryStatus(params.id_livraison, CONFIG.ENUMS.STATUT_LIVRAISON.NON_ASSIGNEE);
    Logger.log(`[EDIT STOPS] ✅ Livraison ${params.id_livraison} → Non Assignée`);

    const stopsRestants = getDeliveryStopsForRoute(params.id_route);

    if (stopsRestants.length === 0) {
        Logger.log(`[EDIT STOPS] ℹ️ Plus aucun stop — pas de TSP ni régénération`);
        updateRowById(CONFIG.SHEETS.ROUTES, params.id_route, CONFIG.COLUMNS.ROUTES.ID_ROUTE, {
            poids_total_kg: 0,
            distance_totale_km: 0,
            lien_maps: '',
            date_modification: getCurrentDateTime()
        });
        return {
            success: true,
            id_route: params.id_route,
            nb_stops_restants: 0,
            lien_maps: '',
            email_envoye: false
        };
    }

    const livraisons = stopsRestants.map(s => getDeliveryById(s.id_livraison)).filter(Boolean);

    const hqConfig = getCurrentHqConfig();
    const hqCoords = (hqConfig && hqConfig.lat && hqConfig.lng)
        ? { lat: hqConfig.lat, lng: hqConfig.lng }
        : null;

    let livraisonsOptimisees = livraisons;
    if (hqCoords && livraisons.length > 1) {
        livraisonsOptimisees = optimizeDeliveryOrder(livraisons, hqCoords);
    }

    _reconstruireEtapes(params.id_route, livraisonsOptimisees);

    const poidsParPart = parseFloat(route.poids_par_part) || 0;
    const poidsParPartHotel = parseFloat(route.poids_par_part_hotel) || poidsParPart;
    const poidsTotal = _calculerPoidsStops(livraisonsOptimisees, poidsParPart, poidsParPartHotel);
    const distanceTotale = hqCoords ? calculerDistanceTotaleRoute(livraisonsOptimisees, hqCoords) : 0;
    const lienMaps = hqCoords ? generateGoogleMapsLink(livraisonsOptimisees, hqCoords) : '';

    updateRowById(CONFIG.SHEETS.ROUTES, params.id_route, CONFIG.COLUMNS.ROUTES.ID_ROUTE, {
        poids_total_kg: Math.round(poidsTotal * 100) / 100,
        distance_totale_km: Math.round(distanceTotale * 100) / 100,
        lien_maps: lienMaps,
        date_modification: getCurrentDateTime()
    });

    _regenererFeuille(params.id_route);

    let emailEnvoye = false;
    if (etaitPrete) {
        emailEnvoye = _envoyerEmailSiConfigured(params.id_route);
    }

    Logger.log(`[EDIT STOPS] ✅ Stop supprimé — ${livraisonsOptimisees.length} stop(s) restant(s)`);

    return {
        success: true,
        id_route: params.id_route,
        nb_stops_restants: livraisonsOptimisees.length,
        poids_total_kg: Math.round(poidsTotal * 100) / 100,
        distance_totale_km: Math.round(distanceTotale * 100) / 100,
        lien_maps: lienMaps,
        email_envoye: emailEnvoye
    };
}

// ============================================================
// AJOUT D'UN STOP
// ============================================================

function addStop(params) {
    Logger.log(`[EDIT STOPS] ➕ Ajout livraison ${params.id_livraison} à route ${params.id_route}`);

    const route = getRouteById(params.id_route);
    if (!route) throw new Error(`Route ${params.id_route} introuvable`);

    const livraison = getDeliveryById(params.id_livraison);
    if (!livraison) throw new Error(`Livraison ${params.id_livraison} introuvable`);

    if (livraison.statut !== CONFIG.ENUMS.STATUT_LIVRAISON.NON_ASSIGNEE) {
        throw new Error(`Livraison ${params.id_livraison} n'est plus disponible (statut: ${livraison.statut})`);
    }

    const statutOriginal = normalizeStatut(route.statut);
    const etaitPrete = statutOriginal === CONFIG.ENUMS.STATUT_ROUTE.PRETE;

    const stopsExistants = getDeliveryStopsForRoute(params.id_route);
    const livraisonsExistantes = stopsExistants.map(s => getDeliveryById(s.id_livraison)).filter(Boolean);

    const toutesLivraisons = [...livraisonsExistantes, livraison];

    const hqConfig = getCurrentHqConfig();
    const hqCoords = (hqConfig && hqConfig.lat && hqConfig.lng)
        ? { lat: hqConfig.lat, lng: hqConfig.lng }
        : null;

    let livraisonsOptimisees = toutesLivraisons;
    if (hqCoords && toutesLivraisons.length > 1) {
        livraisonsOptimisees = optimizeDeliveryOrder(toutesLivraisons, hqCoords);
    }

    _reconstruireEtapes(params.id_route, livraisonsOptimisees);

    updateDeliveryStatus(params.id_livraison, CONFIG.ENUMS.STATUT_LIVRAISON.ASSIGNEE);
    Logger.log(`[EDIT STOPS] ✅ Livraison ${params.id_livraison} → Assignée`);

    const poidsParPart = parseFloat(route.poids_par_part) || 0;
    const poidsParPartHotel = parseFloat(route.poids_par_part_hotel) || poidsParPart;
    const poidsTotal = _calculerPoidsStops(livraisonsOptimisees, poidsParPart, poidsParPartHotel);
    const distanceTotale = hqCoords ? calculerDistanceTotaleRoute(livraisonsOptimisees, hqCoords) : 0;
    const lienMaps = hqCoords ? generateGoogleMapsLink(livraisonsOptimisees, hqCoords) : '';

    const conditionnementPret = livraison.statut_conditionnement === CONFIG.ENUMS.STATUT_CONDITIONNEMENT.PRETE;
    let nouveauStatut = statutOriginal;
    let emailEnvoye = false;

    if (!conditionnementPret) {
        nouveauStatut = CONFIG.ENUMS.STATUT_ROUTE.BROUILLON;
        Logger.log(`[EDIT STOPS] ⚠️ Colis non prêt — route rétrogradée à Brouillon`);
    } else if (etaitPrete) {
        emailEnvoye = _envoyerEmailSiConfigured(params.id_route);
    }

    updateRowById(CONFIG.SHEETS.ROUTES, params.id_route, CONFIG.COLUMNS.ROUTES.ID_ROUTE, {
        statut: nouveauStatut,
        poids_total_kg: Math.round(poidsTotal * 100) / 100,
        distance_totale_km: Math.round(distanceTotale * 100) / 100,
        lien_maps: lienMaps,
        date_modification: getCurrentDateTime()
    });

    _regenererFeuille(params.id_route);

    Logger.log(`[EDIT STOPS] ✅ Stop ajouté — ${livraisonsOptimisees.length} stop(s) au total, statut route: ${nouveauStatut}`);

    return {
        success: true,
        id_route: params.id_route,
        nb_stops_total: livraisonsOptimisees.length,
        poids_total_kg: Math.round(poidsTotal * 100) / 100,
        distance_totale_km: Math.round(distanceTotale * 100) / 100,
        lien_maps: lienMaps,
        nouveau_statut: nouveauStatut,
        conditionnement_pret: conditionnementPret,
        email_envoye: emailEnvoye
    };
}

// ============================================================
// LIVRAISONS DISPONIBLES POUR AJOUT
// ============================================================

function getNearbyAvailableDeliveries(routeId) {
    Logger.log(`[EDIT STOPS] 🔍 Recherche livraisons disponibles pour route ${routeId}`);

    const route = getRouteById(routeId);
    if (!route) throw new Error(`Route ${routeId} introuvable`);

    const stops = getDeliveryStopsForRoute(routeId);
    const livraisons = stops.map(s => getDeliveryById(s.id_livraison)).filter(Boolean);

    const dateRoute = route.date_debut instanceof Date ? route.date_debut : new Date(route.date_debut);
    const toutesDisponibles = getDeliveriesForDate(dateRoute).filter(l => {
        if (l.statut !== CONFIG.ENUMS.STATUT_LIVRAISON.NON_ASSIGNEE) return false;
        if (l.besoins_speciaux && l.besoins_speciaux.trim() !== '') return false;
        return true;
    });

    if (toutesDisponibles.length === 0) {
        Logger.log(`[EDIT STOPS] ℹ️ Aucune livraison disponible pour cette date`);
        return { nearby: [], fallback: [], has_nearby: false };
    }

    const DISTANCE_PROXIMITE = CONFIG.ROUTE_OPTIMIZATION.DISTANCE_PROXIMITE_KM;

    let centroide = null;
    if (livraisons.length > 0) {
        centroide = calculerCentre(livraisons);
    }

    const nearby = [];
    const fallback = [];

    for (const liv of toutesDisponibles) {
        const item = {
            id_livraison: liv.id_livraison,
            id_famille: liv.id_famille,
            id_quartier: liv.id_quartier,
            adresse: liv.adresse,
            nombre_personnes: liv.nombre_personnes,
            priorite: liv.priorite,
            statut_conditionnement: liv.statut_conditionnement || '',
            hotel: liv.hotel === true || liv.hotel === 'TRUE' || liv.hotel === 'true',
            distance_km: null
        };

        if (centroide) {
            const dist = calculerDistanceHaversine(centroide.lat, centroide.lng, liv.latitude, liv.longitude);
            item.distance_km = Math.round(dist * 10) / 10;
            if (dist <= DISTANCE_PROXIMITE) {
                nearby.push(item);
            } else {
                fallback.push(item);
            }
        } else {
            fallback.push(item);
        }
    }

    nearby.sort((a, b) => (a.distance_km || 0) - (b.distance_km || 0));
    fallback.sort((a, b) => (a.distance_km || 0) - (b.distance_km || 0));

    Logger.log(`[EDIT STOPS] ✅ ${nearby.length} proches, ${fallback.length} autres disponibles`);

    return { nearby, fallback, has_nearby: nearby.length > 0 };
}

// ============================================================
// HELPERS INTERNES
// ============================================================

function _reconstruireEtapes(routeId, livraisonsOptimisees) {
    const etapesExistantes = filterData(CONFIG.SHEETS.ETAPES_ROUTE, row => row.id_route === routeId);
    for (const etape of etapesExistantes) {
        deleteRowById(CONFIG.SHEETS.ETAPES_ROUTE, etape.id_etape, CONFIG.COLUMNS.ETAPES_ROUTE.ID_ETAPE);
    }
    Logger.log(`[EDIT STOPS] 🗑️ ${etapesExistantes.length} étape(s) supprimée(s) pour reconstruction`);
    createOptimizedEtapes(routeId, livraisonsOptimisees);
    Logger.log(`[EDIT STOPS] ✅ ${livraisonsOptimisees.length} étape(s) reconstruite(s) pour route ${routeId}`);
}

function _calculerPoidsStops(livraisons, poidsParPart, poidsParPartHotel) {
    return livraisons.reduce((sum, l) => {
        const parts = parseInt(l.nombre_personnes) || 0;
        const estHotel = l.hotel === true || l.hotel === 'TRUE' || l.hotel === 'true';
        return sum + parts * (estHotel ? poidsParPartHotel : poidsParPart);
    }, 0);
}

function _regenererFeuille(routeId) {
    try {
        const adminPhone = PropertiesService.getScriptProperties().getProperty('ADMIN_PHONE') || '';
        generateRouteDoc(routeId, adminPhone);
        Logger.log(`[EDIT STOPS] 📄 Feuille imprimable régénérée pour route ${routeId}`);
    } catch (err) {
        Logger.log(`[EDIT STOPS] ⚠️ Feuille non régénérée pour route ${routeId} : ${err.message}`);
    }
}

function _envoyerEmailSiConfigured(routeId) {
    const apiWebUrl = PropertiesService.getScriptProperties().getProperty('API_LIVRAISON_URL') || '';
    const adminPhone = PropertiesService.getScriptProperties().getProperty('ADMIN_PHONE') || '';
    if (!apiWebUrl) {
        Logger.log(`[EDIT STOPS] ⚠️ API_LIVRAISON_URL non configurée — email non envoyé`);
        return false;
    }
    try {
        sendRouteEmail(routeId, apiWebUrl, adminPhone);
        Logger.log(`[EDIT STOPS] 📧 Email renvoyé pour route ${routeId}`);
        return true;
    } catch (err) {
        Logger.log(`[EDIT STOPS] ⚠️ Email non envoyé pour route ${routeId} : ${err.message}`);
        return false;
    }
}