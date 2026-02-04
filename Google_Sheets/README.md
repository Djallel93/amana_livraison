# 📦 Système de Gestion des Livraisons AMANA

**Version 1.0.0** - Phase 1 Complétée ✅

## 🎯 Vue d'Ensemble

Système complet de gestion des livraisons pour l'association AMANA, développé en Google Apps Script. Ce système permet de :

- ✅ Générer des demandes de livraison depuis l'API Familles
- ✅ Planifier des routes optimisées pour les bénévoles
- ✅ Communiquer les itinéraires par email
- ✅ Générer des étiquettes imprimables avec QR codes
- ✅ Suivre les livraisons en temps réel via API web

## 📊 Phase 1 : Foundation (Complétée)

### ✅ Fichiers Créés

```
/
├── Code.gs                          # Point d'entrée principal avec menu
├── config.gs                        # Configuration centrale
├── services/
│   └── apiService.gs               # Service de communication avec APIs externes
├── utils/
│   ├── sheetUtils.gs               # Utilitaires Google Sheets (CRUD)
│   ├── dateUtils.gs                # Utilitaires dates et timestamps
│   └── validationUtils.gs          # Validation des données
└── ui/
    └── configApiKeys.html          # Interface de configuration des API Keys
```

### 🎯 Fonctionnalités Implémentées

#### 1. Configuration Centrale (`config.gs`)

- ✅ Configuration des 3 APIs externes (Familles, Bénévoles, GEO)
- ✅ Paramètres du QG (adresse, coordonnées)
- ✅ Paramètres d'optimisation des routes (distances, capacités)
- ✅ Configuration email et notifications
- ✅ Énumérations (statuts, types, occasions)
- ✅ Stockage sécurisé dans Script Properties

**Accès :** `Configuration > API Keys`

#### 2. Service API (`apiService.gs`)

- ✅ Appels HTTP avec retry automatique (backoff exponentiel)
- ✅ Cache des réponses (5 min pour Familles/Bénévoles, 1h pour GEO)
- ✅ Gestion d'erreurs robuste
- ✅ Logging détaillé en français

**APIs Supportées :**
- **API Familles v2.2** : Récupération des familles validées
- **API Bénévoles v1.0** : Liste des bénévoles et véhicules
- **API GEO v5.0** : Géocodage, calcul de distances, hiérarchie

**Test :** `Synchronisation > Tester Connexion APIs`

#### 3. Utilitaires Sheets (`sheetUtils.gs`)

- ✅ CRUD complet (Create, Read, Update, Delete)
- ✅ Recherche et filtrage
- ✅ Génération d'IDs auto-incrémentés (L001, R001, E001)
- ✅ Opérations batch pour performance

**Fonctions Principales :**
```javascript
getAllData(sheetName)              // Récupérer toutes les données
appendRow(sheetName, rowData)      // Ajouter une ligne
updateRowById(sheetName, id, updates)  // Mettre à jour par ID
filterData(sheetName, predicate)   // Filtrer avec fonction
generateNextId(sheetName, prefix, colIndex)  // Générer ID
```

#### 4. Utilitaires Dates (`dateUtils.gs`)

- ✅ Formatage dates en français
- ✅ Calculs de différences (jours, heures, minutes)
- ✅ Validation de plages horaires
- ✅ Génération de noms de dossiers (YYYYMMdd_occasion)

**Exemples :**
```javascript
getCurrentDateTime('datetime')     // "2026-02-02 14:30:00"
formatDateReadableFr(date)         // "Lundi 15 Février 2026 à 14h30"
addDays(date, 5)                   // Ajouter 5 jours
generateFolderName(date, 'zakat')  // "20260215_zakat"
```

#### 5. Utilitaires Validation (`validationUtils.gs`)

- ✅ Validation des livraisons
- ✅ Validation des routes
- ✅ Validation des étapes
- ✅ Validation des données API
- ✅ Classe `ValidationResult` pour gérer erreurs/warnings

**Exemple d'utilisation :**
```javascript
const result = validateLivraison(livraison);
if (result.hasErrors()) {
  Logger.log(result.getErrorMessages());
}
```

#### 6. Menu Principal (`Code.gs`)

Menu complet organisé en sections :

**📋 Livraisons**
- Générer Livraisons (Phase 2)
- Voir Toutes les Livraisons
- Mettre à Jour Statuts

**🗺️ Routes**
- Planifier Routes (Phase 3)
- Générer Étapes (Phase 4)
- Envoyer Routes
- Générer Étiquettes (Phase 5)

**⚙️ Configuration**
- ✅ Configurer API Keys
- Configurer Emails
- Adresse QG
- Paramètres Optimisation Routes

**🔄 Synchronisation**
- ✅ Actualiser Données APIs (vider cache)
- ✅ Tester Connexion APIs

**❓ Aide**
- ✅ Initialiser Système
- Documentation
- À Propos

