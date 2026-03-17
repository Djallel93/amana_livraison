/**
 * ====================================================================
 * ROUTE_DOC_SERVICE.GS - Génération du document imprimable par route
 * ====================================================================
 */

/**
 * Génère un Google Doc imprimable pour une route donnée.
 * @param {string} routeId
 * @param {string} adminPhone
 * @returns {string} URL du document généré
 */
function generateRouteDoc(routeId, adminPhone) {
    Logger.log(`[DOC_ROUTE] 🚀 Génération document pour route ${routeId}`);

    const route = getRouteById(routeId);
    if (!route) throw new Error(`Route ${routeId} introuvable`);

    const benevoleResp = getVolunteerById(route.id_benevole);
    const benevole = extractData(benevoleResp, ['volunteer', 'benevole']);
    const benevoleNom = benevole ? `${benevole.prenom || ''} ${benevole.nom || ''}`.trim() : String(route.id_benevole);

    const stops = getDeliveryStopsForRoute(routeId);
    if (stops.length === 0) throw new Error(`Aucune étape pour la route ${routeId}`);

    const stopsAvecDonnees = _enrichirStops(stops);

    const dateRoute = route.date_debut instanceof Date ? route.date_debut : new Date(route.date_debut);
    const occasion = route.occasion || 'ponctuelle';

    const dossier = getDateOccasionFolder(dateRoute, occasion);
    const nomFichier = `${routeId}_${benevoleNom.replace(/\s+/g, '_')}`;

    _supprimerDocExistant(dossier, nomFichier);

    const doc = DocumentApp.create(nomFichier);
    const fichier = DriveApp.getFileById(doc.getId());
    dossier.addFile(fichier);
    DriveApp.getRootFolder().removeFile(fichier);

    _construireDocument(doc, routeId, benevoleNom, dateRoute, stopsAvecDonnees, adminPhone);

    doc.saveAndClose();

    const url = DriveApp.getFileById(doc.getId()).getUrl();
    Logger.log(`[DOC_ROUTE] ✅ Document généré : ${url}`);
    return url;
}

/**
 * Enrichit chaque stop avec adresse, téléphones et nombre de personnes.
 * @param {Array<Object>} stops
 * @returns {Array<Object>}
 */
function _enrichirStops(stops) {
    return stops.map(function (stop) {
        const livraison = getDeliveryById(stop.id_livraison);
        if (!livraison) {
            return {
                ordre: stop.ordre_passage,
                id_famille: stop.id_livraison,
                adresse: '— adresse inconnue —',
                telephone: '',
                telephone_bis: '',
                nombre_personnes: '?'
            };
        }

        let telephone = '';
        let telephoneBis = '';

        try {
            const familleResp = getFamilyById(livraison.id_famille);
            const famille = extractData(familleResp, ['family', 'famille']);
            if (famille) {
                telephone = famille.telephone || '';
                telephoneBis = famille.telephoneBis || '';
            }
        } catch (err) {
            Logger.log(`[DOC_ROUTE] ⚠️ Téléphone famille ${livraison.id_famille} : ${err.message}`);
        }

        return {
            ordre: stop.ordre_passage,
            id_famille: livraison.id_famille,
            adresse: livraison.adresse || '—',
            telephone: String(telephone),
            telephone_bis: String(telephoneBis),
            nombre_personnes: livraison.nombre_personnes || 1
        };
    });
}

/**
 * Construit le contenu du document Google Doc.
 * @param {GoogleAppsScript.Document.Document} doc
 * @param {string} routeId
 * @param {string} benevoleNom
 * @param {Date} dateRoute
 * @param {Array<Object>} stops
 * @param {string} adminPhone
 */
