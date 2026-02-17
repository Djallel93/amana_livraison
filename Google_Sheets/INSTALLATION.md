# Projet de Gestion des Livraisons - Google Apps Script

## 🎯 Vue d'Ensemble du Projet

Vous êtes un expert Google Apps Script. Votre mission est de m'aider a développer un système complet de gestion des livraisons pour une association. Ce système permet de :

1. **Générer des demandes de livraison** à partir de familles validées
2. **Planifier des routes** pour les bénévoles en optimisant distance et capacité
3. **Générer des étapes** et communiquer les itinéraires aux bénévoles
4. **Générer des étiquettes** imprimables pour les colis
5. **Suivre le statut** en temps réel via une API web

## 📊 Modèle de Données (Google Sheets)

### Table 1 : `Livraison` (Demandes de livraison)

| Colonne             | Type     | Description                                                                      |
| ------------------- | -------- | -------------------------------------------------------------------------------- |
| id_livraison        | String   | Clé primaire (auto-incrémenté L001, L002...) - **String pour préfixes lisibles** |
| id_famille          | String   | ID de la famille (depuis API Familles)                                           |
| id_quartier         | String   | Quartier de la famille                                                           |
| adresse             | String   | Adresse complète                                                                 |
| latitude            | Float    | Coordonnées GPS                                                                  |
| longitude           | Float    | Coordonnées GPS                                                                  |
| disponibilite_debut | DateTime | Début de la fenêtre de disponibilité                                             |
| disponibilite_fin   | DateTime | Fin de la fenêtre de disponibilité                                               |
| nombre_personnes    | Integer  | Nombre total de personnes (adultes + enfants)                                    |
| statut              | Enum     | **Non Assignée, Assignée, En Cours, Livrée, Annulée**                            |
| priorite            | Integer  | 1-5 (1 = urgent, 5 = standard)                                                   |
| type_aide           | String   | zakat/sadaqa/recolte                                                             |
| besoins_speciaux    | String   | Notes spéciales (escaliers, code porte...)                                       |
| date_creation       | DateTime | Date de création                                                                 |
| date_modification   | DateTime | Dernière modification                                                            |

**Note sur les IDs** : Tous les IDs sont en String (et non Integer) pour permettre des préfixes lisibles par humain (L001, R001, E001). Cela facilite grandement le débogage, les logs, et la communication avec les équipes terrain.

**Relations** : 1 Livraison → 1 Famille (API externe), 1 Livraison → N Etapes_route

---

### Table 2 : `routes` (Routes des bénévoles)

| Colonne            | Type     | Description                                              |
| ------------------ | -------- | -------------------------------------------------------- |
| id_route           | String   | Clé primaire (R001, R002...)                             |
| id_benevole        | String   | ID du bénévole principal                                 |
| id_binome          | String   | ID du binôme (optionnel)                                 |
| id_vehicule_prete  | String   | ID du véhicule prêté (si applicable)                     |
| date_debut         | Date     | Date de début de la route                                |
| date_fin           | Date     | Date de fin (post-livraison, pour audit)                 |
| occasion           | Enum     | **zakat_el_fitr, recolte, ponctuelle**                   |
| statut             | Enum     | **Brouillon, Confirmée, En Cours, Terminée, Annulée**    |
| distance_totale_km | Float    | Distance totale (calculée)                               |
| poids_total_kg     | Float    | **Poids total transporté (calculé lors création route)** |
| relivre            | Boolean  | true = retour au HQ, false = route linéaire              |
| dossier_drive      | String   | URL du dossier Google Drive                              |
| date_creation      | DateTime | Date de création                                         |
| date_modification  | DateTime | Dernière modification                                    |

**Relations** : 1 Route → 1 Bénévole (API externe), 1 Route → N Etapes_route

---

### Table 3 : `etapes_route` (Étapes individuelles)

