function testCompleteWorkflow() {
    try {
        Logger.log('========================================');
        Logger.log('🧪 COMPLETE WORKFLOW TEST');
        Logger.log('========================================');

        // ✅ Check HQ with CORRECT property names
        const hqConfig = getCurrentHqConfig();

        Logger.log(`\n🏢 HQ Configuration:`);
        if (hqConfig && hqConfig.lat && hqConfig.lng) {
            Logger.log(`   Address: ${hqConfig.address}`);    // ✅ "address"
            Logger.log(`   Lat: ${hqConfig.lat}`);            // ✅ "lat"
            Logger.log(`   Lng: ${hqConfig.lng}`);            // ✅ "lng"
        } else {
            Logger.log(`   ❌ HQ NOT CONFIGURED!`);
            Logger.log(`   Please configure HQ in sheet: ${CONFIG.SHEETS.PARAMETRES}`);
            return;
        }

        // 2. Plan routes (multi-trip)
        Logger.log('\n📍 PHASE 3: PLANNING ROUTES...');
        const planResult = planRoutes({
            date_livraison: '2026-03-08',
            max_livraisons: 15,
            occasion: 'zakat_el_fitr',
            poids_moyen_kg: 5,
            relivre: true
        });

        Logger.log(`✅ Routes created: ${planResult.created}`);

        // 3. Check unassigned deliveries
        const allDeliveries = getAllDataAsObjects(CONFIG.SHEETS.LIVRAISON);
        const unassigned = allDeliveries.filter(d =>
            d.statut === CONFIG.ENUMS.STATUT_LIVRAISON.NON_ASSIGNEE &&
            d.date_livraison === '2026-03-08'
        );
        Logger.log(`📦 Unassigned deliveries: ${unassigned.length}`);

        if (unassigned.length > 0) {
            Logger.log('   First 3 unassigned:');
            unassigned.slice(0, 3).forEach(d => {
                Logger.log(`   - ${d.id_livraison}: ${d.adresse.substring(0, 40)}...`);
            });
        }

        // 4. Generate stops for first route
        Logger.log('\n📍 PHASE 4: GENERATING STOPS FOR R001...');

        const stopResult = generateStops({
            route_id: 'R001',
            occasion: 'zakat_el_fitr',
            regenerate_documents: false,
            send_email: false
        });

        Logger.log(`✅ Stops generated: ${stopResult.stops_count}`);
        Logger.log(`📏 Total distance (with HQ): ${stopResult.total_distance_km}km`);

        // 5. Verify HQ stop
        const etapes = filterData(CONFIG.SHEETS.ETAPES_ROUTE, row => row.id_route === 'R001');
        const sortedEtapes = etapes.sort((a, b) => a.ordre_passage - b.ordre_passage);

        Logger.log(`\n📍 STOPS FOR R001 (${sortedEtapes.length} total):`);
        sortedEtapes.forEach((e, idx) => {
            const isHQ = e.commentaire === 'Retour au QG';
            const isFirst = idx === 0;
            const isLast = idx === sortedEtapes.length - 1;

            let marker = '';
            if (isFirst) marker = '🚀';
            if (isLast) marker = isHQ ? '🏢' : '❌';

            const addr = e.adresse_etape ? e.adresse_etape.substring(0, 30) : '(no address)';
            Logger.log(`  ${e.ordre_passage}. ${e.id_livraison || '(HQ)'} - ${addr}... ${marker}`);
        });

        const lastStop = sortedEtapes[sortedEtapes.length - 1];
        if (lastStop.commentaire === 'Retour au QG' && lastStop.id_livraison === '') {
            Logger.log('\n✅ SUCCESS: HQ return stop is correctly at the end!');
        } else {
            Logger.log('\n❌ ERROR: HQ return stop not found or not last!');
        }

        Logger.log('\n========================================');

    } catch (error) {
        Logger.log(`\n❌ FATAL ERROR: ${error.message}`);
        Logger.log(`   Stack: ${error.stack}`);
    }
}