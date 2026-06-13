# Les Triplettes de Jaurès

Site web statique (hébergé sur GitHub Pages) pour afficher et gérer un tournoi de
pétanque **à 12 équipes** (24 à 36 joueurs, doublettes ou triplettes). Aucune
dépendance, aucun serveur applicatif : trois fichiers (`index.html`,
`styles.css`, `app.js`) et un fichier de données (`data.json`) versionné dans le
dépôt.

Site en ligne : <https://vinylourson.github.io/Les-Triplettes-de-Jaur-s/>

## Format du tournoi (v1.0)

**12 équipes A → L** (l'ordre de la liste fixe les lettres).

1. **Tour de chauffe — 3 parties de 20 min.** Appariements fixes selon la
   position des équipes :
   - Match 1 : A‑L, B‑K, C‑J, D‑I, E‑H, F‑G
   - Match 2 : A‑B, C‑D, E‑F, G‑H, I‑J, K‑L
   - Match 3 : A‑G, B‑H, C‑I, D‑J, E‑K, F‑L
2. **Classement.** Victoire = 2 pts, match nul = 1 pt, défaite = 0. Égalité
   départagée au **goal-average** (points marqués − points encaissés). Les
   équipes sont classées de la 1re (plus de points) à la 12e.
3. **Phase finale à élimination**, têtes de série issues du classement :
   1er‑12e, 2e‑11e, 3e‑10e, 4e‑9e, 5e‑8e, 6e‑7e en 1/8. Le côté droit étant plus
   court, la **demi-finale droite accueille un défi ajouté** : vainqueur du
   tournoi ado, ou meilleur perdant des 1/4 (au goal-average, proposé
   automatiquement). Le vainqueur d'un match avance automatiquement au tour
   suivant.

## Fonctionnalités

- Vues publiques **Phase finale** (tableau en éventail avec lignes de connexion),
  **Tour de chauffe** (3 matchs + classement) et **Équipes** (badges A → L,
  lisibles de loin pour l'écran du tournoi).
- **Numéro de terrain** (1 à 8) sur chaque match, attribué automatiquement et
  modifiable.
- **Back-office** : édition des équipes en ligne au clavier, génération du tour
  de chauffe, classement calculé en direct, lancement de la phase finale depuis
  le classement, saisie des scores avec avancement automatique. Chaque
  modification est **enregistrée automatiquement** (commit GitHub).
- **Bouton « Actualiser les scores »** dans l'en-tête, et rafraîchissement
  automatique toutes les 60 s pour les spectateurs.
- Accessibilité : contrastes AA, focus clavier visible, libellés ARIA,
  `prefers-reduced-motion`.

## Stockage des données et synchronisation

Les données du tournoi vivent dans **`data.json`**, versionné dans le dépôt
GitHub. C'est la source de vérité, partagée entre tous les appareils.

- **Lecture** : à l'ouverture, la page récupère `data.json` via l'API GitHub
  *Contents*. La page Tableau interroge ensuite GitHub toutes les 60 s (requêtes
  conditionnelles `ETag` : une réponse « 304 Not Modified » ne consomme pas le
  quota d'API anonyme) et se met à jour sans rechargement.
- **Écriture** : depuis le back-office, chaque enregistrement réécrit
  `data.json` via l'API GitHub. **Chaque sauvegarde est donc un commit** —
  l'historique complet est conservé et consultable, et toute erreur peut être
  annulée. Les écritures sont regroupées (anti-rebond ~1,5 s) pour qu'une série
  de saisies ne produise qu'un seul commit.
- **Conflits** : si deux administrateurs enregistrent en même temps, le second
  reçoit un conflit de version (SHA), récupère la version à jour et réessaie une
  fois (la dernière écriture l'emporte).
- **Hors-ligne** : une copie est conservée dans le `localStorage` du navigateur
  et sert de secours si GitHub est injoignable.

> Note : les lectures anonymes de l'API GitHub sont limitées (60/h par adresse
> IP). Pour un tournoi, le rythme d'une actualisation par minute est largement
> en dessous de cette limite.

## Authentification du back-office

L'accès au back-office se fait avec un **jeton d'accès personnel GitHub
« fine-grained »**, et non plus un mot de passe. Le jeton est saisi au login,
conservé uniquement dans l'onglet courant (`sessionStorage`) le temps de la
session, et n'apparaît jamais dans le code. Les administrateurs n'ont **pas**
besoin d'un compte GitHub : l'organisateur génère un jeton et le distribue comme
un mot de passe.

### Générer le jeton (organisateur, propriétaire du dépôt)

1. GitHub → **Settings** → **Developer settings** → **Personal access tokens** →
   **Fine-grained tokens** → **Generate new token**.
2. **Token name** : par exemple `triplettes-admin`.
3. **Expiration** : juste après la date du tournoi.
4. **Repository access** : **Only select repositories** →
   `Les-Triplettes-de-Jaur-s`.
5. **Permissions** → **Repository permissions** → **Contents : Read and write**
   (rien d'autre).
6. **Generate token**, copier la chaîne `github_pat_…` et la transmettre aux
   administrateurs par un canal privé.

À la connexion, le site vérifie que le jeton donne bien le droit d'écriture sur
le dépôt avant d'ouvrir le back-office.

> **Sécurité** : ce jeton permet de modifier les fichiers de **ce dépôt
> uniquement**. La date d'expiration borne le risque ; après le tournoi,
> supprimer le jeton pour révoquer l'accès. Le jeton n'est pas stocké dans le
> code, donc le révoquer ne nécessite aucun redéploiement.

## Déroulé d'un tournoi

Le back-office est organisé en 4 étapes numérotées :

1. **Gérer les équipes.** Saisir les 12 équipes (A → L) et leurs joueurs. Tirage
   des équipes au sort (petits papiers) puis saisie au clavier (édition en
   ligne, enregistrement automatique).
2. **Tour de chauffe.** Cliquer sur **« Générer le tour de chauffe »** (3 matchs),
   puis saisir les scores des 18 parties. Le résultat (victoire / nul) est déduit
   des scores.
3. **Classement.** Calculé en direct à partir des scores. Une fois le tour de
   chauffe terminé, cliquer sur **« Lancer la phase finale (selon le classement) »**
   pour renseigner les têtes de série du tableau.
4. **Phase finale.** Saisir les scores et le vainqueur de chaque match ; les
   équipes avancent automatiquement. Renseigner le **défi** de la demi-finale
   droite (saisie libre ou suggestion « meilleur perdant »).

Afficher les pages **Phase finale** et **Tour de chauffe** sur l'écran du
tournoi : elles se rafraîchissent toutes seules, et le bouton **« Actualiser les
scores »** force une mise à jour immédiate.

> Régénérer le tour de chauffe ou relancer la phase finale réinitialise les
> scores concernés (une confirmation est demandée). Le format requiert
> **exactement 12 équipes** : la génération est bloquée tant que ce n'est pas le
> cas.

## Lancer localement

Ouvrir `index.html` via un serveur statique (les appels à l'API GitHub
nécessitent un contexte HTTPS ou `localhost` — `file://` ne fonctionne pas pour
la vérification du jeton, qui utilise l'API Web Crypto/Fetch) :

```bash
python3 -m http.server 8000
# puis http://localhost:8000
```

## Configuration

Les constantes en tête de `app.js` pointent vers le dépôt et la branche :

```js
const REPO_API = "https://api.github.com/repos/vinylourson/Les-Triplettes-de-Jaur-s";
const BRANCH = "main";
```

En cas de fork, adapter `REPO_API` (et au besoin `BRANCH`) à votre dépôt.
