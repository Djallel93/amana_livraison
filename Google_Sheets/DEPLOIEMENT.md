# 🚀 Guide de Déploiement - Système de Gestion des Livraisons

## 📋 Vue d'Ensemble

Ce guide vous accompagne pas à pas dans le déploiement complet du système.

**Phases couvertes :**

- ✅ Phase 1 : Foundation (Configuration)
- ✅ Phase 2 : Génération Livraisons
- ✅ Phase 3 : Planification Routes
- ✅ Phase 4 : Génération Étapes
- ✅ Phase 5 : Génération Étiquettes
- ✅ Phase 6 : API Web Mobile

---

## 🏗️ ÉTAPE 1 : Créer le Google Spreadsheet

### 1.1 Créer le fichier

1. Aller sur [Google Sheets](https://sheets.google.com)
2. Créer un nouveau spreadsheet
3. Le renommer : **"Gestion Livraisons AMANA"**

### 1.2 Ouvrir l'éditeur Apps Script

1. Dans le menu : `Extensions > Apps Script`
2. Une nouvelle fenêtre s'ouvre avec un fichier `Code.gs`

---

## 📂 ÉTAPE 2 : Importer les Fichiers

### 2.1 Structure des dossiers

Dans l'éditeur Apps Script, créer cette structure :

```
Projet
├── Code.gs
├── config.gs
├── services/
│   ├── apiService.gs
│   ├── deliveryService.gs
│   ├── routeService.gs
│   ├── stopService.gs
│   └── labelService.gs
├── api/
│   └── routeApi.gs
├── utils/
│   ├── sheetUtils.gs
│   ├── dateUtils.gs
│   └── validationUtils.gs
└── ui/
    ├── configApiKeys.html
    ├── deliveryForm.html
    ├── routeForm.html
    ├── stopForm.html
    └── labelForm.html
```

### 2.2 Créer les fichiers

**Pour chaque fichier :**

1. Cliquer sur `+` à côté de "Fichiers"
2. Choisir "Script" (.gs) ou "HTML" (.html)
3. Copier-coller le contenu
4. Enregistrer (Ctrl+S)

**Astuce :** Créer d'abord tous les fichiers `.gs`, puis tous les `.html`

---

## 🔧 ÉTAPE 3 : Configuration Initiale

### 3.1 Initialiser le système

1. Dans le spreadsheet, rafraîchir la page (F5)
2. Un nouveau menu apparaît : **"📦 Gestion Livraisons AMANA"**
3. Aller dans : `Aide > Initialiser Système`
4. Cliquer **"Oui"** pour confirmer

**Résultat :** 4 feuilles créées automatiquement :

- `Livraison`
- `routes`
- `etapes_route`
- `tokens`

### 3.2 Configurer les API Keys

1. Menu : `Configuration > Configurer API Keys`
2. Remplir les 3 sections :

**API Familles :**

- URL : `https://script.google.com/macros/s/YOUR_FAMILY_SCRIPT_ID/exec`
- Key : Votre clé API Familles

**API Bénévoles :**

- URL : `https://script.google.com/macros/s/YOUR_VOLUNTEER_SCRIPT_ID/exec`
- Key : Votre clé API Bénévoles

**API GEO :**

- URL : `https://script.google.com/macros/s/YOUR_GEO_SCRIPT_ID/exec`
- Key : Votre clé API GEO

1. Cliquer **"Enregistrer"**

### 3.3 Vérifier les connexions

1. Menu : `Synchronisation > Tester Connexion APIs`
2. Vérifier que les 3 APIs répondent **✅**

Si une API échoue :

- Vérifier l'URL
- Vérifier la clé API
- Vérifier que l'API externe est déployée

---

## 🌐 ÉTAPE 4 : Déployer l'API Web (Phase 6)

### 4.1 Déployer comme Web App

1. Dans l'éditeur Apps Script, cliquer sur **"Déployer"** (en haut à droite)
2. Choisir **"Nouveau déploiement"**
3. Cliquer sur l'icône ⚙️ à côté de "Sélectionner un type"
4. Choisir **"Application Web"**

### 4.2 Configuration du déploiement

**Remplir les champs :**

- **Description :** `API Web Livraisons - v1.0`
- **Exécuter en tant que :** Moi
- **Qui a accès :** Tout le monde

**Important :** Choisir "Tout le monde" car les bénévoles doivent pouvoir accéder à l'API via leurs liens.

### 4.3 Déployer

1. Cliquer **"Déployer"**
2. Autoriser l'accès (première fois)
3. Copier l'**URL de déploiement**

Format : `https://script.google.com/macros/s/VOTRE_DEPLOYMENT_ID/exec`

### 4.4 Configurer l'URL dans le système

**Méthode 1 : Via le menu (recommandé)**

1. Dans le spreadsheet : `Configuration > (à ajouter)`
2. Coller l'URL de déploiement

**Méthode 2 : Manuellement**

1. Dans l'éditeur Apps Script
2. Ouvrir `Code.gs`
3. Chercher la fonction `configureApiWebUrl()`
4. L'exécuter (Exécuter > configureApiWebUrl)
5. Coller l'URL

**Méthode 3 : Via Script Properties**

```javascript
PropertiesService.getScriptProperties().setProperty('API_WEB_URL', 'VOTRE_URL');
```

---

## 🧪 ÉTAPE 5 : Tests de Validation

### Phase 2 : Génération Livraisons

1. Menu : `Livraisons > Générer Livraisons`
2. Sélectionner :
   - Priorités : 1, 2, 3
   - Type : Zakat
   - Quartiers : Sélectionner quelques quartiers
   - Date : Demain
   - Nombre : 10
3. Cliquer **"Générer"**

**Résultat attendu :** X livraisons créées dans la feuille `Livraison`

### Phase 3 : Planification Routes

1. Menu : `Routes > Planifier Routes`
2. Configurer :
   - Date : Même date que les livraisons
   - Max livraisons : 15
   - Occasion : Zakat El Fitr
   - Poids moyen : 5 kg
3. Cliquer **"Planifier"**

**Résultat attendu :** Routes créées avec statut "Brouillon" dans `routes`

### Phase 4 : Génération Étapes

1. Menu : `Routes > Générer Étapes`
2. Sélectionner toutes les routes en brouillon
3. Cliquer **"Générer et Envoyer"**

**Résultat attendu :**

- Étapes créées dans `etapes_route`
- Documents Google créés dans Drive
- Emails envoyés aux bénévoles
- Routes passées en "Confirmée"

### Phase 5 : Génération Étiquettes

1. Menu : `Routes > Générer Étiquettes`
2. Configuration : 7 lignes × 3 colonnes
3. Sélectionner les routes confirmées
4. Cliquer **"Générer"**

**Résultat attendu :** Documents Google avec étiquettes et QR codes

### Phase 6 : API Web

**Test 1 : Ping**

```
GET https://VOTRE_URL?action=ping
```

Devrait retourner : `{"status":"ok",...}`

**Test 2 : Démarrer route** (avec un vrai token)

```
GET https://VOTRE_URL?action=start_route&id_route=R001&token=VOTRE_TOKEN
```

**Note :** Les tokens sont dans la feuille `tokens`

---

## 🎯 ÉTAPE 6 : Utilisation en Production

### Workflow complet

**1. Génération Livraisons**

- Admin : `Livraisons > Générer Livraisons`
- Sélectionner les critères
- Résultat : Livraisons créées

**2. Planification Routes**

- Admin : `Routes > Planifier Routes`
- Système crée les routes optimisées
- Résultat : Routes en "Brouillon"

**3. Génération Étapes**

- Admin : `Routes > Générer Étapes`
- Système optimise l'ordre (TSP)
- Envoie emails aux bénévoles
- Résultat : Routes "Confirmées" + Emails envoyés

**4. Génération Étiquettes**

- Admin : `Routes > Générer Étiquettes`
- Choisir le format (7×3 recommandé)
- Résultat : Documents imprimables

**5. Jour de livraison**

- Bénévole reçoit email avec :
  - Lien Google Maps
  - Document détaillé
  - Bouton "Démarrer Route"
- Clique sur "Démarrer Route"
- Scanne QR codes pour confirmer livraisons
- Ou clique sur les liens dans l'email

---

## 🔐 Sécurité et Permissions

### Script Properties (Clés API)

Les clés API sont stockées dans Script Properties (cryptées par Google).

**Pour les voir/modifier :**

1. Éditeur Apps Script
2. Menu : `Projet > Propriétés du script`
3. Onglet "Propriétés du script"

### Permissions nécessaires

Le script demande ces permissions :

- ✅ Google Sheets (lecture/écriture)
- ✅ Google Drive (création dossiers/docs)
- ✅ Gmail (envoi emails)
- ✅ UrlFetchApp (appels APIs externes)

**C'est normal et nécessaire.**

### Tokens de sécurité

- Générés automatiquement lors de la génération des étapes
- Durée de vie : 48 heures (configurable)
- Stockés dans la feuille `tokens`

---

## 🛠️ Maintenance

### Vider le cache

Si les données des APIs semblent obsolètes :

1. Menu : `Synchronisation > Vider le Cache`

### Réinitialiser le système

**⚠️ Attention : Efface toutes les données !**

1. Supprimer manuellement les 4 feuilles
2. Menu : `Aide > Initialiser Système`

### Mettre à jour le code

1. Copier le nouveau code
2. Remplacer dans l'éditeur
3. Enregistrer
4. Rafraîchir le spreadsheet

**Pas besoin de redéployer** sauf si modifications de l'API Web (Phase 6)

---

## 📊 Monitoring et Logs

### Voir les logs

1. Éditeur Apps Script
2. Menu : `Affichage > Journaux`

Ou :

1. Menu : `Affichage > Exécutions`
2. Cliquer sur une exécution

### Logs importants

Tous les logs sont en français avec emojis :

```
[DELIVERIES] 🚀 Démarrage génération...
[ROUTES] ✅ Route R001 créée
[API] 📡 GET /confirm_delivery
```

### Erreurs fréquentes

**"Clés API manquantes"**
→ Configurer via `Configuration > API Keys`

**"Route introuvable"**
→ Vérifier que la route existe dans la feuille `routes`

**"Token invalide"**
→ Le token a expiré (48h) ou est incorrect

---

## 🎨 Personnalisation

### Modifier les couleurs

Dans les fichiers HTML (`ui/*.html`), chercher les gradients :

```css
background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
```

### Modifier le format des étiquettes

Dans `config.gs` :

```javascript
LABELS: {
  DEFAULT_ROWS: 7,  // Lignes par page
  DEFAULT_COLS: 3,  // Colonnes par page
  QR_CODE_SIZE: 150 // Taille QR code
}
```

### Modifier la durée des tokens

Dans `config.gs` :

```javascript
TOKENS: {
  EXPIRATION_HOURS: 48  // Durée de validité
}
```

---

## 🆘 Support et Dépannage

### Problèmes courants

| Problème | Solution |
|----------|----------|
| Menu n'apparaît pas | Rafraîchir la page (F5) |
| API ne répond pas | Vérifier URL et clé API |
| Emails non envoyés | Vérifier permissions Gmail |
| QR codes ne s'affichent pas | Vérifier connexion internet |
| Routes mal optimisées | Ajuster paramètres dans CONFIG |

### Contact

Pour assistance :

- Consulter les logs
- Vérifier la configuration
- Tester chaque phase individuellement

---

## ✅ Checklist de Déploiement

- [ ] Spreadsheet créé
- [ ] Tous les fichiers importés
- [ ] Système initialisé (4 feuilles créées)
- [ ] API Keys configurées
- [ ] Connexions APIs testées ✅✅✅
- [ ] API Web déployée
- [ ] URL API Web configurée
- [ ] Tests Phase 2 (Livraisons) ✅
- [ ] Tests Phase 3 (Routes) ✅
- [ ] Tests Phase 4 (Étapes) ✅
- [ ] Tests Phase 5 (Étiquettes) ✅
- [ ] Tests Phase 6 (API Web) ✅
- [ ] Formation utilisateurs
- [ ] **Système en production** 🚀

---

## 📞 Ressources

**Documentation Google Apps Script :**

- [Sheets Service](https://developers.google.com/apps-script/reference/spreadsheet)
- [Drive Service](https://developers.google.com/apps-script/reference/drive)
- [Document Service](https://developers.google.com/apps-script/reference/document)

**APIs Utilisées :**

- API Familles v2.2
- API Bénévoles v1.0
- API GEO v5.0
- Google Charts API (QR codes)

---

**Système déployé avec succès !** 🎉

Toutes les phases sont opérationnelles et prêtes pour la production.