| Colonne       | Type     | Description                              |
| ------------- | -------- | ---------------------------------------- |
| id_etape      | String   | Clé primaire (E001, E002...)             |
| id_route      | String   | Clé étrangère → routes                   |
| id_livraison  | String   | Clé étrangère → Livraison                |
| ordre_passage | Integer  | Séquence (1, 2, 3...)                    |
| statut        | Enum     | **En Attente, En Cours, Livrée, Sautée** |
| heure_debut   | DateTime | Début effectif de l'étape                |
| heure_fin     | DateTime | Fin effectif de l'étape                  |
| commentaire   | String   | Notes du bénévole                        |

**Relations** : N Etapes → 1 Route, N Etapes → 1 Livraison

---



### Étape 1 : Generate Deliveries (Générer les Livraisons)

**Menu** : `Livraisons > Générer Livraisons`

**Interface HTML** :

```txt
Formulaire avec :
- Sélecteur de priorités (checkboxes : 1, 2, 3, 4, 5)
- Sélecteur de type d'aide (checkboxes : zakat, sadaqa, recolte)
- Sélecteur multiple de quartiers (depuis API GEO)
- Champ date unique (Date de livraison souhaitée)
- Nombre de livraisons à générer (input number)
```

**Logique Backend** :

1. **Récupérer les familles validées** depuis l'API Familles avec les filtres sélectionnés
2. Pour chaque famille récupérée :
   - Vérifier qu'elle n'a pas déjà une livraison active (statut ≠ Livrée/Annulée)
   - Récupérer adresse via `GET /getfamily?id=X`
   - Géocoder l'adresse via API GEO : `GET /geocode?address=...`
   - Résoudre la hiérarchie complète via : `GET /resolvelocation?lat=X&lng=Y`
3. **Calculer distance depuis HQ** pour chaque famille via : `GET /calculatedistance?from=HQ&to=famille`
4. **Trier les familles** : d'abord par distance (plus loin en premier), puis par priorité (1-5)
5. **Créer les lignes Livraison** avec :
   - `statut = "Non Assignée"` (important : pas encore assigné à un bénévole)
   - `nombre_personnes = adultes + enfants` (depuis API Familles)
   - Autres champs remplis depuis l'API
6. **Logger les résultats** en français dans la console

**Validation** :

- Si aucune famille ne correspond aux filtres → popup d'avertissement
- Si le nombre demandé > familles disponibles → créer seulement celles disponibles

---

### Étape 2 : Plan Routes (Planifier les Routes)

**Menu** : `Routes > Planifier Routes`

**Interface HTML** :

```txt
Formulaire avec :
- Sélecteur de date unique (date de livraison)
- Nombre maximum de livraisons par bénévole (input number)
- Sélecteur d'occasion (radio : zakat_el_fitr, recolte, ponctuelle)
- Poids moyen par personne en kg (input number, ex: 5 kg)

┌─ Véhicules Supplémentaires (Prêtés) ─────────┐
│ (Véhicules prêtés par des bénévoles)         │
│                                              │
│ Type          Capacité (kg)  [Actions]       │
│ [Monospace ▼] [500        ]  [Supprimer]     │
│ [Berline   ▼] [400        ]  [Supprimer]     │
│                                              │
│ [+ Ajouter un véhicule prêté]                │
└──────────────────────────────────────────────┘

┌─ Configuration des Binômes (Optionnel) ───────┐
│ Bénévole Principal    Binôme                  │
│ [Ahmed         ▼]     [Omar          ▼]       │
│ [Fatima        ▼]     [Aucun         ▼]       │
│                                               │
│ [+ Ajouter un binôme]                         │
└───────────────────────────────────────────────┘

Boutons : [Annuler] [Planifier Routes]
```

**Logique Backend (CRITIQUE - Algorithme de Génération de Routes)** :

#### **Préparation des données**

1. Récupérer toutes les livraisons avec `statut = "Non Assignée"` pour la date sélectionnée
2. Récupérer les bénévoles disponibles via API :

   ```url
   GET /listvolunteers?actif=true&statut=Validé
   ```

3. Vérifier la disponibilité de chaque bénévole pour la date via :

   ```url
   GET /getavailability?volunteerId=X
   ```

4. Récupérer les capacités des véhicules via :

   ```url
   GET /getvehicles
   ```

