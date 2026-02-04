# 📦 Système de Gestion des Livraisons AMANA

## 🎉 Bienvenue

Ce package contient **tous les fichiers nécessaires** pour déployer le système complet de gestion des livraisons.

**Version :** 1.0 - Toutes phases opérationnelles  
**Date :** 04 Février 2026  
**Fichiers inclus :** 20 fichiers

---

## 📂 Structure du Package

```
livraisons-amana-system/
│
├── Code.gs                    ← Point d'entrée principal + Menu
├── config.gs                  ← Configuration centralisée
│
├── services/                  ← Logique métier (5 services)
│   ├── apiService.gs          - Intégration APIs externes
│   ├── deliveryService.gs     - Génération livraisons
│   ├── routeService.gs        - Planification routes
│   ├── stopService.gs         - Génération étapes
│   └── labelService.gs        - Génération étiquettes
│
├── api/                       ← API Web pour bénévoles
│   └── routeApi.gs            - Endpoints REST (doGet/doPost)
│
├── utils/                     ← Utilitaires (3 modules)
│   ├── sheetUtils.gs          - CRUD Google Sheets
│   ├── dateUtils.gs           - Manipulation dates
│   └── validationUtils.gs     - Validation données
│
├── ui/                        ← Interfaces HTML (5 formulaires)
│   ├── configApiKeys.html     - Configuration APIs
│   ├── deliveryForm.html      - Génération livraisons
│   ├── routeForm.html         - Planification routes
│   ├── stopForm.html          - Génération étapes
│   └── labelForm.html         - Génération étiquettes
│
└── Documentation/             ← Guides complets
    ├── PROJET_COMPLET.md      - Vue d'ensemble complète
    ├── DEPLOIEMENT.md         - Guide d'installation
    ├── README.md              - Documentation Phase 1
    └── PHASE2_README.md       - Documentation Phase 2
```

---

## ⚡ Installation Rapide (15 minutes)

### Étape 1️⃣ : Créer le Google Spreadsheet

