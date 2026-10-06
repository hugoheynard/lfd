# TODO — ce qui cloche encore autour de la procédure de livraison

> **Relu point par point le 2026-10-06** dans le code. Sur les 25 points
> relevés le 2026-09-15 par le filet du lot 0 des
> [notes photo du commercial](../b2b/comptes-client/notes-du-commercial.md),
> ne restent ici que ceux qui sont **encore vrais**. Les résolus (le poids du
> refus, la phrase du journal, les droits lus en base, le bulletin de démarrage
> du stockage `production`), les périmés et les invérifiables vivent dans
> l'historique git de ce fichier. Les deux README faux de `@lfd/b2b-ui` ont été
> corrigés le même jour.
>
> Chaque comportement d'API est figé par un test nommé d'après lui
> (`apps/lfd-api/test/delivery-procedure-refusals.e2e-spec.ts`) : le corriger
> fera rougir ce test, et c'est voulu.

## Côté API

1. **Les refus de contenu sortent en message Zod, en anglais pour les
   longueurs** : `title : Too big: expected string to have <=80 characters`.
   Le schéma du contrat refuse avant le value object, dont les messages
   français ne sortent jamais en HTTP.
2. **Un ordre vide rend un 400 Zod en anglais** : `stepIds : Too small:
expected array to have >=1 items`.
3. **Au-delà de 2 Mo, Multer rend `413 { message: "File too large" }`** : ni
   `code`, ni phrase qui dise quoi faire. Ce n'est pas une `AppError`.
4. **Un remplacement ou un retrait de photo côté staff publie `step_revised`** :
   le journal ne distingue pas le geste sur la photo.
5. **`admin-delivery-procedure-commands.ts` regroupe quatre commandes dans un
   seul fichier**, là où le B2B sépare commande et handler.

## Côté écran (`@lfd/b2b-ui`, éditeur `photo-cards`)

6. **« Le titre est requis » n'est jamais affiché** : un titre vide désactive
   seulement Enregistrer.
7. **Un seul refus à la fois** : titre ET texte trop longs, seul le titre est
   signalé.
8. **« Remplacer » et « Retirer » sans aperçu** quand la vignette n'est pas
   (encore) téléchargée.
9. **Une vignette arrivée après le rechargement qui a retiré son étape** n'est
   libérée qu'à la destruction de l'éditeur.
10. **Chaque vignette est la photo pleine taille** (jusqu'à 1 Mo), téléchargée
    par une requête authentifiée : lourd pour une liste.

## Outillage

11. **`@lfd/b2b-ui` ne teste pas ses propres composants** : son Jest tourne
    sans jsdom ni `@angular/core`. Ils sont éprouvés dans les apps qui les
    montent.
12. **La boutique (`apps/lfc-ecommerce-frontend`) n'a pas de script `lint`** :
    `turbo run lint` la liste sans rien exécuter.