## 🚀 Installation

### 1. Créer le Google Spreadsheet

1. Créer un nouveau Google Spreadsheet
2. Ouvrir l'éditeur de scripts : `Extensions > Apps Script`
3. Copier tous les fichiers `.gs` dans l'éditeur
4. Créer la structure de dossiers :
   - `services/` pour les services
   - `utils/` pour les utilitaires
   - `ui/` pour les interfaces HTML

### 2. Configurer les APIs

1. Obtenir les URLs et clés API des 3 APIs externes
2. Dans le spreadsheet : `Gestion Livraisons > Configuration > API Keys`
3. Remplir les 3 sections avec les URLs et clés

### 3. Initialiser le Système

1. Dans le menu : `Gestion Livraisons > Aide > Initialiser Système`
2. Cliquer "Oui" pour créer les feuilles et configurer les paramètres
3. Vérifier que les 4 feuilles ont été créées :
   - `Livraison`
   - `routes`
   - `etapes_route`
   - `tokens`

### 4. Tester les Connexions

1. Dans le menu : `Gestion Livraisons > Synchronisation > Tester Connexion APIs`
2. Vérifier que les 3 APIs répondent ✅

## 🔧 Configuration

### Script Properties

Les propriétés suivantes sont stockées dans `PropertiesService` :

**APIs**
- `API_FAMILLES_URL` : URL de l'API Familles
- `API_FAMILLES_KEY` : Clé API Familles
- `API_BENEVOLES_URL` : URL de l'API Bénévoles
- `API_BENEVOLES_KEY` : Clé API Bénévoles
- `API_GEO_URL` : URL de l'API GEO
- `API_GEO_KEY` : Clé API GEO

**QG**
- `HQ_ADRESSE` : Adresse du siège (défaut: "319 Rte de Vannes, 44800 Saint-Herblain")
- `HQ_LAT` : Latitude (défaut: 47.2457349)
- `HQ_LNG` : Longitude (défaut: -1.6037901)

**Optimisation Routes**
- `ROUTE_DISTANCE_PROXIMITE_KM` : Distance proximité (défaut: 3)
- `ROUTE_DISTANCE_CLUSTER_MAX_KM` : Distance max cluster (défaut: 15)
- `ROUTE_CAPACITE_PETITE_VOITURE_KG` : Capacité petite voiture (défaut: 400)
- `ROUTE_DISTANCE_ISOLEE_KM` : Distance route isolée (défaut: 30)
- `ROUTE_CAPACITE_BERLINE_KG` : Capacité Berline (défaut: 400)
- `ROUTE_CAPACITE_BREAK_KG` : Capacité Break (défaut: 500)

**Email**
- `EMAIL_FROM` : Expéditeur (défaut: deliveries@association.org)
- `EMAIL_FROM_NAME` : Nom expéditeur
- `EMAIL_ADMIN` : Email admin

### Modifier les Paramètres

**Via le menu :**
- `Configuration > Adresse QG`
- `Configuration > Paramètres Optimisation Routes`

**Via le code :**
```javascript
setConfigProperty('HQ_ADRESSE', 'Nouvelle adresse');
setConfigProperty('ROUTE_DISTANCE_PROXIMITE_KM', '5');
```

## 📊 Modèle de Données

### Table `Livraison`

| Colonne             | Type     | Description                      |
| ------------------- | -------- | -------------------------------- |
| id_livraison        | String   | L001, L002... (auto-incrémenté)  |
| id_famille          | String   | ID depuis API Familles           |
| id_quartier         | String   | ID quartier                      |
| adresse             | String   | Adresse complète                 |
| latitude            | Float    | Coordonnées GPS                  |
| longitude           | Float    | Coordonnées GPS                  |
| disponibilite_debut | DateTime | Début fenêtre disponibilité      |
| disponibilite_fin   | DateTime | Fin fenêtre disponibilité        |
| nombre_personnes    | Integer  | Total adultes + enfants          |
| statut              | Enum     | Non Assignée, Assignée, etc.     |
| priorite            | Integer  | 1-5 (1=urgent, 5=standard)       |
| type_aide           | String   | zakat/sadaqa/recolte             |
| besoins_speciaux    | String   | Notes spéciales                  |
| date_creation       | DateTime | Date de création                 |
| date_modification   | DateTime | Dernière modification            |

### Table `routes`

