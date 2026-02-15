/**
 * 🔍 DIAGNOSTIC: Test generateNextId() behavior
 * Run this to see what's actually happening
 */
function DEBUG_testGenerateNextId() {
    Logger.log('========================================');
    Logger.log('🔍 DIAGNOSTIC: Testing generateNextId()');
    Logger.log('========================================');

    // Test 1: Call generateNextId multiple times
    Logger.log('\n📊 TEST 1: Calling generateNextId() 5 times');

    for (let i = 0; i < 5; i++) {
        const id = generateNextId(
            CONFIG.SHEETS.ETAPES_ROUTE,
            'E',
            CONFIG.COLUMNS.ETAPES_ROUTE.ID_ETAPE
        );
        Logger.log(`  Call ${i + 1}: ${id}`);
    }

    // Test 2: Check current max ID in sheet
    Logger.log('\n📊 TEST 2: Current max ID in etapes_route sheet');

    const data = getAllData(CONFIG.SHEETS.ETAPES_ROUTE);
    const ids = data
        .map(row => row[CONFIG.COLUMNS.ETAPES_ROUTE.ID_ETAPE - 1])
        .filter(id => id && typeof id === 'string' && id.startsWith('E'));

    Logger.log(`  Total etapes in sheet: ${data.length}`);
    Logger.log(`  IDs starting with 'E': ${ids.length}`);

    if (ids.length > 0) {
        const numbers = ids.map(id => parseInt(id.substring(1))).filter(n => !isNaN(n));
        const maxNum = Math.max(...numbers);
        Logger.log(`  Max ID number: ${maxNum}`);
        Logger.log(`  Max ID: E${String(maxNum).padStart(3, '0')}`);
    }

    // Test 3: Simulate createPreliminaryEtapes logic
    Logger.log('\n📊 TEST 3: Simulate createPreliminaryEtapes()');

    const testLivraisons = [
        { id_livraison: 'TEST_L001' },
        { id_livraison: 'TEST_L002' },
        { id_livraison: 'TEST_L003' }
    ];

    Logger.log('Generating IDs for 3 test livraisons:');
    const generatedIds = [];

    for (let i = 0; i < testLivraisons.length; i++) {
        const etapeId = generateNextId(
            CONFIG.SHEETS.ETAPES_ROUTE,
            'E',
            CONFIG.COLUMNS.ETAPES_ROUTE.ID_ETAPE
        );
        generatedIds.push(etapeId);
        Logger.log(`  ${i + 1}. ${testLivraisons[i].id_livraison} → ${etapeId}`);
    }

    // Check for duplicates
    const uniqueIds = new Set(generatedIds);
    Logger.log(`\n  Generated: ${generatedIds.length} IDs`);
    Logger.log(`  Unique: ${uniqueIds.size} IDs`);

    if (uniqueIds.size === generatedIds.length) {
        Logger.log('  ✅ ALL IDs ARE UNIQUE!');
    } else {
        Logger.log('  ❌ DUPLICATES DETECTED!');
        Logger.log(`  Generated IDs: ${JSON.stringify(generatedIds)}`);
    }

    Logger.log('\n========================================');
}

/**
 * 🔍 DIAGNOSTIC: Check what generateNextId actually returns
 */
function DEBUG_inspectGenerateNextId() {
    Logger.log('========================================');
    Logger.log('🔍 INSPECTING generateNextId() SOURCE');
    Logger.log('========================================');

    try {
        // Test the function exists
        Logger.log('\n1. Function exists: ' + (typeof generateNextId === 'function'));

        // Call it once and inspect result
        const result = generateNextId(
            CONFIG.SHEETS.ETAPES_ROUTE,
            'E',
            CONFIG.COLUMNS.ETAPES_ROUTE.ID_ETAPE
        );

        Logger.log('2. Result type: ' + typeof result);
        Logger.log('3. Result value: ' + result);
        Logger.log('4. Result is string: ' + (typeof result === 'string'));

        // Check if it's reading from sheet correctly
        const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEETS.ETAPES_ROUTE);
        const lastRow = sheet.getLastRow();
        Logger.log('\n5. Sheet last row: ' + lastRow);

        if (lastRow > 1) {
            const idColumn = CONFIG.COLUMNS.ETAPES_ROUTE.ID_ETAPE;
            const lastId = sheet.getRange(lastRow, idColumn).getValue();
            Logger.log('6. Last ID in sheet: ' + lastId);
        }

    } catch (error) {
        Logger.log('❌ ERROR: ' + error.message);
        Logger.log('Stack: ' + error.stack);
    }

    Logger.log('\n========================================');
}

/**
 * 🔍 DIAGNOSTIC: Show actual generateNextId code
 */
function DEBUG_showGenerateNextIdCode() {
    Logger.log('========================================');
    Logger.log('🔍 SHOW generateNextId() IMPLEMENTATION');
    Logger.log('========================================');

    // Try to show the actual code
    try {
        const funcStr = generateNextId.toString();
        Logger.log('\nFunction code:');
        Logger.log(funcStr);
    } catch (error) {
        Logger.log('Cannot display function code: ' + error.message);
    }

    Logger.log('\n========================================');
}

/**
 * 🔧 FIX: Manual test of correct implementation
 */
function DEBUG_testCorrectImplementation() {
    Logger.log('========================================');
    Logger.log('🔧 TEST: Correct Implementation');
    Logger.log('========================================');

    Logger.log('\n❌ WRONG WAY (what you might have):');

    // Simulate wrong way
    const wrongId = generateNextId(
        CONFIG.SHEETS.ETAPES_ROUTE,
        'E',
        CONFIG.COLUMNS.ETAPES_ROUTE.ID_ETAPE
    );

    Logger.log('Generated ID ONCE: ' + wrongId);
    Logger.log('Using for all livraisons:');
    for (let i = 0; i < 3; i++) {
        Logger.log(`  Livraison ${i + 1}: ${wrongId} (DUPLICATE!)`);
    }

    Logger.log('\n✅ CORRECT WAY:');
    Logger.log('Generate ID for EACH livraison:');
    for (let i = 0; i < 3; i++) {
        const correctId = generateNextId(
            CONFIG.SHEETS.ETAPES_ROUTE,
            'E',
            CONFIG.COLUMNS.ETAPES_ROUTE.ID_ETAPE
        );
        Logger.log(`  Livraison ${i + 1}: ${correctId} (UNIQUE)`);
    }

    Logger.log('\n========================================');
}

/**
 * 🔍 COMPLETE DIAGNOSTIC
 */
function DEBUG_runAllDiagnostics() {
    Logger.log('\n\n');
    Logger.log('╔════════════════════════════════════════╗');
    Logger.log('║   COMPLETE DIAGNOSTIC SUITE            ║');
    Logger.log('╚════════════════════════════════════════╝');

    DEBUG_inspectGenerateNextId();
    Utilities.sleep(500);

    DEBUG_testGenerateNextId();
    Utilities.sleep(500);

    DEBUG_testCorrectImplementation();
    Utilities.sleep(500);

    DEBUG_showGenerateNextIdCode();

    Logger.log('\n\n');
    Logger.log('╔════════════════════════════════════════╗');
    Logger.log('║   DIAGNOSTIC COMPLETE                  ║');
    Logger.log('╚════════════════════════════════════════╝');
    Logger.log('\nCheck the logs above to see what is happening.');
}