**IMPORTANT - Gestion des Véhicules** :
Les bénévoles peuvent avoir :

- **Un véhicule personnel** (Citadine, Berline, Break, Monospace, Camion utilitaire)
- **Un permis sans véhicule** (type "Permis", capacité 0 kg)
- **Ni permis ni véhicule** (type "Sans permis", capacité 0 kg)

**Véhicules prêtés** : Certains bénévoles prêtent leur véhicule à d'autres. Le système doit :

- Identifier les véhicules disponibles à prêter
- Les assigner aux bénévoles avec permis mais sans véhicule
- Enregistrer l'attribution dans `id_vehicule_prete` de la table routes

**Données exemple de GET /getvehicles** :

```json
{
  "vehicles": [
    {"id": 1, "type": "Citadine", "capaciteKg": 250},
    {"id": 2, "type": "Berline", "capaciteKg": 350},
    {"id": 3, "type": "Break", "capaciteKg": 400},
    {"id": 4, "type": "Monospace", "capaciteKg": 500},
    {"id": 5, "type": "Camion utilitaire", "capaciteKg": 700},
    {"id": 6, "type": "Permis", "capaciteKg": 0},
    {"id": 7, "type": "Sans permis", "capaciteKg": 0}
  ]
}
```

#### **Règles de Génération de Routes (LOGIQUE EMPIRIQUE - PAR ORDRE DE PRIORITÉ)**

**IMPORTANT** : Cette logique est basée sur l'expérience terrain et optimise pour :

1. **Maximiser l'utilisation des gros véhicules** (remplir au maximum leur capacité)
2. **Prioriser par nombre de livraisons** (pas par distance)
3. **Regrouper les clusters éloignés** pour éviter plusieurs trajets longue distance

---

**RÈGLE 1** : Ignorer complètement le paramètre "confiance" (trusted) pour les livraisons AMANA

**RÈGLE 2** : Identifier les clusters géographiques

```javascript
// Grouper les livraisons par proximité
function identifierClusters(livraisons) {
  const clusters = [];
  const DISTANCE_PROXIMITE = CONFIG.ROUTE_OPTIMIZATION.DISTANCE_PROXIMITE_KM; // 3 km
  
  for (let livraison of livraisons) {
    // Trouver un cluster existant à moins de 3 km
    let clusterTrouve = clusters.find(c => 
      calculerDistance(c.centre, livraison.coords) < DISTANCE_PROXIMITE
    );
    
    if (clusterTrouve) {
      clusterTrouve.livraisons.push(livraison);
      clusterTrouve.poids_total += (livraison.nombre_personnes * poids_moyen_par_part);
    } else {
      // Créer nouveau cluster
      clusters.push({
        id: `C${clusters.length + 1}`,
        centre: livraison.coords,
        livraisons: [livraison],
        quartier_id: livraison.id_quartier,
        distance_hq: livraison.distance_from_hq,
        poids_total: livraison.nombre_personnes * poids_moyen_par_part
      });
    }
  }
  
  // IMPORTANT : Trier par NOMBRE DE LIVRAISONS (DESC), pas par distance
  return clusters.sort((a, b) => b.livraisons.length - a.livraisons.length);
}
```

**RÈGLE 3** : Prioriser par NOMBRE DE LIVRAISONS (pas par distance)

- Cluster avec 10 livraisons à 7 km > Cluster avec 3 livraisons à 50 km
- **La capacité du véhicule doit correspondre au volume de livraisons**

**RÈGLE 4** : Attribution des véhicules (par capacité décroissante)