| Colonne            | Type     | Description                      |
| ------------------ | -------- | -------------------------------- |
| id_route           | String   | R001, R002... (auto-incrémenté)  |
| id_benevole        | String   | ID bénévole principal            |
| id_binome          | String   | ID binôme (optionnel)            |
| id_vehicule_prete  | String   | ID véhicule prêté (si applicable)|
| date_debut         | Date     | Date début route                 |
| date_fin           | Date     | Date fin (post-livraison)        |
| occasion           | Enum     | zakat_el_fitr/recolte/ponctuelle |
| statut             | Enum     | Brouillon, Confirmée, etc.       |
| distance_totale_km | Float    | Distance totale calculée         |
| poids_total_kg     | Float    | Poids total transporté           |
| relivre            | Boolean  | Retour au HQ                     |
| dossier_drive      | String   | URL dossier Google Drive         |
| date_creation      | DateTime | Date de création                 |
| date_modification  | DateTime | Dernière modification            |

### Table `etapes_route`

| Colonne       | Type     | Description                      |
| ------------- | -------- | -------------------------------- |
| id_etape      | String   | E001, E002... (auto-incrémenté)  |
| id_route      | String   | FK → routes                      |
| id_livraison  | String   | FK → Livraison                   |
| ordre_passage | Integer  | Séquence (1, 2, 3...)            |
| statut        | Enum     | En Attente, En Cours, etc.       |
| heure_debut   | DateTime | Début effectif étape             |
| heure_fin     | DateTime | Fin effectif étape               |
| commentaire   | String   | Notes bénévole                   |

### Table `tokens`

| Colonne         | Type     | Description                      |
| --------------- | -------- | -------------------------------- |
| id_route        | String   | FK → routes                      |
| token           | String   | Token unique (32 caractères)     |
| date_expiration | DateTime | Expiration (48h par défaut)      |
| date_creation   | DateTime | Date de création                 |

## 🔒 Sécurité

### API Keys

- ✅ Stockées dans Script Properties (non visibles dans le code)
- ✅ Jamais loggées
- ✅ Masquées dans l'interface (`***`)

### Tokens

- ✅ Génération aléatoire sécurisée
- ✅ Expiration automatique (48h)
- ✅ Un token par route

### Cache

- ✅ Données sensibles non cachées
- ✅ Durées courtes (5 min - 1h)
- ✅ Invalidation manuelle possible

## 📝 Logging

Tous les logs sont en français et suivent ce format :

```
[MODULE] EMOJI Message détaillé
```

**Exemples :**
```javascript
Logger.log('[API] ✅ Succès (200): https://...');
Logger.log('[SHEETS] ✅ Ligne ajoutée dans Livraison à l'index 42');
Logger.log('[CONFIG] ⚠️ Propriété manquante: API_KEY');
Logger.log('[CACHE] 🗑️ Cache invalidé: families_all');
```

**Emojis utilisés :**
- ✅ Succès
- ❌ Erreur
- ⚠️ Avertissement
- 📡 Requête API
- 🗑️ Suppression
- ⏳ Attente
- 🔍 Recherche
- 💾 Sauvegarde

## 🧪 Tests

### Tester la Configuration

```javascript
// Vérifier les propriétés
function testConfig() {
  Logger.log('HQ Address: ' + CONFIG.HQ.ADRESSE);
  Logger.log('API Configured: ' + isApiConfigured());
}

// Tester une API
function testFamilyApi() {
  const result = pingFamilyApi();
  Logger.log(JSON.stringify(result, null, 2));
}
```

### Tester les Utilitaires

```javascript
// Test Sheets
function testSheets() {
  const nextId = generateNextId('Livraison', 'L', 1);
  Logger.log('Next ID: ' + nextId);
}

// Test Dates
function testDates() {
  const now = new Date();
  Logger.log(formatDateReadableFr(now));
}

// Test Validation
function testValidation() {
  const result = validateLivraison({
    id_famille: 'F001',
    adresse: 'Test',
    nombre_personnes: 5
  });
  Logger.log(result.isValid);
}
```

## 🚧 Prochaines Phases

### Phase 2 : Génération des Livraisons
- Interface HTML de génération
- Service de livraisons
- Intégration API Familles/GEO
- Géocodage et calcul distances

### Phase 3 : Planification des Routes
- Algorithme de clustering géographique
- Service de routes
- Interface de planification
- Optimisation TSP

### Phase 4 : Génération des Étapes
- Service d'étapes
- Génération documents Google
- Envoi emails aux bénévoles
- Communication automatisée

### Phase 5 : Génération des Étiquettes
- Service d'étiquettes
- QR codes intégrés
- Export Google Docs
- Format A4 personnalisable

### Phase 6 : API Web Mobile
- Endpoints doGet/doPost
- Gestion des tokens
- Actions bénévoles (démarrer, confirmer, sauter)
- Suivi temps réel

## 📞 Support

Pour toute question ou problème :

1. Consulter la documentation dans `Aide > Documentation`
2. Vérifier les logs : `View > Logs` dans l'éditeur Apps Script
3. Tester les APIs : `Synchronisation > Tester Connexion APIs`
4. Contacter l'admin : [Voir CONFIG.EMAIL.ADMIN_EMAIL]

## 📄 Licence

© 2026 Association AMANA - Tous droits réservés
