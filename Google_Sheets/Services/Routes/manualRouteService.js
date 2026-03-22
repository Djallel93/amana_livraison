function createManualRoute(params) {
    Logger.log(`[ROUTE MANUELLE] 🚀 Démarrage création route manuelle`);
    Logger.log(`[ROUTE MANUELLE] Bénévole: ${params.id_benevole}, Livraisons: ${(params.livraison_ids || []).join(', ')}`);

    if (!params.id_benevole) {
        throw new Error('Un bénévole doit être sélectionné');
    }

    if (!params.livraison_ids || params.livraison_ids.length === 0) {
        throw new Error('Au moins une livraison doit être sélectionnée');
    }

    if (!params.date_livraison) {
        throw new Error('La date de livraison est obligatoire');
    }

    if (!params.occasion) {
        throw new Error("L'occasion est obligatoire");
    }

    const benevoleResponse = getVolunteerById(params.id_benevole);
    const benevole = extractData(benevoleResponse, ['volunteer', 'benevole']);
    if (!benevole) {
        throw new Error(`Bénévole ${params.id_benevole} introuvable`);
    }

    const vehicleResponse = getVehicleTypes();
    const vehiclesMap = {};
    if (vehicleResponse && vehicleResponse.vehicles) {
        vehicleResponse.vehicles.forEach(v => { vehiclesMap[v.id] = v; });
    }

    const vehiculeId = benevole.id_vehicule || benevole.idVehicule;
    const vehicule = vehiculeId ? vehiclesMap[vehiculeId] : null;

    const livraisons = [];
    for (const livraisonId of params.livraison_ids) {
        const livraison = getDeliveryById(livraisonId);
        if (!livraison) {
            throw new Error(`Livraison ${livraisonId} introuvable`);
        }
        if (livraison.statut !== CONFIG.ENUMS.STATUT_LIVRAISON.NON_ASSIGNEE) {
            throw new Error(`Livraison ${livraisonId} n'est plus disponible (statut: ${livraison.statut})`);
        }
        livraisons.push(livraison);
    }

    Logger.log(`[ROUTE MANUELLE] ✅ ${livraisons.length} livraisons validées`);

    const hqConfig = getCurrentHqConfig();
    const hqCoords = (hqConfig && hqConfig.lat && hqConfig.lng)
        ? { lat: hqConfig.lat, lng: hqConfig.lng }
        : null;

    let livraisonsOptimisees = livraisons;

    if (hqCoords && livraisons.length > 1) {
        Logger.log(`[ROUTE MANUELLE] 🎯 Optimisation TSP des ${livraisons.length} livraisons…`);
        livraisonsOptimisees = optimizeDeliveryOrder(livraisons, hqCoords);
    } else {
        Logger.log(`[ROUTE MANUELLE] ⚠️ Optimisation ignorée (QG non configuré ou livraison unique)`);
    }

    const poidsParPart = parseFloat(params.poids_moyen_kg) || 0;
    const poidsParPartHotel = parseFloat(params.poids_moyen_hotel_kg) || poidsParPart;

    const poidsTotal = livraisonsOptimisees.reduce((sum, l) => {
        const parts = parseInt(l.nombre_personnes) || 0;
        const estHotel = l.hotel === true || l.hotel === 'TRUE' || l.hotel === 'true';
        return sum + parts * (estHotel ? poidsParPartHotel : poidsParPart);
    }, 0);

    const distanceTotale = hqCoords
        ? calculerDistanceTotaleRoute(livraisonsOptimisees, hqCoords)
        : 0;

    let lienMaps = '';
    if (hqCoords) {
        lienMaps = generateGoogleMapsLink(livraisonsOptimisees, hqCoords);
    }

    const routeId = generateNextId(
        CONFIG.SHEETS.ROUTES,
        'R',
        CONFIG.COLUMNS.ROUTES.ID_ROUTE
    );

    const routeData = {
        id_route: routeId,
        id_benevole: benevole.id,
        id_binome: '',
        id_vehicule_prete: '',
        date_debut: params.date_livraison,
        date_fin: null,
        occasion: params.occasion,
        statut: CONFIG.ENUMS.STATUT_ROUTE.BROUILLON,
        distance_totale_km: Math.round(distanceTotale * 100) / 100,
        poids_total_kg: Math.round(poidsTotal * 100) / 100,
        poids_par_part: poidsParPart,
        poids_par_part_hotel: poidsParPartHotel,
        relivre: true,
        lien_maps: lienMaps,
        dossier_drive: '',
        date_creation: getCurrentDateTime(),
        date_modification: getCurrentDateTime()
    };

    const validation = validateRoute(routeData);
    if (validation.hasErrors()) {
        throw new Error(`Route invalide: ${validation.getErrorMessages().join(', ')}`);
    }

    const rowData = [
        routeData.id_route,
        routeData.id_benevole,
        routeData.id_binome,
        routeData.id_vehicule_prete,
        routeData.date_debut,
        routeData.date_fin,
        routeData.occasion,
        routeData.statut,
        routeData.distance_totale_km,
        routeData.poids_total_kg,
        routeData.poids_par_part,
        routeData.poids_par_part_hotel,
        routeData.relivre,
        routeData.lien_maps,
        routeData.dossier_drive,
        routeData.date_creation,
        routeData.date_modification
    ];

    appendRow(CONFIG.SHEETS.ROUTES, rowData);
    Logger.log(`[ROUTE MANUELLE] ✅ Route ${routeId} sauvegardée`);

    createOptimizedEtapes(routeId, livraisonsOptimisees);
    Logger.log(`[ROUTE MANUELLE] ✅ Étapes créées pour ${routeId}`);

    for (const livraison of livraisonsOptimisees) {
        updateDeliveryStatus(livraison.id_livraison, CONFIG.ENUMS.STATUT_LIVRAISON.ASSIGNEE);
    }

    _verifierConditionnementApresCreation(routeId, livraisonsOptimisees);

    let docWarning = null;
    try {
        const adminPhone = PropertiesService.getScriptProperties().getProperty('ADMIN_PHONE') || '';
        generateRouteDoc(routeId, adminPhone);
        Logger.log(`[ROUTE MANUELLE] 📄 Feuille imprimable générée pour ${routeId}`);
    } catch (docErr) {
        docWarning = `Feuille imprimable non générée pour ${routeId} : ${docErr.message}`;
        Logger.log(`[ROUTE MANUELLE] ⚠️ ${docWarning}`);
    }

    const benevoleNom = `${benevole.prenom || ''} ${benevole.nom || ''}`.trim();

    Logger.log(`[ROUTE MANUELLE] 🎉 Route ${routeId} créée — ${livraisonsOptimisees.length} livraisons, ${Math.round(distanceTotale)}km`);

    return {
        success: true,
        id_route: routeId,
        benevole_nom: benevoleNom,
        nb_livraisons: livraisonsOptimisees.length,
        distance_totale_km: routeData.distance_totale_km,
        poids_total_kg: routeData.poids_total_kg,
        lien_maps: lienMaps,
        doc_warning: docWarning
    };
}