```javascript
// Trier véhicules par capacité DESC
vehicules.sort((a, b) => b.capaciteKg - a.capaciteKg);

for (let vehicule of vehicules) {
  let route = {
    livraisons: [],
    poids_total: 0,
    clusters_assignes: []
  };
  
  // Prendre le cluster avec le PLUS de livraisons restantes
  let clusterPrincipal = clusters_restants.shift(); // Le premier (plus de livraisons)
  route.livraisons.push(...clusterPrincipal.livraisons);
  route.poids_total += clusterPrincipal.poids_total;
  route.clusters_assignes.push(clusterPrincipal.id);
  
  // RÈGLE IMPORTANTE : Maximiser l'utilisation du véhicule
  // Essayer d'ajouter d'autres clusters tant que :
  // 1. Capacité non dépassée
  // 2. Distance entre clusters < 15 km OU tous sont éloignés (> 30 km)
  
  for (let autreCluster of clusters_restants) {
    let distance_entre_clusters = calculerDistance(
      clusterPrincipal.centre, 
      autreCluster.centre
    );
    
    // Peut grouper si :
    // - Distance < 15 km (clusters voisins)
    // - OU les deux > 30 km du HQ (regrouper trajets longs)
    let peut_grouper = (
      distance_entre_clusters < CONFIG.ROUTE_OPTIMIZATION.DISTANCE_CLUSTER_MAX_KM ||
      (clusterPrincipal.distance_hq > 30 && autreCluster.distance_hq > 30)
    );
    
    if (peut_grouper && 
        (route.poids_total + autreCluster.poids_total) <= vehicule.capaciteKg &&
        (route.livraisons.length + autreCluster.livraisons.length) <= max_livraisons) {
      
      route.livraisons.push(...autreCluster.livraisons);
      route.poids_total += autreCluster.poids_total;
      route.clusters_assignes.push(autreCluster.id);
      
      // Retirer du pool
      clusters_restants = clusters_restants.filter(c => c.id !== autreCluster.id);
    }
  }
  
  // Créer la route
  creerRoute(vehicule, route);
}
```

**Exemple Concret** :

- Camion (900 kg), Citadine (250 kg)
- Cluster A : 6 livraisons, 90 kg, 50 km
- Cluster B : 5 livraisons, 75 kg, 48 km
- Cluster C : 4 livraisons, 60 kg, 45 km
- Cluster D : 3 livraisons, 45 kg, 5 km

**Attribution** :

```txt
Route R001 (Camion) : A + B + C (15 livraisons, 225 kg, ~140 km)
  → Tous éloignés (> 30 km), donc groupés même si > 15 km entre eux
  → Maximise utilisation camion (225/900 kg)
Route R002 (Citadine) : D (3 livraisons, 45 kg, 5 km)
```

**RÈGLE 5** : Minimiser les relivres (retours au HQ)

- Par défaut : `relivre = false` (route linéaire)
- `relivre = true` uniquement si besoin matériel supplémentaire ou retour véhicule prêté

**RÈGLE 6** : Respecter la capacité du véhicule

```javascript
if (route.poids_total_kg > vehicule.capaciteKg) {
  // Popup d'avertissement à l'admin
  Logger.log(`⚠️ AVERTISSEMENT : Route ${id_route} dépasse la capacité de ${vehicule.capaciteKg} kg`);
  // Ne pas bloquer mais alerter
}
```

**RÈGLE 7** : Binômes et véhicules prêtés

- **GESTION ENTIÈREMENT MANUELLE** par l'admin
- Bénévoles "Sans Permis" peuvent participer à d'autres tâches (tri, collecte)
- Interface de sélection binôme et véhicules prêtés dans le formulaire
- Aucune suggestion automatique, aucun popup

**RÈGLE 8** : Détection des routes éloignées (après création)

```javascript
// Après création de toutes les routes
for (let route of routes_creees) {
  if (route.distance_totale_km > CONFIG.ROUTE_OPTIMIZATION.DISTANCE_LIVRAISON_ISOLEE_KM) {
    // Popup informatif (route déjà créée)
    afficherPopup(
      "Route Éloignée Détectée",
      `⚠️ Route ${route.id} est très éloignée (${route.distance_totale_km} km).
      Voulez-vous la conserver ?`,
      ["Confirmer", "Supprimer", "Modifier"]
    );
  }
}
```

**RÈGLE 9** : Ordre des IDs de routes