1. Aller sur [Google Sheets](https://sheets.google.com)
2. Créer un nouveau spreadsheet
3. Le renommer : **"Gestion Livraisons AMANA"**

### Étape 2️⃣ : Ouvrir l'éditeur Apps Script

1. Dans le menu du spreadsheet : `Extensions > Apps Script`
2. Une nouvelle fenêtre s'ouvre

### Étape 3️⃣ : Importer les fichiers

**Important :** Suivre l'ordre exact !

#### A. Créer la structure de dossiers

Dans l'éditeur Apps Script, créer ces dossiers :

1. Cliquer sur `+` à côté de "Fichiers"
2. Choisir "Dossier"
3. Créer dans l'ordre :
   - `services`
   - `api`
   - `utils`
   - `ui`

#### B. Importer les fichiers principaux (racine)

1. Supprimer le fichier `Code.gs` par défaut
2. Créer nouveau `Script` → nommer `Code.gs`
3. Copier-coller le contenu de **Code.gs**
4. Enregistrer (Ctrl+S)
5. Répéter pour **config.gs**

#### C. Importer les services/

Pour chaque fichier .gs du dossier `services/` :

1. Sélectionner le dossier `services`
2. Cliquer `+` → `Script`
3. Nommer exactement comme dans le ZIP
4. Copier-coller le contenu
5. Enregistrer

**Fichiers à importer :**

- apiService.gs
- deliveryService.gs
- routeService.gs
- stopService.gs
- labelService.gs

#### D. Importer api/

1. Sélectionner le dossier `api`
2. Créer `routeApi.gs`
3. Copier-coller le contenu

#### E. Importer utils/

Dans le dossier `utils`, créer :

- sheetUtils.gs
- dateUtils.gs
- validationUtils.gs

#### F. Importer ui/

Pour chaque fichier .html du dossier `ui/` :

1. Sélectionner le dossier `ui`
2. Cliquer `+` → `HTML`
3. Nommer exactement (avec .html)
4. Copier-coller le contenu
5. Enregistrer

**Fichiers à importer :**

- configApiKeys.html
- deliveryForm.html
- routeForm.html
- stopForm.html
- labelForm.html

### Étape 4️⃣ : Initialiser le système

1. Retourner dans le Google Spreadsheet
2. Rafraîchir la page (F5)
3. Un nouveau menu apparaît : **"📦 Gestion Livraisons AMANA"**
4. Aller dans : `Aide > Initialiser Système`
5. Cliquer **"Oui"**

**Résultat :** 4 feuilles créées automatiquement :

- Livraison
- routes
- etapes_route
- tokens

### Étape 5️⃣ : Configurer les API Keys

1. Menu : `Configuration > Configurer API Keys`
2. Remplir les 3 sections :

**API Familles :**

- URL : `https://script.google.com/.../exec`
- Key : Votre clé API Familles

**API Bénévoles :**

- URL : `https://script.google.com/.../exec`
- Key : Votre clé API Bénévoles

**API GEO :**

- URL : `https://script.google.com/.../exec`
- Key : Votre clé API GEO

1. Cliquer **"Enregistrer"**

### Étape 6️⃣ : Tester les connexions

1. Menu : `Synchronisation > Tester Connexion APIs`
2. Vérifier que les 3 APIs répondent ✅✅✅

### Étape 7️⃣ : Déployer l'API Web (Phase 6)

1. Dans l'éditeur Apps Script
2. Cliquer **"Déployer"** → **"Nouveau déploiement"**
3. Type : **"Application Web"**
4. Configuration :
   - Description : `API Web Livraisons v1.0`
   - Exécuter en tant que : **Moi**
   - Qui a accès : **Tout le monde**
5. Cliquer **"Déployer"**
6. Copier l'URL de déploiement

### Étape 8️⃣ : Configurer l'URL de l'API

1. Dans l'éditeur Apps Script
2. Ouvrir `Code.gs`
3. Chercher la fonction `configureApiWebUrl()`
4. Exécuter (Exécuter > configureApiWebUrl)
5. Coller l'URL de déploiement

---

## ✅ Vérification de l'Installation

### Test Phase 2 : Génération Livraisons

1. Menu : `Livraisons > Générer Livraisons`
2. Configurer :
   - Priorités : 1, 2, 3
   - Type : Zakat
   - Quartiers : Quelques quartiers
   - Date : Demain
   - Nombre : 10
3. Cliquer **"Générer"**

**Résultat attendu :** Livraisons créées dans la feuille `Livraison`

### Test Phase 3 : Planification Routes

1. Menu : `Routes > Planifier Routes`
2. Configurer :
   - Date : Même date que les livraisons
   - Max livraisons : 15
   - Occasion : Zakat El Fitr
3. Cliquer **"Planifier"**

**Résultat attendu :** Routes créées dans `routes`

### Test Phase 4 : Génération Étapes

1. Menu : `Routes > Générer Étapes`
2. Sélectionner les routes en brouillon
3. Cliquer **"Générer et Envoyer"**

**Résultat attendu :** Étapes créées + Emails envoyés

### Test Phase 5 : Génération Étiquettes

1. Menu : `Routes > Générer Étiquettes`
2. Format : 7×3
3. Sélectionner les routes confirmées
4. Cliquer **"Générer"**

**Résultat attendu :** Documents Google avec étiquettes

### Test Phase 6 : API Web

Dans un navigateur :

```
https://VOTRE_URL_DEPLOIEMENT?action=ping
```

**Résultat attendu :** `{"status":"ok",...}`

---

## 🎯 Fonctionnalités Disponibles

### Phase 1 : Foundation ✅

- Configuration centralisée
- Intégration 3 APIs externes
- Cache intelligent
- CRUD Google Sheets
- Menu complet

### Phase 2 : Génération Livraisons ✅

- Filtrage multi-critères
- Géocodage automatique
- Anti-doublons
- Tri intelligent

### Phase 3 : Planification Routes ✅

- Clustering géographique
- Optimisation capacités
- Attribution bénévoles
- Détection routes éloignées

### Phase 4 : Génération Étapes ✅

- Optimisation TSP
- Documents Google Drive
- Emails bénévoles
- Tokens sécurisés

### Phase 5 : Génération Étiquettes ✅

- QR codes intégrés
- Format A4 configurable
- Export imprimable

### Phase 6 : API Web Mobile ✅

- Endpoints REST
- Démarrage routes
- Confirmation livraisons
- Gestion erreurs

---

## 📚 Documentation Complète

### Fichiers inclus

1. **PROJET_COMPLET.md** - Vue d'ensemble complète du système
2. **DEPLOIEMENT.md** - Guide détaillé de déploiement (étape par étape)
3. **README.md** - Documentation technique Phase 1
4. **PHASE2_README.md** - Documentation complète Phase 2

### Consulter la documentation

Ouvrir les fichiers `.md` avec :

- Visual Studio Code
- Notepad++
- Tout éditeur de texte
- Ou directement sur GitHub

---

## 🆘 Dépannage

### Problèmes Fréquents

**❌ Le menu n'apparaît pas**
→ Rafraîchir la page (F5)

**❌ "Clés API manquantes"**
→ Menu `Configuration > API Keys`

**❌ Une API ne répond pas**
→ Vérifier URL et clé API

**❌ Les emails ne sont pas envoyés**
→ Vérifier permissions Gmail dans Apps Script

**❌ Erreur "Script not found"**
→ Vérifier que tous les fichiers sont importés

### Logs et Débogage

**Voir les logs :**

1. Éditeur Apps Script
2. Menu : `Affichage > Journaux`

**Format des logs :**

```
[DELIVERIES] 🚀 Démarrage génération...
[ROUTES] ✅ Route R001 créée
[API] 📡 GET /confirm_delivery
```

---

## 📊 Spécifications Techniques

### Modèle de Données

**4 Feuilles Google Sheets :**

1. **Livraison** (15 colonnes)
   - Statuts : Non Assignée, Assignée, En Cours, Livrée, Annulée

2. **routes** (14 colonnes)
   - Statuts : Brouillon, Confirmée, En Cours, Terminée, Annulée

3. **etapes_route** (8 colonnes)
   - Statuts : En Attente, En Cours, Livrée, Sautée

4. **tokens** (4 colonnes)
   - Expiration : 48 heures

### APIs Externes Requises

- **API Familles** v2.2 - CRUD familles
- **API Bénévoles** v1.0 - Gestion bénévoles
- **API GEO** v5.0 - Géocodage et distances

### Technologies Utilisées

- Google Apps Script (JavaScript ES5)
- Google Sheets (base de données)
- Google Drive (stockage documents)
- Google Docs (génération documents)
- Gmail (notifications)
- HTML5 + CSS3 + JavaScript Vanilla

---

## 🔐 Sécurité

### Permissions Requises

Le script demande ces permissions :

- ✅ Google Sheets (lecture/écriture)
- ✅ Google Drive (création dossiers/docs)
- ✅ Gmail (envoi emails)
- ✅ UrlFetchApp (appels APIs externes)

**C'est normal et nécessaire.**

### Protection des Données

- Clés API stockées dans Script Properties (chiffré)
- Tokens générés aléatoirement (32 caractères)
- Expiration automatique tokens (48h)
- Validation stricte à chaque requête

---

## 📞 Support

### Ressources

- **PROJET_COMPLET.md** - Vue d'ensemble
- **DEPLOIEMENT.md** - Guide installation
- Logs dans Apps Script
- Documentation Google Apps Script officielle

### Contact

Pour assistance technique, consulter :

1. Les logs détaillés
2. La documentation complète
3. Tester chaque phase individuellement

---

## ✅ Checklist de Déploiement

- [ ] Spreadsheet créé
- [ ] Tous les fichiers importés (20 fichiers)
- [ ] Système initialisé (4 feuilles)
- [ ] API Keys configurées
- [ ] Connexions APIs testées ✅✅✅
- [ ] API Web déployée
- [ ] URL API Web configurée
- [ ] Test Phase 2 (Livraisons) ✅
- [ ] Test Phase 3 (Routes) ✅
- [ ] Test Phase 4 (Étapes) ✅
- [ ] Test Phase 5 (Étiquettes) ✅
- [ ] Test Phase 6 (API Web) ✅
- [ ] Formation utilisateurs
- [ ] **Système en production** 🚀

---

## 🎉 Félicitations

Une fois l'installation terminée, vous aurez un **système complet et opérationnel** de gestion des livraisons avec :

✨ Génération automatique des livraisons  
✨ Planification optimisée des routes  
✨ Génération des itinéraires  
✨ Étiquettes avec QR codes  
✨ Suivi temps réel via mobile  

**Système développé avec ❤️ pour AMANA**  
**Version 1.0 - Février 2026**

---

**Bon déploiement ! 🚀**
