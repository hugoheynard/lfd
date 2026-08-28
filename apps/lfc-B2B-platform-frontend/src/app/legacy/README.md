# `legacy/` — l'espace pro de la génération précédente

Ces treize dossiers sont la **première version** de l'app : boutique B2B, panier,
paniers enregistrés, commandes, entreprises, profil, réglages, tableau de bord.
Ils compilent, ils sont testés, et **aucune route ne les atteint** —
`FEATURE_PRO_SPACE` est à `false`.

## Pourquoi ce nom, et pas `pro/`

Parce que « pro » ne distingue personne : **tout le monde est un client
professionnel**. Ce qui varie, c'est qu'une partie d'entre eux n'a pas encore
ouvert son _espace pro_ — et ça, c'est un état du compte, pas une catégorie
d'utilisateur ni une famille d'écrans. Un dossier `pro/` aurait laissé croire à
deux publics quand il n'y en a qu'un.

Ce qui sépare vraiment ces dossiers du reste, c'est leur **génération**. D'où
`legacy/`.

## Ce qu'on y fait

Rien. On n'ajoute pas d'écran ici, et on n'y corrige que ce qui casse la
compilation. Tout écran neuf va dans l'app cliente.

## La seule dépendance qui en sort

`account/account.model.ts` importe `CatalogueView` d'ici : la vue de catalogue
préférée est persistée dans le profil (`nav_prefs`, côté API), donc le type
survit à l'écran qui l'a fait naître. Le jour où ce dossier part, ce type-là
sort avec le code vivant plutôt que de disparaître.
