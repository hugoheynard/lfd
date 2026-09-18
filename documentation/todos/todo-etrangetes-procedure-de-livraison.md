# TODO — ce que le filet de la procédure de livraison a figé, et qui cloche

> **État au 2026-09-15** : relevé par le filet du lot 0 du
> [plan des notes photo](../b2b/plan-notes-photo-du-commercial.md), **rien n'est
> corrigé**. Chaque point est figé tel quel par un test nommé d'après le
> comportement : le corriger fera rougir ce test, et c'est voulu — c'est un
> changement observable, à faire APRÈS l'extraction du socle, pas pendant.
>
> Hugo, 2026-09-15 : « tout ce que tu trouves étrange tu notes, mais il faut
> finir ».

## Côté API

1. **Les refus de contenu sortent en message Zod, en anglais pour les
   longueurs.** `Requête invalide : title : Too big: expected string to have
<=80 characters`. Le schéma du contrat refuse avant le value object : les
   messages français de `DeliveryStepContent` (« Donnez un titre à l'étape »…)
   ne sortent jamais en HTTP. Figé dans
   `apps/lfd-api/test/delivery-procedure-refusals.e2e-spec.ts`.
2. **Un ordre vide rend un 400 Zod en anglais** : `stepIds : Too small:
expected array to have >=1 items`.
3. **Au-delà de 2 Mo, Multer rend `413 { message: "File too large", error:
"Payload Too Large" }`** : ni `code`, ni message qui dise quoi faire. Ce
   n'est pas une `AppError`.
4. **Réordonner une adresse sans procédure rend « périmé » (409)**, pas
   « introuvable ».
5. **Le message de poids arrondit mal** : à 1 048 577 octets, « elle pèse
   1.0 Mo, la limite est de 1.0 Mo » (point décimal anglais, et deux chiffres
   identiques pour un refus).
6. **Un remplacement ou un retrait de photo côté staff publie `step_revised`** :
   le journal ne distingue pas le geste sur la photo.

## Côté écran (`@lfd/b2b-ui`, éditeur de procédure)

7. **« Le titre est requis » n'est jamais affiché** : le libellé
   `titleRequired` existe, aucun gabarit ne s'en sert. Un titre vide désactive
   seulement Enregistrer.
8. **Un seul refus à la fois** : titre ET texte trop longs, seul le titre est
   signalé.
9. **« Remplacer » et « Retirer » sans aperçu** : en refaisant une étape dont la
   vignette n'est pas encore (ou n'a pas pu être) téléchargée.
10. **Une vignette arrivée après le rechargement qui a retiré son étape** n'est
    libérée qu'à la destruction de l'éditeur.
11. **Chaque vignette est la photo pleine taille** (jusqu'à 1 Mo), téléchargée
    par une requête authentifiée : lourd pour une liste. Les notes auront une
    vraie vignette (plan, D7 bis) ; les étapes pourraient la reprendre.

## Outillage

12. **`@lfd/b2b-ui` ne peut pas tester ses propres composants** : son Jest
    tourne en CommonJS sans jsdom et `@angular/core` n'y charge pas. Ses
    composants sont éprouvés dans les apps qui les montent (l'éditeur et le
    formulaire, dans `apps/lfc-B2B-admin-frontend/src/app/fiche-client/__tests__/`).
13. **Une suite e2e unique en `--runInBand` sature la mémoire du poste** vers la
    80e suite sur 98 : la batterie complète ne se prouve d'un seul tenant qu'en
    parallèle borné.
14. **Les fonctions de `delivery-step-draft.model.ts` ne servent plus qu'à leur
    spec** depuis le lot 2 : le socle `photo-cards` porte la règle, la procédure
    lui passe ses bornes. Gardées parce que le filet ne devait pas changer ; à
    retirer avec leur spec, qui éprouve désormais un paramétrage et non une
    règle.
15. **Les classes internes de l'éditeur de procédure sont passées de `step-*` à
    `card-*`** au lot 2, avec deux éléments hôtes de plus (`display: contents`).
    Aucun consommateur ni aucune spec ne les lisait (vérifié par `pablo`) ; une
    feuille de style d'app qui les viserait serait morte en silence.
16. **Le README de `@lfd/b2b-ui` cite un sous-dossier `flags`** qui n'existe
    plus dans `src/` (retiré avec `DELIVERY_SERVICE_OPEN`).
17. **Avertissements de budget** aux builds des deux fronts (bundle initial ;
    `packages/b2b-ui/src/order/order-detail/order-detail.scss` pour l'admin) — non comparés à l'état d'avant.
18. **Le journal n'a pas de phrase pour `company.delivery_procedure_edited_by_staff`**
    (`apps/lfc-B2B-admin-frontend/src/app/admin/journal/journal-line.ts`) : les
    gestes du staff sur une procédure de livraison s'y affichent sans libellé. Les
    notes, elles, ont reçu les leurs au lot 4.
19. **Le README de `@lfd/b2b-ui` dit « n'ouvre aucun panneau »** : faux depuis le
    lot 4 — l'éditeur `photo-cards` ouvre la vue en grand par
    `FoldPanelHostService`. L'éditeur écrivait déjà lui-même : la phrase décrivait
    un paquet de pure présentation qu'il n'est plus.
20. **Aucune icône de note dans fold** : l'onglet « Notes » et son état vide
    portent l'icône `edit`. Une icône dédiée est un chantier fold, pas applicatif.
21. **Les droits des rôles de référence ne viennent pas de la base.** Pour
    `admin`, `commercial`, `comptabilite`, `support` et `dev`, l'accès se résout
    depuis `ROLE_GRANTS` du code (`apps/lfd-api/src/staff/permissions/prisma-staff-access.resolver.ts`) ;
    le JSON de `staff_role_definitions` ne sert qu'à l'écran des rôles. Une
    migration qui le met à jour ne donne aucun droit.
22. **Ce JSON n'a jamais reçu `b2b_order_waivers` ni `b2b_feature_access`** :
    leurs migrations ne l'ont pas touché. L'écran des rôles doit donc montrer
    `admin` sans ces deux droits, qu'il exerce pourtant (non vérifié en
    production).
23. **`admin-delivery-procedure-commands.ts` regroupe quatre commandes dans un
    seul fichier**, alors que le B2B sépare commande et handler par fichier.
24. **La boutique (`apps/lfc-B2B-platform-frontend`) n'a pas de script `lint`** :
    `turbo run lint` la liste sans rien exécuter. Un front qui n'entre jamais dans
    `pnpm lint` ne peut pas le faire échouer — relevé par `cerberus`.
25. **Le bulletin de démarrage ignore le stockage `production`** :
    `apps/lfd-api/src/platform/startup/startup-report.service.ts` ne lit que
    `kbis`, `media` et `customers`. L'exclusion était juste quand rien n'écrivait
    dans ce bucket ; elle ne l'est plus depuis `985d21bf` (les deux papiers du
    fournil sont archivés). Un `R2_PRODUCTION_*` mal posé se découvre donc au
    premier tirage, devant un four, et non au démarrage.