```javascript
// Après création, trier par distance_totale DESC avant assignation IDs
routes.sort((a, b) => b.distance_totale_km - a.distance_totale_km);

// Assigner IDs : R001 = plus éloignée, R002 = deuxième, etc.
routes.forEach((route, index) => {
  route.id_route = `R${String(index + 1).padStart(3, '0')}`;
});
```

**Algorithme simplifié** :

```javascript
1. Identifier les clusters géographiques (fonction identifierClusters)
   → Trier par NOMBRE DE LIVRAISONS (DESC), pas par distance

2. Détecter les clusters éloignés (pour popup ultérieur)
   → Marquer si distance HQ > CONFIG.DISTANCE_LIVRAISON_ISOLEE_KM (30 km)

3. Trier véhicules par capacité (DESC) : Camion > Monospace > Berline > Citadine

4. Pour chaque véhicule disponible :
   a. Prendre le cluster avec le PLUS de livraisons restantes
   b. Essayer d'ajouter d'autres clusters pour maximiser la charge si :
      - Capacité non dépassée
      - Distance entre clusters < 15 km OU tous > 30 km du HQ
      - Nombre total livraisons < max_livraisons
   c. Calculer poids_total_kg de la route :
      poids_total_kg = Σ(nombre_personnes × poids_moyen_par_part)
   d. Créer route avec statut "Brouillon"
   e. Remplir id_vehicule_prete si applicable
   f. Mettre à jour les livraisons : statut → "Assignée"

5. Trier routes par distance_totale_km (DESC)
   → Assigner IDs : R001 = plus éloignée, R002, R003...

6. Pour chaque route > 30 km :
   → Popup : "Route R001 très éloignée (45 km). Confirmer ?"
      [Confirmer] [Supprimer] [Modifier]

7. Créer dossier Google Drive : 
   Routes/YYYYMMdd_{occasion}/
```

**Transition de statut** :

- Livraisons : `Non Assignée` → `Assignée` (dès que la route est créée en mode Brouillon)
- Routes : créées avec `statut = "Brouillon"`
- Ordre IDs : R001 = route la plus éloignée

---

### Étape 3 : Generate Stops (Générer les Étapes)

**Menu** : `Routes > Générer Étapes`

**Interface HTML** :

```txt
Liste des routes en statut "Brouillon" :
- Checkbox pour sélectionner les routes à traiter
- Bouton "Générer et Envoyer"
```

**Logique Backend** :

#### **Optimisation de l'ordre des étapes**

**PRIORITÉ 1** : Respecter les fenêtres de disponibilité

```javascript
// Trier les livraisons par disponibilite_debut (plus tôt en premier)
stops.sort((a, b) => a.disponibilite_debut - b.disponibilite_debut);
```

**PRIORITÉ 2** : Optimiser la distance totale (TSP simplifié)

- Utiliser un algorithme nearest-neighbor :

```javascript
1. Départ = HQ
2. Répéter :
   - Trouver la livraison non visitée la plus proche
   - Ajouter comme prochaine étape
   - Mettre à jour position actuelle
3. Si relivre = true : retour au HQ
```

**PRIORITÉ 3** : Réorganisation manuelle

- **Pas d'interface drag-and-drop** : l'admin réorganisera directement dans Google Sheets
- Modifier la colonne `ordre_passage` dans la feuille `etapes_route`
- Possibilité d'ajouter/supprimer des étapes manuellement

#### **Création des étapes**

1. Pour chaque livraison de la route :
   - Créer une ligne dans `etapes_route`
   - `ordre_passage` = séquence calculée (1, 2, 3...)
   - `statut = "En Attente"`

2. **Générer documents Google** :
   - **1 Google Doc par route** : `Route_R001.gdoc`
   - Contenu : tableau avec adresses, horaires, notes
   - **1 fiche d'étiquettes A4** par route (voir section Labels)