function _construireDocument(doc, routeId, benevoleNom, dateRoute, stops, adminPhone) {
    const body = doc.getBody();
    body.clear();

    body.setMarginTop(36);
    body.setMarginBottom(36);
    body.setMarginLeft(36);
    body.setMarginRight(36);

    const dateFormatee = dateRoute instanceof Date && !isNaN(dateRoute.getTime())
        ? dateRoute.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
        : String(dateRoute);

    const titrePara = body.appendParagraph(`Route ${routeId} — ${benevoleNom}`);
    titrePara.setHeading(DocumentApp.ParagraphHeading.HEADING1);
    titrePara.getChild(0).asText().setFontSize(18).setBold(true);

    const datePara = body.appendParagraph(dateFormatee);
    datePara.setHeading(DocumentApp.ParagraphHeading.NORMAL);
    datePara.getChild(0).asText().setFontSize(11).setItalic(true).setForegroundColor('#666666');

    body.appendParagraph('');

    _construireTableau(body, stops);

    body.appendParagraph('');

    if (adminPhone) {
        const footerPara = body.appendParagraph(`Contact administrateur : ${adminPhone}`);
        footerPara.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
        footerPara.getChild(0).asText().setFontSize(10).setBold(true);
    }
}

/**
 * Construit le tableau des livraisons dans le document.
 * Colonnes ajustées au contenu sauf Adresse qui prend l'espace restant.
 * @param {GoogleAppsScript.Document.Body} body
 * @param {Array<Object>} stops
 */
function _construireTableau(body, stops) {
    const PAGE_WIDTH_PT = 595 - 72; // A4 largeur moins marges (36pt x2)

    // Largeurs fixes pour colonnes à contenu court (en pt)
    const COL_NUM = 20;
    const COL_FAMILLE = 50;
    const COL_TEL = 90;
    const COL_TEL_BIS = 90;
    const COL_PERSONNES = 45;
    const COL_ADRESSE = PAGE_WIDTH_PT - COL_NUM - COL_FAMILLE - COL_TEL - COL_TEL_BIS - COL_PERSONNES;

    const largeurs = [COL_NUM, COL_FAMILLE, COL_ADRESSE, COL_TEL, COL_TEL_BIS, COL_PERSONNES];
    const entetes = ['#', 'Famille', 'Adresse', 'Téléphone', 'Tél. bis', 'Personnes'];

    const tableau = body.appendTable();
    tableau.setBorderWidth(1);

    // Ligne d'en-tête
    const ligneEntete = tableau.appendTableRow();
    entetes.forEach(function (entete, i) {
        const cellule = ligneEntete.appendTableCell(entete);
        cellule.setWidth(largeurs[i]);
        cellule.setPaddingTop(5);
        cellule.setPaddingBottom(5);
        cellule.setPaddingLeft(6);
        cellule.setPaddingRight(6);
        cellule.setBackgroundColor('#2d3748');

        const texte = cellule.getChild(0).asParagraph().editAsText();
        texte.setBold(true).setFontSize(9).setForegroundColor('#FFFFFF');

        cellule.getChild(0).asParagraph().setSpacingBefore(0).setSpacingAfter(0);
    });

    // Lignes de données
    stops.forEach(function (stop, index) {
        const ligneData = tableau.appendTableRow();
        const couleurFond = index % 2 === 0 ? '#FFFFFF' : '#f7fafc';

        const valeurs = [
            String(stop.ordre),
            String(stop.id_famille),
            String(stop.adresse),
            String(stop.telephone),
            String(stop.telephone_bis),
            String(stop.nombre_personnes)
        ];

        valeurs.forEach(function (valeur, i) {
            const cellule = ligneData.appendTableCell(valeur);
            cellule.setWidth(largeurs[i]);
            cellule.setPaddingTop(5);
            cellule.setPaddingBottom(5);
            cellule.setPaddingLeft(6);
            cellule.setPaddingRight(6);
            cellule.setBackgroundColor(couleurFond);

            const para = cellule.getChild(0).asParagraph();
            para.setSpacingBefore(0).setSpacingAfter(0);

            const texte = para.editAsText();
            texte.setFontSize(9).setForegroundColor('#000000').setBold(false);

            // Adresse : wrap activé — toutes les autres : pas de wrap
            if (i === 2) {
                cellule.getChild(0).asParagraph().setLineSpacing(115);
            }
        });
    });
}

/**
 * Supprime un document existant portant le même nom dans le dossier.
 * @param {GoogleAppsScript.Drive.Folder} dossier
 * @param {string} nom
 */
function _supprimerDocExistant(dossier, nom) {
    const fichiers = dossier.getFilesByName(nom);
    while (fichiers.hasNext()) {
        fichiers.next().setTrashed(true);
        Logger.log(`[DOC_ROUTE] 🗑️ Ancien document supprimé : ${nom}`);
    }
}