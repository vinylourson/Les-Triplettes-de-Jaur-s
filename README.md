# Les-Triplettes-de-Jaur-s

Site web statique (compatible GitHub Pages) pour afficher et gérer un tournoi de pétanque.

## Fonctionnalités

- Affichage du **tour d'échauffement**
- Affichage du **tableau final** à partir des **1/8 de finale** (16 équipes)
- Page dédiée aux **équipes et membres** (équipes de 2 ou 3 joueurs)
- **Back-office protégé** par mot de passe pour mettre à jour :
  - les scores
  - le vainqueur d'un match (mise en évidence visuelle)

Les données sont sauvegardées côté navigateur (`localStorage`).

## Lancer localement

Ouvrir `index.html` dans un navigateur ou utiliser un serveur statique (ex. `python -m http.server`).

## Accès back-office (démo)

- Mot de passe : `petanque-admin`
