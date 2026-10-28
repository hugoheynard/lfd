# Plan — les raccourcis du fournil : compter en plaques

> ✅ **Bâti le 2026-10-28** (S1, S2) : table `production.production_batch_shortcut`,
> migration `20261028200000_les_raccourcis_du_fournil`, page
> `/reglages/production/raccourcis`, boutons sur la fiche d'atelier. Les
> articles listés sont l'union pro et public.
>
> 📝 Plan du 2026-10-28. Demande de Hugo : « en réglage production, un
> raccourci du fournil, une page avec une table, qui donne pour chaque produit
> la possibilité d'ajouter un bouton `<nom, par défaut “1 plaque”>` — nombre de
> pièces, ce qui permettrait de compter en plaques ». Rien n'est bâti.

## 1. Ce qui existe (relu le 2026-10-28)

- **La fiche d'atelier** déclare une fournée par un champ « Pièces sorties »
  (`apps/lfd-backoffice-frontend/src/app/production/fiche-atelier/worksheet-line/`)
  puis « Déclarer » (`workshop-gestures.ts`, `record`). Une fournée est un
  nombre de pièces, en ajout seul (`production_batch`).
- **La production ne lit pas le catalogue** : elle connaît un article par son
  SKU, et ce qu'il lui faut du commerce passe par son canal
  (`apps/lfd-api/src/production/channels/commerce/`, par exemple
  `workshop-shelves.reader.ts`, que le commerce implémente).
- **Réglages › Production** existe (`/reglages/production/fournil`), sous le
  droit `production_settings`.

## 2. Ce qu'on construit

- **Un raccourci** : pour UN produit, un nom (« 1 plaque » par défaut, libre,
  1 à 30 caractères) et un nombre de pièces (entier ≥ 1). Plusieurs par
  produit, au plus 6 (« 1 plaque », « 1 chariot »…), jamais deux fois le même
  nom pour un produit.
- **La page « Raccourcis du fournil »**, dans Réglages › Production
  (`/reglages/production/raccourcis`) : une `fold-data-table` de tous les
  produits du catalogue, avec un filtre des familles et une recherche au-dessus
  (comme la table du réassort). Chaque ligne montre ses raccourcis en pastilles
  (« 1 plaque · 24 »), et un bouton « Ajouter un raccourci ». Toucher une
  pastille ouvre son dialogue : modifier, ou supprimer dans une
  `fold-danger-zone`. Le dialogue d'ajout propose « 1 plaque » comme nom.
- **Sur la fiche d'atelier**, dans le formulaire « Pièces sorties » d'un
  produit : un bouton par raccourci (« + 1 plaque (24) »). Chaque appui
  **ajoute** ses pièces au champ : deux appuis sur « 1 plaque » donnent 48. Le
  champ reste éditable, et c'est toujours « Déclarer » qui enregistre la
  fournée. Rien ne change dans ce qui est enregistré : un nombre de pièces.

## 3. Le serveur

- Table `production.production_batch_shortcut` : `id`, `sku`, `label`,
  `pieces`, `position`, l'auteur (staff id, nom figé), `created_at`,
  `updated_at`, et `removed_at` (une suppression se trace, elle n'efface rien).
  CHECK : `pieces ≥ 1`, label rogné de 1 à 30 caractères. Index unique partiel
  `(sku, lower(label))` sur les lignes non retirées. Migration **additive**.
- Agrégat de domaine qui porte ces règles, dont le plafond de 6 par produit.
- Un lecteur neuf dans le canal : `production/channels/commerce/`, déclaré par
  la production et implémenté par le commerce. Il rend les articles vendables
  `{ sku, name, familyId, familyName }`, dans l'ordre du catalogue.
- Routes, un handler par cas, contrôleur à bus seulement :

| Route                                                  | Droit                         | Rend                                  |
| ------------------------------------------------------ | ----------------------------- | ------------------------------------- |
| `GET  /admin/production/settings/shortcuts`            | `production_settings:read`    | articles + raccourcis                 |
| `POST /admin/production/settings/shortcuts`            | `production_settings:write`   | `{ id }`                              |
| `PUT  /admin/production/settings/shortcuts/:id`        | `production_settings:write`   | 204                                   |
| `POST /admin/production/settings/shortcuts/:id/remove` | `production_settings:write`   | 204                                   |
| `GET  /admin/production/shortcuts`                     | lecture de la fiche d'atelier | raccourcis par SKU, sans les articles |

- Journal et registre RGPD comme le réglage de production le plus proche.

## 4. Lots

| Lot | Contenu                                                           | Migration |
| --- | ----------------------------------------------------------------- | --------- |
| S1  | Table, agrégat, lecteur du catalogue, routes, page de réglage     | additive  |
| S2  | Les boutons de raccourci dans le formulaire de la fiche d'atelier | non       |
