# Les Triplettes de Jaurès

Site web statique (hébergé sur GitHub Pages) pour afficher et gérer un tournoi de
pétanque. Aucune dépendance, aucun serveur applicatif : trois fichiers
(`index.html`, `styles.css`, `app.js`) et un fichier de données (`data.json`)
versionné dans le dépôt.

Site en ligne : <https://vinylourson.github.io/Les-Triplettes-de-Jaur-s/>

## Fonctionnalités

- **Tour de chauffe** et **tableau final** à élimination directe, affichés sous
  forme de tableau symétrique avec lignes de connexion.
- **Nombre d'équipes adaptable** (de 2 à 16) : la taille du tableau est la
  puissance de 2 immédiatement supérieure au nombre d'équipes. Les places
  vacantes deviennent des **exemptions** (« Exempt »), réparties au plus une par
  match, qui qualifient leur adversaire d'office.
- **Tirage au sort aléatoire** des matchs (tour de chauffe et tableau final) à
  partir de la liste des équipes.
- **Avancement automatique** : le vainqueur d'un match est reporté dans le tour
  suivant ; corriger un résultat invalide les tours en aval.
- Page dédiée aux **équipes et joueurs**, lisible de loin (pensée pour un
  affichage sur écran pendant le tournoi).
- **Back-office** pour gérer les équipes (édition en ligne au clavier) et saisir
  les scores ; chaque modification est **enregistrée automatiquement**.
- **Bouton « Actualiser les scores »** sur la page Tableau, et rafraîchissement
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

1. **Tirage des équipes au sort** (petits papiers), puis saisie des noms et des
   joueurs dans le back-office.
2. Cliquer sur **« Tirage au sort des matchs »** pour générer aléatoirement le
   tour de chauffe et le tableau final (s'adapte au nombre d'équipes).
3. Pendant les parties, saisir les scores : les vainqueurs avancent
   automatiquement, chaque modification est enregistrée (commit).
4. Afficher la page **Tableau** sur l'écran ; elle se rafraîchit toute seule, et
   le bouton **« Actualiser les scores »** force une mise à jour immédiate.

> Refaire un tirage réinitialise tous les scores (une confirmation est demandée).
> Si une équipe se désiste, la supprimer puis relancer le tirage **avant** de
> saisir des résultats.

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
