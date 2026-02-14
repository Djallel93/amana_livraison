/**
 * ====================================================================
 * DEBUG_BATCH_GEO.GS - Fonction de test pour débugger le batch
 * ====================================================================
 * À exécuter manuellement pour diagnostiquer les problèmes
 */

/**
 * Test direct du batch geocode
 */
function testBatchGeocode() {
    Logger.log('=== TEST BATCH GEOCODE ===');

    const testAddresses = [
        '10 Rue de Rivoli, 75001 Paris',
        '1 Avenue des Champs-Élysées, 75008 Paris',
        'Tour Eiffel, Paris'
    ];

    const result = geocodeAddressesBatch(testAddresses);

    Logger.log('Résultats:');
    for (const addr in result) {
        Logger.log(`  ${addr}: ${JSON.stringify(result[addr])}`);
    }
}

/**
 * Test direct du batch resolve location
 */
function testBatchResolveLocation() {
    Logger.log('=== TEST BATCH RESOLVE LOCATION ===');

    const testCoords = [
        { latitude: 47.2154056, longitude: -1.6112647 },
        { latitude: 47.2173, longitude: -1.5536 },
        { latitude: 48.8566, longitude: 2.3522 }
    ];

    const result = batchResolveLocation(testCoords);

    Logger.log('Résultats:');
    for (const key in result) {
        const location = result[key];
        if (location) {
            Logger.log(`  ${key}:`);
            Logger.log(`    Ville: ${location.ville ? location.ville.nom : 'N/A'}`);
            Logger.log(`    Secteur: ${location.secteur ? location.secteur.nom : 'N/A'}`);
            Logger.log(`    Quartier: ${location.quartier ? location.quartier.nom : 'N/A'}`);
        } else {
            Logger.log(`  ${key}: NULL`);
        }
    }
}

/**
 * Test complet du workflow avec vraies familles
 */
function testCompleteWorkflow() {
    Logger.log('=== TEST WORKFLOW COMPLET ===');

    // Simuler une famille
    const testFamily = {
        id: 'TEST_001',
        nom: 'Test Family',
        adresse: '16 allée louis braille, 35500 Vitré',
        criticite: 1,
        nombreAdulte: 2,
        nombreEnfant: 3,
        besoins_speciaux: ''
    };

    Logger.log('1. Famille de test:');
    Logger.log(JSON.stringify(testFamily, null, 2));

    Logger.log('\n2. Géocodage de l\'adresse...');
    const geocodeResult = geocodeAddressesBatch([testFamily.adresse]);
    Logger.log('Coordonnées: ' + JSON.stringify(geocodeResult[testFamily.adresse]));

    if (geocodeResult[testFamily.adresse]) {
        Logger.log('\n3. Résolution de la localisation...');
        const coords = geocodeResult[testFamily.adresse];
        const resolveResult = batchResolveLocation([coords]);
        const coordKey = `${coords.latitude},${coords.longitude}`;

        Logger.log('Localisation: ' + JSON.stringify(resolveResult[coordKey], null, 2));
    }
}

/**
 * Test de l'API GEO directement
 */
function testGeoApiDirect() {
    Logger.log('=== TEST API GEO DIRECT ===');

    try {
        // Test 1: Ping
        Logger.log('\n1. Test PING');
        const pingResponse = callGeoApi('ping', null, 'GET');
        Logger.log('Ping response: ' + JSON.stringify(pingResponse));

        // Test 2: Batch geocode
        Logger.log('\n2. Test BATCH GEOCODE');
        const geocodePayload = {
            action: 'batchgeocode',
            adresses: [
                { adresse: '10 Rue de Rivoli, Paris' }
            ]
        };
        const geocodeResponse = callGeoApi('batchgeocode', geocodePayload, 'POST');
        Logger.log('Geocode response: ' + JSON.stringify(geocodeResponse, null, 2));

        // Test 3: Batch resolve
        Logger.log('\n3. Test BATCH RESOLVE');
        const resolvePayload = {
            action: 'batchresolvelocation',
            coordinates: [
                { lat: 47.2154056, lng: -1.6112647 }
            ]
        };
        const resolveResponse = callGeoApi('batchresolvelocation', resolvePayload, 'POST');
        Logger.log('Resolve response: ' + JSON.stringify(resolveResponse, null, 2));

    } catch (error) {
        Logger.log('ERREUR: ' + error.message);
        Logger.log('Stack: ' + error.stack);
    }
}

/**
 * Affiche la configuration
 */
function showGeoApiConfig() {
    const apiKey = PropertiesService.getScriptProperties().getProperty('GEO_API_KEY');
    const baseUrl = PropertiesService.getScriptProperties().getProperty('GEO_API_URL');

    Logger.log('=== CONFIGURATION API GEO ===');
    Logger.log('API URL: ' + (baseUrl ? baseUrl.substring(0, 50) + '...' : 'NON DÉFINIE'));
    Logger.log('API KEY: ' + (apiKey ? apiKey.substring(0, 10) + '...' : 'NON DÉFINIE'));
}