3. **Envoyer email HTML au bénévole** :
   - Template HTML stocké dans `/templates/email_route.html`
   - CSS commun dans `/templates/styles.css`
   - Langue : **Français uniquement**
   - Contenu :
     - Récapitulatif de la route (nombre d'arrêts, poids total, distance)
     - **Lien Google Maps pour toute la route** (incluant HQ au début et à la fin si relivre=true)
       - Format : `https://www.google.com/maps/dir/[HQ]/[Adresse1]/[Adresse2]/.../[AdresseN]/[HQ si relivre]`
       - Exemple : `https://www.google.com/maps/dir/319+Rte+de+Vannes,+44800+Saint-Herblain/Château+d'eau+de+la+Contrie,+44100+Nantes/6+Rue+Jean+Baptiste+Delambre,+44100+Nantes/...`
     - Tableau des arrêts avec adresses cliquables individuelles (Google Maps par étape)
     - Boutons d'action (voir section API Web)
   - **Envoi direct** (pas de revue par l'admin)

4. **Mettre à jour le statut** :
   - Routes : `Brouillon` → `Confirmée`

---

### Étape 4 : Generate Labels (Générer les Étiquettes)

**Menu** : `Routes > Générer Étiquettes`

**Interface HTML** :

```txt
Formulaire avec :
- Sélecteur de routes (multiples, statut = Confirmed)
- Configuration du format :
  * Nombre de lignes (input number, défaut: 7)
  * Nombre de colonnes (input number, défaut: 3)
- Aperçu du format (21 étiquettes par A4)
- Bouton "Générer"
```

**Logique Backend** :

1. Pour chaque route sélectionnée :
   - Récupérer toutes les étapes (livraisons)
   - Pour chaque livraison avec `parts = N` :
     - Créer `N` étiquettes identiques

2. **Format de l'étiquette (recto)** :

```txt
┌─────────────────────────┐
│ R_001  F_12345          │
│                         │
│                         │
│                      1/3│
└─────────────────────────┘
```

- **Gauche** : `R_` + id_route (en **grande police**, ex: 16pt, gras)
- **Droite** : `F_` + id_famille (en **grande police**, ex: 16pt, gras)
- **En bas à droite** : `X/Y` (numéro part / total parts, en **petite police**, ex: 10pt)
- **Centre** : vide (espace pour écriture manuelle si besoin)

1. **Format de l'étiquette (verso - avec QR Code)** :

```txt
┌─────────────────────────┐
│                         │
│      [QR CODE]          │
│                         │
│  Scan pour confirmer    │
└─────────────────────────┘
```

***⚠️ DÉCISION : Implémenter Option A (QR sur le recto)***

- QR code intégré sur le **recto** de l'étiquette (solution la plus simple)
- Position : coin supérieur droit ou en bas, selon préférence
- Évite les problèmes d'alignement recto-verso

**Génération du QR Code** :

- URL à encoder : même que dans l'email de confirmation
- Exemple : `https://your-api.com/confirm-delivery?token=abc123&etape=E001`
- Bibliothèque : utiliser Google Charts API

```javascript
const qrUrl = `https://chart.googleapis.com/chart?cht=qr&chs=150x150&chl=${encodeURIComponent(confirmUrl)}`;
```

1. **Génération du Google Doc** :

- Créer un Google Doc avec tableau `rows x cols`
- Insérer les étiquettes
- **Facile à découper** : bordures pointillées entre étiquettes
- Sauvegarder dans `Routes/YYYYMMdd_{occasion}/Labels_R001.gdoc`

---

## Besoins Technique

1. Ajoute une nouvelle colonne dans la feuille `routes` nommée `lien_maps` pour stocker le lien Google Maps de la route générée aprs avoir optimiser l'ordre des étapes. Maintenant c'est l'admin qui doit passer le statut de la route à "Confirmée" apres avoir revue et validé le lien maps et l'ordre des étapes. Voici un exemple de lien maps à générer :

    ```url
      https://www.google.com/maps/dir/319+Rte+de+Vannes,+44800+Saint-Herblain/57+Rue+du+65%C3%A8me+R%C3%A9giment+d'Infanterie/2+Rue+%C3%89lie+Delaunay,+44000+Nantes/3+All.+Jacques+Berque,+44000+Nantes/26+All.+de+la+Bouscarle+de+Cetti/6b+Rue+Louis+M%C3%A9karski,+44000+Nantes/3+Rue+des+Chal%C3%A2tres,+44000+Nantes/5+Rue+des+Chal%C3%A2tres,+44000+Nantes/@47.2288845,-1.5872129,14z/data=!4m49!4m48!1m5!1m1!1s0x4805ed009f92a93b:0x627c99a63fb62fa8!2m2!1d-1.6037901!2d47.2457349!1m5!1m1!1s0x4805ee99ba12fe1d:0x9b282a6c35b90fc3!2m2!1d-1.5519562!2d47.2264073!1m5!1m1!1s0x4805eebc68800c07:0x990596f8c09bddf!2m2!1d-1.5466591!2d47.2196411!1m5!1m1!1s0x4805eec83c3cf4eb:0xc821b56fb888dc3d!2m2!1d-1.5381678!2d47.2122747!1m5!1m1!1s0x4805eec79620f0f7:0xaf13b4fb6de15738!2m2!1d-1.5379628!2d47.2153257!1m5!1m1!1s0x4805eec2aa7febdd:0x75695ebb6ca916b6!2m2!1d-1.5294367!2d47.2235896!1m5!1m1!1s0x4805eee84e49fd47:0x130fc0ed9f7cc9af!2m2!1d-1.531169!2d47.225398!1m5!1m1!1s0x4805eee851e97575:0x1fdb38fbca8fa83a!2m2!1d-1.531324!2d47.225586?entry=ttu&g_ep=EgoyMDI1MTIwOS4wIKXMDSoASAFQAw%3D%3D
    ```

2. lorsque je genere les etiquettes pour les routes j'obtiens une erreur a chaque fois. Voici les logs d'execution :

```log
16 Feb 2026, 21:00:49	Info	[FORM] 📝 Génération étiquettes depuis formulaire...
16 Feb 2026, 21:00:49	Info	[FORM] Paramètres: {"routeIds":["R001","R002","R003","R004","R005","R006","R007","R008","R009","R010","R011","R012","R013","R014","R015","R016"],"rows":7,"cols":3}
16 Feb 2026, 21:00:49	Info	[LABELS] 🚀 Démarrage génération des étiquettes...
16 Feb 2026, 21:00:49	Info	[LABELS] Routes: R001, R002, R003, R004, R005, R006, R007, R008, R009, R010, R011, R012, R013, R014, R015, R016
16 Feb 2026, 21:00:49	Info	[LABELS] Format: 7x3
16 Feb 2026, 21:00:49	Info	[LABELS] 📄 Traitement route R001...
16 Feb 2026, 21:00:51	Info	[LABELS]   2 livraisons
16 Feb 2026, 21:00:53	Info	[LABELS]   8 étiquettes
16 Feb 2026, 21:00:53	Info	[LABELS] ❌ Document error: getOrCreateDriveFolder is not defined
16 Feb 2026, 21:00:53	Info	[LABELS] ❌ Route R001: getOrCreateDriveFolder is not defined
16 Feb 2026, 21:00:53	Info	[LABELS] 📄 Traitement route R002...
16 Feb 2026, 21:00:53	Info	[LABELS]   6 livraisons
16 Feb 2026, 21:00:59	Info	[LABELS]   26 étiquettes
16 Feb 2026, 21:00:59	Info	[LABELS] ❌ Document error: getOrCreateDriveFolder is not defined
16 Feb 2026, 21:00:59	Info	[LABELS] ❌ Route R002: getOrCreateDriveFolder is not defined
...
```

## 🚨 RAPPEL FINAL

Si tu as besoin de plus d'informations (logs donnees du google sheets), n'hésite pas à me demander !

**RÈGLE ABSOLUE :**

1. Tous les logs et commentaires doivent être en **FRANÇAIS**
2. Chaque fichier < 250 lignes
   - Si un fichier dépasse → **LE DIVISER** en plusieurs fichiers logiques
   - Créer autant de fichiers que nécessaire pour respecter cette limite
   - Privilégier la clarté et la modularité
   - Regenerer entierement le fichier pour que je puisse copier-coller facilement

## output

When done create a minimal migraion guide (just what files to replace)
